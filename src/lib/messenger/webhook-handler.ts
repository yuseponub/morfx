// ============================================================================
// Facebook Messenger Direct — Inbound Webhook Handler (Phase 40, FB-01/03/04)
//
// Clone of `processManyChatWebhook` (src/lib/manychat/webhook-handler.ts:65-141)
// adapted for the Graph `object==='page'` event shape, with two deliberate
// OMISSIONS vs the ManyChat handler:
//   - NO fuzzy phone/email contact match (D-04/D-05) — contact is resolved
//     strictly by the (page_id, PSID) identity via `resolveOrCreateContact`
//     keyed on the `fb-${PSID}` identifier; never a real phone/email search.
//   - NO Inngest agent dispatch and NO v4 interruption lock (D-12 — human-only
//     inbox; RESEARCH Open Q2 → no dormant agent path for V1). The handler only
//     stores the inbound message (realtime + inbox via domain receiveMessage).
//
// PSID stays a STRING end-to-end (Pitfall 5 — a PSID can exceed
// Number.MAX_SAFE_INTEGER; never Number-coerce it).
//
// All mutations go through the domain layer (Regla 3): findOrCreateConversation,
// resolveOrCreateContact, linkContactToConversation, receiveMessage.
// ============================================================================

import {
  findOrCreateConversation as domainFindOrCreateConversation,
  linkContactToConversation as domainLinkContactToConversation,
} from '@/lib/domain/conversations'
import { resolveOrCreateContact as domainResolveOrCreateContact } from '@/lib/domain/contacts'
import { receiveMessage as domainReceiveMessage } from '@/lib/domain/messages'
import { getMessengerUserName } from '@/lib/meta/messenger-api'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// Types
// ============================================================================

/**
 * A single `entry.messaging[]` item from a Graph `object==='page'` webhook.
 *   - `sender.id`    = PSID (the customer — outbound recipient)
 *   - `recipient.id` = pageId (your page)
 *   - `message.mid`  = dedup key, `message.text` = body
 */
export interface MessengerMessagingEvent {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    attachments?: Array<{ type?: string; payload?: { url?: string } }>
  }
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Process a single inbound Messenger messaging event.
 *
 * @param ev          - one `entry.messaging[]` item (sender = PSID, recipient = page).
 * @param workspaceId - resolved from page_id by the route (never payload-supplied).
 * @param pageId      - the receiving Page ID (entry.id).
 * @param accessToken - optional Page Access Token (the route passes `creds.accessToken`)
 *                      used best-effort for the display-name/avatar profile fetch.
 */
export async function processMessengerWebhook(
  ev: MessengerMessagingEvent,
  workspaceId: string,
  pageId: string,
  accessToken?: string
): Promise<{ stored: boolean }> {
  const ctx: DomainContext = { workspaceId, source: 'webhook' }

  // PSID — kept as a STRING verbatim (Pitfall 5; never Number-coerced).
  const psid = String(ev.sender?.id ?? '')
  if (!psid) {
    console.warn('[messenger-webhook] missing sender PSID, drop')
    return { stored: false }
  }

  // Messenger-distinct identifier prefix (NOT manychat's `mc-`).
  const phoneIdentifier = `fb-${psid}`

  // Display name / avatar — best-effort (D-04). Falls back to `FB-${psid}` on
  // failure or missing name. getMessengerUserProfile already swallows errors.
  let profileName = `FB-${psid}`
  try {
    // 40-08: resolve the display name via the conversations edge (the direct
    // user-profile API fails 100/33 without pages_read_engagement in the token).
    const name = await getMessengerUserName(accessToken ?? '', pageId, psid)
    if (name) profileName = name.trim()
  } catch {
    // keep the FB-${psid} fallback
  }

  // Image attachment (V1: text + image inbound only).
  const attachment = ev.message?.attachments?.[0]
  const isImage = attachment?.type === 'image' && !!attachment.payload?.url
  const messageText = ev.message?.text ?? ''
  const messageType = isImage ? 'image' : 'text'
  const contentJson: Record<string, unknown> = isImage
    ? { body: messageText, image: { url: attachment!.payload!.url } }
    : { body: messageText }

  try {
    // 1. Find or create the conversation (channel='facebook', PSID identity).
    const convResult = await domainFindOrCreateConversation(ctx, {
      phone: phoneIdentifier,
      channel: 'facebook',
      profileName,
      externalSubscriberId: psid,
    })

    if (!convResult.success || !convResult.data) {
      console.error('[messenger-webhook] Failed to find/create conversation:', convResult.error)
      return { stored: false }
    }

    const conversationId = convResult.data.conversationId

    // 2. Resolve-or-create the contact STRICTLY by the (page_id, PSID) identity
    //    (D-04 — no fuzzy phone/email match). The `fb-${psid}` identifier is the
    //    page-scoped identity; resolveOrCreateContact matches it exactly or creates.
    let contactId: string | null = null
    const contactResult = await domainResolveOrCreateContact(ctx, {
      name: profileName,
      phone: phoneIdentifier,
    })
    if (contactResult.success && contactResult.data) {
      contactId = contactResult.data.contactId
      // Link the resolved contact to the conversation (mirror manychat 119-123).
      await domainLinkContactToConversation(ctx, { conversationId, contactId })
    }

    // 3. Store the message via domain (idempotent on `mid` — FB-01 dedup).
    const messageTimestamp = ev.timestamp
      ? new Date(ev.timestamp).toISOString()
      : new Date().toISOString()
    const waMessageId = ev.message?.mid || `fb-${psid}-${Date.now()}`

    const domainResult = await domainReceiveMessage(ctx, {
      conversationId,
      contactId,
      phone: phoneIdentifier,
      messageContent: messageText,
      messageType,
      waMessageId,
      contentJson,
      timestamp: messageTimestamp,
      contactName: profileName,
    })

    // Duplicate (idempotent dedup on mid) → stored:false but not an error.
    if (domainResult.success && domainResult.data?.messageId === '') {
      return { stored: false }
    }

    if (!domainResult.success) {
      console.error('[messenger-webhook] Domain receiveMessage failed:', domainResult.error)
      return { stored: false }
    }

    // D-12: human-only inbox — NO Inngest agent dispatch, NO v4 lock.
    console.log(`[messenger-webhook] Processed facebook message from PSID ${psid} page ${pageId}`)
    return { stored: true }
  } catch (error) {
    console.error('[messenger-webhook] Error processing message:', error)
    return { stored: false }
  }
}
