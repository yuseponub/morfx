// ============================================================================
// Phase 17: CRM Automations Engine — Trigger Emitter
// Async functions that domain layer calls to notify the automation engine
// of CRM/WhatsApp/Task changes.
// Each function checks cascade depth and sends an Inngest event.
//
// IMPORTANT: All emit functions are async and MUST be awaited by callers.
// Fire-and-forget inngest.send is unreliable in Vercel serverless / Inngest
// steps — the process can terminate before the send completes.
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
 * Send event to Inngest with await. Errors are logged but never thrown
 * to avoid blocking server actions or breaking automation chains.
 */
async function sendEvent(
  eventName: string,
  data: Record<string, unknown>,
  triggerType: string,
  workspaceId: string
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (inngest.send as any)({ name: eventName, data })
  } catch (err: unknown) {
    console.error(
      `[trigger-emitter] Failed to emit ${triggerType} for workspace ${workspaceId}:`,
      err instanceof Error ? err.message : err
    )
  }
}

// ============================================================================
// Emitter Functions (13 total — one per trigger type)
// ============================================================================

/**
 * Emit when an order moves to a different pipeline stage.
 */
export async function emitOrderStageChanged(data: {
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
  contactAddress?: string | null
  contactCity?: string | null
  contactDepartment?: string | null
  shippingAddress?: string | null
  shippingCity?: string | null
  shippingDepartment?: string | null
  orderValue?: number | null
  orderName?: string | null
  orderDescription?: string | null
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('order.stage_changed', data.workspaceId, depth)) return

  await sendEvent(
    'automation/order.stage_changed',
    { ...data, cascadeDepth: depth },
    'order.stage_changed',
    data.workspaceId
  )
}

/**
 * Emit when a tag is assigned to a contact or order.
 */
export async function emitTagAssigned(data: {
  workspaceId: string
  entityType: string
  entityId: string
  tagId: string
  tagName: string
  contactId: string | null
  contactName?: string
  contactPhone?: string
  orderId?: string
  pipelineId?: string
  stageId?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('tag.assigned', data.workspaceId, depth)) return

  await sendEvent(
    'automation/tag.assigned',
    { ...data, cascadeDepth: depth },
    'tag.assigned',
    data.workspaceId
  )
}

/**
 * Emit when a tag is removed from a contact or order.
 */
export async function emitTagRemoved(data: {
  workspaceId: string
  entityType: string
  entityId: string
  tagId: string
  tagName: string
  contactId: string | null
  contactName?: string
  orderId?: string
  pipelineId?: string
  stageId?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('tag.removed', data.workspaceId, depth)) return

  await sendEvent(
    'automation/tag.removed',
    { ...data, cascadeDepth: depth },
    'tag.removed',
    data.workspaceId
  )
}

/**
 * Emit when a new contact is created.
 */
export async function emitContactCreated(data: {
  workspaceId: string
  contactId: string
  contactName: string
  contactPhone?: string
  contactEmail?: string
  contactCity?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('contact.created', data.workspaceId, depth)) return

  await sendEvent(
    'automation/contact.created',
    { ...data, cascadeDepth: depth },
    'contact.created',
    data.workspaceId
  )
}

/**
 * Emit when a new order is created (including from duplication).
 */
export async function emitOrderCreated(data: {
  workspaceId: string
  orderId: string
  pipelineId: string
  stageId: string
  contactId: string | null
  totalValue?: number
  sourceOrderId?: string
  contactName?: string
  contactPhone?: string
  contactAddress?: string | null
  contactCity?: string | null
  contactDepartment?: string | null
  shippingAddress?: string | null
  shippingCity?: string | null
  shippingDepartment?: string | null
  orderName?: string | null
  orderDescription?: string | null
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('order.created', data.workspaceId, depth)) return

  await sendEvent(
    'automation/order.created',
    { ...data, cascadeDepth: depth },
    'order.created',
    data.workspaceId
  )
}

/**
 * Emit when a field changes on a contact or order.
 */
export async function emitFieldChanged(data: {
  workspaceId: string
  entityType: string
  entityId: string
  fieldName: string
  previousValue: string | null
  newValue: string | null
  contactId?: string
  contactName?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('field.changed', data.workspaceId, depth)) return

  await sendEvent(
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
export async function emitWhatsAppMessageReceived(data: {
  workspaceId: string
  conversationId: string
  contactId: string | null
  messageContent: string
  phone: string
  contactName?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('whatsapp.message_received', data.workspaceId, depth)) return

  await sendEvent(
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
export async function emitWhatsAppKeywordMatch(data: {
  workspaceId: string
  conversationId: string
  contactId: string | null
  messageContent: string
  phone: string
  keywordMatched: string
  contactName?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('whatsapp.keyword_match', data.workspaceId, depth)) return

  await sendEvent(
    'automation/whatsapp.keyword_match',
    { ...data, cascadeDepth: depth },
    'whatsapp.keyword_match',
    data.workspaceId
  )
}

/**
 * Emit when a task is marked as completed.
 */
export async function emitTaskCompleted(data: {
  workspaceId: string
  taskId: string
  taskTitle: string
  contactId: string | null
  orderId: string | null
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('task.completed', data.workspaceId, depth)) return

  await sendEvent(
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
export async function emitTaskOverdue(data: {
  workspaceId: string
  taskId: string
  taskTitle: string
  dueDate: string
  contactId: string | null
  orderId: string | null
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('task.overdue', data.workspaceId, depth)) return

  await sendEvent(
    'automation/task.overdue',
    { ...data, cascadeDepth: depth },
    'task.overdue',
    data.workspaceId
  )
}

// ============================================================================
// Shopify Trigger Emitters (Phase 20: Integration Automations)
// ============================================================================

/**
 * Emit when a Shopify order is created (orders/create webhook).
 */
export async function emitShopifyOrderCreated(data: {
  workspaceId: string
  shopifyOrderId: number
  shopifyOrderNumber: string
  total: string
  financialStatus: string
  email: string | null
  phone: string | null
  note: string | null
  products: Array<{ sku: string; title: string; quantity: number; price: string }>
  shippingAddress: string | null
  shippingCity: string | null
  shippingDepartment: string | null
  tags: string | null
  contactId?: string
  contactName?: string
  contactPhone?: string
  orderId?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('shopify.order_created', data.workspaceId, depth)) return

  await sendEvent(
    'automation/shopify.order_created',
    { ...data, cascadeDepth: depth },
    'shopify.order_created',
    data.workspaceId
  )
}

/**
 * Emit when a Shopify draft order is created (draft_orders/create webhook).
 */
export async function emitShopifyDraftOrderCreated(data: {
  workspaceId: string
  shopifyDraftOrderId: number
  shopifyOrderNumber: string
  total: string
  status: string
  email: string | null
  phone: string | null
  note: string | null
  products: Array<{ sku: string; title: string; quantity: number; price: string }>
  shippingAddress: string | null
  contactName?: string
  contactPhone?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('shopify.draft_order_created', data.workspaceId, depth)) return

  await sendEvent(
    'automation/shopify.draft_order_created',
    { ...data, cascadeDepth: depth },
    'shopify.draft_order_created',
    data.workspaceId
  )
}

/**
 * Emit when a Shopify order is updated (orders/updated webhook).
 */
export async function emitShopifyOrderUpdated(data: {
  workspaceId: string
  shopifyOrderId: number
  shopifyOrderNumber: string
  total: string
  financialStatus: string
  fulfillmentStatus: string | null
  email: string | null
  phone: string | null
  note: string | null
  products: Array<{ sku: string; title: string; quantity: number; price: string }>
  shippingAddress: string | null
  shippingCity: string | null
  shippingDepartment: string | null
  tags: string | null
  contactId?: string
  contactName?: string
  contactPhone?: string
  orderId?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('shopify.order_updated', data.workspaceId, depth)) return

  await sendEvent(
    'automation/shopify.order_updated',
    { ...data, cascadeDepth: depth },
    'shopify.order_updated',
    data.workspaceId
  )
}
