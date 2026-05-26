/**
 * Unit tests for observability.ts — covers requirement LOCK-07 (typed emitter
 * with 14 D-17-extended labels — REVISION B1 bumped from 13 to include
 * `lock_orphan_swept_by_cron` for Plan 06 cron sweep).
 *
 * Test categories:
 *   - All 14 labels are accepted at runtime and routed to
 *     collector.recordEvent('pipeline_decision', label, payload).
 *   - When getCollector() returns null, recordEvent is NOT called but
 *     console.log IS called (D-11 dual emission survives no-collector case).
 *   - Type test (LOCK-07 strict): an invalid label is a TypeScript compile
 *     error. Verified via `@ts-expect-error` annotation — if tsc reports the
 *     directive as UNUSED, the literal type is not restrictive enough.
 *   - REVISION B1: explicit `lock_orphan_swept_by_cron` call asserts the
 *     14th label is wired.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// vi.mock factory creates the recordEvent spy + an instance getter that
// tests toggle between "collector present" and "collector null".
let collectorPresent = true
const recordEvent = vi.fn()

vi.mock('@/lib/observability', () => ({
  getCollector: () => (collectorPresent ? { recordEvent } : null),
}))

import { emitLockEvent, type LockEventLabel } from '../observability'

// The exhaustive list of 14 labels expected by D-17 + REVISION B1.
const ALL_LABELS: LockEventLabel[] = [
  'lock_acquired',
  'lock_acquire_failed_follower',
  'interrupt_written',
  'interrupt_detected_at_ckpt_N',
  'msg_aborted_path_a_combined',
  'msg_aborted_path_b_solo',
  'lock_released_normal',
  'follower_woke',
  'lock_force_acquired_after_ttl_expiry',
  'zombie_lambda_exit',
  'heartbeat_renewed',
  'pending_list_combined',
  'redis_unavailable_fallback_failed',
  'lock_orphan_swept_by_cron',
]

// Use `any` to bypass vitest's awkward MockInstance typing differences across
// generic signatures. The runtime contract is what we test (toHaveBeenCalled,
// mockClear) — explicit typing here adds no safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let consoleSpy: any

beforeEach(() => {
  collectorPresent = true
  recordEvent.mockClear()
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('emitLockEvent — LOCK-07 (typed 14-label emitter)', () => {
  it('exposes exactly 14 labels in the LockEventLabel union (REVISION B1)', () => {
    // Both length and uniqueness — if D-17 ever gains a label, both this
    // assertion AND the union in observability.ts must be updated together.
    expect(ALL_LABELS).toHaveLength(14)
    expect(new Set(ALL_LABELS).size).toBe(14)
  })

  it('routes all 14 labels to collector.recordEvent under pipeline_decision', () => {
    for (const label of ALL_LABELS) {
      recordEvent.mockClear()
      const payload = { test_label: label, foo: 'bar' }
      emitLockEvent(label, payload)

      expect(recordEvent).toHaveBeenCalledTimes(1)
      expect(recordEvent).toHaveBeenCalledWith('pipeline_decision', label, payload)
    }
  })

  it('dual-emits to console.log with stable [interruption-v2] prefix', () => {
    consoleSpy.mockClear()
    emitLockEvent('lock_acquired', { holder_uuid: 'u', msg_id: 'm', key: 'k', ttl: 45 })
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[interruption-v2] lock_acquired',
      { holder_uuid: 'u', msg_id: 'm', key: 'k', ttl: 45 },
    )
  })

  it('still emits console.log when getCollector() returns null (no-throw)', () => {
    collectorPresent = false
    consoleSpy.mockClear()
    recordEvent.mockClear()

    expect(() =>
      emitLockEvent('heartbeat_renewed', { holder_uuid: 'u', new_ttl: 45 }),
    ).not.toThrow()
    expect(recordEvent).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  // REVISION B1 — explicit assertion that the 14th label is wired.
  it('REVISION B1 — lock_orphan_swept_by_cron is a valid label with cron payload shape', () => {
    recordEvent.mockClear()
    const payload = {
      lock_key: 'lock:ws-1:whatsapp:+57-300-1234567',
      reason: 'no_active_session' as const,
      workspaceId: 'ws-1',
      age_ms: 90_000,
    }
    emitLockEvent('lock_orphan_swept_by_cron', payload)

    expect(recordEvent).toHaveBeenCalledWith(
      'pipeline_decision',
      'lock_orphan_swept_by_cron',
      payload,
    )
  })

  // LOCK-07 strict — type test: a non-LockEventLabel string must be a compile
  // error. If tsc reports the @ts-expect-error directive as UNUSED, the union
  // is not restrictive enough and this test regresses silently.
  it('LOCK-07 strict — invalid label is a TypeScript compile error', () => {
    // @ts-expect-error - 'not_a_label' is not a member of LockEventLabel union
    emitLockEvent('not_a_label', {})
    // Runtime assertion: even though tsc rejects, the call still goes through
    // at runtime — we don't want this to crash, just to be caught by the
    // type checker. The @ts-expect-error directive is the actual test
    // (validated by `npx tsc --noEmit` in plan verification).
    expect(true).toBe(true)
  })
})
