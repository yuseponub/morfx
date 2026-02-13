// src/lib/tools/handlers/whatsapp/index.ts
// Phase 12 Plan 03: Real WhatsApp Tool Handlers
//
// All 7 handlers replace placeholders with real implementations.
// Uses createAdminClient() (NOT cookie-based createClient).
// Every query filters by workspace_id for tenant isolation.
// Returns ToolResult<T> for all operations.

import type { ToolHandler, ExecutionContext, ToolResult } from '../../types'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendTextMessage as domainSendTextMessage,
  sendTemplateMessage as domainSendTemplateMessage,
} from '@/lib/domain/messages'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// TYPES
// ============================================================================

interface MessageSendInput {
  contactId: string
  message: string
  replyToMessageId?: string
}

interface MessageSendOutput {
  messageId: string
  sent: boolean
  timestamp: string
}

interface TemplateSendInput {
  contactId: string
  templateName: string
  templateParams?: Record<string, string>
  language?: string
}

interface TemplateSendOutput {
  messageId: string
  sent: boolean
  templateUsed: string
}

interface MessageListInput {
  conversationId: string
  limit?: number
  before?: string
  after?: string
}

interface MessageListOutput {
  messages: Array<Record<string, unknown>>
  hasMore: boolean
}

interface TemplateListInput {
  status?: string
}

interface TemplateListOutput {
  templates: Array<Record<string, unknown>>
}

interface ConversationListInput {
  status?: string
  assignedTo?: string
  unassignedOnly?: boolean
  page?: number
  pageSize?: number
}

interface ConversationListOutput {
  conversations: Array<Record<string, unknown>>
  total: number
  page: number
  totalPages: number
}

interface ConversationAssignInput {
  conversationId: string
  agentId: string
}

interface ConversationAssignOutput {
  conversationId: string
  previousAgent: string | null
  newAgent: string
  assigned: boolean
}

interface ConversationCloseInput {
  conversationId: string
  resolution?: string
}

interface ConversationCloseOutput {
  conversationId: string
  closed: boolean
  closedAt: string
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get WhatsApp API key from workspace settings, fallback to env var.
 * Returns null if neither is configured.
 */
async function getWhatsAppApiKey(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = data?.settings as any
  const apiKey = settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  return apiKey || null
}

/**
 * Build a ToolResult error response.
 */
function toolError<T>(
  type: 'validation_error' | 'not_found' | 'duplicate' | 'external_api_error' | 'permission_denied' | 'rate_limited' | 'timeout' | 'internal_error',
  code: string,
  message: string,
  suggestion?: string,
  retryable: boolean = false
): ToolResult<T> {
  return {
    success: false,
    error: {
      type,
      code,
      message,
      ...(suggestion ? { suggestion } : {}),
      retryable,
    },
  }
}

// ============================================================================
// HANDLER: whatsapp.message.send
// ============================================================================

async function handleMessageSend(
  input: MessageSendInput,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<MessageSendOutput>> {
  const supabase = createAdminClient()

  // 1. Look up contact by ID + workspace_id to get phone
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, phone')
    .eq('id', input.contactId)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (contactError || !contact) {
    return toolError(
      'not_found',
      'CONTACT_NOT_FOUND',
      'Contacto no encontrado',
      'Verifique el contactId o use crm.contact.list para buscar',
      false
    )
  }

  // 2. Find most recent conversation for contact
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, phone, phone_number_id, last_customer_message_at, status')
    .eq('contact_id', input.contactId)
    .eq('workspace_id', context.workspaceId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single()

  if (convError || !conversation) {
    return toolError(
      'not_found',
      'CONVERSATION_NOT_FOUND',
      'No hay conversacion activa con este contacto',
      'El contacto debe enviar un mensaje primero para iniciar la conversacion',
      false
    )
  }

  // 3. Check 24h window
  if (!conversation.last_customer_message_at) {
    return toolError(
      'external_api_error',
      'WINDOW_CLOSED',
      'Ventana de 24h cerrada - no hay mensaje previo del cliente',
      'Use whatsapp.template.send para enviar fuera de la ventana de 24h',
      false
    )
  }

  const hoursSince =
    (Date.now() - new Date(conversation.last_customer_message_at).getTime()) /
    (1000 * 60 * 60)

  if (hoursSince >= 24) {
    return toolError(
      'external_api_error',
      'WINDOW_CLOSED',
      'Ventana de 24h cerrada',
      'Use whatsapp.template.send para enviar fuera de la ventana de 24h',
      false
    )
  }

  // 4. If dryRun: return preview
  if (dryRun) {
    return {
      success: true,
      data: {
        messageId: 'dry_run_preview',
        sent: true,
        timestamp: new Date().toISOString(),
      },
    }
  }

  // 5. Get API key
  const apiKey = await getWhatsAppApiKey(supabase, context.workspaceId)
  if (!apiKey) {
    return toolError(
      'external_api_error',
      'WHATSAPP_NOT_CONFIGURED',
      'API key de WhatsApp no configurada',
      'Configure la API key en Configuracion > WhatsApp',
      false
    )
  }

  // 6. Delegate to domain
  try {
    const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
    const result = await domainSendTextMessage(ctx, {
      conversationId: conversation.id,
      contactPhone: conversation.phone,
      messageBody: input.message,
      apiKey,
    })

    if (!result.success) {
      return toolError(
        'external_api_error',
        'SEND_FAILED',
        result.error || 'Error al enviar mensaje',
        'Verifique la configuracion de WhatsApp e intente nuevamente',
        true
      )
    }

    // Unarchive if needed (adapter concern)
    if (conversation.status === 'archived') {
      await supabase
        .from('conversations')
        .update({ status: 'active' as const })
        .eq('id', conversation.id)
    }

    return {
      success: true,
      data: {
        messageId: result.data!.messageId,
        sent: true,
        timestamp: new Date().toISOString(),
      },
      message_id: result.data!.waMessageId,
    }
  } catch (err) {
    return toolError(
      'external_api_error',
      'SEND_FAILED',
      err instanceof Error ? err.message : 'Error al enviar mensaje via WhatsApp',
      'Verifique la configuracion de WhatsApp e intente nuevamente',
      true
    )
  }
}

// ============================================================================
// HANDLER: whatsapp.template.send
// ============================================================================

async function handleTemplateSend(
  input: TemplateSendInput,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<TemplateSendOutput>> {
  const supabase = createAdminClient()

  // 1. Look up contact + conversation
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, phone')
    .eq('id', input.contactId)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (contactError || !contact) {
    return toolError(
      'not_found',
      'CONTACT_NOT_FOUND',
      'Contacto no encontrado',
      'Verifique el contactId o use crm.contact.list para buscar',
      false
    )
  }

  // Find conversation (needed for phone and to save message)
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, phone, status')
    .eq('contact_id', input.contactId)
    .eq('workspace_id', context.workspaceId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single()

  if (convError || !conversation) {
    return toolError(
      'not_found',
      'CONVERSATION_NOT_FOUND',
      'No hay conversacion con este contacto',
      'El contacto debe tener al menos una conversacion previa',
      false
    )
  }

  // 2. Look up template by name in whatsapp_templates table
  const { data: template, error: templateError } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('name', input.templateName)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (templateError || !template) {
    return toolError(
      'not_found',
      'TEMPLATE_NOT_FOUND',
      `Template "${input.templateName}" no encontrado`,
      'Use whatsapp.template.list para ver templates disponibles',
      false
    )
  }

  // 3. Verify status is 'APPROVED'
  if (template.status !== 'APPROVED') {
    return toolError(
      'validation_error',
      'TEMPLATE_NOT_APPROVED',
      `Template "${input.templateName}" no esta aprobado (estado: ${template.status})`,
      'Solo se pueden enviar templates con estado APPROVED',
      false
    )
  }

  // 4. If dryRun: return preview
  if (dryRun) {
    return {
      success: true,
      data: {
        messageId: 'dry_run_preview',
        sent: true,
        templateUsed: template.name,
      },
    }
  }

  // 5. Get API key
  const apiKey = await getWhatsAppApiKey(supabase, context.workspaceId)
  if (!apiKey) {
    return toolError(
      'external_api_error',
      'WHATSAPP_NOT_CONFIGURED',
      'API key de WhatsApp no configurada',
      'Configure la API key en Configuracion > WhatsApp',
      false
    )
  }

  // 6. Build components from templateParams (adapter concern: template parsing)
  const language = input.language || template.language || 'es'
  const templateParams = input.templateParams || {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components = template.components as any[]
  const bodyComponent = components?.find((c: { type: string }) => c.type === 'BODY')
  const headerComponent = components?.find((c: { type: string }) => c.type === 'HEADER')

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
        return { type: 'text' as const, text: templateParams[num] || '' }
      }),
    })
  }

  const headerVars = headerComponent?.text?.match(/\{\{(\d+)\}\}/g) || []
  if (headerVars.length > 0) {
    apiComponents.push({
      type: 'header',
      parameters: headerVars.map((v: string) => {
        const num = v.replace(/[{}]/g, '')
        return { type: 'text' as const, text: templateParams[num] || '' }
      }),
    })
  }

  // Build rendered text for display
  let renderedText = bodyComponent?.text || ''
  Object.entries(templateParams).forEach(([num, value]) => {
    renderedText = renderedText.replace(
      new RegExp(`\\{\\{${num}\\}\\}`, 'g'),
      value
    )
  })

  // 7. Delegate to domain
  try {
    const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
    const result = await domainSendTemplateMessage(ctx, {
      conversationId: conversation.id,
      contactPhone: conversation.phone,
      templateName: template.name,
      templateLanguage: language,
      components: apiComponents.length > 0 ? apiComponents : undefined,
      renderedText,
      apiKey,
    })

    if (!result.success) {
      return toolError(
        'external_api_error',
        'TEMPLATE_SEND_FAILED',
        result.error || 'Error al enviar template',
        'Verifique la configuracion de WhatsApp y que el template este aprobado',
        true
      )
    }

    // Unarchive if needed (adapter concern)
    if (conversation.status === 'archived') {
      await supabase
        .from('conversations')
        .update({ status: 'active' as const })
        .eq('id', conversation.id)
    }

    return {
      success: true,
      data: {
        messageId: result.data!.messageId,
        sent: true,
        templateUsed: template.name,
      },
      message_id: result.data!.waMessageId,
    }
  } catch (err) {
    return toolError(
      'external_api_error',
      'TEMPLATE_SEND_FAILED',
      err instanceof Error ? err.message : 'Error al enviar template via WhatsApp',
      'Verifique la configuracion de WhatsApp y que el template este aprobado',
      true
    )
  }
}

// ============================================================================
// HANDLER: whatsapp.message.list
// ============================================================================

async function handleMessageList(
  input: MessageListInput,
  context: ExecutionContext,
  _dryRun: boolean
): Promise<ToolResult<MessageListOutput>> {
  const supabase = createAdminClient()
  const limit = input.limit || 50

  // Verify conversation belongs to workspace
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', input.conversationId)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (convError || !conversation) {
    return toolError(
      'not_found',
      'CONVERSATION_NOT_FOUND',
      'Conversacion no encontrada',
      'Verifique el conversationId o use whatsapp.conversation.list',
      false
    )
  }

  // Query messages with pagination
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', input.conversationId)
    .order('timestamp', { ascending: false })
    .limit(limit + 1) // Fetch one extra to determine hasMore

  // Cursor pagination
  if (input.before) {
    query = query.lt('timestamp', input.before)
  }
  if (input.after) {
    query = query.gt('timestamp', input.after)
  }

  const { data, error } = await query

  if (error) {
    return toolError(
      'internal_error',
      'DB_QUERY_FAILED',
      'Error al consultar mensajes',
      undefined,
      true
    )
  }

  const messages = data || []
  const hasMore = messages.length > limit
  const resultMessages = hasMore ? messages.slice(0, limit) : messages

  // Return in chronological order (oldest first)
  return {
    success: true,
    data: {
      messages: resultMessages.reverse() as unknown as Array<Record<string, unknown>>,
      hasMore,
    },
  }
}

// ============================================================================
// HANDLER: whatsapp.template.list
// ============================================================================

async function handleTemplateList(
  input: TemplateListInput,
  context: ExecutionContext,
  _dryRun: boolean
): Promise<ToolResult<TemplateListOutput>> {
  const supabase = createAdminClient()

  let query = supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('workspace_id', context.workspaceId)
    .order('created_at', { ascending: false })

  // Apply status filter if provided (normalize to uppercase)
  if (input.status) {
    query = query.eq('status', input.status.toUpperCase())
  }

  const { data, error } = await query

  if (error) {
    return toolError(
      'internal_error',
      'DB_QUERY_FAILED',
      'Error al consultar templates',
      undefined,
      true
    )
  }

  return {
    success: true,
    data: {
      templates: (data || []) as unknown as Array<Record<string, unknown>>,
    },
  }
}

// ============================================================================
// HANDLER: whatsapp.conversation.list
// ============================================================================

async function handleConversationList(
  input: ConversationListInput,
  context: ExecutionContext,
  _dryRun: boolean
): Promise<ToolResult<ConversationListOutput>> {
  const supabase = createAdminClient()

  const page = input.page || 1
  const pageSize = input.pageSize || 20
  const offset = (page - 1) * pageSize

  // Build base query with contact join
  let query = supabase
    .from('conversations')
    .select(
      '*, contact:contacts(id, name, phone, address, city)',
      { count: 'exact' }
    )
    .eq('workspace_id', context.workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  // Apply status filter
  // Schema uses 'open'/'closed'/'all' but DB uses 'active'/'archived'
  if (input.status === 'open' || !input.status) {
    query = query.eq('status', 'active')
  } else if (input.status === 'closed') {
    query = query.eq('status', 'archived')
  }
  // 'all' = no status filter

  // Apply assignment filters
  if (input.unassignedOnly) {
    query = query.is('assigned_to', null)
  } else if (input.assignedTo) {
    query = query.eq('assigned_to', input.assignedTo)
  }

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query

  if (error) {
    return toolError(
      'internal_error',
      'DB_QUERY_FAILED',
      'Error al consultar conversaciones',
      undefined,
      true
    )
  }

  const total = count || 0
  const totalPages = Math.ceil(total / pageSize)

  return {
    success: true,
    data: {
      conversations: (data || []) as unknown as Array<Record<string, unknown>>,
      total,
      page,
      totalPages,
    },
  }
}

// ============================================================================
// HANDLER: whatsapp.conversation.assign
// ============================================================================

async function handleConversationAssign(
  input: ConversationAssignInput,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<ConversationAssignOutput>> {
  const supabase = createAdminClient()

  // Verify conversation belongs to workspace and get current assignment
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, assigned_to')
    .eq('id', input.conversationId)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (convError || !conversation) {
    return toolError(
      'not_found',
      'CONVERSATION_NOT_FOUND',
      'Conversacion no encontrada',
      'Verifique el conversationId o use whatsapp.conversation.list',
      false
    )
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        conversationId: conversation.id,
        previousAgent: conversation.assigned_to,
        newAgent: input.agentId,
        assigned: true,
      },
    }
  }

  // Update assigned_to
  const { error: updateError } = await supabase
    .from('conversations')
    .update({
      assigned_to: input.agentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.conversationId)
    .eq('workspace_id', context.workspaceId)

  if (updateError) {
    return toolError(
      'internal_error',
      'DB_UPDATE_FAILED',
      'Error al asignar conversacion',
      undefined,
      true
    )
  }

  return {
    success: true,
    data: {
      conversationId: conversation.id,
      previousAgent: conversation.assigned_to,
      newAgent: input.agentId,
      assigned: true,
    },
  }
}

// ============================================================================
// HANDLER: whatsapp.conversation.close
// ============================================================================

async function handleConversationClose(
  input: ConversationCloseInput,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<ConversationCloseOutput>> {
  const supabase = createAdminClient()

  // Verify conversation belongs to workspace
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, status')
    .eq('id', input.conversationId)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (convError || !conversation) {
    return toolError(
      'not_found',
      'CONVERSATION_NOT_FOUND',
      'Conversacion no encontrada',
      'Verifique el conversationId o use whatsapp.conversation.list',
      false
    )
  }

  if (conversation.status === 'archived') {
    return toolError(
      'validation_error',
      'ALREADY_CLOSED',
      'La conversacion ya esta cerrada/archivada',
      undefined,
      false
    )
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        conversationId: conversation.id,
        closed: true,
        closedAt: new Date().toISOString(),
      },
    }
  }

  // Update status to 'archived' (DB constraint: active|archived only)
  const closedAt = new Date().toISOString()

  const updatePayload: Record<string, unknown> = {
    status: 'archived',
    updated_at: closedAt,
  }

  // Store resolution in last_message_preview if provided
  // (no dedicated resolution column exists; this preserves the info)
  if (input.resolution) {
    updatePayload.last_message_preview = `[Cerrada] ${input.resolution.slice(0, 200)}`
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update(updatePayload)
    .eq('id', input.conversationId)
    .eq('workspace_id', context.workspaceId)

  if (updateError) {
    return toolError(
      'internal_error',
      'DB_UPDATE_FAILED',
      'Error al cerrar conversacion',
      undefined,
      true
    )
  }

  return {
    success: true,
    data: {
      conversationId: conversation.id,
      closed: true,
      closedAt,
    },
  }
}

// ============================================================================
// EXPORT ALL HANDLERS
// ============================================================================

export const whatsappHandlers: Record<string, ToolHandler> = {
  'whatsapp.message.send': handleMessageSend as ToolHandler,
  'whatsapp.message.list': handleMessageList as ToolHandler,
  'whatsapp.template.send': handleTemplateSend as ToolHandler,
  'whatsapp.template.list': handleTemplateList as ToolHandler,
  'whatsapp.conversation.list': handleConversationList as ToolHandler,
  'whatsapp.conversation.assign': handleConversationAssign as ToolHandler,
  'whatsapp.conversation.close': handleConversationClose as ToolHandler,
}
