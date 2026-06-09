// ============================================================================
// Facebook Messenger Direct — Inbound Webhook Handler (Phase 40, FB-01/03/04)
//
// Originally cloned from the legacy FB/IG inbound handler (now decommissioned)
// and adapted for the Graph `object==='page'` event shape, with two deliberate
// OMISSIONS vs that legacy handler:
//   - NO fuzzy phone/email contact match (D-04/D-05) — contact is resolved
//     strictly by the (page_id, PSID) identity via `resolveOrCreateContact`
//     keyed on the `fb-${PSID}` identifier; never a real phone/email search.
//
// Standalone: godentist-fbig-meta-direct-cutover (Plan 02) — THE WIRE.
// The handler now ALWAYS emits `agent/whatsapp.message_received` after a
// successful (non-dedup) store, mirroring the legacy FB/IG dispatch (steps 4+5).
// The agent-vs-silence gate is DOWNSTREAM (webhook-processor.ts —
// lifecycle_routing_enabled + the router), never here. The handler MUST NOT
// import or call the router. Agentless workspaces (Varixcenter) emit too,
// but the router yields null → silence, so human-only stays byte-identical
// (Regla 6, D-01/D-02/D-03). The v4-lock block is replicated INERT
// (v4Path=false for godentist-fb-ig) for event-payload-shape parity.
//
// PSID stays a STRING end-to-end (Pitfall 5 — a PSID can exceed
// Number.MAX_SAFE_INTEGER; never Number-coerce it).
//
// All mutations go through the domain layer (Regla 3): findOrCreateConversation,
// resolveOrCreateContact, linkContactToConversation, receiveMessage.
// ============================================================================

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  findOrCreateConversation as domainFindOrCreateConversation,
  linkContactToConversation as domainLinkContactToConversation,
} from '@/lib/domain/conversations'
import {
  resolveOrCreateContact as domainResolveOrCreateContact,
  healPlaceholderContactName as domainHealPlaceholderContactName,
} from '@/lib/domain/contacts'
import { receiveMessage as domainReceiveMessage } from '@/lib/domain/messages'
import { getMessengerUserName } from '@/lib/meta/messenger-api'
import type { DomainContext } from '@/lib/domain/types'
// Standalone: godentist-fbig-meta-direct-cutover (Plan 02) — THE WIRE.
// All 5 interruption-v2 imports MUST be STATIC (no `await import(...)`,
// REVISION B4). The v4-only gate (resolvedAgentId === 'somnio-sales-v4')
// keeps them completely inert for godentist-fb-ig and any future FB/IG
// agent (Regla 6 — production behavior byte-identical on non-v4 paths).
import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'
import { pushToPending } from '@/lib/agents/interruption-system-v2/pending'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'

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

  // Messenger-distinct identifier prefix (`fb-`, distinct from the WhatsApp keyspace).
  const phoneIdentifier = `fb-${psid}`

  // Display name / avatar — best-effort (D-04). Falls back to `FB-${psid}` on
  // failure or missing name. getMessengerUserName already swallows errors.
  // `nameResolved` distinguishes a REAL name from the placeholder so we never
  // overwrite a good name with `FB-${psid}` on a later first-message-race retry.
  let profileName = `FB-${psid}`
  let nameResolved = false
  try {
    // 40-08: resolve the display name via the conversations edge (the direct
    // user-profile API fails 100/33 without pages_read_engagement in the token).
    const name = await getMessengerUserName(accessToken ?? '', pageId, psid)
    if (name) {
      profileName = name.trim()
      nameResolved = true
    }
  } catch {
    // keep the FB-${psid} fallback
  }

  // Media attachment — image / audio / video / file (40-08 follow-up: was image-only,
  // which left audio/video/doc as an EMPTY text bubble). Meta's Messenger attachment
  // `type` is one of image|audio|video|file; map it to our Message['type'] union.
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
  // 40-08 live: nested `image.url` → bubble showed "Media no disponible".
  const contentJson: Record<string, unknown> = isMedia
    ? { link: mediaUrl, caption: messageText }
    : { body: messageText }

  try {
    // 1. Find or create the conversation (channel='facebook', PSID identity).
    //    Only pass profileName when a REAL name resolved — otherwise undefined, so a
    //    first-message-race fallback never overwrites a previously-healed good name
    //    back to `FB-${psid}` (findOrCreateConversation updates profile_name on change).
    const convResult = await domainFindOrCreateConversation(ctx, {
      phone: phoneIdentifier,
      channel: 'facebook',
      profileName: nameResolved ? profileName : undefined,
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
      // Link the resolved contact to the conversation.
      await domainLinkContactToConversation(ctx, { conversationId, contactId })
      // Self-heal the first-message-race placeholder: resolveOrCreateContact does NOT
      // update an existing contact's name, so a contact created as `FB-${psid}` (name
      // edge not yet indexed on the first DM) stays stuck. When a REAL name is now
      // available, overwrite ONLY if the stored name is still the `FB-` placeholder
      // (the domain guard never clobbers a real/operator-edited name). Idempotent.
      if (nameResolved) {
        await domainHealPlaceholderContactName(ctx, { contactId, realName: profileName })
      }
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

    // ================================================================
    // Standalone: godentist-fbig-meta-direct-cutover (Plan 02) — THE WIRE.
    // Mirror the legacy FB/IG dispatch (steps 4 + 5). The gate is
    // DOWNSTREAM (processMessageWithAgent → lifecycle_routing_enabled →
    // the router). We NEVER invoke the router here. Agentless workspaces
    // (Varixcenter) emit too, but the router yields null → silence
    // (human-only preserved byte-identical — Regla 6, D-01/D-02/D-03).
    // ================================================================
    // 4. Get contact_id from conversation for the agent event.
    const supabase = createAdminClient()
    const { data: convForContact } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single()

    const resolvedAgentId = await resolveAgentIdForWorkspace(workspaceId)
    const v4Path = resolvedAgentId === 'somnio-sales-v4' // inert for godentist-fb-ig

    const lockChannel: 'facebook' | 'instagram' = 'facebook'
    const lockIdentifier = psid

    let lockHandle: { key: string; holderUuid: string; startedAt: string } | null = null
    let ownPendingEntryJson: string | null = null

    if (v4Path) {
      try {
        lockHandle = await acquireLock(workspaceId, lockChannel, lockIdentifier)
        const entryUuid = randomUUID()
        const pendingEntry = {
          entry_uuid: entryUuid,
          content: messageText,
          received_at: new Date().toISOString(),
          msg_id: waMessageId,
        }
        if (!lockHandle) {
          const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
          await redis.set(`interrupt:${workspaceId}:${lockChannel}:${lockIdentifier}`, waMessageId, { ex: 60 })
          emitLockEvent('lock_acquire_failed_follower', {
            existing_holder_uuid: 'unknown', my_msg_id: waMessageId,
            key: `lock:${workspaceId}:${lockChannel}:${lockIdentifier}`,
          })
          emitLockEvent('interrupt_written', { msg_id: waMessageId, pending_list_length: push.pendingListLength })
          console.log(`[interruption-v2] follower path — no Inngest dispatch for FB msg ${waMessageId}`)
          return { stored: true }
        }
        const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
        ownPendingEntryJson = push.exactJson
        emitLockEvent('lock_acquired', {
          holder_uuid: lockHandle.holderUuid, msg_id: waMessageId,
          key: lockHandle.key, ttl: 45, started_at: lockHandle.startedAt,
        })
      } catch (lockErr) {
        emitLockEvent('redis_unavailable_fallback_failed', {
          error_message: lockErr instanceof Error ? lockErr.message : String(lockErr),
        })
        lockHandle = null
        ownPendingEntryJson = null
      }
    }

    // 5. Emit Inngest event for agent processing (reuse the existing event).
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
          messageType,
          mediaUrl: mediaUrl ?? null,
          mediaMimeType: null,
          lockHolderUuid: lockHandle?.holderUuid ?? null,
          lockKey: lockHandle?.key ?? null,
          ownPendingEntryJson,
          lockChannel,
          lockIdentifier,
          agentId: resolvedAgentId,
        },
      })
    } catch (inngestError) {
      console.error('[messenger-webhook] Inngest send failed:', inngestError instanceof Error ? inngestError.message : inngestError)
    }

    console.log(`[messenger-webhook] Dispatched facebook message from PSID ${psid} page ${pageId}`)
    return { stored: true }
  } catch (error) {
    console.error('[messenger-webhook] Error processing message:', error)
    return { stored: false }
  }
}
