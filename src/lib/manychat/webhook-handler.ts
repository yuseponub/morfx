// ============================================================================
// ManyChat Webhook Handler
// Processes incoming messages from ManyChat External Request (FB/IG).
// Mirrors the WhatsApp webhook-handler pattern:
//   1. Find/create conversation (with channel='facebook'|'instagram')
//   2. Link to contact if exists
//   3. Store message via domain receiveMessage()
//   4. Emit Inngest event for agent processing
// ============================================================================

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  findOrCreateConversation as domainFindOrCreateConversation,
  linkContactToConversation as domainLinkContactToConversation,
} from '@/lib/domain/conversations'
import { receiveMessage as domainReceiveMessage } from '@/lib/domain/messages'
import type { DomainContext } from '@/lib/domain/types'
// Standalone: debounce-interruption-system-v2 (Plan 03, REVISION B4) —
// all 5 imports MUST be STATIC (no `await import(...)`). The v4-only
// gate (resolvedAgentId === 'somnio-sales-v4') ensures these are
// completely inert for godentist-fb-ig and any future FB/IG agents
// (Regla 6 — production behavior byte-identical to pre-Plan-03).
import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'
import { pushToPending } from '@/lib/agents/interruption-system-v2/pending'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'

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

    // ================================================================
    // Standalone: debounce-interruption-system-v2 (Plan 03)
    //
    // v4-gated HOLDER/FOLLOWER lock acquisition for FB/IG (D-10 + D-12).
    //
    // REGLA 6: ALL behavior below is gated on resolvedAgentId ===
    // 'somnio-sales-v4'. v4 currently serves WhatsApp only per
    // 00-MEASUREMENTS.md §v4 dormancy attestation, so for godentist-fb-ig
    // (the only FB/IG agent today) v4Path is false and this block is
    // inert — pre-Plan-03 behavior byte-identical.
    //
    // REVISION W6 — FB/IG dedup gap (messages table lacks UNIQUE on FB/IG
    // message IDs) is accepted forward-looking risk per Plan 00 Task 0.4.
    // v4 does not serve FB/IG today; gap closes whenever v4 onboards
    // FB/IG (separate standalone). Documented in 03-SUMMARY.md.
    //
    // D-10: identifier is `external_subscriber_id` (the raw ManyChat
    // subscriber id), NOT the `mc-` prefixed `phoneIdentifier` we use
    // for conversation lookup. The lock key is per-subscriber so
    // followers from the same subscriber collide on the same lock.
    // ================================================================
    const resolvedAgentId = await resolveAgentIdForWorkspace(workspaceId)
    const v4Path = resolvedAgentId === 'somnio-sales-v4'

    // REVISION W3 + W2: channel + identifier resolved here ONCE; threaded
    // into event.data so Plan 04 runner does NOT need a conversations
    // lookup. Per D-10, identifier is external_subscriber_id verbatim.
    const lockChannel: 'facebook' | 'instagram' = channel
    const lockIdentifier = subscriberId

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
          // FOLLOWER PATH (D-03 second arm + RESEARCH Pattern 2)
          const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
          await redis.set(
            `interrupt:${workspaceId}:${lockChannel}:${lockIdentifier}`,
            waMessageId,
            { ex: 60 },
          )
          emitLockEvent('lock_acquire_failed_follower', {
            existing_holder_uuid: 'unknown',
            my_msg_id: waMessageId,
            key: `lock:${workspaceId}:${lockChannel}:${lockIdentifier}`,
          })
          emitLockEvent('interrupt_written', {
            msg_id: waMessageId,
            pending_list_length: push.pendingListLength,
          })
          console.log(
            `[interruption-v2] follower path — no Inngest dispatch for FB/IG msg ${waMessageId}`,
          )
          return { stored: true } // 200 OK to ManyChat — NO Inngest dispatch
        }

        // HOLDER PATH (D-16 — RPUSH self ALWAYS)
        const push = await pushToPending(workspaceId, lockChannel, lockIdentifier, pendingEntry)
        ownPendingEntryJson = push.exactJson
        emitLockEvent('lock_acquired', {
          holder_uuid: lockHandle.holderUuid,
          msg_id: waMessageId,
          key: lockHandle.key,
          ttl: 45,
          started_at: lockHandle.startedAt,
        })
      } catch (lockErr) {
        // Fail-open per RESEARCH Open Question 5
        emitLockEvent('redis_unavailable_fallback_failed', {
          error_message: lockErr instanceof Error ? lockErr.message : String(lockErr),
        })
        lockHandle = null
        ownPendingEntryJson = null
      }
    }

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
          // Standalone: debounce-interruption-system-v2 (Plan 03)
          // 6 new fields — all optional, all null on non-v4 paths
          // (Regla 6 — pre-v4 Inngest function destructure safe).
          // REVISION W3 + W2: lockChannel/lockIdentifier/agentId
          // threaded so Plan 04 avoids a conversations-table lookup.
          lockHolderUuid: lockHandle?.holderUuid ?? null,
          lockKey: lockHandle?.key ?? null,
          ownPendingEntryJson,
          lockChannel,
          lockIdentifier,
          agentId: resolvedAgentId,
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
