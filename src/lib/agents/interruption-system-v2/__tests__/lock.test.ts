/**
 * Unit tests for lock.ts primitives — covers requirements LOCK-01..03.
 *
 * Test categories:
 *   - acquireLock     → LOCK-01 (atomic SET NX, collision returns null)
 *   - assertHoldsLock → LOCK-03 (fencing token re-check), defensive parsing
 *   - renewLockTTL    → LOCK-02 (TTL extends), refuses to renew foreign lock
 *   - releaseLockIfOwner → LOCK-03 (Lua atomic; foreign UUID does not delete;
 *                          rejects malformed UUID before Lua ARGV — Security V5)
 *   - startHeartbeat  → LOCK-02 (interval lifecycle, stop clears interval)
 *
 * Mocking strategy: vi.mock factory constructs the shared mock once (factory
 * runs once per test file). Tests retrieve the mock instance via
 * `await import('../redis-client')` which returns the mocked exports. The
 * `vi.hoisted` block lifts the createMockRedis helper import above vi.mock's
 * hoisting; using a top-level `const` for the mock instance would fail
 * because vi.mock's factory cannot close over uninitialized bindings.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockRedis, type MockRedis } from './_helpers/mock-redis'
import {
  acquireLock,
  assertHoldsLock,
  renewLockTTL,
  releaseLockIfOwner,
  startHeartbeat,
  LOCK_TTL_S,
  HEARTBEAT_MS,
  type LockHandle,
} from '../lock'
import { RELEASE_IF_OWNER_LUA } from '../lua-scripts'

vi.mock('../redis-client', async () => {
  const { createMockRedis: factory } = await import('./_helpers/mock-redis')
  const instance = factory()
  return {
    __mock: instance, // expose for retrieval below
    redis: instance,
    getRedisClient: () => instance,
  }
})

// Suppress logger noise from releaseLockIfOwner's defensive UUID validation.
vi.mock('@/lib/audit/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Retrieve the mock instance via the mocked module's __mock export.
let mockRedis: MockRedis
beforeEach(async () => {
  const mod = (await import('../redis-client')) as unknown as { __mock: MockRedis }
  mockRedis = mod.__mock
  // Reset state + call history between tests.
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
})

const WS = 'ws-1'
const PHONE = '+57-300-1234567'

// =============================================================================
// acquireLock — LOCK-01
// =============================================================================

describe('acquireLock — LOCK-01', () => {
  it('returns a LockHandle on first call (SET NX succeeds)', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()
    expect(handle!.key).toBe(`lock:${WS}:whatsapp:${PHONE}`)
    expect(handle!.holderUuid).toMatch(/^[0-9a-f-]{36}$/i)
    expect(handle!.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    // Verify SET NX object syntax (RESEARCH anti-pattern line 465 — NOT positional).
    expect(mockRedis.set).toHaveBeenCalledWith(
      handle!.key,
      expect.any(String),
      { nx: true, ex: LOCK_TTL_S },
    )

    // Stored value carries the D-15 + D-16 fields.
    const { store } = mockRedis.__getAll()
    const stored = JSON.parse(store.get(handle!.key) ?? '{}')
    expect(stored.holder_uuid).toBe(handle!.holderUuid)
    expect(stored.has_sent_anything).toBe(false)
    expect(typeof stored.started_at).toBe('string')
  })

  it('returns null when SET NX collides (second concurrent caller)', async () => {
    const first = await acquireLock(WS, 'whatsapp', PHONE)
    expect(first).not.toBeNull()

    const second = await acquireLock(WS, 'whatsapp', PHONE)
    expect(second).toBeNull()
  })
})

// =============================================================================
// assertHoldsLock — LOCK-03
// =============================================================================

describe('assertHoldsLock — LOCK-03 (fencing token)', () => {
  it('returns true when UUID matches the stored holder_uuid', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    const holds = await assertHoldsLock(handle!)
    expect(holds).toBe(true)
  })

  it('returns false when UUID differs (zombie defense per D-15)', async () => {
    const real = await acquireLock(WS, 'whatsapp', PHONE)
    expect(real).not.toBeNull()

    const zombie: LockHandle = {
      key: real!.key,
      holderUuid: '00000000-0000-0000-0000-000000000000',
      startedAt: real!.startedAt,
    }
    const holds = await assertHoldsLock(zombie)
    expect(holds).toBe(false)
  })

  it('returns false when the key is absent (TTL expired)', async () => {
    const handle: LockHandle = {
      key: `lock:${WS}:whatsapp:${PHONE}`,
      holderUuid: '11111111-1111-1111-1111-111111111111',
      startedAt: new Date().toISOString(),
    }
    const holds = await assertHoldsLock(handle)
    expect(holds).toBe(false)
  })

  it('returns false when the lock value is malformed JSON (defensive)', async () => {
    const handle: LockHandle = {
      key: `lock:${WS}:whatsapp:${PHONE}`,
      holderUuid: '22222222-2222-2222-2222-222222222222',
      startedAt: new Date().toISOString(),
    }
    // Inject a malformed value directly into the store.
    mockRedis.__getAll().store.set(handle.key, 'not json {{{')

    const holds = await assertHoldsLock(handle)
    expect(holds).toBe(false)
  })
})

// =============================================================================
// renewLockTTL — LOCK-02
// =============================================================================

describe('renewLockTTL — LOCK-02 (TTL extends only for owner)', () => {
  it('refreshes TTL via redis.expire when owner matches', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    mockRedis.expire.mockClear()
    const renewed = await renewLockTTL(handle!)
    expect(renewed).toBe(true)
    expect(mockRedis.expire).toHaveBeenCalledWith(handle!.key, LOCK_TTL_S)
  })

  it('does NOT renew TTL when owner does not match', async () => {
    const real = await acquireLock(WS, 'whatsapp', PHONE)
    expect(real).not.toBeNull()

    const zombie: LockHandle = {
      key: real!.key,
      holderUuid: '33333333-3333-3333-3333-333333333333',
      startedAt: real!.startedAt,
    }
    mockRedis.expire.mockClear()
    const renewed = await renewLockTTL(zombie)
    expect(renewed).toBe(false)
    expect(mockRedis.expire).not.toHaveBeenCalled()
  })
})

// =============================================================================
// releaseLockIfOwner — LOCK-03
// =============================================================================

describe('releaseLockIfOwner — LOCK-03 (atomic Lua release)', () => {
  it('deletes the lock when UUID matches', async () => {
    const handle = await acquireLock(WS, 'whatsapp', PHONE)
    expect(handle).not.toBeNull()

    const released = await releaseLockIfOwner(handle!)
    expect(released).toBe(true)

    // Critical Pitfall 3 verification: eval called with ARRAY signature
    // (script, [key], [uuid]) — NOT positional (script, key, uuid).
    expect(mockRedis.eval).toHaveBeenCalledWith(
      RELEASE_IF_OWNER_LUA,
      [handle!.key],
      [handle!.holderUuid],
    )

    // Key is gone from the mock store.
    expect(mockRedis.__getAll().store.has(handle!.key)).toBe(false)
  })

  it('does NOT delete when UUID differs (fencing via Lua)', async () => {
    const real = await acquireLock(WS, 'whatsapp', PHONE)
    expect(real).not.toBeNull()

    const zombie: LockHandle = {
      key: real!.key,
      holderUuid: '44444444-4444-4444-4444-444444444444',
      startedAt: real!.startedAt,
    }
    const released = await releaseLockIfOwner(zombie)
    expect(released).toBe(false)

    // Real lock is still in store.
    expect(mockRedis.__getAll().store.has(real!.key)).toBe(true)
  })

  it('rejects invalid UUID format before sending to Lua ARGV (Security V5)', async () => {
    const real = await acquireLock(WS, 'whatsapp', PHONE)
    expect(real).not.toBeNull()

    mockRedis.eval.mockClear()
    const malicious: LockHandle = {
      key: real!.key,
      // Inject a Lua-shaped payload instead of a UUID. Validation should
      // reject BEFORE the script is sent to Redis.
      holderUuid: "'; redis.call('FLUSHDB'); --",
      startedAt: real!.startedAt,
    }
    const released = await releaseLockIfOwner(malicious)
    expect(released).toBe(false)
    expect(mockRedis.eval).not.toHaveBeenCalled()
  })
})

// =============================================================================
// startHeartbeat — LOCK-02 (interval lifecycle)
// =============================================================================

describe('startHeartbeat — LOCK-02', () => {
  it('fires renewLockTTL every HEARTBEAT_MS; stop() clears the interval', async () => {
    vi.useFakeTimers()
    try {
      const handle = await acquireLock(WS, 'whatsapp', PHONE)
      expect(handle).not.toBeNull()

      mockRedis.expire.mockClear()
      const stop = startHeartbeat(handle!)

      // Advance one heartbeat tick — first renew should fire.
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
      expect(mockRedis.expire).toHaveBeenCalledTimes(1)
      expect(mockRedis.expire).toHaveBeenLastCalledWith(handle!.key, LOCK_TTL_S)

      // Advance two more ticks — should fire twice more (total 3).
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2)
      expect(mockRedis.expire).toHaveBeenCalledTimes(3)

      // Stop the heartbeat. No further ticks should fire renew.
      stop()
      mockRedis.expire.mockClear()
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 5)
      expect(mockRedis.expire).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
