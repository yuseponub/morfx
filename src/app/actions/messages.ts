'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { differenceInHours } from 'date-fns'
import { getTemplate } from './templates'
import {
  sendTextMessage as domainSendTextMessage,
  sendMediaMessage as domainSendMediaMessage,
  sendTemplateMessage as domainSendTemplateMessage,
} from '@/lib/domain/messages'
import type { DomainContext } from '@/lib/domain/types'
import type {
  Message,
  ActionResult,
} from '@/lib/whatsapp/types'

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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Get conversation with 24h window info
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, phone, phone_number_id, last_customer_message_at, status')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .single()

  if (convError || !conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  // Check 24h window
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
  const result = await domainSendTextMessage(ctx, {
    conversationId,
    contactPhone: conversation.phone,
    messageBody: text,
    apiKey,
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Get conversation with 24h window info
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, phone, phone_number_id, last_customer_message_at, status')
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)
    .single()

  if (convError || !conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  // Check 24h window
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

  // Determine media type from MIME type
  let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document'
  if (mimeType.startsWith('image/')) {
    mediaType = 'image'
  } else if (mimeType.startsWith('video/')) {
    mediaType = 'video'
  } else if (mimeType.startsWith('audio/')) {
    mediaType = 'audio'
  }

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

  try {
    // Upload to Supabase Storage (adapter concern — stays in server action)
    const adminClient = createAdminClient()
    const buffer = Buffer.from(fileData, 'base64')
    const filePath = `${workspaceId}/${conversationId}/${Date.now()}-${fileName}`

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
      contactPhone: conversation.phone,
      mediaUrl,
      mediaType,
      caption,
      filename: mediaType === 'document' ? fileName : undefined,
      apiKey,
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

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

  try {
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

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
      type: 'text'
      text: string
    }>
  }> = []

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

  // Same for header if it has variables
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
