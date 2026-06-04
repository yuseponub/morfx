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
  sendButtonMessage as send360Buttons,
} from '@/lib/whatsapp/api'
import { getChannelSender } from '@/lib/channels/registry'
import type { ChannelType } from '@/lib/channels/types'
import {
  emitWhatsAppMessageReceived,
  emitWhatsAppKeywordMatch,
} from '@/lib/automations/trigger-emitter'
// Phase 39 (MIG-03 / D-02 — the 131047 fix): the SINGLE provider-decision site.
// `meta_direct` workspaces route the WhatsApp arm through metaWhatsappSender using
// creds resolved from ctx.workspaceId (T-39-02 — NEVER from input/params). The
// `360dialog` arm stays byte-identical (Regla 6).
import { resolveByWorkspace } from '@/lib/meta/credentials'
import { metaWhatsappSender } from '@/lib/channels/meta-whatsapp-sender'
// Phase 40 (MIG-02 / D-10 — Facebook Messenger Direct): the SINGLE messenger
// provider-decision site. `meta_direct` workspaces route the facebook arm through
// metaFacebookSender using creds resolved from ctx.workspaceId (T-40-02 — NEVER from
// input/params). The `manychat` arm stays byte-identical (Regla 6 — protects the
// godentist-fb-ig production agent + every ManyChat workspace).
import { metaFacebookSender } from '@/lib/channels/meta-facebook-sender'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Provider decision helper (Phase 39 — MIG-01: column already exists in prod)
// Reads workspaces.whatsapp_provider for ctx.workspaceId. Used by the three
// send functions to branch the WhatsApp arm. Default/null → '360dialog'.
// ============================================================================
async function readWhatsappProvider(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string
): Promise<'360dialog' | 'meta_direct'> {
  const { data: ws } = await supabase
    .from('workspaces')
    .select('whatsapp_provider')
    .eq('id', workspaceId)
    .single()
  return ws?.whatsapp_provider === 'meta_direct' ? 'meta_direct' : '360dialog'
}

// ============================================================================
// Messenger provider decision helper (Phase 40 — MIG-02 / D-10)
// Reads workspaces.messenger_provider for ctx.workspaceId. Used by the facebook
// arm of sendTextMessage/sendMediaMessage. Default/null/unknown → 'manychat'
// (the byte-identical ManyChat path — Regla 6). Single read per facebook send
// (Regla 3 chokepoint — never per-call-site).
// ============================================================================
async function readMessengerProvider(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string
): Promise<'manychat' | 'meta_direct'> {
  const { data: ws } = await supabase
    .from('workspaces')
    .select('messenger_provider')
    .eq('id', workspaceId)
    .single()
  return ws?.messenger_provider === 'meta_direct' ? 'meta_direct' : 'manychat'
}

// ============================================================================
// Param Types
// ============================================================================

export interface SendTextMessageParams {
  conversationId: string
  contactPhone: string
  messageBody: string
  /** The workspace's 360dialog API key or ManyChat API key — caller must resolve this */
  apiKey: string
  /** Channel type — defaults to 'whatsapp' for backward compatibility */
  channel?: ChannelType
  /**
   * Optional Messenger message tag for out-of-window meta_direct facebook sends.
   * undefined = standard RESPONSE (24h window). The Plan 06 window gate supplies it.
   */
  tag?: 'HUMAN_AGENT'
}

export interface SendMediaMessageParams {
  conversationId: string
  contactPhone: string
  mediaUrl: string
  mediaType: 'image' | 'video' | 'audio' | 'document'
  caption?: string
  filename?: string
  /** The workspace's 360dialog API key or ManyChat API key — caller must resolve this */
  apiKey: string
  /** Channel type — defaults to 'whatsapp' for backward compatibility */
  channel?: ChannelType
  /**
   * Optional Messenger message tag for out-of-window meta_direct facebook sends.
   * undefined = standard RESPONSE (24h window). The Plan 06 window gate supplies it.
   */
  tag?: 'HUMAN_AGENT'
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

export interface SendInteractiveMessageParams {
  conversationId: string
  contactPhone: string
  /** 360dialog key — caller resolves; meta arm ignores it (resolves Meta creds from ctx) */
  apiKey: string
  /** D-04 union discriminant: buttons (meta + 360dialog) | list (meta_direct-only) */
  interactiveType: 'buttons' | 'list'
  body: string
  header?: string
  footer?: string
  /** interactiveType === 'buttons' */
  buttons?: Array<{ id: string; title: string }>
  /** interactiveType === 'list' — menu button label */
  buttonLabel?: string
  /** interactiveType === 'list' */
  sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>
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
  mediaMimeType?: string
  mediaFilename?: string
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
    const channel = params.channel || 'whatsapp'
    let wamid: string | undefined

    // Provider decision (MIG-03) — read whatsapp_provider ONCE for this workspace.
    const provider =
      channel === 'whatsapp'
        ? await readWhatsappProvider(supabase, ctx.workspaceId)
        : '360dialog'

    // 1. Send via the appropriate channel API
    if (channel === 'whatsapp' && provider === 'meta_direct') {
      // Meta Cloud API arm (the 131047 fix). Creds resolve from ctx.workspaceId
      // via resolveByWorkspace — NEVER from params/input (T-39-02).
      const creds = await resolveByWorkspace(ctx.workspaceId, 'whatsapp')
      if (!creds?.accessToken || !creds.phoneNumberId) {
        return { success: false, error: 'Credenciales Meta no configuradas' }
      }
      const resp = await metaWhatsappSender.sendText(
        { accessToken: creds.accessToken, phoneNumberId: creds.phoneNumberId },
        params.contactPhone,
        params.messageBody
      )
      wamid = resp.externalMessageId
    } else if (channel === 'whatsapp') {
      // Direct 360dialog call (existing path, zero change — Regla 6)
      const response = await send360Text(params.apiKey, params.contactPhone, params.messageBody)
      wamid = response.messages?.[0]?.id
    } else if (channel === 'facebook') {
      // Facebook messenger provider decision (MIG-02 / D-10) — read messenger_provider
      // ONCE for this workspace (Regla 3 chokepoint).
      const mp = await readMessengerProvider(supabase, ctx.workspaceId)
      if (mp === 'meta_direct') {
        // Meta Messenger Send API arm. Creds resolve from ctx.workspaceId via
        // resolveByWorkspace('facebook') — NEVER from params/input (T-40-02).
        const creds = await resolveByWorkspace(ctx.workspaceId, 'facebook')
        if (!creds?.accessToken || !creds.pageId) {
          return { success: false, error: 'Credenciales Meta no configuradas' }
        }
        const resp = await metaFacebookSender.sendText(
          { accessToken: creds.accessToken, pageId: creds.pageId },
          params.contactPhone, // PSID string for facebook (external_subscriber_id)
          params.messageBody,
          params.tag
        )
        wamid = resp.externalMessageId
      } else {
        // manychat — BYTE-IDENTICAL to the existing getChannelSender('facebook') path (Regla 6)
        const sender = getChannelSender(channel)
        const result = await sender.sendText(params.apiKey, params.contactPhone, params.messageBody)
        if (!result.success) {
          return { success: false, error: result.error || 'Error al enviar por canal' }
        }
        wamid = result.externalMessageId
      }
    } else {
      // Instagram (or future channels) via ManyChat — untouched (Regla 6)
      const sender = getChannelSender(channel)
      const result = await sender.sendText(params.apiKey, params.contactPhone, params.messageBody)
      if (!result.success) {
        return { success: false, error: result.error || 'Error al enviar por canal' }
      }
      wamid = result.externalMessageId
    }

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
      // Message was sent but DB insert failed — caller must know this is NOT fully successful
      console.error('[domain/messages] sendTextMessage DB insert failed:', insertError)
      return {
        success: false,
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
    const channel = params.channel || 'whatsapp'
    let wamid: string | undefined

    // Provider decision (MIG-03) — read whatsapp_provider ONCE for this workspace.
    const provider =
      channel === 'whatsapp'
        ? await readWhatsappProvider(supabase, ctx.workspaceId)
        : '360dialog'

    // 1. Send via the appropriate channel API
    if (channel === 'whatsapp' && provider === 'meta_direct') {
      // Meta Cloud API arm (the 131047 fix). Creds from ctx.workspaceId only (T-39-02).
      const creds = await resolveByWorkspace(ctx.workspaceId, 'whatsapp')
      if (!creds?.accessToken || !creds.phoneNumberId) {
        return { success: false, error: 'Credenciales Meta no configuradas' }
      }
      const resp = await metaWhatsappSender.sendMedia(
        { accessToken: creds.accessToken, phoneNumberId: creds.phoneNumberId },
        params.contactPhone,
        params.mediaType,
        params.mediaUrl,
        params.caption,
        params.filename
      )
      wamid = resp.externalMessageId
    } else if (channel === 'whatsapp') {
      // Direct 360dialog call (existing path, zero change — Regla 6)
      const response = await send360Media(
        params.apiKey,
        params.contactPhone,
        params.mediaType,
        params.mediaUrl,
        params.caption,
        params.filename
      )
      wamid = response.messages?.[0]?.id
    } else if (channel === 'facebook') {
      // Messenger provider decision (MIG-02 / D-10) — read messenger_provider ONCE.
      const mp = await readMessengerProvider(supabase, ctx.workspaceId)
      if (mp === 'meta_direct') {
        // Meta Messenger Send API arm — supports image/audio/video/document
        // (40-08 follow-up; was image-only). Creds from ctx.workspaceId only (T-40-02).
        const creds = await resolveByWorkspace(ctx.workspaceId, 'facebook')
        if (!creds?.accessToken || !creds.pageId) {
          return { success: false, error: 'Credenciales Meta no configuradas' }
        }
        const resp = await metaFacebookSender.sendMedia(
          { accessToken: creds.accessToken, pageId: creds.pageId },
          params.contactPhone, // PSID string for facebook
          params.mediaType,
          params.mediaUrl,
          params.caption,
          params.tag
        )
        wamid = resp.externalMessageId
      } else if (params.mediaType === 'image') {
        // manychat — BYTE-IDENTICAL to the existing getChannelSender('facebook') path (Regla 6)
        const sender = getChannelSender(channel)
        const result = await sender.sendImage(params.apiKey, params.contactPhone, params.mediaUrl, params.caption)
        if (!result.success) {
          return { success: false, error: result.error || 'Error al enviar media por canal' }
        }
        wamid = result.externalMessageId
      } else {
        // manychat facebook — only images supported (unchanged, Regla 6)
        console.warn(`[domain/messages] Media type '${params.mediaType}' not supported on channel '${channel}' (manychat)`)
        return { success: false, error: `Tipo de media '${params.mediaType}' no soportado en ${channel}` }
      }
    } else {
      // Instagram (or future channels) via ManyChat — untouched (Regla 6) — only images supported
      if (params.mediaType === 'image') {
        const sender = getChannelSender(channel)
        const result = await sender.sendImage(params.apiKey, params.contactPhone, params.mediaUrl, params.caption)
        if (!result.success) {
          return { success: false, error: result.error || 'Error al enviar media por canal' }
        }
        wamid = result.externalMessageId
      } else {
        // Other media types not yet supported on ManyChat — log and skip
        console.warn(`[domain/messages] Media type '${params.mediaType}' not supported on channel '${channel}'`)
        return { success: false, error: `Tipo de media '${params.mediaType}' no soportado en ${channel}` }
      }
    }

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
        success: false,
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
    // Provider decision (MIG-03) — template sends are always WhatsApp.
    const provider = await readWhatsappProvider(supabase, ctx.workspaceId)

    let wamid: string | undefined

    // 1. Send via the resolved provider
    if (provider === 'meta_direct') {
      // Meta Cloud API arm (the 131047 fix). Creds from ctx.workspaceId only (T-39-02).
      const creds = await resolveByWorkspace(ctx.workspaceId, 'whatsapp')
      if (!creds?.accessToken || !creds.phoneNumberId) {
        return { success: false, error: 'Credenciales Meta no configuradas' }
      }
      const resp = await metaWhatsappSender.sendTemplate(
        { accessToken: creds.accessToken, phoneNumberId: creds.phoneNumberId },
        params.contactPhone,
        params.templateName,
        params.templateLanguage,
        params.components
      )
      wamid = resp.externalMessageId
    } else {
      // Direct 360dialog call (existing path, zero change — Regla 6)
      const response = await send360Template(
        params.apiKey,
        params.contactPhone,
        params.templateName,
        params.templateLanguage,
        params.components
      )
      wamid = response.messages?.[0]?.id
    }

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
        success: false,
        data: { messageId: '', waMessageId: wamid },
        error: 'Template enviado pero no se pudo guardar en DB',
      }
    }

    // 3. Update conversation (reactivate if archived so it appears in inbox)
    const preview = `[Template] ${params.templateName}`

    await supabase
      .from('conversations')
      .update({
        status: 'active',
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
// SEND INTERACTIVE MESSAGE (Phase 999.1 — D-03/D-04)
// Single domain chokepoint for interactive sends (reply buttons + list).
// Reads whatsapp_provider ONCE and branches (Regla 3 / Phase 39):
//   - meta_direct → metaWhatsappSender.sendButtons / .sendList (creds from ctx, T-39-02)
//   - 360dialog   → send360Buttons byte-identical (Regla 6); list → clear error (legacy)
// Stores the full interactive structure as JSONB (type='interactive') so the
// outbound bubble renders rich (D-04). Returns DomainResult<SendMessageResult>.
// ============================================================================
export async function sendInteractiveMessage(
  ctx: DomainContext,
  params: SendInteractiveMessageParams
): Promise<DomainResult<SendMessageResult>> {
  const supabase = createAdminClient()

  try {
    // Provider decision (Phase 39) — interactive sends are always WhatsApp.
    const provider = await readWhatsappProvider(supabase, ctx.workspaceId)

    let wamid: string | undefined

    // 1. Send via the resolved provider
    if (provider === 'meta_direct') {
      // Meta Cloud API arm. Creds from ctx.workspaceId only (T-39-02).
      const creds = await resolveByWorkspace(ctx.workspaceId, 'whatsapp')
      if (!creds?.accessToken || !creds.phoneNumberId) {
        return { success: false, error: 'Credenciales Meta no configuradas' }
      }
      const metaCreds = { accessToken: creds.accessToken, phoneNumberId: creds.phoneNumberId }
      const resp =
        params.interactiveType === 'buttons'
          ? await metaWhatsappSender.sendButtons(
              metaCreds,
              params.contactPhone,
              params.body,
              params.buttons ?? [],
              params.header,
              params.footer
            )
          : await metaWhatsappSender.sendList(
              metaCreds,
              params.contactPhone,
              params.body,
              params.buttonLabel ?? '',
              params.sections ?? [],
              params.header,
              params.footer
            )
      wamid = resp.externalMessageId
    } else {
      // Direct 360dialog call (existing path, zero change — Regla 6).
      // List is meta_direct-only: 360dialog has no list function (D-03).
      if (params.interactiveType === 'list') {
        return { success: false, error: 'lista no soportada en 360dialog (legacy)' }
      }
      const resp = await send360Buttons(
        params.apiKey,
        params.contactPhone,
        params.body,
        params.buttons ?? [],
        params.header,
        params.footer
      )
      wamid = resp.messages?.[0]?.id
    }

    if (!wamid) {
      return { success: false, error: 'No se recibio ID de mensaje de WhatsApp' }
    }

    // 2. Store the FULL interactive structure as JSONB (D-04) for the rich outbound bubble.
    const content = {
      interactiveType: params.interactiveType,
      body: params.body,
      ...(params.header ? { header: params.header } : {}),
      ...(params.footer ? { footer: params.footer } : {}),
      ...(params.buttons ? { buttons: params.buttons } : {}),
      ...(params.buttonLabel ? { buttonLabel: params.buttonLabel } : {}),
      ...(params.sections ? { sections: params.sections } : {}),
    }

    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: params.conversationId,
        workspace_id: ctx.workspaceId,
        wamid,
        direction: 'outbound',
        type: 'interactive',
        content: content as unknown as Record<string, unknown>,
        status: 'sent',
        timestamp: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !message) {
      console.error('[domain/messages] sendInteractiveMessage DB insert failed:', insertError)
      return {
        success: false,
        data: { messageId: '', waMessageId: wamid },
        error: 'Interactivo enviado pero no se pudo guardar en DB',
      }
    }

    // 3. Update conversation (reactivate if archived so it appears in inbox)
    await supabase
      .from('conversations')
      .update({
        status: 'active',
        last_message_at: new Date().toISOString(),
        last_message_preview: '[Interactivo]',
      })
      .eq('id', params.conversationId)

    return {
      success: true,
      data: { messageId: message.id, waMessageId: wamid },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[domain/messages] sendInteractiveMessage failed:', msg)
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
        ...(params.mediaMimeType ? { media_mime_type: params.mediaMimeType } : {}),
        ...(params.mediaFilename ? { media_filename: params.mediaFilename } : {}),
        processed_by_agent: false,
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
    await emitWhatsAppMessageReceived({
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
          await emitWhatsAppKeywordMatch({
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

// ============================================================================
// agent-lifecycle-router extensions (Plan 02 Task 3 — B-4 fix)
//
// Read-only helpers consumed by Plan 03 fact resolvers (lastInteractionAt,
// daysSinceLastInteraction) and Plan 05 dry-run replay. None mutate.
// ============================================================================

/**
 * Returns the ISO timestamp of the contact's most recent inbound WhatsApp
 * message, or null if none. Used by Plan 03 fact `lastInteractionAt` /
 * `daysSinceLastInteraction`.
 */
export async function getLastInboundMessageAt(
  contactId: string,
  workspaceId: string,
): Promise<string | null> {
  const supabase = createAdminClient()
  // messages table has conversation_id (FK to conversations.contact_id),
  // not contact_id directly. Join via inner select on conversations.
  const { data } = await supabase
    .from('messages')
    .select('created_at, conversations!inner(contact_id)')
    .eq('workspace_id', workspaceId)
    .eq('conversations.contact_id', contactId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { created_at?: string } | null)?.created_at ?? null
}

// ============================================================================
// setMessageTranscription — v4-media-audio-image Plan 02 (D-04/D-09, Regla 3)
//
// Persists the Whisper transcript for an already-inserted audio message row.
// The row is inserted by receiveMessage (keyed by wamid) BEFORE the Inngest
// media-gate runs (RQ-6 / Pitfall 2). Transcript = UPDATE, never a second INSERT.
//
// Consumed by: Wave 2 Inngest function (v4-only, Regla 6).
// ============================================================================

/**
 * Updates the `transcription` column on an existing message row, identified
 * by its WhatsApp message id (`wamid`) within the caller's workspace.
 *
 * Regla 3: createAdminClient() + workspace_id filter on every mutation.
 * Regla 6: called only from the v4 media-gate Inngest function.
 */
export async function setMessageTranscription(
  ctx: DomainContext,
  params: { wamid: string; transcription: string }
): Promise<DomainResult<{ updated: boolean }>> {
  if (!params.wamid) {
    return { success: false, error: 'missing wamid' }
  }
  const supabase = createAdminClient()
  try {
    const { error } = await supabase
      .from('messages')
      .update({ transcription: params.transcription })
      .eq('wamid', params.wamid)
      .eq('workspace_id', ctx.workspaceId) // Regla 3 workspace isolation
    if (error) {
      console.error('[domain/messages] setMessageTranscription failed:', error.message)
      return { success: false, error: error.message }
    }
    return { success: true, data: { updated: true } }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[domain/messages] setMessageTranscription failed:', msg)
    return { success: false, error: msg }
  }
}

/**
 * Returns up to `limit` distinct conversations that received at least one
 * inbound message in the last `daysBack` days, deduplicated by
 * `conversation_id`. Each entry carries the most-recent inbound timestamp.
 *
 * Used by Plan 05 dry-run simulator to replay historical decisions against
 * a candidate rule set.
 */
export async function getInboundConversationsLastNDays(
  workspaceId: string,
  daysBack: number,
  limit = 500,
): Promise<Array<{ conversation_id: string; contact_id: string; inbound_message_at: string }>> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString()
  // messages table has conversation_id (FK), not contact_id directly. Join via
  // inner select on conversations to retrieve contact_id.
  const { data } = await supabase
    .from('messages')
    .select('conversation_id, created_at, conversations!inner(contact_id)')
    .eq('workspace_id', workspaceId)
    .eq('direction', 'inbound')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)
  const seen = new Set<string>()
  const out: Array<{ conversation_id: string; contact_id: string; inbound_message_at: string }> = []
  for (const row of (data ?? []) as Array<{
    conversation_id: string | null
    created_at: string
    conversations: { contact_id: string | null } | { contact_id: string | null }[] | null
  }>) {
    if (!row.conversation_id) continue
    if (seen.has(row.conversation_id)) continue
    const conv = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations
    const contactId = conv?.contact_id ?? null
    if (!contactId) continue
    seen.add(row.conversation_id)
    out.push({
      conversation_id: row.conversation_id,
      contact_id: contactId,
      inbound_message_at: row.created_at,
    })
  }
  return out
}
