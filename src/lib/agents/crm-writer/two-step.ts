/**
 * CRM Writer — Two-Step Propose/Confirm Lifecycle
 * Phase 44 Plan 05.
 *
 * proposeAction: insert a 'proposed' row in crm_bot_actions, return {action_id, preview, expires_at}.
 *                Does NOT mutate the target entity. TTL = 5 min.
 * confirmAction: idempotent via optimistic UPDATE. Dispatches to domain layer.
 *                Second caller on same action_id gets 'already_executed' without re-mutating (Pitfall 3).
 * dispatchToolExecution: maps tool_name + input_params to the right domain function.
 *
 * NOTE: This is the ONLY file in the writer folder that imports createAdminClient.
 * It operates on crm_bot_actions (audit/lifecycle table), not on business entities.
 * Tool files (contacts.ts, etc.) use domain helpers exclusively (Regla 3 + Blocker 1).
 */

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import type { WriterContext, WriterPreview, ProposedAction, ConfirmResult } from './types'

import {
  createContact, updateContact, archiveContact,
  type CreateContactParams, type UpdateContactParams, type ArchiveContactParams,
} from '@/lib/domain/contacts'
import {
  createOrder, updateOrder, moveOrderToStage, archiveOrder,
  type CreateOrderParams, type UpdateOrderParams, type MoveOrderToStageParams, type ArchiveOrderParams,
} from '@/lib/domain/orders'
import {
  createNote, updateNote, archiveNote, archiveOrderNote,
  type CreateNoteParams, type UpdateNoteParams, type ArchiveNoteParams, type ArchiveOrderNoteParams,
} from '@/lib/domain/notes'
import {
  createTask, updateTask,
  type CreateTaskParams, type UpdateTaskParams,
} from '@/lib/domain/tasks'

const logger = createModuleLogger('crm-writer.two-step')

const PROPOSAL_TTL_MS = 5 * 60 * 1000  // 5 min (strict for writer; Plan 06 cron uses 30s grace)
export const CRM_WRITER_AGENT_ID = 'crm-writer' as const

// ------------------------------------------------------------------
// proposeAction
// ------------------------------------------------------------------

export interface ProposeActionInput {
  tool: string
  input: unknown
  preview: WriterPreview
}

export async function proposeAction(
  ctx: WriterContext,
  input: ProposeActionInput,
): Promise<ProposedAction> {
  const admin = createAdminClient()
  const actionId = randomUUID()
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS).toISOString()

  const { error } = await admin.from('crm_bot_actions').insert({
    id: actionId,
    workspace_id: ctx.workspaceId,
    agent_id: CRM_WRITER_AGENT_ID,
    invoker: ctx.invoker ?? null,
    tool_name: input.tool,
    input_params: input.input,
    preview: input.preview,
    status: 'proposed',
    expires_at: expiresAt,
  })

  if (error) {
    logger.error({ error, workspaceId: ctx.workspaceId, tool: input.tool }, 'proposeAction insert failed')
    throw new Error(`propose_failed: ${error.message}`)
  }

  logger.info({ actionId, workspaceId: ctx.workspaceId, tool: input.tool }, 'action proposed')

  return {
    status: 'proposed',
    action_id: actionId,
    tool: input.tool,
    preview: input.preview,
    expires_at: expiresAt,
  }
}

// ------------------------------------------------------------------
// confirmAction
// ------------------------------------------------------------------

export async function confirmAction(
  ctx: WriterContext,
  actionId: string,
): Promise<ConfirmResult> {
  const admin = createAdminClient()

  const { data: row, error: selectErr } = await admin
    .from('crm_bot_actions')
    .select('*')
    .eq('id', actionId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()

  if (selectErr) {
    logger.error({ selectErr, actionId, workspaceId: ctx.workspaceId }, 'confirm select failed')
    return { status: 'failed', error: { code: 'select_failed', message: selectErr.message } }
  }
  if (!row) return { status: 'not_found' }

  if (row.status === 'executed') return { status: 'already_executed', output: row.output }
  if (row.status === 'failed') {
    return {
      status: 'failed',
      error: row.error ?? { code: 'unknown', message: 'previously failed' },
    }
  }

  if (row.status === 'expired' || new Date(row.expires_at).getTime() < Date.now()) {
    await admin
      .from('crm_bot_actions')
      .update({ status: 'expired' })
      .eq('id', actionId)
      .eq('status', 'proposed')
    return { status: 'expired' }
  }

  let output: unknown
  let failed: { code: string; message: string } | null = null
  try {
    output = await dispatchToolExecution(ctx, row.tool_name, row.input_params)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failed = { code: 'dispatch_error', message }
    logger.error({ err, actionId, tool: row.tool_name }, 'dispatch threw')
  }

  if (failed) {
    const { data: updated } = await admin
      .from('crm_bot_actions')
      .update({ status: 'failed', error: failed, executed_at: new Date().toISOString() })
      .eq('id', actionId)
      .eq('status', 'proposed')
      .select()
      .maybeSingle()
    if (!updated) {
      const { data: current } = await admin
        .from('crm_bot_actions')
        .select('status, output, error')
        .eq('id', actionId)
        .maybeSingle()
      if (current?.status === 'executed') return { status: 'already_executed', output: current.output }
      if (current?.status === 'failed') return { status: 'failed', error: current.error }
    }
    return { status: 'failed', error: failed }
  }

  const { data: updated, error: updateErr } = await admin
    .from('crm_bot_actions')
    .update({
      status: 'executed',
      output: output as Record<string, unknown> | null,
      executed_at: new Date().toISOString(),
    })
    .eq('id', actionId)
    .eq('status', 'proposed')
    .select('status, output')
    .maybeSingle()

  if (updateErr) {
    logger.error({ updateErr, actionId }, 'confirm UPDATE failed')
    return { status: 'failed', error: { code: 'update_failed', message: updateErr.message } }
  }

  if (!updated) {
    // Lost the optimistic race — another caller already transitioned the row.
    const { data: current } = await admin
      .from('crm_bot_actions')
      .select('status, output')
      .eq('id', actionId)
      .maybeSingle()
    if (current?.status === 'executed') return { status: 'already_executed', output: current.output }
    return { status: 'not_found' }
  }

  logger.info({ actionId, tool: row.tool_name }, 'action executed')
  return { status: 'executed', output }
}

// ------------------------------------------------------------------
// dispatchToolExecution — maps tool_name → domain function (Regla 3)
// ------------------------------------------------------------------

async function dispatchToolExecution(
  ctx: WriterContext,
  toolName: string,
  inputParams: unknown,
): Promise<unknown> {
  const domainCtx = { workspaceId: ctx.workspaceId, source: 'tool-handler' as const }

  switch (toolName) {
    case 'createContact': {
      const result = await createContact(domainCtx, inputParams as CreateContactParams)
      return unwrap(result, toolName)
    }
    case 'updateContact': {
      const result = await updateContact(domainCtx, inputParams as UpdateContactParams)
      return unwrap(result, toolName)
    }
    case 'archiveContact': {
      const result = await archiveContact(domainCtx, inputParams as ArchiveContactParams)
      return unwrap(result, toolName)
    }
    case 'createOrder': {
      const result = await createOrder(domainCtx, inputParams as CreateOrderParams)
      return unwrap(result, toolName)
    }
    case 'updateOrder': {
      const result = await updateOrder(domainCtx, inputParams as UpdateOrderParams)
      return unwrap(result, toolName)
    }
    case 'moveOrderToStage': {
      const result = await moveOrderToStage(domainCtx, inputParams as MoveOrderToStageParams)
      return unwrap(result, toolName)
    }
    case 'archiveOrder': {
      const result = await archiveOrder(domainCtx, inputParams as ArchiveOrderParams)
      return unwrap(result, toolName)
    }
    case 'createNote': {
      const result = await createNote(domainCtx, inputParams as CreateNoteParams)
      return unwrap(result, toolName)
    }
    case 'updateNote': {
      const result = await updateNote(domainCtx, inputParams as UpdateNoteParams)
      return unwrap(result, toolName)
    }
    case 'archiveNote': {
      const result = await archiveNote(domainCtx, inputParams as ArchiveNoteParams)
      return unwrap(result, toolName)
    }
    case 'archiveOrderNote': {
      const result = await archiveOrderNote(domainCtx, inputParams as ArchiveOrderNoteParams)
      return unwrap(result, toolName)
    }
    case 'createTask': {
      const result = await createTask(domainCtx, inputParams as CreateTaskParams)
      return unwrap(result, toolName)
    }
    case 'updateTask':
    case 'completeTask': {
      const result = await updateTask(domainCtx, inputParams as UpdateTaskParams)
      return unwrap(result, toolName)
    }
    default:
      throw new Error(`unknown_tool: ${toolName}`)
  }
}

function unwrap<T>(result: { success: boolean; data?: T; error?: string }, toolName: string): T {
  if (!result.success) {
    throw new Error(`${toolName}_failed: ${result.error ?? 'unknown'}`)
  }
  return result.data as T
}
