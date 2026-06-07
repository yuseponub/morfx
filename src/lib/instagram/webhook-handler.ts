// ============================================================================
// Instagram Direct — Inbound Webhook Handler (Phase 41, IG-01/03/04)
//
// Clone of `processMessengerWebhook` (src/lib/messenger/webhook-handler.ts)
// adapted for the Graph `object==='instagram'` event shape, with the same two
// deliberate OMISSIONS as the Messenger handler:
//   - NO fuzzy phone/email contact match (D-IG-05) — contact is resolved
//     strictly by the (ig_account_id, IGSID) identity via `resolveOrCreateContact`
//     keyed on the `ig-${IGSID}` identifier; never a real phone/email search.
//
// Standalone: godentist-fbig-meta-direct-cutover (Plan 02) — THE WIRE (IG).
// The handler now ALWAYS emits `agent/whatsapp.message_received` after a
// successful (non-dedup) store AND the inline audio-transcription block,
// mirroring the FB wire + ManyChat handler. The agent-vs-silence gate is
// DOWNSTREAM (webhook-processor.ts — lifecycle_routing_enabled + the
// router), never here. The handler MUST NOT import or call the router.
// Agentless workspaces emit too, but the router yields null → silence, so
// human-only stays byte-identical (Regla 6, D-01/D-02/D-03). The v4-lock
// block is replicated INERT (v4Path=false for godentist-fb-ig).
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
import { getInstagramUserName } from '@/lib/meta/instagram-api'
import type { DomainContext } from '@/lib/domain/types'
// Standalone: godentist-fbig-meta-direct-cutover (Plan 02) — THE WIRE (IG).
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
    // GAP-41-05: a story reply carries a `reply_to.story` object (no text/attachment).
    reply_to?: { story?: { id?: string; url?: string } }
  }
  // GAP-41-05: a reaction is a TOP-LEVEL event field (not inside `message`).
  reaction?: { reaction?: string; emoji?: string }
}

// ============================================================================
// GAP-41-05 — Non-standard IG type labeling
// ============================================================================

/**
 * Derive a non-empty, human-readable label for IG inbound events that are NEITHER
 * a plain text message NOR a mapped media attachment (image|audio|video|file).
 *
 * Returns:
 *   - a non-empty label string for a recognized non-standard type
 *     (shared post/reel, story mention, story reply, reaction), OR a diagnostic
 *     placeholder for an unknown non-text/non-media subtype — NEVER an empty string;
 *   - `null` when the event IS a plain text or a mapped-media event (those keep
 *     their existing handling in `processInstagramWebhook`).
 *
 * Pure (no I/O, never throws) — the handler uses it to guarantee no IG inbound
 * message is ever stored as an empty bubble (real case Ruth Zapata Duarte).
 */
export function labelInstagramEvent(ev: InstagramMessagingEvent): string | null {
  const att = ev.message?.attachments?.[0]
  const t = att?.type
  // Mapped media + plain text are handled by the existing paths.
  if (ev.message?.text && ev.message.text.length > 0) return null
  if (t === 'image' || t === 'audio' || t === 'video' || t === 'file') return null

  if (t === 'share' || t === 'ig_reel') {
    const url = att?.payload?.url
    return url ? `[Publicación compartida] ${url}` : '[Publicación compartida]'
  }
  if (t === 'story_mention' || ev.message?.reply_to?.story) {
    return '[Respuesta a tu historia]'
  }
  if (ev.reaction) {
    const r = ev.reaction.emoji || ev.reaction.reaction
    return r ? `[Reacción: ${r}]` : '[Reacción]'
  }
  // Recognized-as-non-standard but unknown subtype → diagnostic, never empty.
  return '[Mensaje de Instagram no compatible]'
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

  // GAP-41-05: when the event is NOT text and NOT mapped media, derive a non-empty
  // labeled body (shared post/reel, story reply/mention, reaction, or unknown
  // diagnostic) so we NEVER store an empty bubble.
  let effectiveText = messageText
  let effectiveType: 'image' | 'audio' | 'video' | 'document' | 'text' = isMedia ? mediaKind! : 'text'
  if (!isMedia && (!messageText || messageText.length === 0)) {
    const label = labelInstagramEvent(ev)
    if (label) {
      effectiveText = label
      effectiveType = 'text'
    }
  }
  const messageType = effectiveType
  // Media content must match MediaContent (whatsapp/types.ts) so the inbox bubble
  // renders it: it reads `media_url || content.link` (NOT a nested `image.url`).
  const contentJson: Record<string, unknown> = isMedia
    ? { link: mediaUrl, caption: effectiveText }
    : { body: effectiveText }

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
      messageContent: effectiveText,
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

    // GAP-41-06: transcribe IG inbound audio and persist via the domain (Regla 3).
    // Best-effort + non-blocking-on-failure: an expired/unfetchable lookaside URL
    // simply leaves transcription=null (transcribeAudioFromUrl returns {success:false}).
    // INLINE (no Inngest) per D-IG-01 human-only — the v4 Inngest persist-transcription
    // step is agent-path infra not present here. lookaside.fbsbx.com/ig_messaging_cdn is a
    // public-but-signed CDN link delivered in the (HMAC-verified) webhook payload, fetchable
    // server-side at webhook time (it may expire later — that's why we transcribe immediately).
    if (messageType === 'audio' && mediaUrl) {
      try {
        const { transcribeAudioFromUrl } = await import('@/lib/agents/media/audio-transcriber')
        const { setMessageTranscription } = await import('@/lib/domain/messages')
        const tr = await transcribeAudioFromUrl(mediaUrl, 'audio/mp4')
        if (tr.success) {
          await setMessageTranscription(ctx, { wamid: waMessageId, transcription: tr.text })
        } else {
          console.warn('[instagram-webhook] audio transcription failed:', tr.error)
        }
      } catch (e) {
        console.warn('[instagram-webhook] audio transcription error:', e)
      }
    }

    // ================================================================
    // Standalone: godentist-fbig-meta-direct-cutover (Plan 02) — THE WIRE (IG).
    // Mirrors the FB wire + ManyChat handler. Gate is DOWNSTREAM (never
    // invoke the router here). Agentless workspaces emit too → router→null →
    // silence (human-only preserved — Regla 6, D-01/D-02/D-03).
    // ================================================================
    const supabase = createAdminClient()
    const { data: convForContact } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single()

    const resolvedAgentId = await resolveAgentIdForWorkspace(workspaceId)
    const v4Path = resolvedAgentId === 'somnio-sales-v4'

    const lockChannel: 'facebook' | 'instagram' = 'instagram'
    const lockIdentifier = igsid

    let lockHandle: { key: string; holderUuid: string; startedAt: string } | null = null
    let ownPendingEntryJson: string | null = null

    if (v4Path) {
      try {
        lockHandle = await acquireLock(workspaceId, lockChannel, lockIdentifier)
        const entryUuid = randomUUID()
        const pendingEntry = {
          entry_uuid: entryUuid,
          content: effectiveText,
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
          console.log(`[interruption-v2] follower path — no Inngest dispatch for IG msg ${waMessageId}`)
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

    try {
      const { inngest } = await import('@/inngest/client')
      await (inngest.send as any)({
        name: 'agent/whatsapp.message_received',
        data: {
          conversationId,
          contactId: convForContact?.contact_id ?? null,
          messageContent: effectiveText,
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
      console.error('[instagram-webhook] Inngest send failed:', inngestError instanceof Error ? inngestError.message : inngestError)
    }

    console.log(`[instagram-webhook] Dispatched instagram message from IGSID ${igsid} account ${igAccountId}`)
    return { stored: true }
  } catch (error) {
    console.error('[instagram-webhook] Error processing message:', error)
    return { stored: false }
  }
}
