// ============================================================================
// Phase 7: WhatsApp Webhook Handler
// Process incoming messages and status updates from 360dialog
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { recordMessageCost } from '@/app/actions/usage'
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
  const phone = normalizePhone(msg.from)

  // Get contact name from webhook if available
  const contactInfo = webhookValue.contacts?.[0]
  const profileName = contactInfo?.profile.name

  try {
    // Find or create conversation (pass profile name from WhatsApp)
    const conversationId = await findOrCreateConversation(
      supabase,
      workspaceId,
      phone,
      phoneNumberId,
      profileName
    )

    // Try to link to existing contact by phone
    await linkConversationToContact(supabase, conversationId, workspaceId, phone)

    // Build message content based on type
    const content = buildMessageContent(msg)

    // Insert message (with deduplication via wamid constraint)
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        workspace_id: workspaceId,
        wamid: msg.id,
        direction: 'inbound',
        type: msg.type,
        content,
        timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
      })

    // Handle duplicate message (unique constraint on wamid)
    if (msgError) {
      if (msgError.code === '23505') {
        // Duplicate - already processed, ignore
        console.log(`Duplicate message ignored: ${msg.id}`)
        return
      }
      console.error('Error inserting message:', msgError)
      throw msgError
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

/**
 * Find or create a conversation for a phone number.
 * Updates profile_name if provided (WhatsApp profile name).
 */
async function findOrCreateConversation(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  phone: string,
  phoneNumberId: string,
  profileName?: string
): Promise<string> {
  // Try to find existing conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, profile_name')
    .eq('workspace_id', workspaceId)
    .eq('phone', phone)
    .single()

  if (existing) {
    // Update profile_name if it changed or was empty
    if (profileName && existing.profile_name !== profileName) {
      await supabase
        .from('conversations')
        .update({ profile_name: profileName })
        .eq('id', existing.id)
    }
    return existing.id
  }

  // Create new conversation
  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      phone,
      phone_number_id: phoneNumberId,
      profile_name: profileName,
    })
    .select('id')
    .single()

  if (error) {
    // Handle race condition - conversation was created by another request
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('conversations')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('phone', phone)
        .single()

      if (retry) {
        return retry.id
      }
    }
    throw error
  }

  return created.id
}

/**
 * Try to link a conversation to an existing contact by phone.
 */
async function linkConversationToContact(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  workspaceId: string,
  phone: string
): Promise<void> {
  // Check if already linked
  const { data: conversation } = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('id', conversationId)
    .single()

  if (conversation?.contact_id) {
    return // Already linked
  }

  // Find contact by phone in this workspace
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('phone', phone)
    .single()

  if (!contact) {
    return // No matching contact
  }

  // Link conversation to contact
  await supabase
    .from('conversations')
    .update({ contact_id: contact.id })
    .eq('id', conversationId)
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
 * Normalize phone to E.164 format.
 */
function normalizePhone(phone: string): string {
  // Remove any non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '')

  // Ensure it starts with +
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized
  }

  return normalized
}
