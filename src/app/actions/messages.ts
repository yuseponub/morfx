'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getRequestAuth } from '@/lib/auth/request-auth'
import { differenceInHours } from 'date-fns'
import { getTemplate } from './templates'
import {
  sendTextMessage as domainSendTextMessage,
  sendMediaMessage as domainSendMediaMessage,
  sendTemplateMessage as domainSendTemplateMessage,
  sendInteractiveMessage as domainSendInteractiveMessage,
} from '@/lib/domain/messages'
import type { DomainContext } from '@/lib/domain/types'
import { resolveMessengerWindowSend } from '@/lib/messenger/window-gate'
import type {
  Message,
  ActionResult,
} from '@/lib/whatsapp/types'

/**
 * GAP-41-08: detect an audio-only mp4/quicktime container.
 * Returns true iff the buffer carries a 'soun' (audio) handler and NO 'vide' (video)
 * handler — i.e. a .mp4/.mov with no video track (chat-downloaded audioclip-*.mp4,
 * Android voice notes). Pure, bounded, never throws. Used to reclassify such files
 * from 'video' to 'audio' for IG/FB sends (Meta rejects audio-only mp4 sent as video).
 */
export function isAudioOnlyMp4(buf: Buffer): boolean {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 8) return false
    // Bound the scan — untrusted uploaded buffer; moov/hdlr boxes are at the front.
    const slice = buf.length > 524288 ? buf.subarray(0, 524288) : buf
    const hasVide = slice.indexOf('vide', 0, 'ascii') !== -1
    if (hasVide) return false
    const hasSoun = slice.indexOf('soun', 0, 'ascii') !== -1
    return hasSoun
  } catch {
    return false
  }
}

// ============================================================================
// READ OPERATIONS (unchanged — domain only handles mutations)
// ============================================================================

/**
 * Get messages for a conversation.
 * Returns messages ordered by timestamp (oldest first for chat display).
 *
 * @param conversationId - Conversation ID
 * @param limit - Maximum number of messages to return (default 100)
 * @param before - Optional cursor for pagination (timestamp)
 */
export async function getMessages(
  conversationId: string,
  limit: number = 100,
  before?: string
): Promise<Message[]> {
  const auth = await getRequestAuth()
  if (!auth) {
    return []
  }
  const workspaceId = auth.workspaceId
  const supabase = await createClient()

  // Verify conversation belongs to workspace
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!conversation) {
    return []
  }

  // Query messages
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(limit)

  // Cursor pagination: get messages before a certain timestamp
  if (before) {
    query = query.lt('timestamp', before)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching messages:', error)
    return []
  }

  // Return in chronological order (oldest first for chat display)
  return (data || []).reverse() as Message[]
}

// ============================================================================
// SEND OPERATIONS — delegates to domain/messages
// ============================================================================

/**
 * Send a text message within the 24h window.
 * Auth + 24h window check + API key resolution are adapter concerns.
 * Actual send + DB storage delegated to domain.
 */
export async function sendMessage(
  conversationId: string,
  text: string
): Promise<ActionResult<{ messageId: string }>> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId
  const supabase = await createClient()

  // Get conversation with 24h window info + channel
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, phone, phone_number_id, last_customer_message_at, status, channel, external_subscriber_id')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .single()

  if (convError || !conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  const channel = (conversation.channel || 'whatsapp') as 'whatsapp' | 'facebook' | 'instagram'

  // Check 24h window (WhatsApp only — FB/IG don't have this restriction via ManyChat)
  if (channel === 'whatsapp') {
    if (!conversation.last_customer_message_at) {
      return { error: 'Ventana de 24h cerrada. Usa un template.' }
    }

    const hoursSinceCustomerMessage = differenceInHours(
      new Date(),
      new Date(conversation.last_customer_message_at)
    )

    if (hoursSinceCustomerMessage >= 24) {
      return { error: 'Ventana de 24h cerrada. Usa un template.' }
    }
  }

  // Get workspace settings for API key (channel-aware) + messenger_provider (FB window
  // gate) + instagram_provider (IG window gate — D-IG-09).
  const { data: workspaceSettings } = await supabase
    .from('workspaces')
    .select('settings, messenger_provider, instagram_provider')
    .eq('id', workspaceId)
    .single()

  let apiKey: string | undefined
  // meta_direct facebook sends use the Page token (resolved in the domain via
  // resolveByWorkspace) — NOT the ManyChat API key. Regla 6: the manychat facebook +
  // instagram + whatsapp paths still require their key (byte-identical). Only the
  // meta_direct facebook arm skips it (apiKey stays undefined; the domain ignores it).
  const isMetaDirectFacebook =
    channel === 'facebook' && workspaceSettings?.messenger_provider === 'meta_direct'
  const isMetaDirectInstagram =
    channel === 'instagram' && workspaceSettings?.instagram_provider === 'meta_direct'
  if (!isMetaDirectFacebook && !isMetaDirectInstagram) {
    if (channel === 'facebook' || channel === 'instagram') {
      apiKey = workspaceSettings?.settings?.manychat_api_key
      if (!apiKey) {
        return { error: 'API key de ManyChat no configurada' }
      }
    } else {
      apiKey = workspaceSettings?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
      if (!apiKey) {
        return { error: 'API key de WhatsApp no configurada' }
      }
    }
  }

  // Facebook meta_direct window gate (D-09). ONLY applies to channel=facebook +
  // messenger_provider=meta_direct; the manychat facebook + instagram + whatsapp paths
  // stay byte-identical (Regla 6). Inside 24h → RESPONSE (no tag); 24h-7d + Human Agent
  // feature granted → HUMAN_AGENT tag; else → BLOCK with a clear Spanish message.
  let fbTag: 'HUMAN_AGENT' | undefined
  if (channel === 'facebook' && workspaceSettings?.messenger_provider === 'meta_direct') {
    const hoursSinceCustomerMessage = conversation.last_customer_message_at
      ? differenceInHours(new Date(), new Date(conversation.last_customer_message_at))
      : Infinity
    const decision = resolveMessengerWindowSend({
      hoursSinceCustomerMessage,
      featureGranted: process.env.META_HUMAN_AGENT_ENABLED === 'true',
    })
    if ('blocked' in decision) {
      return { error: decision.error }
    }
    fbTag = decision.messaging_type === 'MESSAGE_TAG' ? decision.tag : undefined
  }

  // Instagram meta_direct window gate (D-IG-09 — reuses the SAME window-gate helper as
  // FB, no IG sibling). ONLY applies to channel=instagram + instagram_provider=meta_direct;
  // the manychat instagram + facebook + whatsapp paths stay byte-identical (Regla 6). IG has
  // NO templates → outside the window is block-only (Pitfall 6).
  let igTag: 'HUMAN_AGENT' | undefined
  if (channel === 'instagram' && workspaceSettings?.instagram_provider === 'meta_direct') {
    const hoursSinceCustomerMessage = conversation.last_customer_message_at
      ? differenceInHours(new Date(), new Date(conversation.last_customer_message_at))
      : Infinity
    const decision = resolveMessengerWindowSend({
      hoursSinceCustomerMessage,
      featureGranted: process.env.META_HUMAN_AGENT_ENABLED === 'true',
    })
    if ('blocked' in decision) {
      return { error: decision.error }
    }
    igTag = decision.messaging_type === 'MESSAGE_TAG' ? decision.tag : undefined
  }

  // For FB/IG, use external_subscriber_id as the recipient
  const recipientId = (channel !== 'whatsapp' && conversation.external_subscriber_id)
    ? conversation.external_subscriber_id
    : conversation.phone

  // Delegate to domain
  const ctx: DomainContext = { workspaceId, source: 'server-action' }
  const result = await domainSendTextMessage(ctx, {
    conversationId,
    contactPhone: recipientId,
    messageBody: text,
    apiKey: apiKey ?? '', // meta_direct facebook/instagram ignores this (uses the Page token)
    channel,
    tag: fbTag ?? igTag,
  })

  if (!result.success) {
    return { error: result.error || 'Error al enviar mensaje' }
  }

  // Unarchive conversation if needed (adapter concern)
  if (conversation.status === 'archived') {
    await supabase
      .from('conversations')
      .update({ status: 'active' })
      .eq('id', conversationId)
  }

  revalidatePath('/whatsapp')
  return { success: true, data: { messageId: result.data!.messageId } }
}

/**
 * Send an interactive message (reply buttons / list) within the 24h window.
 *
 * Mirrors `sendMessage` EXACTLY: auth → load conversation (workspace-scoped) →
 * 24h-window re-check → resolve apiKey → build DomainContext → delegate to domain →
 * revalidatePath. Adapter-layer concerns (auth, window gating defense-in-depth,
 * cred resolution, revalidation) live here, NOT in the domain.
 *
 * REGLA 3: this action NEVER reads or branches on the WhatsApp provider — the domain
 * (`sendInteractiveMessage`) owns the single provider-decision chokepoint. The window
 * check is re-applied server-side even though the composer UI gates it (D-02), because
 * interactive is a session message and Meta rejects it outside the 24h window.
 *
 * Interactive is WhatsApp-only in this phase; FB/IG (ManyChat) is out of scope.
 */
export async function sendInteractiveMessage(
  conversationId: string,
  payload: {
    interactiveType: 'buttons' | 'list'
    body: string
    header?: string
    footer?: string
    buttons?: { id: string; title: string }[]
    buttonLabel?: string
    sections?: { title: string; rows: { id: string; title: string; description?: string }[] }[]
  }
): Promise<ActionResult<{ messageId: string }>> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId
  const supabase = await createClient()

  // Load conversation scoped by workspace_id (Regla 3 / V4 access control)
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, phone, last_customer_message_at, status, channel')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .single()

  if (convError || !conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  // Channel guard: interactive is WhatsApp-only (FB/IG out of scope this phase)
  if (conversation.channel !== 'whatsapp') {
    return { error: 'Interactivos solo disponibles en WhatsApp' }
  }

  // 24h window re-check (defense-in-depth behind the UI gate — D-02).
  // Interactive is a session message → the window MUST be open.
  if (!conversation.last_customer_message_at) {
    return { error: 'Ventana de 24h cerrada. Usa un template.' }
  }

  const hoursSinceCustomerMessage = differenceInHours(
    new Date(),
    new Date(conversation.last_customer_message_at)
  )

  if (hoursSinceCustomerMessage >= 24) {
    return { error: 'Ventana de 24h cerrada. Usa un template.' }
  }

  // Resolve apiKey (360dialog arm only; the meta_direct arm ignores it and the domain
  // resolves Meta creds itself via resolveByWorkspace — the action never reads the provider).
  const { data: workspaceSettings } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  const apiKey = workspaceSettings?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) {
    return { error: 'API key de WhatsApp no configurada' }
  }

  // Delegate to domain (the single provider-decision chokepoint — Regla 3)
  const ctx: DomainContext = { workspaceId, source: 'server-action' }
  const result = await domainSendInteractiveMessage(ctx, {
    conversationId,
    contactPhone: conversation.phone,
    apiKey,
    ...payload,
  })

  if (!result.success) {
    return { error: result.error || 'Error al enviar mensaje interactivo' }
  }

  // Unarchive conversation if needed (adapter concern)
  if (conversation.status === 'archived') {
    await supabase
      .from('conversations')
      .update({ status: 'active' })
      .eq('id', conversationId)
  }

  revalidatePath('/whatsapp')
  return { success: true, data: { messageId: result.data!.messageId } }
}

/**
 * Send a media message within the 24h window.
 * File upload to Supabase Storage is adapter concern.
 * Actual send + DB storage delegated to domain.
 */
export async function sendMediaMessage(
  conversationId: string,
  fileData: string,
  fileName: string,
  mimeType: string,
  caption?: string
): Promise<ActionResult<{ messageId: string }>> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId
  const supabase = await createClient()

  // Get conversation with 24h window info + channel
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, phone, phone_number_id, last_customer_message_at, status, channel, external_subscriber_id')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .single()

  if (convError || !conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  const channel = (conversation.channel || 'whatsapp') as 'whatsapp' | 'facebook' | 'instagram'

  // Check 24h window (WhatsApp only)
  if (channel === 'whatsapp') {
    if (!conversation.last_customer_message_at) {
      return { error: 'Ventana de 24h cerrada. Usa un template.' }
    }

    const hoursSinceCustomerMessage = differenceInHours(
      new Date(),
      new Date(conversation.last_customer_message_at)
    )

    if (hoursSinceCustomerMessage >= 24) {
      return { error: 'Ventana de 24h cerrada. Usa un template.' }
    }
  }

  // Determine media type from MIME type
  let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document'
  if (mimeType.startsWith('image/')) {
    mediaType = 'image'
  } else if (mimeType.startsWith('video/')) {
    mediaType = 'video'
  } else if (mimeType.startsWith('audio/')) {
    mediaType = 'audio'
  }

  // GAP-41-08: audio-only .mp4/.mov clips (e.g. chat-downloaded audioclip-*.mp4) report
  // MIME video/mp4 → mis-classified as 'video' above → Meta rejects (#100 subcode 2018047)
  // on FB AND IG because there is no video track. For IG/FB only, scan the container: if it
  // has a 'soun' handler and NO 'vide' handler, reclassify to 'audio' so the sender sends
  // type:'audio' (Meta 200). WhatsApp is NOT gated → byte-identical (Regla 6).
  if (
    (channel === 'instagram' || channel === 'facebook') &&
    mediaType === 'video' &&
    (mimeType === 'video/mp4' || mimeType === 'video/quicktime')
  ) {
    // Decode only a bounded prefix for the scan — the moov/hdlr boxes are at the front of a
    // chat-exported mp4. The full buffer is decoded later for the upload (line ~469, unchanged).
    const scanBuffer = Buffer.from(fileData.slice(0, 700000), 'base64')
    if (isAudioOnlyMp4(scanBuffer)) {
      mediaType = 'audio'
    }
  }

  // Get workspace settings for API key (channel-aware) + messenger_provider (FB window
  // gate) + instagram_provider (IG window gate — D-IG-09).
  const { data: workspaceSettings } = await supabase
    .from('workspaces')
    .select('settings, messenger_provider, instagram_provider')
    .eq('id', workspaceId)
    .single()

  let apiKey: string | undefined
  // meta_direct facebook sends use the Page token (resolved in the domain via
  // resolveByWorkspace) — NOT the ManyChat API key. Regla 6: the manychat facebook +
  // instagram + whatsapp paths still require their key (byte-identical). Only the
  // meta_direct facebook arm skips it (apiKey stays undefined; the domain ignores it).
  const isMetaDirectFacebook =
    channel === 'facebook' && workspaceSettings?.messenger_provider === 'meta_direct'
  const isMetaDirectInstagram =
    channel === 'instagram' && workspaceSettings?.instagram_provider === 'meta_direct'
  if (!isMetaDirectFacebook && !isMetaDirectInstagram) {
    if (channel === 'facebook' || channel === 'instagram') {
      apiKey = workspaceSettings?.settings?.manychat_api_key
      if (!apiKey) {
        return { error: 'API key de ManyChat no configurada' }
      }
    } else {
      apiKey = workspaceSettings?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
      if (!apiKey) {
        return { error: 'API key de WhatsApp no configurada' }
      }
    }
  }

  // Facebook meta_direct window gate (D-09) — mirror of the text path. meta_direct facebook
  // only; manychat facebook + instagram + whatsapp unchanged (Regla 6).
  let fbTag: 'HUMAN_AGENT' | undefined
  if (channel === 'facebook' && workspaceSettings?.messenger_provider === 'meta_direct') {
    const hoursSinceCustomerMessage = conversation.last_customer_message_at
      ? differenceInHours(new Date(), new Date(conversation.last_customer_message_at))
      : Infinity
    const decision = resolveMessengerWindowSend({
      hoursSinceCustomerMessage,
      featureGranted: process.env.META_HUMAN_AGENT_ENABLED === 'true',
    })
    if ('blocked' in decision) {
      return { error: decision.error }
    }
    fbTag = decision.messaging_type === 'MESSAGE_TAG' ? decision.tag : undefined
  }

  // Instagram meta_direct window gate (D-IG-09) — mirror of the text path; reuses the SAME
  // window-gate helper as FB (no IG sibling). meta_direct instagram only; manychat instagram
  // + facebook + whatsapp unchanged (Regla 6). IG has NO templates → block-only (Pitfall 6).
  let igTag: 'HUMAN_AGENT' | undefined
  if (channel === 'instagram' && workspaceSettings?.instagram_provider === 'meta_direct') {
    const hoursSinceCustomerMessage = conversation.last_customer_message_at
      ? differenceInHours(new Date(), new Date(conversation.last_customer_message_at))
      : Infinity
    const decision = resolveMessengerWindowSend({
      hoursSinceCustomerMessage,
      featureGranted: process.env.META_HUMAN_AGENT_ENABLED === 'true',
    })
    if ('blocked' in decision) {
      return { error: decision.error }
    }
    igTag = decision.messaging_type === 'MESSAGE_TAG' ? decision.tag : undefined
  }

  // For FB/IG, use external_subscriber_id as the recipient
  const recipientId = (channel !== 'whatsapp' && conversation.external_subscriber_id)
    ? conversation.external_subscriber_id
    : conversation.phone

  try {
    // Upload to Supabase Storage (adapter concern — stays in server action)
    const adminClient = createAdminClient()
    const buffer = Buffer.from(fileData, 'base64')
    const safeName = fileName
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${workspaceId}/${conversationId}/${Date.now()}-${safeName}`

    const { error: uploadError } = await adminClient
      .storage
      .from('whatsapp-media')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading media:', uploadError)
      return { error: `Error al subir archivo: ${uploadError.message}` }
    }

    // Get public URL
    const { data: publicUrlData } = adminClient
      .storage
      .from('whatsapp-media')
      .getPublicUrl(filePath)

    const mediaUrl = publicUrlData.publicUrl

    // Delegate to domain
    const ctx: DomainContext = { workspaceId, source: 'server-action' }
    const result = await domainSendMediaMessage(ctx, {
      conversationId,
      contactPhone: recipientId,
      mediaUrl,
      mediaType,
      caption,
      filename: mediaType === 'document' ? fileName : undefined,
      apiKey: apiKey ?? '', // meta_direct facebook/instagram ignores this (uses the Page token)
      channel,
      tag: fbTag ?? igTag,
    })

    if (!result.success) {
      return { error: result.error || 'Error al enviar archivo' }
    }

    // Unarchive conversation if needed (adapter concern)
    if (conversation.status === 'archived') {
      await supabase
        .from('conversations')
        .update({ status: 'active' })
        .eq('id', conversationId)
    }

    revalidatePath('/whatsapp')
    return { success: true, data: { messageId: result.data!.messageId } }
  } catch (err) {
    console.error('Error sending media message:', err)
    return { error: err instanceof Error ? err.message : 'Error al enviar archivo' }
  }
}

/**
 * Mark a specific message as read (send read receipt to WhatsApp).
 * Read-only + API call — not a domain mutation, stays in server action.
 */
export async function markMessageAsRead(messageId: string): Promise<ActionResult> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId
  const supabase = await createClient()

  // Get message with wamid
  const { data: message } = await supabase
    .from('messages')
    .select('id, wamid, conversation_id')
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!message || !message.wamid) {
    return { error: 'Mensaje no encontrado' }
  }

  // Provider decision (MIG-03 / D-07) — read receipts route via the same
  // chokepoint logic as sends: meta_direct → Cloud API, else 360dialog.
  const { data: workspaceSettings } = await supabase
    .from('workspaces')
    .select('settings, whatsapp_provider')
    .eq('id', workspaceId)
    .single()

  try {
    if (workspaceSettings?.whatsapp_provider === 'meta_direct') {
      // Meta Cloud API arm. Creds resolved from workspaceId only (T-39-02),
      // and the access token is never logged (T-39-01).
      const { resolveByWorkspace } = await import('@/lib/meta/credentials')
      const { markWhatsAppRead } = await import('@/lib/meta/api')
      const creds = await resolveByWorkspace(workspaceId, 'whatsapp')
      if (!creds?.accessToken || !creds.phoneNumberId) {
        return { error: 'Credenciales Meta no configuradas' }
      }
      await markWhatsAppRead(creds.accessToken, creds.phoneNumberId, message.wamid)
      return { success: true, data: undefined }
    }

    // 360dialog arm (default — byte-identical, Regla 6).
    const apiKey = workspaceSettings?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
    if (!apiKey) {
      return { error: 'API key de WhatsApp no configurada' }
    }
    const { markMessageAsRead: markRead360 } = await import('@/lib/whatsapp/api')
    await markRead360(apiKey, message.wamid)

    return { success: true, data: undefined }
  } catch (err) {
    console.error('Error marking message as read:', err)
    return { error: 'Error al marcar mensaje como leido' }
  }
}

// ============================================================================
// TEMPLATE OPERATIONS — delegates to domain/messages
// ============================================================================

/**
 * Send a template message (used when 24h window is closed).
 * Template lookup + component building are adapter concerns.
 * Actual send + DB storage delegated to domain.
 */
export async function sendTemplateMessage(params: {
  conversationId: string
  templateId: string
  variableValues: Record<string, string>
}): Promise<ActionResult<{ messageId: string }>> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId
  const supabase = await createClient()

  // Get conversation to get recipient phone
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, phone, contact_id, status')
    .eq('id', params.conversationId)
    .eq('workspace_id', workspaceId)
    .single()

  if (convError || !conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  // Get template
  const template = await getTemplate(params.templateId)
  if (!template) {
    return { error: 'Template no encontrado' }
  }
  if (template.status !== 'APPROVED') {
    return { error: 'Template no aprobado por Meta' }
  }

  // Build template components with variable values
  const bodyComponent = template.components.find(c => c.type === 'BODY')
  const headerComponent = template.components.find(c => c.type === 'HEADER')

  const apiComponents: Array<{
    type: 'header' | 'body' | 'button'
    parameters?: Array<{
      type: 'text' | 'image' | 'video' | 'document'
      text?: string
      image?: { link: string }
      video?: { link: string }
      document?: { link: string }
    }>
  }> = []

  // Handle HEADER component (image/video/document require media parameter)
  if (headerComponent) {
    const format = (headerComponent.format || '').toUpperCase()
    if (format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT') {
      const mediaUrl = headerComponent.example?.header_handle?.[0] || ''
      if (mediaUrl) {
        const mediaType = format.toLowerCase() as 'image' | 'video' | 'document'
        apiComponents.push({
          type: 'header',
          parameters: [{
            type: mediaType,
            [mediaType]: { link: mediaUrl },
          }],
        })
      }
    } else {
      const headerVars = headerComponent?.text?.match(/\{\{(\d+)\}\}/g) || []
      if (headerVars.length > 0) {
        apiComponents.push({
          type: 'header',
          parameters: headerVars.map(v => {
            const num = v.replace(/[{}]/g, '')
            return { type: 'text' as const, text: params.variableValues[num] || '' }
          })
        })
      }
    }
  }

  // Extract variable numbers from body text and build parameters
  const bodyVars = bodyComponent?.text?.match(/\{\{(\d+)\}\}/g) || []
  if (bodyVars.length > 0) {
    apiComponents.push({
      type: 'body',
      parameters: bodyVars.map(v => {
        const num = v.replace(/[{}]/g, '')
        return { type: 'text' as const, text: params.variableValues[num] || '' }
      })
    })
  }

  // Build the rendered message text for display
  let renderedText = bodyComponent?.text || ''
  Object.entries(params.variableValues).forEach(([num, value]) => {
    renderedText = renderedText.replace(new RegExp(`\\{\\{${num}\\}\\}`, 'g'), value)
  })

  // Get workspace settings for API key
  const { data: workspaceSettings } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  const apiKey = workspaceSettings?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) {
    return { error: 'API key de WhatsApp no configurada' }
  }

  // Delegate to domain
  const ctx: DomainContext = { workspaceId, source: 'server-action' }
  const result = await domainSendTemplateMessage(ctx, {
    conversationId: params.conversationId,
    contactPhone: conversation.phone,
    templateName: template.name,
    templateLanguage: template.language,
    components: apiComponents.length > 0 ? apiComponents : undefined,
    renderedText,
    apiKey,
  })

  if (!result.success) {
    return { error: result.error || 'Error al enviar template' }
  }

  // Unarchive conversation if needed (adapter concern)
  if (conversation.status === 'archived') {
    await supabase
      .from('conversations')
      .update({ status: 'active' })
      .eq('id', params.conversationId)
  }

  revalidatePath('/whatsapp')
  return { success: true, data: { messageId: result.data!.messageId } }
}
