// ============================================================================
// Phase 7: WhatsApp Webhook Handler
// Process incoming messages and status updates from 360dialog
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/utils/phone'
import { normalizeWebsiteGreeting } from '@/lib/agents/somnio/normalizers'
import { recordMessageCost } from '@/app/actions/usage'
import { downloadMedia } from './api'
import { receiveMessage as domainReceiveMessage } from '@/lib/domain/messages'
import {
  findOrCreateConversation as domainFindOrCreateConversation,
  linkContactToConversation as domainLinkContactToConversation,
} from '@/lib/domain/conversations'
import type { DomainContext } from '@/lib/domain/types'
import type {
  WebhookPayload,
  WebhookValue,
  IncomingMessage,
  IncomingStatus,
  WebhookContact,
  MessageContent,
  TextContent,
  MediaContent,
  LocationContent,
  ContactsContent,
  ReactionContent,
} from './types'

type CostCategory = 'marketing' | 'utility' | 'authentication' | 'service'

// ============================================================================
// MAIN WEBHOOK PROCESSOR
// ============================================================================

/**
 * Process a webhook payload from 360dialog.
 * This should be called asynchronously after returning 200 to the webhook.
 *
 * @param payload - The webhook payload
 * @param workspaceId - The workspace ID for this phone number
 * @param phoneNumberId - The 360dialog phone number ID
 */
export async function processWebhook(
  payload: WebhookPayload,
  workspaceId: string,
  phoneNumberId: string
): Promise<void> {
  // Process each entry
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { value } = change

      // Verify this is for our phone number
      if (value.metadata.phone_number_id !== phoneNumberId) {
        console.warn(
          `Webhook for different phone: ${value.metadata.phone_number_id}`
        )
        continue
      }

      // Process incoming messages
      if (value.messages && value.messages.length > 0) {
        for (const msg of value.messages) {
          await processIncomingMessage(
            msg,
            value,
            workspaceId,
            phoneNumberId
          )
        }
      }

      // Process status updates
      if (value.statuses && value.statuses.length > 0) {
        for (const status of value.statuses) {
          await processStatusUpdate(status, workspaceId)
        }
      }
    }
  }
}

// ============================================================================
// INCOMING MESSAGE PROCESSOR
// ============================================================================

/**
 * Process a single incoming message.
 * - Find or create conversation
 * - Link to contact if phone matches
 * - Insert message with deduplication
 */
async function processIncomingMessage(
  msg: IncomingMessage,
  webhookValue: WebhookValue,
  workspaceId: string,
  phoneNumberId: string
): Promise<void> {
  const supabase = createAdminClient()

  // Normalize phone to E.164 (should already be, but ensure)
  // WhatsApp provides phones in E.164 format, so normalizePhone should always succeed.
  // Fall back to raw phone with + prefix if normalization fails.
  const phone = normalizePhone(msg.from) ?? `+${msg.from.replace(/[^\d]/g, '')}`

  // Get contact name from webhook if available
  const contactInfo = webhookValue.contacts?.[0]
  const profileName = contactInfo?.profile.name

  try {
    // Find or create conversation via domain
    const ctx: DomainContext = { workspaceId, source: 'webhook' }
    const convResult = await domainFindOrCreateConversation(ctx, {
      phone,
      whatsappAccountId: phoneNumberId,
      profileName,
    })

    if (!convResult.success || !convResult.data) {
      throw new Error(convResult.error || 'Failed to find or create conversation')
    }

    const conversationId = convResult.data.conversationId

    // Try to link to existing contact by phone
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('phone', phone)
      .single()

    if (contact) {
      // Check if already linked
      const { data: conv } = await supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', conversationId)
        .single()

      if (!conv?.contact_id) {
        await domainLinkContactToConversation(ctx, {
          conversationId,
          contactId: contact.id,
        })
      }
    }

    // Build message content based on type
    const content = buildMessageContent(msg)
    const messageTimestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString()

    // Download and re-host media if this is a media message
    let mediaUrl: string | undefined
    let mediaMimeType: string | undefined
    let mediaFilename: string | undefined

    if (MEDIA_TYPES.has(msg.type)) {
      const mediaContent = content as MediaContent
      if (mediaContent.mediaId) {
        // Resolve API key for this workspace
        const { data: ws } = await supabase
          .from('workspaces')
          .select('settings')
          .eq('id', workspaceId)
          .single()
        const apiKey = (ws?.settings as Record<string, unknown>)?.whatsapp_api_key as string | undefined || process.env.WHATSAPP_API_KEY

        if (apiKey) {
          const uploaded = await downloadAndUploadMedia(
            apiKey,
            mediaContent.mediaId,
            workspaceId,
            conversationId,
            mediaContent.mimeType
          )
          if (uploaded) {
            mediaUrl = uploaded.url
            mediaMimeType = uploaded.mimeType
            mediaFilename = uploaded.filename || mediaContent.filename
          }
        } else {
          console.warn('[webhook] No API key found for media download, workspace:', workspaceId)
        }
      }
    }

    // Get contact_id for domain context
    const { data: convForContact } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single()

    const contactId = convForContact?.contact_id ?? null

    // Delegate message storage + trigger emission to domain
    const domainResult = await domainReceiveMessage(ctx, {
      conversationId,
      contactId,
      phone,
      messageContent: msg.text?.body ?? buildMessagePreview(msg),
      messageType: msg.type,
      waMessageId: msg.id,
      contentJson: content as unknown as Record<string, unknown>,
      timestamp: messageTimestamp,
      contactName: profileName,
      mediaUrl,
      mediaMimeType,
      mediaFilename,
    })

    // If domain returned a duplicate, stop processing
    if (domainResult.success && domainResult.data?.messageId === '') {
      // Duplicate message — domain handled dedup, skip agent routing
      return
    }

    if (!domainResult.success) {
      console.error('Error processing message via domain:', domainResult.error)
      throw new Error(domainResult.error || 'Domain receiveMessage failed')
    }

    // ================================================================
    // Agent routing (Phase 16): Process text messages through agent
    // Calls webhook-processor directly (inline, no Inngest dependency).
    // Non-blocking: agent failures must not break message reception.
    // ================================================================
    if (msg.type === 'text') {
      try {
        // Get contact_id from conversation (may be null for new conversations)
        const { data: convData } = await supabase
          .from('conversations')
          .select('contact_id')
          .eq('id', conversationId)
          .single()

        const { processMessageWithAgent } = await import(
          '@/lib/agents/production/webhook-processor'
        )
        const agentResult = await processMessageWithAgent({
          conversationId,
          contactId: convData?.contact_id ?? null,
          messageContent: normalizeWebsiteGreeting(msg.text?.body ?? ''),
          workspaceId,
          phone,
        })

        // If agent failed, write error to conversation so we can diagnose
        if (!agentResult.success && agentResult.error) {
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            workspace_id: workspaceId,
            direction: 'outbound',
            type: 'text',
            content: { body: `[ERROR AGENTE] ${agentResult.error.code}: ${agentResult.error.message?.substring(0, 500)}` },
            timestamp: new Date().toISOString(),
          })
        }
      } catch (agentError) {
        // Non-blocking: log but never fail message processing
        const errMsg = agentError instanceof Error ? agentError.message : String(agentError)
        console.error('Agent processing failed (non-blocking):', errMsg)
        try {
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            workspace_id: workspaceId,
            direction: 'outbound',
            type: 'text',
            content: { body: `[ERROR AGENTE] Exception: ${errMsg.substring(0, 500)}` },
            timestamp: new Date().toISOString(),
          })
        } catch { /* ignore */ }
      }
    }

    console.log(`Processed inbound message ${msg.id} from ${phone}`)
  } catch (error) {
    console.error('Error processing incoming message:', error)
    throw error
  }
}

// ============================================================================
// STATUS UPDATE PROCESSOR
// ============================================================================

/**
 * Process a message status update.
 * Updates the status of an outbound message and records cost if billable.
 */
async function processStatusUpdate(
  status: IncomingStatus,
  workspaceId: string
): Promise<void> {
  const supabase = createAdminClient()

  try {
    // Map 360dialog status to our status
    const mappedStatus = status.status as 'sent' | 'delivered' | 'read' | 'failed'

    // Build update object
    const updates: Record<string, unknown> = {
      status: mappedStatus,
      status_timestamp: new Date(parseInt(status.timestamp) * 1000).toISOString(),
    }

    // Add error info if failed
    if (mappedStatus === 'failed' && status.errors && status.errors.length > 0) {
      const error = status.errors[0]
      updates.error_code = String(error.code)
      updates.error_message = error.message
    }

    // Update message by wamid
    const { error } = await supabase
      .from('messages')
      .update(updates)
      .eq('wamid', status.id)

    if (error) {
      console.error('Error updating message status:', error)
      throw error
    }

    console.log(`Updated status for message ${status.id}: ${mappedStatus}`)

    // Record cost if billable (only on 'sent' status to avoid duplicates)
    if (status.pricing?.billable && mappedStatus === 'sent') {
      // Extract country code from phone (e.g., +57 for Colombia)
      const countryCode = status.recipient_id?.match(/^\+?(\d{1,3})/)?.[1]
      const countryMap: Record<string, string> = {
        '57': 'CO',
        '1': 'US',
        '52': 'MX',
        '54': 'AR',
        '55': 'BR',
        '56': 'CL',
        '51': 'PE',
        '593': 'EC',
        '58': 'VE',
      }
      const recipientCountry = countryMap[countryCode || ''] || null

      // Map the category from webhook to our CostCategory type
      const category = (status.pricing.category?.toLowerCase() || 'service') as CostCategory

      await recordMessageCost({
        workspaceId,
        wamid: status.id,
        category,
        recipientCountry,
      })

      console.log(`Recorded cost for message ${status.id}: ${category}`)
    }
  } catch (error) {
    console.error('Error processing status update:', error)
    throw error
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// findOrCreateConversation and linkConversationToContact
// are now handled by domain/conversations.ts

// ============================================================================
// MEDIA DOWNLOAD + UPLOAD
// ============================================================================

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker'])

/**
 * Download media from 360dialog and re-host on Supabase Storage.
 * Returns null if download fails (caller should save message without media).
 */
async function downloadAndUploadMedia(
  apiKey: string,
  mediaId: string,
  workspaceId: string,
  conversationId: string,
  mimeType?: string
): Promise<{ url: string; mimeType: string; filename?: string } | null> {
  console.log('[webhook] Attempting media download:', { mediaId, workspaceId, hasApiKey: !!apiKey })
  try {
    const media = await downloadMedia(apiKey, mediaId)
    console.log('[webhook] Media downloaded:', { mimeType: media.mimeType, size: media.buffer.byteLength, hasFilename: !!media.filename })

    // Build storage path: inbound/{workspaceId}/{conversationId}/{timestamp}_{sanitized_filename_or_mediaId}
    const ext = getExtensionFromMime(media.mimeType || mimeType || 'application/octet-stream')
    const safeName = media.filename
      ? media.filename.replace(/[^a-zA-Z0-9.-]/g, '_')
      : `${mediaId}${ext}`
    const filePath = `inbound/${workspaceId}/${conversationId}/${Date.now()}_${safeName}`

    const supabase = createAdminClient()
    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, Buffer.from(media.buffer), {
        contentType: media.mimeType || mimeType || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      console.error('[webhook] Media upload failed:', { step: 'upload', error: uploadError.message, filePath })
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(filePath)

    console.log('[webhook] Media uploaded:', { filePath, publicUrl })

    return {
      url: publicUrl,
      mimeType: media.mimeType || mimeType || 'application/octet-stream',
      filename: media.filename || undefined,
    }
  } catch (error) {
    console.error('[webhook] Media step failed:', { step: 'download', error: error instanceof Error ? error.message : error, mediaId })
    return null
  }
}

/**
 * Map MIME type to file extension.
 */
function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'audio/aac': '.aac',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/amr': '.amr',
    'audio/opus': '.opus',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'text/plain': '.txt',
  }
  return map[mimeType] || ''
}

/**
 * Build message content JSONB from incoming message.
 */
function buildMessageContent(msg: IncomingMessage): MessageContent {
  switch (msg.type) {
    case 'text':
      return { body: msg.text?.body || '' } as TextContent

    case 'image':
      return {
        mediaId: msg.image?.id,
        caption: msg.image?.caption,
        mimeType: msg.image?.mime_type,
      } as MediaContent

    case 'video':
      return {
        mediaId: msg.video?.id,
        caption: msg.video?.caption,
        mimeType: msg.video?.mime_type,
      } as MediaContent

    case 'audio':
      return {
        mediaId: msg.audio?.id,
        mimeType: msg.audio?.mime_type,
      } as MediaContent

    case 'document':
      return {
        mediaId: msg.document?.id,
        caption: msg.document?.caption,
        filename: msg.document?.filename,
        mimeType: msg.document?.mime_type,
      } as MediaContent

    case 'sticker':
      return {
        mediaId: msg.sticker?.id,
        mimeType: msg.sticker?.mime_type,
      } as MediaContent

    case 'location':
      return {
        latitude: msg.location?.latitude || 0,
        longitude: msg.location?.longitude || 0,
        name: msg.location?.name,
        address: msg.location?.address,
      } as LocationContent

    case 'contacts':
      return {
        contacts: msg.contacts || [],
      } as ContactsContent

    case 'reaction':
      return {
        message_id: msg.reaction?.message_id || '',
        emoji: msg.reaction?.emoji || '',
      } as ReactionContent

    case 'interactive':
      // Handle button/list replies
      if (msg.interactive?.type === 'button_reply') {
        return {
          body: msg.interactive.button_reply?.title || '',
        } as TextContent
      }
      if (msg.interactive?.type === 'list_reply') {
        return {
          body: msg.interactive.list_reply?.title || '',
        } as TextContent
      }
      return { body: '[Interactive]' } as TextContent

    default:
      return { body: `[${msg.type}]` } as TextContent
  }
}

/**
 * Build message preview text for conversation list display.
 */
function buildMessagePreview(msg: IncomingMessage): string {
  switch (msg.type) {
    case 'text':
      return (msg.text?.body || '').slice(0, 100)
    case 'image':
      return msg.image?.caption ? msg.image.caption.slice(0, 100) : '[Imagen]'
    case 'video':
      return msg.video?.caption ? msg.video.caption.slice(0, 100) : '[Video]'
    case 'audio':
      return '[Audio]'
    case 'document':
      return msg.document?.caption ? msg.document.caption.slice(0, 100) : '[Documento]'
    case 'sticker':
      return '[Sticker]'
    case 'location':
      return '[Ubicacion]'
    case 'contacts':
      return '[Contacto]'
    case 'reaction':
      return '[Reaccion]'
    case 'interactive':
      if (msg.interactive?.type === 'button_reply') {
        return msg.interactive.button_reply?.title || '[Respuesta]'
      }
      if (msg.interactive?.type === 'list_reply') {
        return msg.interactive.list_reply?.title || '[Respuesta]'
      }
      return '[Interactivo]'
    default:
      return '[Mensaje]'
  }
}

