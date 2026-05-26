/**
 * Unit tests for checkpoints.ts — covers requirement LOCK-05.
 *
 * Test categories:
 *   - proceed=true happy path             → lock owner matches, no interrupt key.
 *   - lostLock=true zombie defense        → handle.holderUuid no longer matches
 *                                           stored lock value; emits 'zombie_lambda_exit' (D-15).
 *   - interrupted Path A (pre-send)       → interrupt key present, hasSentAnything=false;
 *                                           returns pendingListLength from LLEN; emits
 *                                           'interrupt_detected_at_ckpt_N' with checkpoint_id (D-17).
 *   - interrupted Path B (post-send)      → interrupt key present, hasSentAnything=true;
 *                                           emits same event with the actual pending length.
 *   - 8 CheckpointId values type-coverage → iterate const allCkpts: CheckpointId[] = [...]
 *                                           and invoke checkpoint() once each.
 *   - templateIndex suffix (CKPT-7.N)     → opts.templateIndex appended to checkpoint_id
 *                                           in the emitted event payload (D-18 .N suffix).
 *   - fail-open on Redis error            → redis.get throws; checkpoint emits
 *                                           'redis_unavailable_fallback_failed' and returns
 *                                           { proceed: true } per RESEARCH Open Question 5.
 *
 * Mocking strategy: reuses Plan 01 vi.mock async factory + __mock retrieval
 * pattern. observability is also mocked to capture emitLockEvent calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockRedis, type MockRedis } from './_helpers/mock-redis'
import {
  checkpoint,
  type CheckpointId,
  type CheckpointResult,
} from '../checkpoints'
import { acquireLock, type LockHandle } from '../lock'
import { emitLockEvent } from '../observability'

vi.mock('../redis-client', async () => {
  const { createMockRedis: factory } = await import('./_helpers/mock-redis')
  const instance = factory()
  return {
    __mock: instance,
    redis: instance,
    getRedisClient: () => instance,
  }
})

vi.mock('../observability', () => ({
  emitLockEvent: vi.fn(),
}))

// Suppress logger noise from lock.ts UUID validation path.
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
  // Reset the mocked emitLockEvent call history.
  vi.mocked(emitLockEvent).mockClear()
})

const WS = 'ws-1'
const PHONE = '+57-300-1234567'

// =============================================================================
// proceed=true — happy path
// =============================================================================

describe('checkpoint — LOCK-05 happy path', () => {
  it('returns { proceed: true } when lock owner matches and no interrupt key', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    const result: CheckpointResult = await checkpoint(
      'ckpt_0_post_acquire',
      handle!,
      WS,
      'whatsapp',
      PHONE,
    )
    expect(result).toEqual({ proceed: true })
    // No lifecycle event emitted on the happy path (silence by design — D-17).
    expect(emitLockEvent).not.toHaveBeenCalled()
  })
})

// =============================================================================
// lostLock=true — zombie defense (D-15)
// =============================================================================

describe('checkpoint — LOCK-05 zombie defense (D-15)', () => {
  it('returns { proceed: false, lostLock: true } and emits zombie_lambda_exit when handle UUID no longer matches', async () => {
    const real = await acquireLock(WS, 'whatsapp', PHONE)
    expect(real).not.toBeNull()

    // Simulate this lambda's lock having been stolen by another holder: the
    // stored lock value's holder_uuid no longer matches our handle.
    const zombieHandle: LockHandle = {
      key: real!.key,
      holderUuid: '99999999-9999-9999-9999-999999999999',
      startedAt: real!.startedAt,
    }

    const result = await checkpoint(
      'ckpt_2_post_state_machine',
      zombieHandle,
      WS,
      'whatsapp',
      PHONE,
    )
    expect(result).toEqual({ proceed: false, lostLock: true })

    // Exactly one zombie_lambda_exit emission with the at_step pinned to the
    // ckptId where the fencing-token check fired.
    expect(emitLockEvent).toHaveBeenCalledWith(
      'zombie_lambda_exit',
      expect.objectContaining({
        my_uuid: zombieHandle.holderUuid,
        at_step: 'ckpt_2_post_state_machine',
      }),
    )
  })
})

// =============================================================================
// interrupted — Path A (pre-send) + Path B (post-send) (D-17)
// =============================================================================

describe('checkpoint — LOCK-05 interrupt detection (D-17)', () => {
  it('returns { proceed: false, interrupted: { pendingListLength } } and emits interrupt_detected_at_ckpt_N (Path A — pre-send)', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    // Follower writes interrupt key + pushes an entry to pending list.
    const interruptKey = `interrupt:${WS}:whatsapp:${PHONE}`
    const pendingKey = `pending:${WS}:whatsapp:${PHONE}`
    mockRedis.__getAll().store.set(interruptKey, 'wamid.follower-msg-2')
    mockRedis.__getAll().lists.set(pendingKey, [
      JSON.stringify({ content: 'follower msg', entry_uuid: 'x', msg_id: null, received_at: 'now' }),
    ])

    const result = await checkpoint(
      'ckpt_1_post_comprehension',
      handle!,
      WS,
      'whatsapp',
      PHONE,
      { hasSentAnything: false },
    )
    expect(result.proceed).toBe(false)
    expect(result.lostLock).toBeUndefined()
    expect(result.interrupted?.pendingListLength).toBe(1)
    expect(result.interrupted?.interruptMsgId).toBe('wamid.follower-msg-2')

    // Event emitted with checkpoint_id matching the ckptId (no .N suffix here).
    expect(emitLockEvent).toHaveBeenCalledWith(
      'interrupt_detected_at_ckpt_N',
      expect.objectContaining({
        checkpoint_id: 'ckpt_1_post_comprehension',
        my_holder_uuid: handle!.holderUuid,
        interrupt_msg_id: 'wamid.follower-msg-2',
      }),
    )
  })

  it('returns interrupted with actual pendingListLength when 3 followers piled on (Path B — post-send)', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    const interruptKey = `interrupt:${WS}:whatsapp:${PHONE}`
    const pendingKey = `pending:${WS}:whatsapp:${PHONE}`
    mockRedis.__getAll().store.set(interruptKey, 'wamid.first-follower')
    mockRedis.__getAll().lists.set(pendingKey, [
      JSON.stringify({ content: 'm1', entry_uuid: 'a', msg_id: null, received_at: 'now' }),
      JSON.stringify({ content: 'm2', entry_uuid: 'b', msg_id: null, received_at: 'now' }),
      JSON.stringify({ content: 'm3', entry_uuid: 'c', msg_id: null, received_at: 'now' }),
    ])

    const result = await checkpoint(
      'ckpt_7_pre_template',
      handle!,
      WS,
      'whatsapp',
      PHONE,
      { hasSentAnything: true, templateIndex: 2 },
    )
    expect(result.proceed).toBe(false)
    expect(result.interrupted?.pendingListLength).toBe(3)
  })

  it('appends .N suffix to checkpoint_id in the emitted event when templateIndex is set (D-18 CKPT-7.N runtime suffix)', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    mockRedis.__getAll().store.set(`interrupt:${WS}:whatsapp:${PHONE}`, 'wamid.x')

    await checkpoint(
      'ckpt_7_pre_template',
      handle!,
      WS,
      'whatsapp',
      PHONE,
      { templateIndex: 3 },
    )
    expect(emitLockEvent).toHaveBeenCalledWith(
      'interrupt_detected_at_ckpt_N',
      expect.objectContaining({
        checkpoint_id: 'ckpt_7_pre_template_3',
      }),
    )
  })
})

// =============================================================================
// 8 CheckpointId values (LOCK-05 + D-18 coverage matrix)
// =============================================================================

describe('checkpoint — LOCK-05 all 8 CheckpointId values (D-18)', () => {
  it('accepts all 8 CheckpointId values and returns { proceed: true } for each on the happy path', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    // TypeScript validates each entry is a member of the CheckpointId union.
    // If a value is removed from the union or renamed, this array breaks at
    // compile time — making the test a structural contract enforcer.
    const allCkpts: CheckpointId[] = [
      'ckpt_0_post_acquire',
      'ckpt_1_post_comprehension',
      'ckpt_2_post_state_machine',
      'ckpt_3_post_tooling',
      'ckpt_4_post_generation',
      'ckpt_5_post_compliance',
      'ckpt_6_pre_send_loop',
      'ckpt_7_pre_template',
    ]
    expect(allCkpts.length).toBe(8) // Belt-and-suspenders D-18 invariant.

    for (const ckptId of allCkpts) {
      const result = await checkpoint(ckptId, handle!, WS, 'whatsapp', PHONE)
      expect(result).toEqual({ proceed: true })
    }
  })

  it('rejects a non-CheckpointId string at compile time (typed-union contract)', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    // @ts-expect-error — 'ckpt_99_fake' is not a member of CheckpointId.
    await checkpoint('ckpt_99_fake', handle!, WS, 'whatsapp', PHONE)
    // Runtime behavior of an invalid ckptId is undefined-by-contract; we only
    // assert that TS would catch it. If the @ts-expect-error directive ever
    // stops triggering an error, this test will fail at compile time.
  })
})

// =============================================================================
// fail-open — Redis unavailable (RESEARCH Open Question 5)
// =============================================================================

describe('checkpoint — LOCK-05 fail-open on Redis error', () => {
  it('emits redis_unavailable_fallback_failed and returns { proceed: true } when redis.get throws', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    // First .get call inside checkpoint() comes from assertHoldsLock — make
    // that one throw to exercise the fail-open wrapper.
    mockRedis.get.mockRejectedValueOnce(new Error('Upstash 503'))

    const result = await checkpoint(
      'ckpt_0_post_acquire',
      handle!,
      WS,
      'whatsapp',
      PHONE,
    )
    expect(result).toEqual({ proceed: true })

    expect(emitLockEvent).toHaveBeenCalledWith(
      'redis_unavailable_fallback_failed',
      expect.objectContaining({
        error_message: 'Upstash 503',
        at_step: 'ckpt_0_post_acquire',
      }),
    )
  })
})
