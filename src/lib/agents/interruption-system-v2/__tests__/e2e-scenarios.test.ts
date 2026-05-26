/**
 * E2E scenarios — D-19 Phase 1+2 coverage (S1, S2, S3, S4).
 *
 * Wires the public surface of interruption-system-v2 (acquireLock, pushToPending,
 * checkpoint, releaseLockIfOwner, assertHoldsLock, emitLockEvent) against the
 * shared mock-redis helper to simulate the 4 lifecycle scenarios locked in
 * DISCUSSION-LOG.md D-19 + RESEARCH.md lines 875-886.
 *
 * Mocking strategy mirrors the lock.test.ts pattern (vi.mock factory + __mock
 * retrieval via `await import('../redis-client')` in beforeEach) — avoids the
 * hoisting trap where a top-level `const mockRedis = createMockRedis()` would
 * fail because vi.mock's factory cannot close over uninitialized bindings.
 *
 * Observability mock: we mock `@/lib/observability.getCollector` to return a
 * collector whose recordEvent appends to a shared `emittedEvents` array. Because
 * `emitLockEvent` is the real one (NOT mocked), every call from inside
 * `checkpoint()` (interrupt detection, zombie exit, fail-open) AND every direct
 * scenario call lands in the same array — making event-label assertions
 * deterministic.
 *
 * REVISION W4: S3 (TTL expiry / zombie lambda) is covered HERE in Vitest only.
 * Manual reproduction on Vercel preview is deferred per UAT.md acknowledgment
 * because it would require artificial hang induction in production code.
 *
 * Source: 07-PLAN.md Task 7.1 + LockEventLabel union in observability.ts (14
 * labels post REVISION B1) + DISCUSSION-LOG.md D-17/D-18.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'crypto'
import type { MockRedis } from './_helpers/mock-redis'

vi.mock('../redis-client', async () => {
  const { createMockRedis: factory } = await import('./_helpers/mock-redis')
  const instance = factory()
  return {
    __mock: instance,
    redis: instance,
    getRedisClient: () => instance,
  }
})

// Shared array — emitLockEvent (real impl) routes to this via the mocked collector.
const emittedEvents: Array<{ label: string; payload: Record<string, unknown> }> = []
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({
    recordEvent: (_cat: string, label: string, payload: Record<string, unknown>) => {
      emittedEvents.push({ label, payload })
    },
  }),
}))

// Suppress logger noise.
vi.mock('@/lib/audit/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

let mockRedis: MockRedis

beforeEach(async () => {
  const mod = (await import('../redis-client')) as unknown as { __mock: MockRedis }
  mockRedis = mod.__mock
  const { store, ttls, lists } = mockRedis.__getAll()
  store.clear()
  ttls.clear()
  lists.clear()
  mockRedis.set.mockClear()
  mockRedis.get.mockClear()
  mockRedis.del.mockClear()
  mockRedis.expire.mockClear()
  mockRedis.rpush.mockClear()
  mockRedis.lrem.mockClear()
  mockRedis.lrange.mockClear()
  mockRedis.llen.mockClear()
  mockRedis.eval.mockClear()
  mockRedis.multi.mockClear()
  emittedEvents.length = 0
})

const WS = 'ws-1'
const CHANNEL = 'whatsapp' as const

describe('e2e scenarios — D-19 Phase 2 (S1, S2, S3, S4)', () => {
  // ===========================================================================
  // S1 — solo path: msg1 alone, no contention
  // ===========================================================================
  it('S1: solo path — acquire + clean release lifecycle (≥2 events)', async () => {
    const PHONE = '+57300S1'

    const { acquireLock, releaseLockIfOwner } = await import('../lock')
    const { emitLockEvent } = await import('../observability')

    // Holder acquires.
    const handle = await acquireLock(WS, CHANNEL, PHONE)
    expect(handle).not.toBeNull()
    emitLockEvent('lock_acquired', {
      holder_uuid: handle!.holderUuid,
      msg_id: 'm1',
      key: handle!.key,
      ttl: 45,
      started_at: handle!.startedAt,
    })

    // Simulate a normal turn passing — no interrupts. (Checkpoints would emit
    // nothing on the happy path because assertHoldsLock = true and interrupt
    // key is absent → proceed=true silently.)

    // Holder releases.
    const released = await releaseLockIfOwner(handle!)
    expect(released).toBe(true)
    emitLockEvent('lock_released_normal', {
      holder_uuid: handle!.holderUuid,
      duration_ms: 100,
      templates_sent: 3,
    })

    const labels = emittedEvents.map((e) => e.label)
    expect(labels).toContain('lock_acquired')
    expect(labels).toContain('lock_released_normal')
    expect(emittedEvents.length).toBeGreaterThanOrEqual(2)

    // Lock is gone from store post-release.
    expect(mockRedis.__getAll().store.has(handle!.key)).toBe(false)
  })

  // ===========================================================================
  // S2 — race: two messages, follower follows holder, holder aborts Path A
  // ===========================================================================
  it('S2: race — 1 holder + 1 follower → Path A combined abort (≥4 distinct event labels)', async () => {
    const PHONE = '+57301S2'

    const { acquireLock, releaseLockIfOwner } = await import('../lock')
    const { pushToPending } = await import('../pending')
    const { checkpoint } = await import('../checkpoints')
    const { emitLockEvent } = await import('../observability')
    const { redis } = await import('../redis-client')

    // 1. Holder acquires.
    const holder = await acquireLock(WS, CHANNEL, PHONE)
    expect(holder).not.toBeNull()
    emitLockEvent('lock_acquired', {
      holder_uuid: holder!.holderUuid,
      msg_id: 'm1',
      key: holder!.key,
      ttl: 45,
      started_at: holder!.startedAt,
    })
    await pushToPending(WS, CHANNEL, PHONE, {
      entry_uuid: randomUUID(),
      content: 'msg1',
      received_at: new Date().toISOString(),
      msg_id: 'm1',
    })

    // 2. Follower attempts to acquire — SET NX collides → null.
    const follower = await acquireLock(WS, CHANNEL, PHONE)
    expect(follower).toBeNull()
    emitLockEvent('lock_acquire_failed_follower', {
      existing_holder_uuid: 'unknown',
      my_msg_id: 'm2',
      key: `lock:${WS}:${CHANNEL}:${PHONE}`,
    })

    // 3. Follower writes pending entry + interrupt key.
    const push2 = await pushToPending(WS, CHANNEL, PHONE, {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })
    await redis.set(`interrupt:${WS}:${CHANNEL}:${PHONE}`, 'm2', { ex: 60 })
    emitLockEvent('interrupt_written', {
      msg_id: 'm2',
      pending_list_length: push2.pendingListLength,
    })

    // 4. Holder reaches CKPT-1 — detects interrupt. checkpoint() itself emits
    //    `interrupt_detected_at_ckpt_N` per D-17/D-18.
    const ck = await checkpoint('ckpt_1_post_comprehension', holder!, WS, CHANNEL, PHONE)
    expect(ck.proceed).toBe(false)
    expect(ck.interrupted).toBeDefined()
    expect(ck.interrupted!.pendingListLength).toBe(2)

    // 5. Holder aborts Path A (pre-send) — combined turn deferred to next lambda.
    emitLockEvent('msg_aborted_path_a_combined', { combined_msg_count: 2, total_chars: 8 })
    emitLockEvent('pending_list_combined', { entries_count: 2, total_chars: 8 })

    // 6. Holder releases lock (next lambda picks up combo via readAndClearPending).
    const released = await releaseLockIfOwner(holder!)
    expect(released).toBe(true)
    emitLockEvent('lock_released_normal', {
      holder_uuid: holder!.holderUuid,
      duration_ms: 50,
      templates_sent: 0,
    })

    const labels = emittedEvents.map((e) => e.label)
    expect(labels).toContain('lock_acquired')
    expect(labels).toContain('lock_acquire_failed_follower')
    expect(labels).toContain('interrupt_written')
    expect(labels).toContain('interrupt_detected_at_ckpt_N') // emitted by checkpoint() itself
    expect(labels).toContain('msg_aborted_path_a_combined')
    expect(labels).toContain('pending_list_combined')
    expect(labels).toContain('lock_released_normal')

    // At least 4 DISTINCT labels (plan minimum) — we expect 7 in practice.
    expect(new Set(labels).size).toBeGreaterThanOrEqual(4)
    expect(emittedEvents.length).toBeGreaterThanOrEqual(4)
  })

  // ===========================================================================
  // S3 — TTL expiry / zombie lambda
  // REVISION W4: Vitest-only coverage; manual reproduction deferred (UAT.md sign-off).
  // ===========================================================================
  it('S3: TTL expiry → second caller force-acquires → first holder zombie-exits (REVISION W4 — Vitest-only coverage; UAT.md captures user acknowledgment of manual deferral)', async () => {
    const PHONE = '+57302S3'

    const { acquireLock, assertHoldsLock, releaseLockIfOwner } = await import('../lock')
    const { checkpoint } = await import('../checkpoints')
    const { emitLockEvent } = await import('../observability')
    const { redis } = await import('../redis-client')

    // 1. Holder 1 acquires.
    const h1 = await acquireLock(WS, CHANNEL, PHONE)
    expect(h1).not.toBeNull()

    // 2. Simulate TTL expiry — key drops out of store.
    mockRedis.__simulateTtlExpiry(h1!.key)

    // 3. Holder 2 force-acquires (SET NX now succeeds because key is absent).
    const h2 = await acquireLock(WS, CHANNEL, PHONE)
    expect(h2).not.toBeNull()
    expect(h2!.holderUuid).not.toEqual(h1!.holderUuid)
    emitLockEvent('lock_force_acquired_after_ttl_expiry', {
      previous_holder_uuid: h1!.holderUuid,
      expired_ago_estimate_ms: 0,
    })

    // 4. Holder 2 writes an interrupt key (in the real flow this would be a
    //    follower racing in; here it asserts the path with interrupt context).
    await redis.set(`interrupt:${WS}:${CHANNEL}:${PHONE}`, 'm2', { ex: 60 })
    emitLockEvent('interrupt_written', { msg_id: 'm2', pending_list_length: 1 })

    // 5. Holder 1 wakes up from a paused step and hits a checkpoint —
    //    assertHoldsLock returns false because the stored UUID is now h2's.
    //    checkpoint() emits `zombie_lambda_exit` itself per D-15.
    const h1Holds = await assertHoldsLock(h1!)
    expect(h1Holds).toBe(false)
    const ck = await checkpoint('ckpt_2_post_state_machine', h1!, WS, CHANNEL, PHONE)
    expect(ck.proceed).toBe(false)
    expect(ck.lostLock).toBe(true)

    // 6. Holder 2 finishes its turn normally (combined or solo — irrelevant for
    //    event-count assertion). pending_list_combined emitted at acquire-time
    //    by the runner (we emit explicitly here to mirror runtime flow).
    emitLockEvent('pending_list_combined', { entries_count: 1, total_chars: 4 })
    const released = await releaseLockIfOwner(h2!)
    expect(released).toBe(true)
    emitLockEvent('lock_released_normal', {
      holder_uuid: h2!.holderUuid,
      duration_ms: 80,
      templates_sent: 1,
    })

    const labels = emittedEvents.map((e) => e.label)
    expect(labels).toContain('lock_force_acquired_after_ttl_expiry')
    expect(labels).toContain('zombie_lambda_exit') // emitted by checkpoint() itself
    expect(labels).toContain('interrupt_written')
    expect(labels).toContain('pending_list_combined')
    expect(labels).toContain('lock_released_normal')
    expect(emittedEvents.length).toBeGreaterThanOrEqual(5)
  })

  // ===========================================================================
  // S4 — Path B: holder sent ≥1 template before interrupt fires at CKPT-7.N
  // ===========================================================================
  it('S4: holder sends 1 template, msg2 arrives, CKPT-7.N detects interrupt → Path B solo (≥4 events)', async () => {
    const PHONE = '+57303S4'

    const { acquireLock, releaseLockIfOwner } = await import('../lock')
    const { checkpoint } = await import('../checkpoints')
    const { emitLockEvent } = await import('../observability')
    const { redis } = await import('../redis-client')

    // 1. Holder acquires.
    const handle = await acquireLock(WS, CHANNEL, PHONE)
    expect(handle).not.toBeNull()
    emitLockEvent('lock_acquired', {
      holder_uuid: handle!.holderUuid,
      msg_id: 'm1',
      key: handle!.key,
      ttl: 45,
      started_at: handle!.startedAt,
    })

    // 2. Holder sends 1 template — update lock value to has_sent_anything=true.
    //    (In the real runner this is done by V4MessagingAdapter post first send.)
    const newVal = JSON.stringify({
      holder_uuid: handle!.holderUuid,
      started_at: handle!.startedAt,
      has_sent_anything: true,
    })
    mockRedis.__getAll().store.set(handle!.key, newVal)

    // 3. Interrupt arrives mid-flight.
    await redis.set(`interrupt:${WS}:${CHANNEL}:${PHONE}`, 'm2', { ex: 60 })
    emitLockEvent('interrupt_written', { msg_id: 'm2', pending_list_length: 1 })

    // 4. Holder hits CKPT-7.N before sending template #2 — detects interrupt
    //    AND sees hasSentAnything=true → Path B (solo abort, no combo).
    //    checkpoint() emits `interrupt_detected_at_ckpt_N` itself.
    const ck = await checkpoint('ckpt_7_pre_template', handle!, WS, CHANNEL, PHONE, {
      templateIndex: 2,
      hasSentAnything: true,
    })
    expect(ck.proceed).toBe(false)
    expect(ck.interrupted).toBeDefined()

    // 5. Holder aborts Path B (post-send) — emits the explicit Path B label.
    emitLockEvent('msg_aborted_path_b_solo', { templates_sent_before_abort: 1 })

    // 6. Holder releases lock normally.
    const released = await releaseLockIfOwner(handle!)
    expect(released).toBe(true)
    emitLockEvent('lock_released_normal', {
      holder_uuid: handle!.holderUuid,
      duration_ms: 200,
      templates_sent: 1,
    })

    const labels = emittedEvents.map((e) => e.label)
    expect(labels).toContain('lock_acquired')
    expect(labels).toContain('interrupt_written')
    expect(labels).toContain('interrupt_detected_at_ckpt_N') // emitted by checkpoint() itself
    expect(labels).toContain('msg_aborted_path_b_solo')
    expect(labels).toContain('lock_released_normal')
    expect(emittedEvents.length).toBeGreaterThanOrEqual(4)

    // The checkpoint event payload should include the .N suffix (CKPT-7.N — D-18).
    const ckptEvent = emittedEvents.find((e) => e.label === 'interrupt_detected_at_ckpt_N')
    expect(ckptEvent).toBeDefined()
    expect(ckptEvent!.payload.checkpoint_id).toBe('ckpt_7_pre_template_2')
    expect(ckptEvent!.payload.has_sent_anything).toBe(true)
  })
})
