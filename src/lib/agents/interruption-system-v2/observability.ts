/**
 * Typed observability emitter for the interruption-system-v2 lock lifecycle.
 *
 * Source: RESEARCH.md Code Example 5 (lines 729-756) + DISCUSSION-LOG.md D-17
 * (13 base lifecycle labels). REVISION B1 (Plan 06) bumped the union to 14
 * entries by adding `lock_orphan_swept_by_cron` — emitted by the cron sweep,
 * NOT during normal turn-time lifecycle.
 *
 * D-16 (somnio-v4-consolidation): el union pasa de 14 → 11 labels. Se removieron
 * 3 labels fantasma (`follower_woke`, `lock_force_acquired_after_ttl_expiry`,
 * `heartbeat_renewed`) que tenían CERO emisores en código no-test — el tipo debe
 * reflejar la realidad; re-agregarlos en el futuro es barato.
 *
 * Why typed union: passing an arbitrary string to `emitLockEvent` is a
 * compile error. Every label belongs to the D-17 + B1 contract; if a new
 * label is needed, it MUST be added here first so consumers (observability
 * dashboards, sandbox debug-panel tab, alerting) can rely on a stable surface.
 *
 * Dual emission per D-11: every event is recorded to the request's
 * ObservabilityCollector (when present, becomes a `pipeline_decision` row in
 * `agent_observability_events`) AND echoed to `console.log` (for Vercel
 * function logs grep + local sandbox debugging).
 */

import { getCollector } from '@/lib/observability'

/**
 * The 11 lifecycle event labels enforceable at compile time.
 *
 * (14 originales − 3 sin emisor removidos en D-16 somnio-v4-consolidation.)
 *
 * Each comment block above a label documents the expected payload shape per
 * D-17 (DISCUSSION-LOG.md lines 121-137) + REVISION B1 (Plan 06 cron). Keep
 * these in sync if D-17 changes — they are the source of truth for consumers
 * who don't go read the discussion log directly.
 */
export type LockEventLabel =
  /** Payload: { holder_uuid, msg_id, key, ttl, started_at } — SET NX succeeded. */
  | 'lock_acquired'
  /** Payload: { existing_holder_uuid, my_msg_id, key } — follower path. */
  | 'lock_acquire_failed_follower'
  /** Payload: { msg_id, pending_list_length } — follower wrote interrupt + RPUSH. */
  | 'interrupt_written'
  /** Payload: { checkpoint_id, my_holder_uuid, interrupt_msg_id } — holder saw interrupt at a checkpoint. */
  | 'interrupt_detected_at_ckpt_N'
  /** Payload: { combined_msg_count, total_chars } — abort pre-send; next turn = combo. */
  | 'msg_aborted_path_a_combined'
  /** Payload: { templates_sent_before_abort } — abort post-send; next turn = solo. */
  | 'msg_aborted_path_b_solo'
  /** Payload: { holder_uuid, duration_ms, templates_sent } — DEL lock at successful end. */
  | 'lock_released_normal'
  /** Payload: { my_uuid, current_holder_uuid, at_step } — holder_uuid mismatch detected, clean exit. */
  | 'zombie_lambda_exit'
  /** Payload: { entries_count, total_chars } — holder read LRANGE at acquire-time. */
  | 'pending_list_combined'
  /** Payload: { error_message } — Redis unreachable; no fallback per D-08. */
  | 'redis_unavailable_fallback_failed'
  /**
   * REVISION B1 — emitted by Plan 06 cron sweep, NOT turn-time lifecycle.
   * Payload: { lock_key, reason: 'no_active_session'|'stale_age'|'malformed_value', workspaceId, holder_uuid?, age_ms }
   */
  | 'lock_orphan_swept_by_cron'

/**
 * Record a lifecycle event for the lock subsystem.
 *
 * Dual emission (D-11):
 *  1. ObservabilityCollector.recordEvent under category 'pipeline_decision'
 *     (when a collector is bound to the current async context — e.g., inside
 *     a turn that ran inside `runWithCollector`). Defensive: getCollector()
 *     returns null when observability is disabled or this emitter is invoked
 *     outside a request context (cron, smoke tests). Skipped silently.
 *  2. `console.log` with a stable `[interruption-v2] {label}` prefix so the
 *     event is greppable in Vercel function logs even when the collector is
 *     not active.
 */
export function emitLockEvent(
  label: LockEventLabel,
  payload: Record<string, unknown>,
): void {
  const collector = getCollector()
  if (collector) {
    collector.recordEvent('pipeline_decision', label, payload)
  }
  console.log(`[interruption-v2] ${label}`, payload)
}
