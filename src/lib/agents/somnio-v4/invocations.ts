/**
 * Somnio Sales Agent v4 — Inline Invocations Resolver (W-04 fix)
 *
 * Resolvedor que dispara las mutations CRM no-createOrder INLINE desde el happy path
 * tras `resolveSalesTrack`. Cierra el gap del checker B-W-04 — las 4 mutations
 * no-createOrder ahora se disparan desde happy path (NO solo desde sub-loop).
 *
 * createOrder se maneja directamente en somnio-v4-agent.ts (path crítico, no pasa por aquí).
 *
 * D-15 trigger kinds:
 *  - come-back (blocking, afecta respuesta): updateOrder, moveOrderToStage(cancelar)
 *  - execute (fire-and-forget): updateContact, addOrderNote
 *
 * D-19 set mínimo (5 mutations). Esta función dispara 4 (todas excepto createOrder).
 *
 * Pitfall 5 (idempotency keys): donde el tool soporta `idempotencyKey`, el llamador
 * usa convención `somnio-v4-{tool}-{sessionId}-{tag}` con tag distintivo por call site.
 * Las tools que NO aceptan idempotencyKey (updateOrder, moveOrderToStage, updateContact)
 * son idempotentes por design del domain layer (pre-check + last-write-wins / CAS).
 *
 * Standalone: somnio-sales-v4 / Plan 07.
 *
 * Anti-patterns:
 * - NO importar `@/lib/agents/somnio-v3/*` (D-24)
 * - NO usar `crm-writer-adapter` (D-07)
 * - NO blockear el orquestador en updateContact/addOrderNote (fire-and-forget)
 * - NO inventar idempotency keys donde el tool no las soporta (silenciosamente ignoradas)
 */

import { createCrmMutationTools, type MutationResult } from '@/lib/agents/shared/crm-mutation-tools'
import { getCollector } from '@/lib/observability'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from './config'
import type { AgentState } from './types'
import type { StateChanges } from './state'

/**
 * Cast helper — AI SDK v6 typa `Tool.execute?` como
 * `((input, options: ToolExecutionOptions) => MutationResult | AsyncIterable<MutationResult>) | undefined`.
 * Nuestros mutation-tools siempre devuelven MutationResult directo (no streaming) y
 * la firma `execute` está siempre presente al construir vía factory `createCrmMutationTools`.
 *
 * Misma técnica que los tests del módulo crm-mutation-tools (contacts.test.ts:115)
 * que cast a `{ execute: (input) => Promise<unknown> }`.
 */
type ExecMut<I, O> = (input: I) => Promise<MutationResult<O>>
function asExec<I, O>(t: { execute?: unknown }): ExecMut<I, O> {
  // Runtime: tool.execute(input) — el segundo arg ToolExecutionOptions no se consume
  // en mutation-tools (solo se usa en AI SDK loop interno cuando los tools son
  // llamados por el LLM via `generateText`). Aquí los invocamos directamente.
  return ((input: I) => (t.execute as (i: I) => Promise<MutationResult<O>>)(input)) as ExecMut<I, O>
}

/**
 * Stage UUID para mover pedido a CANCELADO (D-19 — moveOrderToStage trigger).
 *
 * D-29: stages by UUID (no hardcoded names en transitions). Plan 07 usa env var
 * como bridge mientras se cablea config-driven lookup en standalones futuros.
 * Si no está definido, ningún `cancelar` se dispara (fail-closed seguro — la
 * acción se omite + se loggea event observability).
 *
 * Evaluación lazy (function call) en lugar de const top-level porque tests pueden
 * inyectar la var via process.env en `beforeEach` sin requerir module re-import.
 */
function getCanceledStageUuid(): string | null {
  return process.env.SOMNIO_CANCELED_STAGE_UUID ?? null
}

export interface InvocationContext {
  workspaceId: string
  sessionId: string
  conversationId: string
}

/**
 * Outcome reportado al orquestador para que decida escalación post-mutación.
 *
 * - `cancelarFailed.cas=true` → orquestador escala a sub-loop reason='cas_reject'
 * - `cancelarFailed.cas=false` (otro error) → orquestador puede emitir addOrderNote audit
 * - `updateOrderFailed` → orquestador puede emitir addOrderNote audit
 * - updateContact / addOrderNote son fire-and-forget — NO se reportan
 */
export interface InvocationOutcome {
  cancelarFailed?: { code: string; cas: boolean }
  updateOrderFailed?: { code: string }
}

export interface ExecuteInvocationsArgs {
  ctx: InvocationContext
  state: AgentState
  /** sales-track action resuelta (ej: 'cancelar', 'mostrar_confirmacion', null). */
  salesAccion: string | null
  /**
   * StateChanges del mergeAnalysis — usado para detectar shipping/email/cedula
   * recién capturados este turno.
   */
  changes: StateChanges
  /** Phone del contacto (input.contactPhone) — para resolver contactId si falta. */
  contactPhone: string | null
  /**
   * activeContactId — el UUID resuelto previamente (Plan 07 orquestador hace
   * la resolución vía crm-query-tools.getContactByPhone tras la primera mutación).
   * Si null, los tools que requieren contactId UUID (updateContact) se omiten
   * silenciosamente y se reporta event observability — fire-and-forget puro.
   */
  activeContactId: string | null
  /** activeOrderId — pedido al que aplican updateOrder/moveOrderToStage/addOrderNote. */
  activeOrderId: string | null
  /**
   * Hooks adicionales que el orquestador puede pasar tras post-procesar mutations:
   * - handoffReason: nota de audit cuando se escala a humano
   * - mutationFailedNote: nota de audit cuando una mutación principal falló
   */
  extra?: { handoffReason?: string; mutationFailedNote?: string }
}

/**
 * Procesa el merged state tras resolveTransition y dispara las 4 mutations apropiadas.
 *
 * Decisión de qué mutation disparar:
 *  - shipping fields cambiaron → updateOrder (come-back blocking)
 *  - salesAccion === 'cancelar' → moveOrderToStage (come-back blocking, CAS-protected)
 *  - email nuevo capturado → updateContact (execute fire-and-forget)
 *  - extra.handoffReason || extra.mutationFailedNote → addOrderNote (execute fire-and-forget audit)
 */
export async function executeInvocations(args: ExecuteInvocationsArgs): Promise<InvocationOutcome> {
  const tools = createCrmMutationTools({
    workspaceId: args.ctx.workspaceId || SOMNIO_WORKSPACE_ID,
    invoker: SOMNIO_V4_AGENT_ID,
  })

  const outcome: InvocationOutcome = {}
  const orderId = args.activeOrderId

  // ---------------------------------------------------------------------------
  // come-back 1: updateOrder (shipping captured) — D-19 W-04
  // Disparador: cualquiera de los shipping fields cambió este turno + activeOrderId
  // disponible + state final tiene direccion+ciudad mínimos.
  //
  // El tool no soporta `idempotencyKey` (idempotency natural via pre-check + last-write).
  // ---------------------------------------------------------------------------
  const shippingFieldsChanged =
    args.changes.newFields.includes('direccion') ||
    args.changes.newFields.includes('ciudad') ||
    args.changes.newFields.includes('departamento') ||
    args.changes.newFields.includes('barrio')

  const hasMinimumShipping = !!args.state.datos.direccion && !!args.state.datos.ciudad

  if (orderId && shippingFieldsChanged && hasMinimumShipping) {
    type UpdateOrderInput = {
      orderId: string
      shippingAddress?: string | null
      shippingCity?: string | null
      shippingDepartment?: string | null
    }
    const exec = asExec<UpdateOrderInput, unknown>(tools.updateOrder)
    const result = await exec({
      orderId,
      shippingAddress: args.state.datos.direccion,
      shippingCity: args.state.datos.ciudad,
      shippingDepartment: args.state.datos.departamento,
    })
    if (result.status !== 'executed' && result.status !== 'duplicate') {
      const code = 'error' in result ? result.error?.code ?? 'unknown' : 'unknown'
      outcome.updateOrderFailed = { code }
      getCollector()?.recordEvent('pipeline_decision', 'updateOrder_failed', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: args.ctx.sessionId,
        errorCode: code,
        resultStatus: result.status,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // come-back 2: moveOrderToStage (cancelar) — D-19 W-04
  // Disparador: salesAccion='cancelar' + activeOrderId presente.
  // CAS reject ('stage_changed_concurrently') → flag para que orquestador
  // escale a sub-loop reason='cas_reject' (Pitfall 1 — propagar verbatim, NO retry).
  // ---------------------------------------------------------------------------
  if (args.salesAccion === 'cancelar' && orderId) {
    const canceledStageUuid = getCanceledStageUuid()
    if (!canceledStageUuid) {
      // Fail-closed: stage UUID no configurado → no movemos, solo loggeamos.
      getCollector()?.recordEvent('pipeline_decision', 'moveOrderToStage_skipped', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: args.ctx.sessionId,
        targetStage: 'CANCELADO',
        reason: 'SOMNIO_CANCELED_STAGE_UUID env var not set',
      })
    } else {
      type MoveStageInput = { orderId: string; stageId: string }
      const exec = asExec<MoveStageInput, unknown>(tools.moveOrderToStage)
      const result = await exec({
        orderId,
        stageId: canceledStageUuid,
      })
      if (result.status !== 'executed' && result.status !== 'duplicate') {
        const code = 'error' in result ? result.error?.code ?? 'unknown' : 'unknown'
        const cas = result.status === 'stage_changed_concurrently'
        outcome.cancelarFailed = { code, cas }
        getCollector()?.recordEvent('pipeline_decision', 'moveOrderToStage_failed', {
          agent: SOMNIO_V4_AGENT_ID,
          sessionId: args.ctx.sessionId,
          targetStage: 'CANCELADO',
          errorCode: code,
          cas,
          resultStatus: result.status,
        })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // execute (fire-and-forget) 1: updateContact — D-19 W-04
  // Disparador: email recién capturado este turno + activeContactId disponible.
  //
  // El tool real REQUIERE contactId UUID (no acepta phone-based lookup). El orquestador
  // debe haber resuelto activeContactId previamente (vía crm-query-tools.getContactByPhone)
  // o estar en una conversación con contactId del request. Si activeContactId es null,
  // se omite silenciosamente + event observability (fire-and-forget — no rompe el turn).
  //
  // Nota: el tool tampoco acepta `idNumber` field — solo name/phone/email/address/city/department.
  // La cedula se mantiene en agent state para crear el pedido / handoff humano, pero NO se
  // sincroniza al contacto en V1 (V1.1 deferred — gap documentado).
  // ---------------------------------------------------------------------------
  const newEmail =
    args.changes.newFields.includes('correo') && args.state.datos.correo
      ? args.state.datos.correo
      : null

  if (newEmail && args.activeContactId) {
    type UpdateContactInput = { contactId: string; email?: string }
    const exec = asExec<UpdateContactInput, unknown>(tools.updateContact)
    void exec({
      contactId: args.activeContactId,
      email: newEmail,
    }).catch((err: unknown) => {
      getCollector()?.recordEvent('pipeline_decision', 'updateContact_failed_silent', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: args.ctx.sessionId,
        error: err instanceof Error ? err.message : String(err),
      })
    })
  } else if (newEmail && !args.activeContactId) {
    // Observability: queremos saber cuántas veces nos saltamos updateContact por falta de UUID.
    getCollector()?.recordEvent('pipeline_decision', 'updateContact_skipped_no_contactId', {
      agent: SOMNIO_V4_AGENT_ID,
      sessionId: args.ctx.sessionId,
      hasPhone: !!args.contactPhone,
    })
  }

  // ---------------------------------------------------------------------------
  // execute (fire-and-forget) 2: addOrderNote (handoff / mutation fail audit) — D-19 W-04
  // Disparador: orquestador pasa `extra.handoffReason` o `extra.mutationFailedNote`.
  // Body field es 'body' (caller-friendly schema del tool real, NO 'note').
  // Soporta idempotencyKey (Pitfall 5).
  // ---------------------------------------------------------------------------
  if (orderId && (args.extra?.handoffReason || args.extra?.mutationFailedNote)) {
    const isHandoff = !!args.extra?.handoffReason
    const noteBody = isHandoff
      ? `[v4 handoff] ${args.extra?.handoffReason ?? ''}`
      : `[v4 mutation_failed] ${args.extra?.mutationFailedNote ?? ''}`
    const tag = isHandoff ? 'handoff' : 'mutation_failed'
    type AddOrderNoteInput = { orderId: string; body: string; idempotencyKey?: string }
    const exec = asExec<AddOrderNoteInput, unknown>(tools.addOrderNote)
    void exec({
      orderId,
      body: noteBody,
      idempotencyKey: `somnio-v4-addOrderNote-${args.ctx.sessionId}-${tag}`,
    }).catch((err: unknown) => {
      getCollector()?.recordEvent('pipeline_decision', 'addOrderNote_failed_silent', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: args.ctx.sessionId,
        tag,
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }

  return outcome
}
