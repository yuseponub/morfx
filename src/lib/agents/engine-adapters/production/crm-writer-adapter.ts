/**
 * CRM Writer Adapter — Somnio PW-Confirmation Agent
 * Standalone `somnio-sales-v3-pw-confirmation` Plan 10 (Wave 4).
 *
 * Wraps `proposeAction + confirmAction` (from `@/lib/agents/crm-writer/two-step`)
 * for the 3 operations that PW-confirmation V1 requires:
 *
 *   1. updateOrderShipping(workspaceId, orderId, shipping, ctx)
 *      → tool='updateOrder' with {orderId, shippingAddress, shippingCity, shippingDepartment}
 *      → maps to domain `updateOrder` (D-12: cambiar dirección sin crear pedido nuevo).
 *
 *   2. moveOrderToConfirmado(workspaceId, orderId, ctx)
 *      → tool='moveOrderToStage' with {orderId, newStageId: PW_CONFIRMATION_STAGES.CONFIRMADO}
 *      → maps to domain `moveOrderToStage` (D-10: stage destino al confirmar).
 *
 *   3. moveOrderToFaltaConfirmar(workspaceId, orderId, ctx)
 *      → tool='moveOrderToStage' with {orderId, newStageId: PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR}
 *      → maps to domain `moveOrderToStage` (D-14: "espera lo pienso / ya te confirmo").
 *
 * Architectural pattern (D-08, RESEARCH §C.2 'Otra opcion mas limpia'):
 *   processWriterMessage() does NOT exist — crm-writer is shipped as HTTP endpoints
 *   (/propose, /confirm) PLUS in-process primitives (proposeAction, confirmAction).
 *   For in-process backend agents, the correct path is direct import of two-step
 *   (mismo patron que recompra→reader documentado en agent-scope.md).
 *
 * Error contract (D-06 cross-agent, Standalone crm-stage-integrity):
 *   When `confirmAction` returns {status:'failed', error:{code:'stage_changed_concurrently'}},
 *   this adapter PROPAGATES the error VERBATIM. NO retries. The agent loop (Plan 11
 *   engine) decides handoff humano (D-21 trigger c) per `agent-scope.md` §Somnio
 *   Sales V3 PW-Confirmation Agent.
 *
 * Regla 3 compliance:
 *   This file does NOT use `createAdminClient`. The only DB-touching code lives in
 *   `src/lib/agents/crm-writer/two-step.ts` (the `crm_bot_actions` audit table) and
 *   in the domain layer that two-step dispatches to. ZERO direct mutations.
 *
 * Observability (RESEARCH §A.5):
 *   Emits `pipeline_decision:crm_writer_propose_emitted` post-propose and
 *   `pipeline_decision:crm_writer_confirm_emitted` post-confirm. Also emits
 *   `pipeline_decision:stage_changed_concurrently_caught` when the D-06 error
 *   contract triggers — so the engine can correlate the handoff downstream.
 */

import { proposeAction, confirmAction } from '@/lib/agents/crm-writer/two-step'
import {
  PW_CONFIRMATION_STAGES,
  SOMNIO_PW_CONFIRMATION_AGENT_ID,
} from '@/lib/agents/somnio-pw-confirmation/constants'
import { createModuleLogger } from '@/lib/audit/logger'
import { getCollector } from '@/lib/observability'
import type {
  WriterContext,
  WriterPreview,
  ProposedAction,
} from '@/lib/agents/crm-writer/types'

const logger = createModuleLogger('pw-confirmation.crm-writer-adapter')

// ============================================================================
// Public types
// ============================================================================

/**
 * Result shape returned by every adapter operation.
 *
 * - `executed`: propose + confirm both succeeded; mutation persisted.
 * - `failed`: either propose insert failed, confirm dispatch failed, or the
 *   row was 'expired' / 'already_executed' (treated as failures from the
 *   caller's perspective because the requested mutation did NOT execute in
 *   THIS turn).
 *
 * `error.code` values the engine MUST handle explicitly:
 *   - `'stage_changed_concurrently'` → trigger handoff humano (D-21 trigger c).
 *     Propagated VERBATIM from `confirmAction.error.code` per D-06 contract.
 *   - `'propose_failed'` → upstream propose insert in `crm_bot_actions` failed
 *     (DB unavailable, schema drift). Engine logs + retries policy upstream.
 *   - `'expired_or_dup'` → confirm came back as 'expired' or 'already_executed'.
 *     For backend in-process flow this should never happen (propose + confirm
 *     happen synchronously in same turn). Treated as anomaly.
 *   - `'dispatch_error'` → generic domain failure (validation, FK violation,
 *     etc.). Engine treats as soft failure.
 *   - `'unknown_status'` → confirm returned a status outside the known set
 *     (`'not_found'`). Defensive fallback.
 */
export type AdapterResult =
  | { status: 'executed'; actionId: string; output?: unknown }
  | { status: 'failed'; actionId?: string; error: { code: string; message: string } }

/**
 * Context object every operation requires.
 *
 * - `agentId`: locked to literal 'somnio-sales-v3-pw-confirmation' for type safety.
 *   This adapter is single-tenant for the PW-confirmation agent — other agents
 *   should build their own adapter or call two-step directly.
 * - `conversationId`: optional — passed through to `proposeAction` as the writer
 *   `invoker` field for audit-trail correlation in `crm_bot_actions`.
 */
export interface PwAdapterContext {
  agentId: typeof SOMNIO_PW_CONFIRMATION_AGENT_ID
  conversationId?: string
}

interface ShippingFields {
  shippingAddress: string
  shippingCity: string
  shippingDepartment: string
}

// ============================================================================
// Internal helper — propose + confirm orchestrator
// ============================================================================

interface ExecuteParams {
  workspaceId: string
  conversationId?: string
  tool: string
  input: Record<string, unknown>
  preview: WriterPreview
}

/**
 * Centralized 2-step executor.
 *
 * Sequence:
 *   1. proposeAction(...) → returns ProposedAction with action_id.
 *      If insert throws (DB unavailable), we catch and return 'propose_failed'.
 *   2. confirmAction(action_id) → executes domain function via dispatch.
 *      Maps the ConfirmResult union to AdapterResult, with special-case
 *      handling for `stage_changed_concurrently` (propagated verbatim per D-06).
 *
 * Observability events emitted:
 *   - `pipeline_decision:crm_writer_propose_emitted` after step 1 succeeds
 *   - `pipeline_decision:crm_writer_confirm_emitted` after step 2 returns
 *   - `pipeline_decision:stage_changed_concurrently_caught` when D-06 fires
 */
async function executeProposeConfirm(params: ExecuteParams): Promise<AdapterResult> {
  const { workspaceId, conversationId, tool, input, preview } = params

  const writerCtx: WriterContext = {
    workspaceId,
    invoker: conversationId
      ? `${SOMNIO_PW_CONFIRMATION_AGENT_ID}:${conversationId}`
      : SOMNIO_PW_CONFIRMATION_AGENT_ID,
  }

  // ---- Step 1: propose ----
  let proposed: ProposedAction
  try {
    proposed = await proposeAction(writerCtx, { tool, input, preview })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      { err, workspaceId, tool, conversationId },
      'crm-writer-adapter: proposeAction threw',
    )
    getCollector()?.recordEvent('pipeline_decision', 'crm_writer_propose_emitted', {
      agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
      conversationId,
      tool,
      status: 'failed',
      error: 'propose_failed',
      message,
    })
    return {
      status: 'failed',
      error: { code: 'propose_failed', message },
    }
  }

  const actionId = proposed.action_id

  getCollector()?.recordEvent('pipeline_decision', 'crm_writer_propose_emitted', {
    agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
    conversationId,
    tool,
    actionId,
    status: 'proposed',
  })

  // ---- Step 2: confirm ----
  const confirm = await confirmAction(writerCtx, actionId)

  if (confirm.status === 'executed' || confirm.status === 'already_executed') {
    getCollector()?.recordEvent('pipeline_decision', 'crm_writer_confirm_emitted', {
      agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
      conversationId,
      tool,
      actionId,
      status: confirm.status,
    })
    // 'already_executed' is treated as success — for in-process synchronous
    // flow this means the same action_id was confirmed twice (idempotency
    // safeguard via optimistic UPDATE in two-step.ts:182). The mutation IS
    // persisted, so engine can proceed.
    return { status: 'executed', actionId, output: confirm.output }
  }

  if (confirm.status === 'expired') {
    getCollector()?.recordEvent('pipeline_decision', 'crm_writer_confirm_emitted', {
      agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
      conversationId,
      tool,
      actionId,
      status: 'expired',
    })
    logger.warn(
      { actionId, workspaceId, tool },
      'crm-writer-adapter: confirm returned expired (anomaly for in-process flow)',
    )
    return {
      status: 'failed',
      actionId,
      error: {
        code: 'expired_or_dup',
        message: 'crm_bot_actions row was expired before confirm reached it',
      },
    }
  }

  if (confirm.status === 'not_found') {
    getCollector()?.recordEvent('pipeline_decision', 'crm_writer_confirm_emitted', {
      agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
      conversationId,
      tool,
      actionId,
      status: 'not_found',
    })
    logger.warn(
      { actionId, workspaceId, tool },
      'crm-writer-adapter: confirm returned not_found (action_id race)',
    )
    return {
      status: 'failed',
      actionId,
      error: {
        code: 'unknown_status',
        message: 'crm_bot_actions row not found for action_id',
      },
    }
  }

  // confirm.status === 'failed' — propagate verbatim, with special handling
  // for the D-06 stage_changed_concurrently error contract.
  const errCode = confirm.error?.code ?? 'unknown'
  const errMessage = confirm.error?.message ?? 'unknown error'

  getCollector()?.recordEvent('pipeline_decision', 'crm_writer_confirm_emitted', {
    agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
    conversationId,
    tool,
    actionId,
    status: 'failed',
    errorCode: errCode,
  })

  if (errCode === 'stage_changed_concurrently') {
    // D-06 cross-agent contract (Standalone crm-stage-integrity Plan 02):
    // the order was moved by another source (manual, automation, other agent)
    // between SELECT and UPDATE in domain.moveOrderToStage. The error code is
    // preserved verbatim by two-step.ts:151. Adapter MUST NOT convert it to
    // a generic message — Plan 11 engine matches on this code to trigger
    // handoff humano (D-21 trigger c).
    getCollector()?.recordEvent('pipeline_decision', 'stage_changed_concurrently_caught', {
      agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
      conversationId,
      tool,
      actionId,
    })
    logger.warn(
      { actionId, workspaceId, tool },
      'crm-writer-adapter: stage_changed_concurrently — propagating verbatim for handoff',
    )
  } else {
    logger.error(
      { actionId, workspaceId, tool, errCode, errMessage },
      'crm-writer-adapter: confirm failed',
    )
  }

  return {
    status: 'failed',
    actionId,
    error: { code: errCode, message: errMessage },
  }
}

// ============================================================================
// Public operation: updateOrderShipping (D-12)
// ============================================================================

/**
 * Update shipping address fields on an existing order.
 *
 * Used when the customer says "cambiar direccion" or provides new shipping
 * data after agent asked (D-12). Maps to domain `updateOrder` via tool name
 * 'updateOrder' (two-step.ts:235 dispatch).
 *
 * NOTE: V1 only updates the 3 shipping fields. NOT items, NOT contact, NOT
 * dates — those would be additional features for V1.1.
 */
export async function updateOrderShipping(
  workspaceId: string,
  orderId: string,
  shipping: ShippingFields,
  context: PwAdapterContext,
): Promise<AdapterResult> {
  const { shippingAddress, shippingCity, shippingDepartment } = shipping

  const input: Record<string, unknown> = {
    orderId,
    shippingAddress,
    shippingCity,
    shippingDepartment,
  }

  const preview: WriterPreview = {
    action: 'update',
    entity: 'order',
    after: {
      orderId,
      shippingAddress,
      shippingCity,
      shippingDepartment,
    },
  }

  logger.info(
    {
      workspaceId,
      orderId,
      conversationId: context.conversationId,
      shippingAddress,
      shippingCity,
      shippingDepartment,
    },
    'crm-writer-adapter: updateOrderShipping start',
  )

  return executeProposeConfirm({
    workspaceId,
    conversationId: context.conversationId,
    tool: 'updateOrder',
    input,
    preview,
  })
}

// ============================================================================
// Public operation: moveOrderToConfirmado (D-10)
// ============================================================================

/**
 * Move an order to stage `CONFIRMADO` (D-10 — the agent's terminal happy-path
 * mutation when the customer confirms purchase).
 *
 * Stage UUID sourced from `PW_CONFIRMATION_STAGES.CONFIRMADO` (Plan 04 constants).
 * NEVER hardcode the UUID inline — if Somnio recreates the pipeline, only
 * constants.ts needs an update.
 *
 * Error contract: if domain `moveOrderToStage` rejects with
 * `stage_changed_concurrently` (D-06 — another source moved the order between
 * SELECT and UPDATE), the error is propagated VERBATIM. Plan 11 engine matches
 * on `error.code === 'stage_changed_concurrently'` to trigger handoff humano.
 */
export async function moveOrderToConfirmado(
  workspaceId: string,
  orderId: string,
  context: PwAdapterContext,
): Promise<AdapterResult> {
  const newStageId = PW_CONFIRMATION_STAGES.CONFIRMADO

  const input: Record<string, unknown> = { orderId, newStageId }

  const preview: WriterPreview = {
    action: 'move',
    entity: 'order',
    after: { orderId, newStageId, stageName: 'CONFIRMADO' },
  }

  logger.info(
    { workspaceId, orderId, conversationId: context.conversationId, newStageId },
    'crm-writer-adapter: moveOrderToConfirmado start',
  )

  return executeProposeConfirm({
    workspaceId,
    conversationId: context.conversationId,
    tool: 'moveOrderToStage',
    input,
    preview,
  })
}

// ============================================================================
// Public operation: moveOrderToFaltaConfirmar (D-14)
// ============================================================================

/**
 * Move an order to stage `FALTA_CONFIRMAR` (D-14 — when the customer says
 * "espera lo pienso" / "ya te confirmo" / "luego").
 *
 * Stage UUID sourced from `PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR` (Plan 04
 * constants). FALTA_CONFIRMAR is one of the 3 entry stages of the agent
 * (D-04) — moving here is "pause" not "exit".
 *
 * Same `stage_changed_concurrently` error contract as `moveOrderToConfirmado`
 * applies — the error code is propagated verbatim for engine-level handoff
 * decision.
 */
export async function moveOrderToFaltaConfirmar(
  workspaceId: string,
  orderId: string,
  context: PwAdapterContext,
): Promise<AdapterResult> {
  const newStageId = PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR

  const input: Record<string, unknown> = { orderId, newStageId }

  const preview: WriterPreview = {
    action: 'move',
    entity: 'order',
    after: { orderId, newStageId, stageName: 'FALTA_CONFIRMAR' },
  }

  logger.info(
    { workspaceId, orderId, conversationId: context.conversationId, newStageId },
    'crm-writer-adapter: moveOrderToFaltaConfirmar start',
  )

  return executeProposeConfirm({
    workspaceId,
    conversationId: context.conversationId,
    tool: 'moveOrderToStage',
    input,
    preview,
  })
}

// ============================================================================
// Re-exports for downstream consumers (Plan 11 engine, Plan 12 tests)
// ============================================================================

export { SOMNIO_PW_CONFIRMATION_AGENT_ID }
