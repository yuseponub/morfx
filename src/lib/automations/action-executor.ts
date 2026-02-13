// ============================================================================
// Phase 17: CRM Automations Engine — Action Executor
// Executes automation actions via domain layer and direct DB ops.
// Uses createAdminClient to bypass RLS (runs from Inngest, no user session).
//
// Phase 18: All CRM actions (orders, contacts, tags) delegate to domain.
// Trigger emissions handled by domain — no inline trigger code for
// orders, contacts, or tags here.
// Remaining direct DB: WhatsApp actions, task creation, webhooks.
// ============================================================================

import type { AutomationAction, ActionType, TriggerContext } from './types'
import { resolveVariables, resolveVariablesInObject } from './variable-resolver'
import { WEBHOOK_TIMEOUT_MS } from './constants'
import { initializeTools } from '@/lib/tools/init'
import { executeToolFromWebhook } from '@/lib/tools/executor'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMediaMessage } from '@/lib/whatsapp/api'
import {
  createOrder as domainCreateOrder,
  duplicateOrder as domainDuplicateOrder,
  moveOrderToStage as domainMoveOrderToStage,
  updateOrder as domainUpdateOrder,
  addOrderTag as domainAddOrderTag,
  removeOrderTag as domainRemoveOrderTag,
} from '@/lib/domain/orders'
import {
  updateContact as domainUpdateContact,
} from '@/lib/domain/contacts'
import {
  assignTag as domainAssignTag,
  removeTag as domainRemoveTag,
} from '@/lib/domain/tags'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// Types
// ============================================================================

export interface ActionResult {
  success: boolean
  result?: unknown
  error?: string
  duration_ms: number
}

// Request metadata for tool executor (Inngest context, no real IP/UA)
const AUTOMATION_REQUEST_META = {
  ip: 'inngest',
  userAgent: 'automation-engine',
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Execute a single automation action.
 *
 * @param action - The action definition from the automation
 * @param context - Trigger context with entity data for variable resolution
 * @param workspaceId - Workspace scope for DB operations
 * @param cascadeDepth - Current cascade depth (for emitting child triggers)
 * @returns ActionResult with success/error and timing
 */
export async function executeAction(
  action: AutomationAction,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<ActionResult> {
  const startMs = Date.now()

  try {
    // Ensure tool registry is ready (idempotent)
    initializeTools()

    // Resolve variables in action params before execution
    const resolvedParams = resolveVariablesInObject(
      action.params,
      context as unknown as Record<string, unknown>
    )

    // Dispatch to type-specific handler
    const result = await executeByType(
      action.type,
      resolvedParams,
      context,
      workspaceId,
      cascadeDepth
    )

    return {
      success: true,
      result,
      duration_ms: Date.now() - startMs,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[action-executor] Failed action ${action.type} in workspace ${workspaceId}:`,
      message
    )
    return {
      success: false,
      error: message,
      duration_ms: Date.now() - startMs,
    }
  }
}

// ============================================================================
// Action Dispatcher
// ============================================================================

async function executeByType(
  type: ActionType,
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  switch (type) {
    case 'assign_tag':
      return executeAssignTag(params, context, workspaceId, cascadeDepth)
    case 'remove_tag':
      return executeRemoveTag(params, context, workspaceId, cascadeDepth)
    case 'change_stage':
      return executeChangeStage(params, context, workspaceId, cascadeDepth)
    case 'update_field':
      return executeUpdateField(params, context, workspaceId, cascadeDepth)
    case 'create_order':
      return executeCreateOrder(params, context, workspaceId, cascadeDepth)
    case 'duplicate_order':
      return executeDuplicateOrder(params, context, workspaceId, cascadeDepth)
    case 'send_whatsapp_template':
      return executeSendWhatsAppTemplate(params, context, workspaceId)
    case 'send_whatsapp_text':
      return executeSendWhatsAppText(params, context, workspaceId)
    case 'send_whatsapp_media':
      return executeSendWhatsAppMedia(params, context, workspaceId)
    case 'create_task':
      return executeCreateTask(params, context, workspaceId)
    case 'webhook':
      return executeWebhook(params)
    default: {
      const _exhaustive: never = type
      throw new Error(`Unknown action type: ${_exhaustive}`)
    }
  }
}

// ============================================================================
// CRM Order Actions — via domain/orders
// Domain handles DB logic + trigger emission. cascadeDepth + 1 passed via ctx.
// ============================================================================

/**
 * Assign a tag to a contact or order.
 * Both entity types delegate to domain (handles DB + trigger emission).
 */
async function executeAssignTag(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const tagName = String(params.tagName || '')
  const entityType = String(params.entityType || 'contact') as 'contact' | 'order'

  if (!tagName) throw new Error('tagName is required for assign_tag')

  const entityId = entityType === 'order'
    ? context.orderId
    : context.contactId

  if (!entityId) throw new Error(`No ${entityType}Id available in trigger context`)

  // Orders: delegate to domain/orders.addOrderTag
  if (entityType === 'order') {
    const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
    const result = await domainAddOrderTag(ctx, { orderId: entityId, tagName })
    if (!result.success) throw new Error(result.error || 'Failed to assign tag')
    return { tagId: result.data!.tagId, tagName, entityType, entityId, assigned: true }
  }

  // Contacts: delegate to domain/tags.assignTag
  const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
  const result = await domainAssignTag(ctx, { entityType: 'contact', entityId, tagName })
  if (!result.success) throw new Error(result.error || 'Failed to assign tag')
  return { tagId: result.data!.tagId, tagName, entityType, entityId, assigned: true }
}

/**
 * Remove a tag from a contact or order.
 * Both entity types delegate to domain (handles DB + trigger emission).
 */
async function executeRemoveTag(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const tagName = String(params.tagName || '')
  const entityType = String(params.entityType || 'contact') as 'contact' | 'order'

  if (!tagName) throw new Error('tagName is required for remove_tag')

  const entityId = entityType === 'order'
    ? context.orderId
    : context.contactId

  if (!entityId) throw new Error(`No ${entityType}Id available in trigger context`)

  // Orders: delegate to domain/orders.removeOrderTag
  if (entityType === 'order') {
    const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
    const result = await domainRemoveOrderTag(ctx, { orderId: entityId, tagName })
    if (!result.success) throw new Error(result.error || 'Failed to remove tag')
    return { tagId: result.data!.tagId, tagName, entityType, entityId, removed: true }
  }

  // Contacts: delegate to domain/tags.removeTag
  const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
  const result = await domainRemoveTag(ctx, { entityType: 'contact', entityId, tagName })
  if (!result.success) throw new Error(result.error || 'Failed to remove tag')
  return { tagId: result.data!.tagId, tagName, entityType, entityId, removed: true }
}

/**
 * Change the stage of an order.
 * Delegates to domain/orders.moveOrderToStage.
 */
async function executeChangeStage(
  params: Record<string, unknown>,
  _context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const stageId = String(params.stageId || '')
  const orderId = _context.orderId

  if (!stageId) throw new Error('stageId is required for change_stage')
  if (!orderId) throw new Error('No orderId available in trigger context')

  const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
  const result = await domainMoveOrderToStage(ctx, { orderId, newStageId: stageId })

  if (!result.success) throw new Error(result.error || 'Failed to change stage')

  return {
    orderId,
    previousStageId: result.data!.previousStageId,
    newStageId: result.data!.newStageId,
  }
}

/**
 * Update a field on a contact or order.
 * Both entity types delegate to domain (handles DB + field.changed trigger emission).
 */
async function executeUpdateField(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const fieldName = String(params.fieldName || '')
  const value = params.value
  const entityType = String(params.entityType || 'contact')

  if (!fieldName) throw new Error('fieldName is required for update_field')

  const entityId = entityType === 'order'
    ? context.orderId
    : context.contactId

  if (!entityId) throw new Error(`No ${entityType}Id available in trigger context`)

  // Orders: delegate to domain/orders.updateOrder
  if (entityType === 'order') {
    const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }

    // Map field name to domain updateOrder params
    const standardOrderFields = ['shipping_address', 'description', 'carrier', 'tracking_number', 'shipping_city', 'closing_date', 'contact_id']
    const domainFieldMap: Record<string, string> = {
      'shipping_address': 'shippingAddress',
      'description': 'description',
      'carrier': 'carrier',
      'tracking_number': 'trackingNumber',
      'shipping_city': 'shippingCity',
      'closing_date': 'closingDate',
      'contact_id': 'contactId',
    }

    if (standardOrderFields.includes(fieldName)) {
      const paramKey = domainFieldMap[fieldName] || fieldName
      const result = await domainUpdateOrder(ctx, {
        orderId: entityId,
        [paramKey]: value,
      })
      if (!result.success) throw new Error(result.error || `Failed to update field ${fieldName}`)
    } else {
      // Custom field: read existing, merge, call domain updateOrder
      const supabase = createAdminClient()
      const { data: current } = await supabase
        .from('orders')
        .select('custom_fields')
        .eq('id', entityId)
        .eq('workspace_id', workspaceId)
        .single()

      const existingCustom = (current?.custom_fields as Record<string, unknown>) || {}
      const updatedCustom = { ...existingCustom, [fieldName]: value }

      const result = await domainUpdateOrder(ctx, {
        orderId: entityId,
        customFields: updatedCustom,
      })
      if (!result.success) throw new Error(result.error || `Failed to update custom field ${fieldName}`)
    }

    return { entityType, entityId, fieldName, newValue: value }
  }

  // Contacts: delegate to domain/contacts.updateContact
  const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
  const standardContactFields = ['name', 'phone', 'email', 'address', 'city']

  if (standardContactFields.includes(fieldName)) {
    // Standard field: call domain updateContact with the field
    const result = await domainUpdateContact(ctx, {
      contactId: entityId,
      [fieldName]: value,
    })
    if (!result.success) throw new Error(result.error || `Failed to update field ${fieldName}`)
  } else {
    // Custom field: read existing, merge, call domain updateContact
    const supabase = createAdminClient()
    const { data: current } = await supabase
      .from('contacts')
      .select('custom_fields')
      .eq('id', entityId)
      .eq('workspace_id', workspaceId)
      .single()

    const existingCustom = (current?.custom_fields as Record<string, unknown>) || {}
    const updatedCustom = { ...existingCustom, [fieldName]: value }

    const result = await domainUpdateContact(ctx, {
      contactId: entityId,
      customFields: updatedCustom,
    })
    if (!result.success) throw new Error(result.error || `Failed to update custom field ${fieldName}`)
  }

  return { entityType, entityId, fieldName, newValue: value }
}

/**
 * Create a new order in a pipeline.
 * Delegates to domain/orders.createOrder.
 */
async function executeCreateOrder(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const pipelineId = String(params.pipelineId || '')
  const stageId = params.stageId ? String(params.stageId) : undefined
  const contactId = context.contactId

  if (!pipelineId) throw new Error('pipelineId is required for create_order')
  if (!contactId) throw new Error('No contactId available in trigger context')

  const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
  const result = await domainCreateOrder(ctx, {
    pipelineId,
    stageId,
    contactId,
  })

  if (!result.success) throw new Error(result.error || 'Failed to create order')

  // Copy tags from trigger context order if configured
  if (params.copyTags && context.orderId) {
    const supabase = createAdminClient()
    const { data: sourceTags } = await supabase
      .from('order_tags')
      .select('tag_id')
      .eq('order_id', context.orderId)

    if (sourceTags && sourceTags.length > 0) {
      await supabase
        .from('order_tags')
        .insert(sourceTags.map(t => ({ order_id: result.data!.orderId, tag_id: t.tag_id })))
    }
  }

  return { orderId: result.data!.orderId, pipelineId, stageId: result.data!.stageId }
}

/**
 * Duplicate an order to another pipeline with source_order_id tracking.
 * Delegates to domain/orders.duplicateOrder.
 */
async function executeDuplicateOrder(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const targetPipelineId = String(params.targetPipelineId || '')
  const targetStageId = params.targetStageId ? String(params.targetStageId) : undefined
  const sourceOrderId = context.orderId

  if (!targetPipelineId) throw new Error('targetPipelineId is required for duplicate_order')
  if (!sourceOrderId) throw new Error('No orderId available in trigger context')

  const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
  const result = await domainDuplicateOrder(ctx, {
    sourceOrderId,
    targetPipelineId,
    targetStageId,
  })

  if (!result.success) throw new Error(result.error || 'Failed to duplicate order')

  // Copy tags if configured (domain doesn't handle tag copying)
  if (params.copyTags) {
    const supabase = createAdminClient()
    const { data: sourceTags } = await supabase
      .from('order_tags')
      .select('tag_id')
      .eq('order_id', sourceOrderId)

    if (sourceTags && sourceTags.length > 0) {
      await supabase
        .from('order_tags')
        .insert(sourceTags.map(t => ({ order_id: result.data!.orderId, tag_id: t.tag_id })))
    }
  }

  return {
    newOrderId: result.data!.orderId,
    sourceOrderId: result.data!.sourceOrderId,
    targetPipelineId,
    targetStageId: targetStageId || null,
  }
}

// ============================================================================
// WhatsApp Actions (via existing tool handlers — unchanged)
// ============================================================================

/**
 * Send a WhatsApp template message using the existing tool handler.
 * Tool name verified: whatsapp.template.send
 */
async function executeSendWhatsAppTemplate(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string
): Promise<unknown> {
  const contactId = context.contactId
  if (!contactId) throw new Error('No contactId available for WhatsApp template send')

  const templateName = String(params.templateName || '')
  if (!templateName) throw new Error('templateName is required for send_whatsapp_template')

  const result = await executeToolFromWebhook(
    'whatsapp.template.send',
    {
      contactId,
      templateName,
      templateParams: params.variables || {},
      language: params.language || 'es',
    },
    workspaceId,
    AUTOMATION_REQUEST_META
  )

  if (result.status === 'error') {
    throw new Error(result.error?.message || 'WhatsApp template send failed')
  }

  return result.outputs
}

/**
 * Send a WhatsApp text message using the existing tool handler.
 * Tool name verified: whatsapp.message.send
 */
async function executeSendWhatsAppText(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string
): Promise<unknown> {
  const contactId = context.contactId
  if (!contactId) throw new Error('No contactId available for WhatsApp text send')

  const text = String(params.text || '')
  if (!text) throw new Error('text is required for send_whatsapp_text')

  const result = await executeToolFromWebhook(
    'whatsapp.message.send',
    {
      contactId,
      message: text,
    },
    workspaceId,
    AUTOMATION_REQUEST_META
  )

  if (result.status === 'error') {
    throw new Error(result.error?.message || 'WhatsApp text send failed')
  }

  return result.outputs
}

/**
 * Send a WhatsApp media message.
 * Uses direct 360dialog API since there's no dedicated media tool handler.
 */
async function executeSendWhatsAppMedia(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string
): Promise<unknown> {
  const contactId = context.contactId
  if (!contactId) throw new Error('No contactId available for WhatsApp media send')

  const mediaUrl = String(params.mediaUrl || '')
  if (!mediaUrl) throw new Error('mediaUrl is required for send_whatsapp_media')

  const caption = params.caption ? String(params.caption) : undefined

  const supabase = createAdminClient()

  // Get contact phone
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone')
    .eq('id', contactId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!contact?.phone) throw new Error('Contact phone not found')

  // Get conversation for the contact
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, phone, last_customer_message_at')
    .eq('contact_id', contactId)
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single()

  if (!conversation) throw new Error('No conversation found for contact')

  // Check 24h window
  if (conversation.last_customer_message_at) {
    const hoursSince =
      (Date.now() - new Date(conversation.last_customer_message_at).getTime()) / (1000 * 60 * 60)
    if (hoursSince >= 24) {
      throw new Error('24h WhatsApp window closed — cannot send media')
    }
  } else {
    throw new Error('No customer message — 24h window not open')
  }

  // Get API key
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = workspace?.settings as any
  const apiKey = settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) throw new Error('WhatsApp API key not configured')

  // Detect media type from URL extension
  const ext = mediaUrl.split('.').pop()?.toLowerCase() || ''
  const mediaType: 'image' | 'video' | 'audio' | 'document' =
    ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image' :
    ['mp4', 'avi', 'mov'].includes(ext) ? 'video' :
    ['mp3', 'ogg', 'wav', 'opus'].includes(ext) ? 'audio' :
    'document'

  // Send via 360dialog API directly
  const response = await sendMediaMessage(
    apiKey,
    conversation.phone,
    mediaType,
    mediaUrl,
    caption
  )

  // Save message to DB
  const wamid = response.messages[0]?.id
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    workspace_id: workspaceId,
    wamid,
    direction: 'outbound',
    type: mediaType,
    content: { [mediaType]: { link: mediaUrl }, ...(caption ? { caption } : {}) } as unknown as Record<string, unknown>,
    status: 'sent',
    timestamp: new Date().toISOString(),
  })

  // Update conversation
  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: caption ? `[${mediaType}] ${caption.slice(0, 80)}` : `[${mediaType}]`,
    })
    .eq('id', conversation.id)

  return { messageId: wamid, mediaType, sent: true }
}

// ============================================================================
// Task Action (Direct DB — unchanged)
// ============================================================================

/**
 * Create a task linked to the trigger's contact/order.
 */
async function executeCreateTask(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string
): Promise<unknown> {
  const supabase = createAdminClient()
  const title = String(params.title || '')
  if (!title) throw new Error('title is required for create_task')

  const description = params.description ? String(params.description) : null

  // Calculate due date from relative delay if provided
  let dueDate: string | null = null
  if (params.dueDateRelative && typeof params.dueDateRelative === 'object') {
    const delay = params.dueDateRelative as { amount: number; unit: string }
    const now = new Date()
    switch (delay.unit) {
      case 'minutes':
        now.setMinutes(now.getMinutes() + delay.amount)
        break
      case 'hours':
        now.setHours(now.getHours() + delay.amount)
        break
      case 'days':
        now.setDate(now.getDate() + delay.amount)
        break
    }
    dueDate = now.toISOString()
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: workspaceId,
      title,
      description,
      due_date: dueDate,
      contact_id: context.contactId || null,
      order_id: context.orderId || null,
      assigned_to: params.assignToUserId ? String(params.assignToUserId) : null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !task) {
    throw new Error(`Failed to create task: ${error?.message}`)
  }

  return { taskId: task.id, title, dueDate }
}

// ============================================================================
// Webhook Action (unchanged)
// ============================================================================

/**
 * Send an HTTP POST to an external URL.
 * Timeout at WEBHOOK_TIMEOUT_MS.
 */
async function executeWebhook(
  params: Record<string, unknown>
): Promise<unknown> {
  const url = String(params.url || '')
  if (!url) throw new Error('url is required for webhook')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Add custom headers
  if (params.headers && typeof params.headers === 'object') {
    const customHeaders = params.headers as Record<string, string>
    Object.assign(headers, customHeaders)
  }

  // Build payload
  const payload = params.payloadTemplate || params.payload || {}

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch {
      responseBody = await response.text()
    }

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${JSON.stringify(responseBody)}`)
    }

    return {
      status: response.status,
      body: responseBody,
    }
  } finally {
    clearTimeout(timeout)
  }
}
