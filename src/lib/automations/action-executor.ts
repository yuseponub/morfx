// ============================================================================
// Phase 17: CRM Automations Engine — Action Executor
// Executes automation actions via domain layer and direct DB ops.
// Uses createAdminClient to bypass RLS (runs from Inngest, no user session).
//
// Phase 18: All CRM + WhatsApp + task actions delegate to domain.
// Trigger emissions handled by domain — no inline trigger code for
// orders, contacts, tags, messages, or tasks here.
// Remaining direct DB: webhooks only.
// ============================================================================

import type { AutomationAction, ActionType, TriggerContext } from './types'
import { resolveVariables, resolveVariablesInObject } from './variable-resolver'
import { WEBHOOK_TIMEOUT_MS } from './constants'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTwilioConfig, createTwilioClient } from '@/lib/twilio/client'
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
  updateCustomFieldValues as domainUpdateCustomFieldValues,
} from '@/lib/domain/custom-fields'
import {
  assignTag as domainAssignTag,
  removeTag as domainRemoveTag,
} from '@/lib/domain/tags'
import {
  sendTextMessage as domainSendTextMessage,
  sendTemplateMessage as domainSendTemplateMessage,
  sendMediaMessage as domainSendMediaMessage,
} from '@/lib/domain/messages'
import {
  createTask as domainCreateTask,
} from '@/lib/domain/tasks'
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
      return executeCreateTask(params, context, workspaceId, cascadeDepth)
    case 'send_sms':
      return executeSendSms(params, context, workspaceId)
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
    // Custom field: delegate to domain/custom-fields (handles JSONB merge + field.changed)
    const result = await domainUpdateCustomFieldValues(ctx, {
      contactId: entityId,
      fields: { [fieldName]: value },
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
// WhatsApp Actions — via domain/messages
// Domain handles API call + DB storage + conversation update.
// Action executor resolves contact → conversation → API key (adapter concerns).
// ============================================================================

/**
 * Helper: resolve contact → conversation → API key for WhatsApp actions.
 * All 3 WhatsApp action types need this common lookup.
 */
async function resolveWhatsAppContext(
  contactId: string,
  workspaceId: string
): Promise<{
  conversation: { id: string; phone: string; last_customer_message_at: string | null }
  apiKey: string
}> {
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

  return { conversation, apiKey }
}

/**
 * Send a WhatsApp template message via domain.
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

  const { conversation, apiKey } = await resolveWhatsAppContext(contactId, workspaceId)

  // Look up template to build components (adapter concern)
  const supabase = createAdminClient()
  const { data: template } = await supabase
    .from('whatsapp_templates')
    .select('name, language, components, status')
    .eq('name', templateName)
    .eq('workspace_id', workspaceId)
    .single()

  if (!template) throw new Error(`Template "${templateName}" not found`)
  if (template.status !== 'APPROVED') throw new Error(`Template "${templateName}" not approved`)

  const language = String(params.language || template.language || 'es')
  const templateVars = (params.variables || {}) as Record<string, string>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components = template.components as any[]
  const bodyComponent = components?.find((c: { type: string }) => c.type === 'BODY')

  const apiComponents: Array<{
    type: 'header' | 'body' | 'button'
    parameters?: Array<{ type: 'text'; text: string }>
  }> = []

  const bodyVars = bodyComponent?.text?.match(/\{\{(\d+)\}\}/g) || []
  if (bodyVars.length > 0) {
    apiComponents.push({
      type: 'body',
      parameters: bodyVars.map((v: string) => {
        const num = v.replace(/[{}]/g, '')
        return { type: 'text' as const, text: templateVars[num] || '' }
      }),
    })
  }

  // Build rendered text
  let renderedText = bodyComponent?.text || ''
  Object.entries(templateVars).forEach(([num, value]) => {
    renderedText = renderedText.replace(new RegExp(`\\{\\{${num}\\}\\}`, 'g'), value)
  })

  const ctx: DomainContext = { workspaceId, source: 'automation' }
  const result = await domainSendTemplateMessage(ctx, {
    conversationId: conversation.id,
    contactPhone: conversation.phone,
    templateName: template.name,
    templateLanguage: language,
    components: apiComponents.length > 0 ? apiComponents : undefined,
    renderedText,
    apiKey,
  })

  if (!result.success) throw new Error(result.error || 'WhatsApp template send failed')

  return { messageId: result.data!.messageId, templateUsed: templateName, sent: true }
}

/**
 * Send a WhatsApp text message via domain.
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

  const { conversation, apiKey } = await resolveWhatsAppContext(contactId, workspaceId)

  // Check 24h window (adapter concern for text messages)
  if (conversation.last_customer_message_at) {
    const hoursSince =
      (Date.now() - new Date(conversation.last_customer_message_at).getTime()) / (1000 * 60 * 60)
    if (hoursSince >= 24) {
      throw new Error('24h WhatsApp window closed — cannot send text')
    }
  } else {
    throw new Error('No customer message — 24h window not open')
  }

  const ctx: DomainContext = { workspaceId, source: 'automation' }
  const result = await domainSendTextMessage(ctx, {
    conversationId: conversation.id,
    contactPhone: conversation.phone,
    messageBody: text,
    apiKey,
  })

  if (!result.success) throw new Error(result.error || 'WhatsApp text send failed')

  return { messageId: result.data!.messageId, sent: true }
}

/**
 * Send a WhatsApp media message via domain.
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

  const { conversation, apiKey } = await resolveWhatsAppContext(contactId, workspaceId)

  // Check 24h window (adapter concern for media messages)
  if (conversation.last_customer_message_at) {
    const hoursSince =
      (Date.now() - new Date(conversation.last_customer_message_at).getTime()) / (1000 * 60 * 60)
    if (hoursSince >= 24) {
      throw new Error('24h WhatsApp window closed — cannot send media')
    }
  } else {
    throw new Error('No customer message — 24h window not open')
  }

  // Detect media type from URL extension
  const ext = mediaUrl.split('.').pop()?.toLowerCase() || ''
  const mediaType: 'image' | 'video' | 'audio' | 'document' =
    ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image' :
    ['mp4', 'avi', 'mov'].includes(ext) ? 'video' :
    ['mp3', 'ogg', 'wav', 'opus'].includes(ext) ? 'audio' :
    'document'

  const ctx: DomainContext = { workspaceId, source: 'automation' }
  const result = await domainSendMediaMessage(ctx, {
    conversationId: conversation.id,
    contactPhone: conversation.phone,
    mediaUrl,
    mediaType,
    caption,
    apiKey,
  })

  if (!result.success) throw new Error(result.error || 'WhatsApp media send failed')

  return { messageId: result.data!.messageId, mediaType, sent: true }
}

// ============================================================================
// Task Action — via domain/tasks
// Domain handles DB logic. Trigger gap FIXED: if task created with
// status=completed, domain emits task.completed.
// ============================================================================

/**
 * Create a task linked to the trigger's contact/order.
 * Delegates to domain/tasks.createTask.
 */
async function executeCreateTask(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const title = String(params.title || '')
  if (!title) throw new Error('title is required for create_task')

  const description = params.description ? String(params.description) : undefined

  // Calculate due date from relative delay if provided
  let dueDate: string | undefined
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

  const ctx: DomainContext = { workspaceId, source: 'automation', cascadeDepth: cascadeDepth + 1 }
  const result = await domainCreateTask(ctx, {
    title,
    description,
    dueDate,
    contactId: context.contactId || undefined,
    orderId: context.orderId || undefined,
    assignedTo: params.assignToUserId ? String(params.assignToUserId) : undefined,
  })

  if (!result.success) {
    throw new Error(result.error || 'Failed to create task')
  }

  return { taskId: result.data!.taskId, title, dueDate: dueDate || null }
}

// ============================================================================
// Twilio SMS Action — via Twilio SDK
// Sends SMS, stores record in sms_messages, uses status callback for async price.
// ============================================================================

/**
 * Send an SMS via Twilio SDK and store the record in sms_messages.
 * Price may not be available immediately — updated via status callback.
 * SMS does not produce any cascading triggers.
 */
async function executeSendSms(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string
): Promise<unknown> {
  const body = String(params.body || '')
  if (!body) throw new Error('body is required for send_sms')

  // Resolve recipient phone: explicit param > contact phone from context
  const to = params.to ? String(params.to) : context.contactPhone
  if (!to) throw new Error('No phone number available for SMS — set "to" param or ensure trigger has contactPhone')

  // Load Twilio credentials (throws if not configured)
  const twilioConfig = await getTwilioConfig(workspaceId)
  const client = createTwilioClient(twilioConfig)

  // Build status callback URL (optional — won't break if NEXT_PUBLIC_APP_URL not set)
  const statusCallbackUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status`
    : undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messageParams: Record<string, any> = {
    body,
    from: twilioConfig.phone_number,
    to,
    ...(statusCallbackUrl && { statusCallback: statusCallbackUrl }),
  }

  // Optional MMS media (only works for US/Canada numbers)
  if (params.mediaUrl) {
    messageParams.mediaUrl = [String(params.mediaUrl)]
  }

  // Send SMS via Twilio
  const message = await client.messages.create(messageParams)

  // Store SMS record for usage tracking
  const supabase = createAdminClient()
  await supabase.from('sms_messages').insert({
    workspace_id: workspaceId,
    twilio_sid: message.sid,
    from_number: twilioConfig.phone_number,
    to_number: to,
    body,
    status: message.status,
    direction: 'outbound',
    // Price: Twilio returns negative for outbound, we store absolute value
    price: message.price ? Math.abs(parseFloat(message.price)) : null,
    price_unit: message.priceUnit || 'USD',
    segments: message.numSegments ? parseInt(message.numSegments) : 1,
    media_url: params.mediaUrl ? String(params.mediaUrl) : null,
  })

  return { messageSid: message.sid, status: message.status, to, sent: true }
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
