// ============================================================================
// Phase 17: CRM Automations Engine — Action Executor
// Executes automation actions via existing tool handlers and direct DB ops.
// Uses createAdminClient to bypass RLS (runs from Inngest, no user session).
// ============================================================================

import type { AutomationAction, ActionType, TriggerContext } from './types'
import { resolveVariables, resolveVariablesInObject } from './variable-resolver'
import { WEBHOOK_TIMEOUT_MS } from './constants'
import { initializeTools } from '@/lib/tools/init'
import { executeToolFromWebhook } from '@/lib/tools/executor'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMediaMessage } from '@/lib/whatsapp/api'

// Lazy import to avoid circular dependency (trigger-emitter imports are deferred)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _triggerEmitter: any = null
async function getTriggerEmitter() {
  if (!_triggerEmitter) {
    _triggerEmitter = await import('./trigger-emitter')
  }
  return _triggerEmitter
}

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
// CRM Actions (Direct DB via createAdminClient)
// ============================================================================

/**
 * Assign a tag to a contact or order.
 * Uses find-or-create pattern for the tag, then links it.
 */
async function executeAssignTag(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const supabase = createAdminClient()
  const tagName = String(params.tagName || '')
  const entityType = String(params.entityType || 'contact')

  if (!tagName) throw new Error('tagName is required for assign_tag')

  // Determine entity ID from context
  const entityId = entityType === 'order'
    ? context.orderId
    : context.contactId

  if (!entityId) throw new Error(`No ${entityType}Id available in trigger context`)

  // Find or create tag
  let tagId: string
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', tagName)
    .single()

  if (existingTag) {
    tagId = existingTag.id
  } else {
    const { data: newTag, error: tagError } = await supabase
      .from('tags')
      .insert({
        workspace_id: workspaceId,
        name: tagName,
        color: '#6366f1',
        applies_to: 'both',
      })
      .select('id')
      .single()

    if (tagError || !newTag) {
      throw new Error(`Failed to create tag "${tagName}": ${tagError?.message}`)
    }
    tagId = newTag.id
  }

  // Link tag to entity
  const table = entityType === 'order' ? 'order_tags' : 'contact_tags'
  const fkColumn = entityType === 'order' ? 'order_id' : 'contact_id'

  const { error: linkError } = await supabase
    .from(table)
    .insert({ [fkColumn]: entityId, tag_id: tagId })

  // Ignore duplicate (23505) — tag already assigned
  if (linkError && linkError.code !== '23505') {
    throw new Error(`Failed to assign tag: ${linkError.message}`)
  }

  // Emit cascade event
  const emitter = await getTriggerEmitter()
  emitter.emitTagAssigned({
    workspaceId,
    entityType,
    entityId,
    tagId,
    tagName,
    contactId: context.contactId || null,
    contactName: context.contactName,
    cascadeDepth: cascadeDepth + 1,
  })

  return { tagId, tagName, entityType, entityId, assigned: true }
}

/**
 * Remove a tag from a contact or order.
 */
async function executeRemoveTag(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const supabase = createAdminClient()
  const tagName = String(params.tagName || '')
  const entityType = String(params.entityType || 'contact')

  if (!tagName) throw new Error('tagName is required for remove_tag')

  const entityId = entityType === 'order'
    ? context.orderId
    : context.contactId

  if (!entityId) throw new Error(`No ${entityType}Id available in trigger context`)

  // Find tag by name
  const { data: tag } = await supabase
    .from('tags')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', tagName)
    .single()

  if (!tag) {
    throw new Error(`Tag "${tagName}" not found in workspace`)
  }

  // Remove link
  const table = entityType === 'order' ? 'order_tags' : 'contact_tags'
  const fkColumn = entityType === 'order' ? 'order_id' : 'contact_id'

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq(fkColumn, entityId)
    .eq('tag_id', tag.id)

  if (deleteError) {
    throw new Error(`Failed to remove tag: ${deleteError.message}`)
  }

  // Emit cascade event
  const emitter = await getTriggerEmitter()
  emitter.emitTagRemoved({
    workspaceId,
    entityType,
    entityId,
    tagId: tag.id,
    tagName,
    contactId: context.contactId || null,
    cascadeDepth: cascadeDepth + 1,
  })

  return { tagId: tag.id, tagName, entityType, entityId, removed: true }
}

/**
 * Change the stage of an order.
 */
async function executeChangeStage(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const supabase = createAdminClient()
  const stageId = String(params.stageId || '')
  const pipelineId = String(params.pipelineId || '')
  const orderId = context.orderId

  if (!stageId) throw new Error('stageId is required for change_stage')
  if (!orderId) throw new Error('No orderId available in trigger context')

  // Get current stage for cascade event
  const { data: order } = await supabase
    .from('orders')
    .select('stage_id, pipeline_id')
    .eq('id', orderId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!order) throw new Error(`Order ${orderId} not found`)

  const previousStageId = order.stage_id

  // Update stage
  const { error: updateError } = await supabase
    .from('orders')
    .update({ stage_id: stageId })
    .eq('id', orderId)
    .eq('workspace_id', workspaceId)

  if (updateError) {
    throw new Error(`Failed to change stage: ${updateError.message}`)
  }

  // Resolve stage names for cascade event
  const { data: prevStage } = await supabase
    .from('pipeline_stages')
    .select('name')
    .eq('id', previousStageId)
    .single()

  const { data: newStage } = await supabase
    .from('pipeline_stages')
    .select('name')
    .eq('id', stageId)
    .single()

  // Emit cascade event
  const emitter = await getTriggerEmitter()
  emitter.emitOrderStageChanged({
    workspaceId,
    orderId,
    previousStageId,
    newStageId: stageId,
    pipelineId: pipelineId || order.pipeline_id,
    contactId: context.contactId || null,
    previousStageName: prevStage?.name,
    newStageName: newStage?.name,
    cascadeDepth: cascadeDepth + 1,
  })

  return {
    orderId,
    previousStageId,
    newStageId: stageId,
    previousStageName: prevStage?.name,
    newStageName: newStage?.name,
  }
}

/**
 * Update a field on a contact or order.
 * For custom_fields, merges into existing JSONB.
 */
async function executeUpdateField(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const supabase = createAdminClient()
  const fieldName = String(params.fieldName || '')
  const value = params.value
  const entityType = String(params.entityType || 'contact')

  if (!fieldName) throw new Error('fieldName is required for update_field')

  const entityId = entityType === 'order'
    ? context.orderId
    : context.contactId

  if (!entityId) throw new Error(`No ${entityType}Id available in trigger context`)

  const table = entityType === 'order' ? 'orders' : 'contacts'

  // Check if this is a standard column or custom field
  const standardContactFields = ['name', 'phone', 'email', 'address', 'city']
  const standardOrderFields = ['shipping_address', 'description', 'total_value']
  const standardFields = entityType === 'order' ? standardOrderFields : standardContactFields

  let previousValue: unknown = null

  if (standardFields.includes(fieldName)) {
    // Standard field: direct update
    const { data: current } = await supabase
      .from(table)
      .select(fieldName)
      .eq('id', entityId)
      .eq('workspace_id', workspaceId)
      .single()

    previousValue = current ? (current as unknown as Record<string, unknown>)[fieldName] : null

    const { error: updateError } = await supabase
      .from(table)
      .update({ [fieldName]: value })
      .eq('id', entityId)
      .eq('workspace_id', workspaceId)

    if (updateError) {
      throw new Error(`Failed to update field ${fieldName}: ${updateError.message}`)
    }
  } else {
    // Custom field: merge into custom_fields JSONB
    const { data: current } = await supabase
      .from(table)
      .select('custom_fields')
      .eq('id', entityId)
      .eq('workspace_id', workspaceId)
      .single()

    const existingCustom = (current?.custom_fields as Record<string, unknown>) || {}
    previousValue = existingCustom[fieldName] ?? null

    const updatedCustom = { ...existingCustom, [fieldName]: value }

    const { error: updateError } = await supabase
      .from(table)
      .update({ custom_fields: updatedCustom })
      .eq('id', entityId)
      .eq('workspace_id', workspaceId)

    if (updateError) {
      throw new Error(`Failed to update custom field ${fieldName}: ${updateError.message}`)
    }
  }

  // Emit cascade event
  const emitter = await getTriggerEmitter()
  emitter.emitFieldChanged({
    workspaceId,
    entityType,
    entityId,
    fieldName,
    previousValue: previousValue != null ? String(previousValue) : null,
    newValue: value != null ? String(value) : null,
    cascadeDepth: cascadeDepth + 1,
  })

  return { entityType, entityId, fieldName, previousValue, newValue: value }
}

/**
 * Create a new order in a pipeline.
 */
async function executeCreateOrder(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const supabase = createAdminClient()
  const pipelineId = String(params.pipelineId || '')
  const stageId = params.stageId ? String(params.stageId) : null
  const contactId = context.contactId

  if (!pipelineId) throw new Error('pipelineId is required for create_order')
  if (!contactId) throw new Error('No contactId available in trigger context')

  // Resolve target stage
  let targetStageId = stageId

  if (!targetStageId) {
    // Get first stage by position
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (!firstStage) throw new Error('No stages found in target pipeline')
    targetStageId = firstStage.id
  }

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: targetStageId,
    })
    .select('id, total_value')
    .single()

  if (orderError || !order) {
    throw new Error(`Failed to create order: ${orderError?.message}`)
  }

  // Copy tags from trigger context order if configured
  if (params.copyTags && context.orderId) {
    const { data: sourceTags } = await supabase
      .from('order_tags')
      .select('tag_id')
      .eq('order_id', context.orderId)

    if (sourceTags && sourceTags.length > 0) {
      await supabase
        .from('order_tags')
        .insert(sourceTags.map(t => ({ order_id: order.id, tag_id: t.tag_id })))
    }
  }

  // Emit cascade event
  const emitter = await getTriggerEmitter()
  emitter.emitOrderCreated({
    workspaceId,
    orderId: order.id,
    pipelineId,
    stageId: targetStageId,
    contactId,
    totalValue: order.total_value ?? 0,
    cascadeDepth: cascadeDepth + 1,
  })

  return { orderId: order.id, pipelineId, stageId: targetStageId }
}

/**
 * Duplicate an order to another pipeline with source_order_id tracking.
 */
async function executeDuplicateOrder(
  params: Record<string, unknown>,
  context: TriggerContext,
  workspaceId: string,
  cascadeDepth: number
): Promise<unknown> {
  const supabase = createAdminClient()
  const targetPipelineId = String(params.targetPipelineId || '')
  const targetStageId = params.targetStageId ? String(params.targetStageId) : null
  const sourceOrderId = context.orderId

  if (!targetPipelineId) throw new Error('targetPipelineId is required for duplicate_order')
  if (!sourceOrderId) throw new Error('No orderId available in trigger context')

  // Read source order
  const { data: sourceOrder, error: sourceError } = await supabase
    .from('orders')
    .select('*, order_products(*)')
    .eq('id', sourceOrderId)
    .eq('workspace_id', workspaceId)
    .single()

  if (sourceError || !sourceOrder) {
    throw new Error(`Source order ${sourceOrderId} not found`)
  }

  // Resolve target stage
  let resolvedStageId = targetStageId
  if (!resolvedStageId) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', targetPipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (!firstStage) throw new Error('No stages found in target pipeline')
    resolvedStageId = firstStage.id
  }

  // Create new order with source_order_id reference
  const contactId = params.copyContact !== false
    ? sourceOrder.contact_id
    : context.contactId || sourceOrder.contact_id

  const { data: newOrder, error: createError } = await supabase
    .from('orders')
    .insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      pipeline_id: targetPipelineId,
      stage_id: resolvedStageId,
      source_order_id: sourceOrderId,
      shipping_address: sourceOrder.shipping_address,
      description: sourceOrder.description,
    })
    .select('id')
    .single()

  if (createError || !newOrder) {
    throw new Error(`Failed to duplicate order: ${createError?.message}`)
  }

  // Copy products if configured (default true)
  if (params.copyProducts !== false && sourceOrder.order_products?.length > 0) {
    const products = sourceOrder.order_products.map(
      (p: { title: string; sku: string; unit_price: number; quantity: number }) => ({
        order_id: newOrder.id,
        title: p.title,
        sku: p.sku,
        unit_price: p.unit_price,
        quantity: p.quantity,
      })
    )
    await supabase.from('order_products').insert(products)
  }

  // Copy tags if configured
  if (params.copyTags) {
    const { data: sourceTags } = await supabase
      .from('order_tags')
      .select('tag_id')
      .eq('order_id', sourceOrderId)

    if (sourceTags && sourceTags.length > 0) {
      await supabase
        .from('order_tags')
        .insert(sourceTags.map(t => ({ order_id: newOrder.id, tag_id: t.tag_id })))
    }
  }

  // Emit cascade event
  const emitter = await getTriggerEmitter()
  emitter.emitOrderCreated({
    workspaceId,
    orderId: newOrder.id,
    pipelineId: targetPipelineId,
    stageId: resolvedStageId,
    contactId,
    totalValue: params.copyValue !== false ? (sourceOrder.total_value ?? 0) : 0,
    sourceOrderId,
    cascadeDepth: cascadeDepth + 1,
  })

  return {
    newOrderId: newOrder.id,
    sourceOrderId,
    targetPipelineId,
    targetStageId: resolvedStageId,
  }
}

// ============================================================================
// WhatsApp Actions (via existing tool handlers)
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
// Task Action (Direct DB)
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
// Webhook Action
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
