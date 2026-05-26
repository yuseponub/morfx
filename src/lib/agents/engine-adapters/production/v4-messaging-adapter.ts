/**
 * V4 Messaging Adapter — v4-only subclass of ProductionMessagingAdapter that
 * REPLACES the Phase 31 `hasNewInboundMessage` DB query with the Redis-based
 * `checkpoint('ckpt_7_pre_template', ...)` from interruption-system-v2.
 *
 * Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.2 + D-08 + RESEARCH
 * Open Question 2 option-a).
 *
 * D-08 verdict: eliminate Phase 31 from the v4 path entirely. The Redis lock +
 * checkpoint subsystem provides stricter guarantees than the DB-poll approach
 * (synchronous detection at acquire-time + interrupt key set by followers) and
 * the DB-poll would now be a redundant second mechanism. The lock + pending list
 * also handles cross-lambda race windows that Phase 31 cannot — see
 * 00-MEASUREMENTS.md §Phase 31 race-window for the empirical motivation.
 *
 * Regla 6: parent ProductionMessagingAdapter behavior PRESERVED VERBATIM for all
 * other consumers (v3 / godentist / godentist-fb-ig / somnio-recompra /
 * somnio-pw-confirmation). Only the v4 path consumes this subclass.
 *
 * Fail-open: if lockHandle is null (sandbox / fail-open path from webhook), this
 * adapter falls back to the parent's Phase 31 behavior via `super.shouldAbortBeforeTemplate`
 * — so the v4 path is NEVER worse than the v3 path even when Redis is unavailable
 * (RESEARCH Open Question 5).
 */

import type { ChannelType } from '@/lib/channels/types'
import { ProductionMessagingAdapter } from './messaging'
import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
import { removeOwnEntry } from '@/lib/agents/interruption-system-v2/pending'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import type { LockHandle } from '@/lib/agents/interruption-system-v2/lock'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('v4-messaging-adapter')

/**
 * Thrown when a checkpoint detects that this lambda no longer owns the lock
 * (D-15 fencing token mismatch — either TTL expired and another holder
 * force-acquired, or Upstash failover split-brain).
 *
 * Propagates through V4MessagingAdapter.send() → V4ProductionRunner.processMessage's
 * outer catch — runner emits `zombie_lambda_exit` and returns failure. This is
 * the "zombie defense" mechanism from D-15 + RESEARCH Pitfall 1.
 */
export class LostLockError extends Error {
  constructor(public ckptId: string) {
    super(`[interruption-v2] zombie lambda — lost lock at ${ckptId}`)
    this.name = 'LostLockError'
  }
}

export class V4MessagingAdapter extends ProductionMessagingAdapter {
  constructor(
    sessionManager: unknown,
    conversationId: string,
    workspaceId: string,
    phoneNumber: string | undefined,
    responseSpeed: number,
    private readonly lockHandle: LockHandle | null,
    private readonly ownPendingEntryJson: string | null,
  ) {
    super(sessionManager, conversationId, workspaceId, phoneNumber, responseSpeed)
  }

  /**
   * Override the per-template abort check. Replaces Phase 31 DB query with
   * Redis-based checkpoint at `ckpt_7_pre_template` (D-08 option-a).
   *
   * Three return branches:
   *   - checkpoint.proceed → continue with send (return { abort: false })
   *   - checkpoint.lostLock → THROW LostLockError (caught by runner's outer catch)
   *   - checkpoint.interrupted → return { abort: true, reason: 'ckpt7_interrupted' }
   *
   * Fail-open: if no lockHandle was injected (sandbox / fail-open path), defers
   * to the parent's Phase 31 behavior — never worse than pre-v4 path.
   */
  protected async shouldAbortBeforeTemplate(
    params: { conversationId: string; triggerTimestamp?: string; sentCount: number },
    opts: { templateIndex: number; channel: ChannelType; recipientIdentifier: string }
  ): Promise<{ abort: false } | { abort: true; reason: string }> {
    // Fail-open: no lock infrastructure → defer to Phase 31 parent behavior.
    if (!this.lockHandle) {
      return super.shouldAbortBeforeTemplate(params, opts)
    }

    // CKPT-7.N is only meaningful for WhatsApp/FB/IG channels (interruption-system-v2
    // CheckpointChannel union). If somehow we got a non-{whatsapp,facebook,instagram}
    // channel here (shouldn't happen — adapter is only instantiated for v4 which is
    // WhatsApp-only today), fall back to parent.
    if (opts.channel !== 'whatsapp' && opts.channel !== 'facebook' && opts.channel !== 'instagram') {
      return super.shouldAbortBeforeTemplate(params, opts)
    }

    const ckpt = await checkpoint(
      'ckpt_7_pre_template',
      this.lockHandle,
      this.workspaceId,
      opts.channel,
      opts.recipientIdentifier,
      { templateIndex: opts.templateIndex, hasSentAnything: params.sentCount > 0 }
    )

    if (ckpt.lostLock) {
      throw new LostLockError(`ckpt_7_pre_template_${opts.templateIndex}`)
    }
    if (!ckpt.proceed && ckpt.interrupted) {
      return { abort: true, reason: 'ckpt7_interrupted' }
    }
    return { abort: false }
  }

  /**
   * Override the post-first-send hook (D-16 LREM-self).
   *
   * Two operations:
   *   1. removeOwnEntry — drop the holder's own entry from the pending list so
   *      cascade scenarios (other followers' entries) are correctly resolved.
   *      Uses the EXACT JSON string the webhook pushed (Pitfall 4 byte-exact
   *      LREM — re-serializing the entry would NOT match).
   *   2. Re-write the lock value with has_sent_anything=true (D-15) using the
   *      keepTtl SUPPORTED branch (verified in 00-MEASUREMENTS.md §REVISION W7).
   *      This flag is read by subsequent checkpoints to distinguish Path A
   *      (no sends, combine) vs Path B (≥1 send, solo follower).
   *
   * Skips both operations if lockHandle or ownPendingEntryJson is null
   * (sandbox / fail-open path).
   */
  protected async onFirstSendCompleted(
    opts: { channel: ChannelType; identifier: string }
  ): Promise<void> {
    if (!this.lockHandle || !this.ownPendingEntryJson) return

    // Only proceed for valid interruption-system-v2 channels.
    if (opts.channel !== 'whatsapp' && opts.channel !== 'facebook' && opts.channel !== 'instagram') {
      return
    }

    // D-16: LREM-self after first successful template send.
    try {
      const removed = await removeOwnEntry(
        this.workspaceId,
        opts.channel,
        opts.identifier,
        this.ownPendingEntryJson,
      )
      if (!removed) {
        logger.debug(
          { workspaceId: this.workspaceId, channel: opts.channel, identifier: opts.identifier },
          '[interruption-v2] LREM-self returned 0 (entry already gone — readAndClearPending consumed it)',
        )
      }
    } catch (err) {
      // Fail-open: log + emit observability, but never block the send loop.
      const error_message = err instanceof Error ? err.message : String(err)
      emitLockEvent('redis_unavailable_fallback_failed', {
        error_message,
        at_step: 'lrem_self_after_first_send',
      })
    }

    // D-15: flip has_sent_anything in the lock value. Plan 00 Task 0.5b verdict:
    // keepTtl SUPPORTED on @upstash/redis 1.38.0 — use SDK-direct branch with
    // `as { keepTtl: true }` assertion (SetCommandOptions type does not list
    // keepTtl despite runtime support — see 00-MEASUREMENTS.md §REVISION W7
    // line 201).
    try {
      const newValue = JSON.stringify({
        holder_uuid: this.lockHandle.holderUuid,
        started_at: this.lockHandle.startedAt,
        has_sent_anything: true,
      })
      await redis.set(this.lockHandle.key, newValue, { keepTtl: true } as { keepTtl: true })
    } catch (err) {
      // Fail-open: brief Upstash outage doesn't block send. The heartbeat (5s)
      // will re-renew TTL via assertHoldsLock+expire so even a brief outage
      // here is bounded by HEARTBEAT_MS margins.
      const error_message = err instanceof Error ? err.message : String(err)
      emitLockEvent('redis_unavailable_fallback_failed', {
        error_message,
        at_step: 'set_has_sent_anything',
      })
    }
  }
}
