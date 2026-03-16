// ============================================================================
// ManyChat Webhook Handler
// Processes incoming messages from ManyChat External Request (FB/IG).
// Mirrors the WhatsApp webhook-handler pattern:
//   1. Find/create conversation (with channel='facebook'|'instagram')
//   2. Link to contact if exists
//   3. Store message via domain receiveMessage()
//   4. Emit Inngest event for agent processing
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import {
  findOrCreateConversation as domainFindOrCreateConversation,
  linkContactToConversation as domainLinkContactToConversation,
} from '@/lib/domain/conversations'
import { receiveMessage as domainReceiveMessage } from '@/lib/domain/messages'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Payload sent by ManyChat External Request.
 * Configured in ManyChat Flow Builder to include these fields.
 */
export interface ManyChatWebhookPayload {
  /** ManyChat subscriber ID (numeric, used as conversation identifier) */
  subscriber_id: string | number
  /** Subscriber display name */
  name?: string
  first_name?: string
  last_name?: string
  /** The message text the subscriber sent */
  message_text?: string
  /** Channel: 'messenger' or 'instagram' (ManyChat terminology) */
  channel?: string
  /** ManyChat's internal message ID for dedup */
  message_id?: string
  /** Profile picture URL */
  profile_pic?: string
  /** Phone number if available in ManyChat custom fields */
  phone?: string
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Process a webhook payload from ManyChat External Request.
 * Called after returning 200 to ManyChat.
 */
export async function processManyChatWebhook(
  payload: ManyChatWebhookPayload,
  workspaceId: string
): Promise<{ stored: boolean }> {
  const supabase = createAdminClient()
  const ctx: DomainContext = { workspaceId, source: 'webhook' }

  const subscriberId = String(payload.subscriber_id)
  const messageText = payload.message_text || ''
  const profileName = payload.name || payload.first_name || `FB-${subscriberId}`

  // Determine channel from ManyChat's channel field
  // ManyChat uses 'messenger' for Facebook and 'instagram' for Instagram
  const channel: 'facebook' | 'instagram' =
    payload.channel === 'instagram' ? 'instagram' : 'facebook'

  // Use subscriber_id as the "phone" identifier for FB/IG conversations
  // This is the unique identifier ManyChat uses for each subscriber
  const phoneIdentifier = `mc-${subscriberId}`

  try {
    // 1. Find or create conversation with channel
    const convResult = await domainFindOrCreateConversation(ctx, {
      phone: phoneIdentifier,
      channel,
      profileName,
      externalSubscriberId: subscriberId,
    })

    if (!convResult.success || !convResult.data) {
      console.error('[manychat-webhook] Failed to find/create conversation:', convResult.error)
      return { stored: false }
    }

    const conversationId = convResult.data.conversationId

    // 2. Try to link to existing contact by name or phone
    // If ManyChat provides a phone via custom fields, try to match
    if (payload.phone) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('phone', payload.phone)
        .single()

      if (contact) {
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
    }

    // 3. Store message via domain
    const messageTimestamp = new Date().toISOString()
    const waMessageId = payload.message_id || `mc-${subscriberId}-${Date.now()}`

    const domainResult = await domainReceiveMessage(ctx, {
      conversationId,
      contactId: null, // Will be resolved by conversation's contact_id
      phone: phoneIdentifier,
      messageContent: messageText,
      messageType: 'text', // ManyChat External Request only sends text for now
      waMessageId,
      contentJson: { body: messageText },
      timestamp: messageTimestamp,
      contactName: profileName,
    })

    // If duplicate, stop
    if (domainResult.success && domainResult.data?.messageId === '') {
      return { stored: false }
    }

    if (!domainResult.success) {
      console.error('[manychat-webhook] Domain receiveMessage failed:', domainResult.error)
      return { stored: false }
    }

    // 4. Get contact_id from conversation for agent event
    const { data: convForContact } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single()

    // 5. Emit Inngest event for agent processing (reuse existing event)
    // The agent doesn't care about channel — the messaging adapter handles routing
    try {
      const { inngest } = await import('@/inngest/client')
      await (inngest.send as any)({
        name: 'agent/whatsapp.message_received',
        data: {
          conversationId,
          contactId: convForContact?.contact_id ?? null,
          messageContent: messageText,
          workspaceId,
          phone: phoneIdentifier,
          messageId: waMessageId,
          messageTimestamp,
          messageType: 'text',
          mediaUrl: null,
          mediaMimeType: null,
        },
      })
    } catch (inngestError) {
      console.error('[manychat-webhook] Inngest send failed:', inngestError instanceof Error ? inngestError.message : inngestError)
      // No inline fallback for ManyChat — Inngest is required
    }

    console.log(`[manychat-webhook] Processed ${channel} message from subscriber ${subscriberId}`)
    return { stored: true }
  } catch (error) {
    console.error('[manychat-webhook] Error processing message:', error)
    return { stored: false }
  }
}
