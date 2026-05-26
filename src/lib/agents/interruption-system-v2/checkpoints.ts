/**
 * Single-source-of-truth checkpoint helper called at all 8 D-18 placements in
 * the v4 pipeline. Combines (a) D-15 fencing-token check (is the lock still
 * mine?) with (b) D-17 interrupt detection (did a follower write the interrupt
 * key while I was working?) in one Redis round-trip pair.
 *
 * Source: RESEARCH.md Pattern 3 (lines 402-460) verbatim — extended with
 * fail-open wrapper per Open Question 5 (transient Upstash errors at a
 * checkpoint must NOT crash the pipeline; we accept the residual double-
 * response risk and emit 'redis_unavailable_fallback_failed' for visibility).
 *
 * The 8 CheckpointId values are locked by D-18 (DISCUSSION-LOG.md lines
 * 138-159). Removing or renaming any entry is a breaking change to the
 * observability contract and the Plan 04/05 integration sites — coordinate
 * via standalone phase if a 9th checkpoint is needed.
 *
 * Path coverage matrix (RESEARCH lines 875-886):
 *   Conventional (no sub-loop) → CKPT-0, 1, 2, 6, 7.N
 *   Sub-loop RAG               → CKPT-0..7.N (all 8)
 *   Sub-loop legacy            → CKPT-0, 1, 2, 3+4+5 combined, 6, 7.N
 *   Guard-blocked R0/R1        → CKPT-0, 1 only (early return)
 *
 * Total per turn: 5-7 (conventional) or 8-10 (sub-loop). Each is ~10-20ms (2
 * Redis round-trips — GET lock + GET interrupt; LLEN only on interrupt branch).
 */

import { assertHoldsLock, type LockHandle } from './lock'
import { emitLockEvent } from './observability'
import { redis } from './redis-client'

/**
 * The 8 D-18 checkpoint identifiers in pipeline execution order.
 *
 * CKPT-7.N (per-template) appends a `.N` suffix at runtime via `opts.templateIndex`
 * — the helper accepts the base id `ckpt_7_pre_template` and the caller passes
 * `templateIndex` separately. The runtime checkpoint_id emitted in the event
 * is `${ckptId}_${templateIndex}` (e.g., `ckpt_7_pre_template_3`).
 */
export type CheckpointId =
  | 'ckpt_0_post_acquire'
  | 'ckpt_1_post_comprehension'
  | 'ckpt_2_post_state_machine'
  | 'ckpt_3_post_tooling'
  | 'ckpt_4_post_generation'
  | 'ckpt_5_post_compliance'
  | 'ckpt_6_pre_send_loop'
  | 'ckpt_7_pre_template'

export type CheckpointChannel = 'whatsapp' | 'facebook' | 'instagram'

/**
 * Outcome of a single checkpoint call.
 *
 * Three terminal shapes (exactly one branch is true per call):
 *   - { proceed: true }                                 → continue pipeline
 *   - { proceed: false, lostLock: true }                → zombie exit (D-15)
 *   - { proceed: false, interrupted: { pendingListLength } } → interrupt seen (D-17)
 *
 * On fail-open (Redis unavailable), we return { proceed: true } — accepting the
 * residual double-response risk per RESEARCH Open Question 5 in exchange for
 * pipeline liveness.
 */
export interface CheckpointResult {
  proceed: boolean
  /** Set when an interrupt key was detected; carries pending list length for telemetry. */
  interrupted?: { interruptMsgId?: string; pendingListLength: number }
  /** Set when the fencing-token check failed (handle.holderUuid no longer in lock value). */
  lostLock?: true
}

/**
 * Optional per-call tuning for the checkpoint helper.
 *
 *   templateIndex   — when set (CKPT-7.N use case), appended to the emitted
 *                     checkpoint_id as `${ckptId}_${templateIndex}` so the
 *                     per-template fanout is visible in observability events.
 *   hasSentAnything — informational only at this layer (Path A vs Path B is
 *                     decided by the caller post-return). Carried through to
 *                     events for downstream filtering.
 */
export interface CheckpointOptions {
  templateIndex?: number
  hasSentAnything?: boolean
}

/**
 * Run a checkpoint: verify lock ownership, then check for interrupt, then
 * decide whether the caller should proceed.
 *
 * Fail-open wrapper: any error thrown by the Redis ops (GET lock, GET interrupt,
 * LLEN pending) emits `redis_unavailable_fallback_failed` and returns
 * `{ proceed: true }`. The pipeline keeps moving; the residual risk is that we
 * miss an interrupt window during the brief outage — accepted per Open Question 5.
 *
 * **Important:** `assertHoldsLock` is wrapped inside the same try/catch so its
 * own internal `redis.get` failure also routes through fail-open. The function
 * NEVER throws under normal operation; the only way to get a thrown error out
 * is a programmer error in the helper itself (e.g., undefined handle), which
 * is intentional — those are bugs we want to see.
 */
export async function checkpoint(
  ckptId: CheckpointId,
  handle: LockHandle,
  workspaceId: string,
  channel: CheckpointChannel,
  identifier: string,
  opts?: CheckpointOptions,
): Promise<CheckpointResult> {
  // Compose the runtime checkpoint_id (CKPT-7.N gets .N suffix per D-18).
  const runtimeCkptId =
    opts?.templateIndex != null ? `${ckptId}_${opts.templateIndex}` : ckptId

  try {
    // 1. Fencing-token check (D-15) — is the lock still ours?
    const holds = await assertHoldsLock(handle)
    if (!holds) {
      emitLockEvent('zombie_lambda_exit', {
        my_uuid: handle.holderUuid,
        at_step: ckptId,
      })
      return { proceed: false, lostLock: true }
    }

    // 2. Interrupt-key check (D-17) — did a follower signal us to abort?
    const interruptKey = `interrupt:${workspaceId}:${channel}:${identifier}`
    const interrupted = await redis.get<string>(interruptKey)
    if (!interrupted) return { proceed: true }

    // 3. Interrupt confirmed — read pending list length for telemetry.
    const pendingKey = `pending:${workspaceId}:${channel}:${identifier}`
    const pendingListLength = await redis.llen(pendingKey)

    emitLockEvent('interrupt_detected_at_ckpt_N', {
      checkpoint_id: runtimeCkptId,
      my_holder_uuid: handle.holderUuid,
      interrupt_msg_id: interrupted,
      has_sent_anything: opts?.hasSentAnything ?? false,
    })

    return {
      proceed: false,
      interrupted: { interruptMsgId: interrupted, pendingListLength },
    }
  } catch (err) {
    // Fail-open per RESEARCH Open Question 5. Accept the double-response risk
    // for the brief Upstash outage window in exchange for pipeline liveness.
    const error_message = err instanceof Error ? err.message : String(err)
    emitLockEvent('redis_unavailable_fallback_failed', {
      error_message,
      at_step: ckptId,
    })
    return { proceed: true }
  }
}
