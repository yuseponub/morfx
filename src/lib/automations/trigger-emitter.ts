// ============================================================================
// Phase 17: CRM Automations Engine — Trigger Emitter
// Fire-and-forget functions that server actions call to notify the
// automation engine of CRM/WhatsApp/Task changes.
// Each function checks cascade depth and emits an Inngest event.
// ============================================================================

import { inngest } from '@/inngest/client'
import { MAX_CASCADE_DEPTH } from './constants'

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check cascade depth and warn if exceeded.
 * Returns true if the event should be suppressed (depth >= MAX).
 */
function isCascadeSuppressed(
  triggerType: string,
  workspaceId: string,
  cascadeDepth: number
): boolean {
  if (cascadeDepth >= MAX_CASCADE_DEPTH) {
    console.warn(
      `[trigger-emitter] Cascade depth ${cascadeDepth} >= MAX_CASCADE_DEPTH (${MAX_CASCADE_DEPTH}). ` +
      `Suppressing ${triggerType} for workspace ${workspaceId}`
    )
    return true
  }
  return false
}

/**
 * Fire-and-forget: send event to Inngest without awaiting.
 * Errors are logged but never thrown to avoid blocking server actions.
 */
function fireAndForget(
  eventName: string,
  data: Record<string, unknown>,
  triggerType: string,
  workspaceId: string
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(inngest.send as any)({ name: eventName, data }).catch((err: unknown) => {
    console.error(
      `[trigger-emitter] Failed to emit ${triggerType} for workspace ${workspaceId}:`,
      err instanceof Error ? err.message : err
    )
  })
}

// ============================================================================
// Emitter Functions (10 total — one per trigger type)
// ============================================================================

/**
 * Emit when an order moves to a different pipeline stage.
 */
export function emitOrderStageChanged(data: {
  workspaceId: string
  orderId: string
  previousStageId: string
  newStageId: string
  pipelineId: string
  contactId: string | null
  previousStageName?: string
  newStageName?: string
  pipelineName?: string
  contactName?: string
  contactPhone?: string
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('order.stage_changed', data.workspaceId, depth)) return

  fireAndForget(
    'automation/order.stage_changed',
    { ...data, cascadeDepth: depth },
    'order.stage_changed',
    data.workspaceId
  )
}

/**
 * Emit when a tag is assigned to a contact or order.
 */
export function emitTagAssigned(data: {
  workspaceId: string
  entityType: string
  entityId: string
  tagId: string
  tagName: string
  contactId: string | null
  contactName?: string
  contactPhone?: string
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('tag.assigned', data.workspaceId, depth)) return

  fireAndForget(
    'automation/tag.assigned',
    { ...data, cascadeDepth: depth },
    'tag.assigned',
    data.workspaceId
  )
}

/**
 * Emit when a tag is removed from a contact or order.
 */
export function emitTagRemoved(data: {
  workspaceId: string
  entityType: string
  entityId: string
  tagId: string
  tagName: string
  contactId: string | null
  contactName?: string
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('tag.removed', data.workspaceId, depth)) return

  fireAndForget(
    'automation/tag.removed',
    { ...data, cascadeDepth: depth },
    'tag.removed',
    data.workspaceId
  )
}

/**
 * Emit when a new contact is created.
 */
export function emitContactCreated(data: {
  workspaceId: string
  contactId: string
  contactName: string
  contactPhone?: string
  contactEmail?: string
  contactCity?: string
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('contact.created', data.workspaceId, depth)) return

  fireAndForget(
    'automation/contact.created',
    { ...data, cascadeDepth: depth },
    'contact.created',
    data.workspaceId
  )
}

/**
 * Emit when a new order is created (including from duplication).
 */
export function emitOrderCreated(data: {
  workspaceId: string
  orderId: string
  pipelineId: string
  stageId: string
  contactId: string | null
  totalValue?: number
  sourceOrderId?: string
  contactName?: string
  contactPhone?: string
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('order.created', data.workspaceId, depth)) return

  fireAndForget(
    'automation/order.created',
    { ...data, cascadeDepth: depth },
    'order.created',
    data.workspaceId
  )
}

/**
 * Emit when a field changes on a contact or order.
 */
export function emitFieldChanged(data: {
  workspaceId: string
  entityType: string
  entityId: string
  fieldName: string
  previousValue: string | null
  newValue: string | null
  contactId?: string
  contactName?: string
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('field.changed', data.workspaceId, depth)) return

  fireAndForget(
    'automation/field.changed',
    { ...data, cascadeDepth: depth },
    'field.changed',
    data.workspaceId
  )
}

/**
 * Emit when a WhatsApp message is received.
 * Typically called from the webhook handler.
 */
export function emitWhatsAppMessageReceived(data: {
  workspaceId: string
  conversationId: string
  contactId: string | null
  messageContent: string
  phone: string
  contactName?: string
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('whatsapp.message_received', data.workspaceId, depth)) return

  fireAndForget(
    'automation/whatsapp.message_received',
    { ...data, cascadeDepth: depth },
    'whatsapp.message_received',
    data.workspaceId
  )
}

/**
 * Emit when a WhatsApp message matches configured keywords.
 * Typically called after message content is checked against automation trigger config.
 */
export function emitWhatsAppKeywordMatch(data: {
  workspaceId: string
  conversationId: string
  contactId: string | null
  messageContent: string
  phone: string
  keywordMatched: string
  contactName?: string
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('whatsapp.keyword_match', data.workspaceId, depth)) return

  fireAndForget(
    'automation/whatsapp.keyword_match',
    { ...data, cascadeDepth: depth },
    'whatsapp.keyword_match',
    data.workspaceId
  )
}

/**
 * Emit when a task is marked as completed.
 */
export function emitTaskCompleted(data: {
  workspaceId: string
  taskId: string
  taskTitle: string
  contactId: string | null
  orderId: string | null
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('task.completed', data.workspaceId, depth)) return

  fireAndForget(
    'automation/task.completed',
    { ...data, cascadeDepth: depth },
    'task.completed',
    data.workspaceId
  )
}

/**
 * Emit when a task passes its due date without being completed.
 * Typically called from a scheduled cron job or Inngest function.
 */
export function emitTaskOverdue(data: {
  workspaceId: string
  taskId: string
  taskTitle: string
  dueDate: string
  contactId: string | null
  orderId: string | null
  cascadeDepth?: number
}): void {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('task.overdue', data.workspaceId, depth)) return

  fireAndForget(
    'automation/task.overdue',
    { ...data, cascadeDepth: depth },
    'task.overdue',
    data.workspaceId
  )
}
