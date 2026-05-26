/**
 * Shared Vitest mock for `@upstash/redis` — implements the 9 methods this
 * module consumes (set, get, del, expire, rpush, lrem, lrange, llen, eval,
 * multi). Mirrors RESEARCH Code Example 6 (lines 760-833) verbatim with
 * additions for test-only introspection (`__simulateTtlExpiry`, `__getAll`).
 *
 * Usage in tests:
 *
 *   const mockRedis = createMockRedis()
 *   vi.mock('../redis-client', () => ({ redis: mockRedis }))
 *
 * The mock is a SINGLE shared instance per test file so multiple test cases
 * can probe its `vi.fn().mock.calls` history. Pair with `beforeEach(() =>
 * vi.clearAllMocks())` to reset call history between tests if needed.
 *
 * Mocked methods:
 *   set     — honors { nx, ex } object syntax (DO NOT use positional args —
 *             RESEARCH anti-pattern line 465). Honors keepTtl object option.
 *   get     — returns null if absent, the stored string otherwise.
 *   del     — returns 1 if existed, 0 otherwise.
 *   expire  — returns 1 if key existed, 0 otherwise.
 *   rpush   — appends to list, returns new length.
 *   lrem    — byte-exact match removal, returns number removed.
 *   lrange  — slice of the list; end=-1 means "to end".
 *   llen    — list length, 0 if absent.
 *   eval    — specifically simulates RELEASE_IF_OWNER_LUA semantics: GET +
 *             JSON.parse + compare holder_uuid + DEL. Returns 1 on success, 0
 *             otherwise. Mirrors lua-scripts.ts RELEASE_IF_OWNER_LUA behavior.
 *   multi   — returns a chain-call builder with .del().exec(); exec() returns
 *             [] (no per-command results needed by Plan 02 callers).
 *
 * Test-only helpers:
 *   __simulateTtlExpiry(key) — deletes the key from store + ttls, simulating
 *     TTL expiry without sleeping. Used by Plan 02+ tests for force-acquire
 *     scenarios.
 *   __getAll() — returns the underlying Map references for assertion-time
 *     introspection (e.g., setting `store.set(key, 'not json')` to test
 *     malformed-value defense in assertHoldsLock).
 */

import { vi } from 'vitest'

export function createMockRedis() {
  const store = new Map<string, string>()
  const ttls = new Map<string, number>()
  const lists = new Map<string, string[]>()

  const mock = {
    set: vi.fn(
      async (
        key: string,
        value: string,
        opts?: { nx?: boolean; ex?: number; keepTtl?: boolean },
      ): Promise<'OK' | null> => {
        if (opts?.nx && store.has(key)) return null
        store.set(key, value)
        if (opts?.ex) {
          ttls.set(key, Date.now() + opts.ex * 1000)
        } else if (opts?.keepTtl) {
          // Preserve existing TTL — no-op on the ttls map.
        }
        return 'OK'
      },
    ),

    get: vi.fn(async (key: string): Promise<string | null> => {
      return store.get(key) ?? null
    }),

    del: vi.fn(async (key: string): Promise<number> => {
      const had = store.has(key)
      store.delete(key)
      ttls.delete(key)
      return had ? 1 : 0
    }),

    expire: vi.fn(async (key: string, ex: number): Promise<number> => {
      if (!store.has(key)) return 0
      ttls.set(key, Date.now() + ex * 1000)
      return 1
    }),

    rpush: vi.fn(async (key: string, val: string): Promise<number> => {
      const arr = lists.get(key) ?? []
      arr.push(val)
      lists.set(key, arr)
      return arr.length
    }),

    lrem: vi.fn(async (key: string, _count: number, val: string): Promise<number> => {
      const arr = lists.get(key) ?? []
      const before = arr.length
      const idx = arr.indexOf(val)
      if (idx >= 0) arr.splice(idx, 1)
      lists.set(key, arr)
      return before - arr.length
    }),

    lrange: vi.fn(async (key: string, start: number, end: number): Promise<string[]> => {
      const arr = lists.get(key) ?? []
      return arr.slice(start, end === -1 ? undefined : end + 1)
    }),

    llen: vi.fn(async (key: string): Promise<number> => {
      return (lists.get(key) ?? []).length
    }),

    eval: vi.fn(
      async (_script: string, keys: string[], args: string[]): Promise<number> => {
        // Simulates RELEASE_IF_OWNER_LUA: GET + JSON.parse + compare + DEL.
        const raw = store.get(keys[0])
        if (!raw) return 0
        try {
          const parsed = JSON.parse(raw) as { holder_uuid?: string }
          if (parsed.holder_uuid === args[0]) {
            store.delete(keys[0])
            ttls.delete(keys[0])
            return 1
          }
        } catch {
          // Malformed JSON treated as not-owner (matches Lua pcall).
        }
        return 0
      },
    ),

    multi: vi.fn(() => {
      const tx = {
        del: vi.fn().mockReturnThis(),
        exec: vi.fn(async () => [] as unknown[]),
      }
      return tx
    }),

    /** Test-only: drop a key from store + ttls to simulate TTL expiry. */
    __simulateTtlExpiry(key: string): void {
      store.delete(key)
      ttls.delete(key)
    },

    /** Test-only: expose the underlying state Maps for assertions. */
    __getAll() {
      return { store, ttls, lists }
    },
  }

  return mock
}

export type MockRedis = ReturnType<typeof createMockRedis>
