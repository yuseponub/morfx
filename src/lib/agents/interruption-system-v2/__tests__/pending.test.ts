/**
 * Unit tests for pending.ts — covers requirement LOCK-04.
 *
 * Test categories:
 *   - pushToPending      → RPUSH + returns { pendingListLength, exactJson } with
 *                          alphabetical key serialization (D-20 + RESEARCH Pitfall 4)
 *   - removeOwnEntry     → byte-exact LREM match; fails for re-serialized JSON
 *                          (Pitfall 4 — full string match required, NOT just entry_uuid)
 *   - readAndClearPending → LRANGE + atomic multi().del().exec(); empty key safe
 *   - unbounded growth   → 100-push test (D-05 / D-16 no LLEN cap)
 *
 * Mocking strategy: reuses Plan 01 vi.mock async factory + __mock retrieval
 * pattern from lock.test.ts (LEARNING from 01-SUMMARY.md — avoids vi.mock
 * hoisting trap "Cannot access mockRedis before initialization").
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockRedis, type MockRedis } from './_helpers/mock-redis'
import {
  pushToPending,
  removeOwnEntry,
  readAndClearPending,
  type PendingEntry,
} from '../pending'

vi.mock('../redis-client', async () => {
  const { createMockRedis: factory } = await import('./_helpers/mock-redis')
  const instance = factory()
  return {
    __mock: instance,
    redis: instance,
    getRedisClient: () => instance,
  }
})

// Suppress logger noise from defensive JSON.parse path in readAndClearPending.
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
})

const WS = 'ws-1'
const PHONE = '+57-300-1234567'
const PENDING_KEY = `pending:${WS}:whatsapp:${PHONE}`

function makeEntry(overrides: Partial<PendingEntry> = {}): PendingEntry {
  return {
    entry_uuid: '11111111-1111-1111-1111-111111111111',
    content: 'hola',
    received_at: '2026-05-25T22:30:00.000Z',
    msg_id: 'wamid.ABC123',
    ...overrides,
  }
}

// =============================================================================
// pushToPending — LOCK-04
// =============================================================================

describe('pushToPending — LOCK-04', () => {
  it('RPUSHes and returns { pendingListLength, exactJson } with alphabetical-key serialization', async () => {
    const entry = makeEntry()
    const { pendingListLength, exactJson } = await pushToPending(WS, 'whatsapp', PHONE, entry)

    expect(pendingListLength).toBe(1)
    // Alphabetical key order: content, entry_uuid, msg_id, received_at.
    // This is the byte-exact JSON that LREM must match later (Pitfall 4).
    expect(exactJson).toBe(
      JSON.stringify({
        content: entry.content,
        entry_uuid: entry.entry_uuid,
        msg_id: entry.msg_id ?? null,
        received_at: entry.received_at,
      }),
    )
    // Stored in Redis as exactly the same string we returned.
    expect(mockRedis.rpush).toHaveBeenCalledWith(PENDING_KEY, exactJson)
    const { lists } = mockRedis.__getAll()
    expect(lists.get(PENDING_KEY)).toEqual([exactJson])
  })

  it('serializes msg_id as null when undefined (deterministic shape)', async () => {
    const entry: PendingEntry = {
      entry_uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      content: 'sin msg id',
      received_at: '2026-05-25T22:31:00.000Z',
    }
    const { exactJson } = await pushToPending(WS, 'whatsapp', PHONE, entry)
    expect(exactJson).toContain('"msg_id":null')
    // Confirm alphabetical ordering still holds.
    expect(exactJson).toBe(
      JSON.stringify({
        content: entry.content,
        entry_uuid: entry.entry_uuid,
        msg_id: null,
        received_at: entry.received_at,
      }),
    )
  })

  it('is unbounded — pushing 100 entries returns pendingListLength=100 (D-05 no cap)', async () => {
    let last: { pendingListLength: number; exactJson: string } | null = null
    for (let i = 0; i < 100; i++) {
      const entry: PendingEntry = {
        entry_uuid: `${i.toString().padStart(8, '0')}-0000-0000-0000-000000000000`,
        content: `msg-${i}`,
        received_at: new Date(Date.UTC(2026, 4, 25, 22, 30, i)).toISOString(),
        msg_id: `wamid.${i}`,
      }
      last = await pushToPending(WS, 'whatsapp', PHONE, entry)
    }
    expect(last).not.toBeNull()
    expect(last!.pendingListLength).toBe(100)
    expect(mockRedis.__getAll().lists.get(PENDING_KEY)?.length).toBe(100)
  })
})

// =============================================================================
// removeOwnEntry — LOCK-04 (Pitfall 4 byte-exact match)
// =============================================================================

describe('removeOwnEntry — LOCK-04 (Pitfall 4 byte-exact LREM)', () => {
  it('succeeds (returns true) when given the exactJson previously produced by pushToPending', async () => {
    const entry = makeEntry()
    const { exactJson } = await pushToPending(WS, 'whatsapp', PHONE, entry)

    const removed = await removeOwnEntry(WS, 'whatsapp', PHONE, exactJson)
    expect(removed).toBe(true)
    // List is empty after the LREM.
    expect(mockRedis.__getAll().lists.get(PENDING_KEY)?.length ?? 0).toBe(0)
    // LREM called with the exact JSON string (NOT a re-serialization).
    expect(mockRedis.lrem).toHaveBeenCalledWith(PENDING_KEY, 1, exactJson)
  })

  it('FAILS (returns false) when given a manually re-serialized JSON with different key order — Pitfall 4 byte-exact assertion', async () => {
    const entry = makeEntry()
    const { exactJson: original } = await pushToPending(WS, 'whatsapp', PHONE, entry)

    // Build a "logically equivalent" string with REVERSED key order. Pitfall 4
    // says Redis LREM compares values byte-by-byte; this MUST fail to remove
    // even though entry_uuid + content + msg_id + received_at all match.
    const reversed = JSON.stringify({
      received_at: entry.received_at,
      msg_id: entry.msg_id ?? null,
      entry_uuid: entry.entry_uuid,
      content: entry.content,
    })
    expect(reversed).not.toBe(original) // Pre-condition: the strings differ byte-wise.

    const removed = await removeOwnEntry(WS, 'whatsapp', PHONE, reversed)
    expect(removed).toBe(false)
    // Original entry still in list — proves byte-exact match enforced.
    expect(mockRedis.__getAll().lists.get(PENDING_KEY)).toEqual([original])
  })

  it('FAILS (returns false) when entry_uuid matches but content differs — full string match required', async () => {
    const entry = makeEntry({ content: 'original content' })
    await pushToPending(WS, 'whatsapp', PHONE, entry)

    // Construct a string with same entry_uuid but different content.
    const tampered = JSON.stringify({
      content: 'tampered content',
      entry_uuid: entry.entry_uuid,
      msg_id: entry.msg_id ?? null,
      received_at: entry.received_at,
    })

    const removed = await removeOwnEntry(WS, 'whatsapp', PHONE, tampered)
    expect(removed).toBe(false)
    // List still has the original entry.
    expect(mockRedis.__getAll().lists.get(PENDING_KEY)?.length).toBe(1)
  })

  it('returns false when the list is empty (defensive)', async () => {
    const removed = await removeOwnEntry(WS, 'whatsapp', PHONE, '{"any":"string"}')
    expect(removed).toBe(false)
  })
})

// =============================================================================
// readAndClearPending — LOCK-04
// =============================================================================

describe('readAndClearPending — LOCK-04', () => {
  it('returns all entries in RPUSH order and atomically clears the list via multi().del().exec()', async () => {
    const e1 = makeEntry({ entry_uuid: 'aaaaaaaa-1111-1111-1111-111111111111', content: 'first' })
    const e2 = makeEntry({ entry_uuid: 'bbbbbbbb-2222-2222-2222-222222222222', content: 'second' })
    const e3 = makeEntry({ entry_uuid: 'cccccccc-3333-3333-3333-333333333333', content: 'third' })
    await pushToPending(WS, 'whatsapp', PHONE, e1)
    await pushToPending(WS, 'whatsapp', PHONE, e2)
    await pushToPending(WS, 'whatsapp', PHONE, e3)

    const items = await readAndClearPending(WS, 'whatsapp', PHONE)
    expect(items).toHaveLength(3)
    // RPUSH preserves insertion order; LRANGE 0 -1 returns them in same order.
    expect(items[0].content).toBe('first')
    expect(items[1].content).toBe('second')
    expect(items[2].content).toBe('third')

    // Atomic clear pattern: redis.multi() called exactly once, returned tx has
    // .del(key) scheduled then .exec() awaited. The mock's multi() returns a
    // chain stub (del returns this; exec returns []) so we verify the call
    // shape rather than the cleared list state (real Upstash multi clears
    // server-side; mock's tx.del does not back-port to the lists Map).
    expect(mockRedis.multi).toHaveBeenCalledTimes(1)
    const txInstance = mockRedis.multi.mock.results[0]?.value as {
      del: ReturnType<typeof vi.fn>
      exec: ReturnType<typeof vi.fn>
    }
    expect(txInstance.del).toHaveBeenCalledWith(PENDING_KEY)
    expect(txInstance.exec).toHaveBeenCalledTimes(1)
  })

  it('returns [] when the key does not exist (no throw)', async () => {
    const items = await readAndClearPending(WS, 'whatsapp', PHONE)
    expect(items).toEqual([])
    // multi() should NOT be called when there's nothing to clear.
    expect(mockRedis.multi).not.toHaveBeenCalled()
  })

  it('handles already-deserialized items from @upstash/redis SDK auto-parse (defensive)', async () => {
    // @upstash/redis sometimes auto-parses JSON-looking responses into objects.
    // Inject an already-parsed object into the list to simulate.
    const entry = makeEntry({ content: 'auto-parsed' })
    const { exactJson } = await pushToPending(WS, 'whatsapp', PHONE, entry)
    void exactJson

    // Replace the stored string with an already-parsed object (cast).
    const lists = mockRedis.__getAll().lists
    const parsed = {
      content: entry.content,
      entry_uuid: entry.entry_uuid,
      msg_id: entry.msg_id ?? null,
      received_at: entry.received_at,
    }
    lists.set(PENDING_KEY, [parsed as unknown as string])

    const items = await readAndClearPending(WS, 'whatsapp', PHONE)
    expect(items).toHaveLength(1)
    expect(items[0].content).toBe('auto-parsed')
    expect(items[0].entry_uuid).toBe(entry.entry_uuid)
  })
})
