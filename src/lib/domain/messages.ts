// ============================================================================
// Domain Layer — Messages
// Single source of truth for ALL message mutations (send + receive).
// Every caller (server actions, tool handlers, automations, webhook handler,
// engine adapter) goes through these functions instead of hitting DB directly.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Execute mutation (API call + DB insert)
//   4. Emit trigger (fire-and-forget) for inbound messages
//   5. Return DomainResult<T>
//
// Note: Outbound messages do NOT emit triggers (no send trigger defined in
// Phase 17). Inbound messages emit whatsapp.message_received and check for
// whatsapp.keyword_match against active automations.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendTextMessage as send360Text,
  sendMediaMessage as send360Media,
  sendTemplateMessage as send360Template,
} from '@/lib/whatsapp/api'
import {
  emitWhatsAppMessageReceived,
  emitWhatsAppKeywordMatch,
} from '@/lib/automations/trigger-emitter'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface SendTextMessageParams {
  conversationId: string
  contactPhone: string
  messageBody: string
  /** The workspace's 360dialog API key — caller must resolve this */
  apiKey: string
}

export interface SendMediaMessageParams {
  conversationId: string
  contactPhone: string
  mediaUrl: string
  mediaType: 'image' | 'video' | 'audio' | 'document'
  caption?: string
  filename?: string
  /** The workspace's 360dialog API key — caller must resolve this */
  apiKey: string
}

export interface SendTemplateMessageParams {
  conversationId: string
  contactPhone: string
  templateName: string
  templateLanguage: string
  /** Template body components for variable substitution */
  components?: Array<{
    type: 'header' | 'body' | 'button'
    parameters?: Array<{
      type: 'text' | 'image' | 'document' | 'video'
      text?: string
      image?: { link: string }
      document?: { link: string }
      video?: { link: string }
    }>
  }>
  /** Rendered text for DB storage (with variables substituted) */
  renderedText?: string
  /** The workspace's 360dialog API key — caller must resolve this */
  apiKey: string
}

export interface ReceiveMessageParams {
  conversationId: string
  contactId: string | null
  phone: string
  messageContent: string
  messageType: string
  waMessageId: string
  /** Full message content JSONB (type-specific fields) */
  contentJson: Record<string, unknown>
  mediaUrl?: string
  timestamp: string
  contactName?: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface SendMessageResult {
  messageId: string
  waMessageId?: string
}

export interface ReceiveMessageResult {
  messageId: string
}

// ============================================================================
// SEND TEXT MESSAGE
// ============================================================================

/**
 * Send a text message via 360dialog API and store in DB.
 * Used by: server actions, tool handlers, action executor, engine adapter.
 */
export async function sendTextMessage(
  ctx: DomainContext,
  params: SendTextMessageParams
): Promise<DomainResult<SendMessageResult>> {
  const supabase = createAdminClient()

  try {
    // 1. Send via 360dialog API
    const response = await send360Text(params.apiKey, params.contactPhone, params.messageBody)
    const wamid = response.messages?.[0]?.id

    // 2. Store message in DB
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: params.conversationId,
        workspace_id: ctx.workspaceId,
        wamid,
        direction: 'outbound',
        type: 'text',
        content: { body: params.messageBody } as unknown as Record<string, unknown>,
        status: 'sent',
        timestamp: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !message) {
      // Message was sent but DB insert failed — partial success
      console.error('[domain/messages] sendTextMessage DB insert failed:', insertError)
      return {
        success: true,
        data: { messageId: '', waMessageId: wamid },
        error: 'Mensaje enviado pero no se pudo guardar en DB',
      }
    }

    // 3. Update conversation last_message_at
    const preview = params.messageBody.length > 100
      ? params.messageBody.slice(0, 100) + '...'
      : params.messageBody

    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
      })
      .eq('id', params.conversationId)

    return {
      success: true,
      data: { messageId: message.id, waMessageId: wamid },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[domain/messages] sendTextMessage failed:', msg)
    return { success: false, error: msg }
  }
}

// ============================================================================
// SEND MEDIA MESSAGE
// ============================================================================

/**
 * Send a media message via 360dialog API and store in DB.
 * Used by: server actions, action executor.
 */
export async function sendMediaMessage(
  ctx: DomainContext,
  params: SendMediaMessageParams
): Promise<DomainResult<SendMessageResult>> {
  const supabase = createAdminClient()

  try {
    // 1. Send via 360dialog API
    const response = await send360Media(
      params.apiKey,
      params.contactPhone,
      params.mediaType,
      params.mediaUrl,
      params.caption,
      params.filename
    )
    const wamid = response.messages?.[0]?.id

    // 2. Store message in DB
    const content: Record<string, unknown> = {
      link: params.mediaUrl,
      ...(params.caption ? { caption: params.caption } : {}),
      ...(params.filename ? { filename: params.filename } : {}),
    }

    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: params.conversationId,
        workspace_id: ctx.workspaceId,
        wamid,
        direction: 'outbound',
        type: params.mediaType,
        content: content as unknown as Record<string, unknown>,
        status: 'sent',
        media_url: params.mediaUrl,
        ...(params.filename ? { media_filename: params.filename } : {}),
        timestamp: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !message) {
      console.error('[domain/messages] sendMediaMessage DB insert failed:', insertError)
      return {
        success: true,
        data: { messageId: '', waMessageId: wamid },
        error: 'Mensaje enviado pero no se pudo guardar en DB',
      }
    }

    // 3. Update conversation
    const typeLabels: Record<string, string> = {
      image: 'Imagen',
      video: 'Video',
      audio: 'Audio',
      document: 'Documento',
    }
    const preview = params.caption || `[${typeLabels[params.mediaType] || params.mediaType}]`

    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview.length > 100 ? preview.slice(0, 100) + '...' : preview,
      })
      .eq('id', params.conversationId)

    return {
      success: true,
      data: { messageId: message.id, waMessageId: wamid },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[domain/messages] sendMediaMessage failed:', msg)
    return { success: false, error: msg }
  }
}

// ============================================================================
// SEND TEMPLATE MESSAGE
// ============================================================================

/**
 * Send a template message via 360dialog API and store in DB.
 * Used by: server actions, tool handlers, action executor.
 */
export async function sendTemplateMessage(
  ctx: DomainContext,
  params: SendTemplateMessageParams
): Promise<DomainResult<SendMessageResult>> {
  const supabase = createAdminClient()

  try {
    // 1. Send via 360dialog API
    const response = await send360Template(
      params.apiKey,
      params.contactPhone,
      params.templateName,
      params.templateLanguage,
      params.components
    )
    const wamid = response.messages?.[0]?.id

    if (!wamid) {
      return { success: false, error: 'No se recibio ID de mensaje de WhatsApp' }
    }

    // 2. Store message in DB
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: params.conversationId,
        workspace_id: ctx.workspaceId,
        wamid,
        direction: 'outbound',
        type: 'template',
        content: { body: params.renderedText || params.templateName } as unknown as Record<string, unknown>,
        template_name: params.templateName,
        status: 'sent',
        timestamp: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !message) {
      console.error('[domain/messages] sendTemplateMessage DB insert failed:', insertError)
      return {
        success: true,
        data: { messageId: '', waMessageId: wamid },
        error: 'Template enviado pero no se pudo guardar en DB',
      }
    }

    // 3. Update conversation
    const preview = `[Template] ${params.templateName}`

    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
      })
      .eq('id', params.conversationId)

    return {
      success: true,
      data: { messageId: message.id, waMessageId: wamid },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[domain/messages] sendTemplateMessage failed:', msg)
    return { success: false, error: msg }
  }
}

// ============================================================================
// RECEIVE MESSAGE
// ============================================================================

/**
 * Store an incoming message and emit automation triggers.
 * Used by: webhook handler (processIncomingMessage).
 *
 * Emits:
 *   - whatsapp.message_received (always)
 *   - whatsapp.keyword_match (for each automation whose keywords match)
 */
export async function receiveMessage(
  ctx: DomainContext,
  params: ReceiveMessageParams
): Promise<DomainResult<ReceiveMessageResult>> {
  const supabase = createAdminClient()

  try {
    // 1. Store incoming message in DB
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: params.conversationId,
        workspace_id: ctx.workspaceId,
        wamid: params.waMessageId,
        direction: 'inbound',
        type: params.messageType,
        content: params.contentJson,
        timestamp: params.timestamp,
        ...(params.mediaUrl ? { media_url: params.mediaUrl } : {}),
      })
      .select('id')
      .single()

    // Handle duplicate message (unique constraint on wamid)
    if (insertError) {
      if (insertError.code === '23505') {
        // Duplicate — already processed, ignore
        console.log(`[domain/messages] Duplicate message ignored: ${params.waMessageId}`)
        return { success: true, data: { messageId: '' } }
      }
      console.error('[domain/messages] receiveMessage DB insert failed:', insertError)
      return { success: false, error: insertError.message }
    }

    // 2. Update conversation last_message_at + last_customer_message_at
    await supabase
      .from('conversations')
      .update({
        last_message_at: params.timestamp,
        last_message_preview: buildInboundPreview(params.messageType, params.messageContent),
        last_customer_message_at: params.timestamp,
        is_read: false,
      })
      .eq('id', params.conversationId)

    // 3. Emit whatsapp.message_received trigger (fire-and-forget)
    emitWhatsAppMessageReceived({
      workspaceId: ctx.workspaceId,
      conversationId: params.conversationId,
      contactId: params.contactId,
      messageContent: params.messageContent,
      phone: params.phone,
      contactName: params.contactName,
      cascadeDepth: ctx.cascadeDepth ?? 0,
    })

    // 4. Check for keyword matches against active automations
    await checkKeywordMatches(
      supabase,
      ctx,
      params
    )

    return {
      success: true,
      data: { messageId: message?.id || '' },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[domain/messages] receiveMessage failed:', msg)
    return { success: false, error: msg }
  }
}

// ============================================================================
// KEYWORD MATCH (activating the dead trigger)
// ============================================================================

/**
 * Query active automations with trigger_type = 'whatsapp.keyword_match' for
 * this workspace. For each matching automation, check if the message content
 * contains any of the configured keywords (case-insensitive). Emit
 * emitWhatsAppKeywordMatch for each match.
 *
 * This is fire-and-forget — errors are logged but never thrown.
 */
async function checkKeywordMatches(
  supabase: ReturnType<typeof createAdminClient>,
  ctx: DomainContext,
  params: ReceiveMessageParams
): Promise<void> {
  try {
    // Query active keyword automations for this workspace
    const { data: automations, error } = await supabase
      .from('automations')
      .select('id, trigger_config')
      .eq('workspace_id', ctx.workspaceId)
      .eq('trigger_type', 'whatsapp.keyword_match')
      .eq('is_enabled', true)

    if (error || !automations || automations.length === 0) {
      return // No keyword automations — nothing to check
    }

    const contentLower = params.messageContent.toLowerCase()

    for (const automation of automations) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = automation.trigger_config as any
      const keywords: string[] = config?.keywords || []

      for (const keyword of keywords) {
        if (keyword && contentLower.includes(keyword.toLowerCase())) {
          // Match found — emit trigger
          emitWhatsAppKeywordMatch({
            workspaceId: ctx.workspaceId,
            conversationId: params.conversationId,
            contactId: params.contactId,
            messageContent: params.messageContent,
            phone: params.phone,
            keywordMatched: keyword,
            contactName: params.contactName,
            cascadeDepth: ctx.cascadeDepth ?? 0,
          })
          // Only emit once per automation (first matching keyword wins)
          break
        }
      }
    }
  } catch (error) {
    // Fire-and-forget: log but never throw
    console.error(
      '[domain/messages] checkKeywordMatches failed:',
      error instanceof Error ? error.message : error
    )
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a preview string for inbound messages (for conversation list display).
 */
function buildInboundPreview(messageType: string, messageContent: string): string {
  if (messageType === 'text') {
    return messageContent.length > 100 ? messageContent.slice(0, 100) : messageContent
  }

  const typeLabels: Record<string, string> = {
    image: '[Imagen]',
    video: '[Video]',
    audio: '[Audio]',
    document: '[Documento]',
    sticker: '[Sticker]',
    location: '[Ubicacion]',
    contacts: '[Contacto]',
    reaction: '[Reaccion]',
    interactive: '[Interactivo]',
  }

  // If there's content (e.g. caption), show it; otherwise show type label
  if (messageContent && messageContent.length > 0 && messageType !== 'text') {
    return messageContent.length > 100 ? messageContent.slice(0, 100) : messageContent
  }

  return typeLabels[messageType] || '[Mensaje]'
}
