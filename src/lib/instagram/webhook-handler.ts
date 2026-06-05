// ============================================================================
// Instagram Direct — Inbound Webhook Handler (Phase 41, IG-01/03/04)
//
// Clone of `processMessengerWebhook` (src/lib/messenger/webhook-handler.ts)
// adapted for the Graph `object==='instagram'` event shape, with the same two
// deliberate OMISSIONS as the Messenger handler:
//   - NO fuzzy phone/email contact match (D-IG-05) — contact is resolved
//     strictly by the (ig_account_id, IGSID) identity via `resolveOrCreateContact`
//     keyed on the `ig-${IGSID}` identifier; never a real phone/email search.
//   - NO Inngest agent dispatch and NO v4 interruption lock (D-IG-01 — human-only
//     inbox; V1 has no dormant agent path for meta_direct IG). The handler only
//     stores the inbound message (realtime + inbox via domain receiveMessage).
//
// IGSID stays a STRING end-to-end (Pitfall 3 — an IGSID can exceed
// Number.MAX_SAFE_INTEGER; never Number-coerce it).
//
// The ONLY divergence vs the FB handler is the SIMPLER display-name edge:
// getInstagramUserName(token, igsid) hits the DIRECT edge
// GET /{IGSID}?fields=name,username (NO pageId arg — vs FB's conversations-edge).
//
// All mutations go through the domain layer (Regla 3): findOrCreateConversation,
// resolveOrCreateContact, linkContactToConversation, receiveMessage.
// ============================================================================

import {
  findOrCreateConversation as domainFindOrCreateConversation,
  linkContactToConversation as domainLinkContactToConversation,
} from '@/lib/domain/conversations'
import {
  resolveOrCreateContact as domainResolveOrCreateContact,
  healPlaceholderContactName as domainHealPlaceholderContactName,
} from '@/lib/domain/contacts'
import { receiveMessage as domainReceiveMessage } from '@/lib/domain/messages'
import { getInstagramUserName } from '@/lib/meta/instagram-api'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// Types
// ============================================================================

/**
 * A single `entry.messaging[]` item from a Graph `object==='instagram'` webhook.
 *   - `sender.id`    = IGSID (the customer — outbound recipient)
 *   - `recipient.id` = IGID (your Instagram Professional account)
 *   - `message.mid`  = dedup key, `message.text` = body
 */
export interface InstagramMessagingEvent {
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
 * Process a single inbound Instagram messaging event.
 *
 * @param ev           - one `entry.messaging[]` item (sender = IGSID, recipient = IGID).
 * @param workspaceId  - resolved from ig_account_id by the route (never payload-supplied).
 * @param igAccountId  - the receiving Instagram account ID (entry.id = IGID).
 * @param accessToken  - optional Page Access Token (the route passes `creds.accessToken`)
 *                       used best-effort for the display-name profile fetch.
 */
export async function processInstagramWebhook(
  ev: InstagramMessagingEvent,
  workspaceId: string,
  igAccountId: string,
  accessToken?: string
): Promise<{ stored: boolean }> {
  const ctx: DomainContext = { workspaceId, source: 'webhook' }

  // IGSID — kept as a STRING verbatim (Pitfall 3; never Number-coerced).
  const igsid = String(ev.sender?.id ?? '')
  if (!igsid) {
    console.warn('[instagram-webhook] missing sender IGSID, drop')
    return { stored: false }
  }

  // Instagram-distinct identifier prefix (D-IG-05 identity).
  const phoneIdentifier = `ig-${igsid}`

  // Display name — best-effort. Falls back to `IG-${igsid}` on failure or missing
  // name. `nameResolved` distinguishes a REAL name from the placeholder so we never
  // overwrite a good name with `IG-${igsid}` on a later first-message-race retry.
  // IG uses the SIMPLER DIRECT edge getInstagramUserName(token, igsid) — NO pageId
  // arg (unlike FB's conversations-edge workaround).
  let profileName = `IG-${igsid}`
  let nameResolved = false
  try {
    const name = await getInstagramUserName(accessToken ?? '', igsid)
    if (name) {
      profileName = name.trim()
      nameResolved = true
    }
  } catch {
    // keep the IG-${igsid} fallback
  }

  // Media attachment — image / audio / video / file. Meta's IG attachment `type`
  // is one of image|audio|video|file; map it to our Message['type'] union.
  const ATTACHMENT_TYPE_MAP: Record<string, 'image' | 'audio' | 'video' | 'document'> = {
    image: 'image',
    audio: 'audio',
    video: 'video',
    file: 'document',
  }
  const attachment = ev.message?.attachments?.[0]
  const mediaKind = attachment?.type ? ATTACHMENT_TYPE_MAP[attachment.type] : undefined
  const mediaUrl = attachment?.payload?.url
  const isMedia = !!mediaKind && !!mediaUrl
  const messageText = ev.message?.text ?? ''
  const messageType = isMedia ? mediaKind! : 'text'
  // Media content must match MediaContent (whatsapp/types.ts) so the inbox bubble
  // renders it: it reads `media_url || content.link` (NOT a nested `image.url`).
  const contentJson: Record<string, unknown> = isMedia
    ? { link: mediaUrl, caption: messageText }
    : { body: messageText }

  try {
    // 1. Find or create the conversation (channel='instagram', IGSID identity).
    //    Only pass profileName when a REAL name resolved — otherwise undefined, so a
    //    first-message-race fallback never overwrites a previously-healed good name
    //    back to `IG-${igsid}` (findOrCreateConversation updates profile_name on change).
    const convResult = await domainFindOrCreateConversation(ctx, {
      phone: phoneIdentifier,
      channel: 'instagram',
      profileName: nameResolved ? profileName : undefined,
      externalSubscriberId: igsid,
    })

    if (!convResult.success || !convResult.data) {
      console.error('[instagram-webhook] Failed to find/create conversation:', convResult.error)
      return { stored: false }
    }

    const conversationId = convResult.data.conversationId

    // 2. Resolve-or-create the contact STRICTLY by the (ig_account_id, IGSID) identity
    //    (D-IG-05 — no fuzzy phone/email match). The `ig-${igsid}` identifier is the
    //    account-scoped identity; resolveOrCreateContact matches it exactly or creates.
    let contactId: string | null = null
    const contactResult = await domainResolveOrCreateContact(ctx, {
      name: profileName,
      phone: phoneIdentifier,
    })
    if (contactResult.success && contactResult.data) {
      contactId = contactResult.data.contactId
      // Link the resolved contact to the conversation.
      await domainLinkContactToConversation(ctx, { conversationId, contactId })
      // Self-heal the first-message-race placeholder: resolveOrCreateContact does NOT
      // update an existing contact's name, so a contact created as `IG-${igsid}` (name
      // edge not yet indexed on the first DM) stays stuck. When a REAL name is now
      // available, overwrite ONLY if the stored name is still the `IG-` placeholder
      // (the domain guard never clobbers a real/operator-edited name). Idempotent.
      if (nameResolved) {
        await domainHealPlaceholderContactName(ctx, {
          contactId,
          realName: profileName,
          placeholderPrefix: 'IG-',
        })
      }
    }

    // 3. Store the message via domain (idempotent on `mid` — IG-01 dedup).
    const messageTimestamp = ev.timestamp
      ? new Date(ev.timestamp).toISOString()
      : new Date().toISOString()
    const waMessageId = ev.message?.mid || `ig-${igsid}-${Date.now()}`

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
      console.error('[instagram-webhook] Domain receiveMessage failed:', domainResult.error)
      return { stored: false }
    }

    // D-IG-01: human-only inbox — NO Inngest agent dispatch, NO v4 lock.
    console.log(`[instagram-webhook] Processed instagram message from IGSID ${igsid} account ${igAccountId}`)
    return { stored: true }
  } catch (error) {
    console.error('[instagram-webhook] Error processing message:', error)
    return { stored: false }
  }
}
