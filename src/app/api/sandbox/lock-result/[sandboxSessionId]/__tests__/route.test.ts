/**
 * Sandbox lock-result long-poll endpoint — L1 happy + L2 timeout scenarios.
 *
 * Plan 04 Task 4.3 of standalone `debounce-v2-sandbox-integration` (WARNING 2 fix).
 *
 * Validates Plan 02's GET /api/sandbox/lock-result/[sandboxSessionId]:
 *   - L1 happy: Redis returns serialized result on a poll iteration → endpoint
 *     returns { ready: true, result } AND calls redis.del to clear the key.
 *   - L2 timeout: Redis returns null for 30s → endpoint returns
 *     { ready: false, timeout: true } HTTP 200 with no redis.del call.
 *
 * Uses fake timers (vi.useFakeTimers + vi.advanceTimersByTimeAsync) to avoid
 * a real 30s wait in CI.
 *
 * Source: 04-PLAN.md must_haves L1 / L2.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Use vi.hoisted to define mocks BEFORE the vi.mock factory runs (vitest
// hoists vi.mock() calls above all imports + top-level decls, so plain
// const mocks reference uninitialized bindings under static-import paths.
// The lock-result route uses STATIC `import { redis } from ...redis-client`,
// unlike sandbox/process/route.ts which uses dynamic imports inside an async
// branch — that's why the same naive pattern works there but not here).
const { redisGetMock, redisDelMock } = vi.hoisted(() => ({
  redisGetMock: vi.fn(),
  redisDelMock: vi.fn(),
}))

vi.mock('@/lib/agents/interruption-system-v2/redis-client', () => ({
  redis: {
    get: redisGetMock,
    del: redisDelMock,
  },
}))

// Authed user always.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'test-user-id' } } }),
    },
  })),
}))

// Import GET handler AFTER all mocks.
import { GET } from '@/app/api/sandbox/lock-result/[sandboxSessionId]/route'

function makeReq(): NextRequest {
  return new NextRequest('http://localhost:3020/api/sandbox/lock-result/abc')
}

function makeCtx(id = 'abc'): { params: Promise<{ sandboxSessionId: string }> } {
  return { params: Promise.resolve({ sandboxSessionId: id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/sandbox/lock-result/[sandboxSessionId] — L1/L2 (Plan 04 D-07 + D-14 + WARNING 2)', () => {
  it('L1 happy: returns ready=true + DELs key when result available on second poll iteration', async () => {
    const fakeResult = {
      success: true,
      messages: ['combined reply'],
      newState: {},
      debugTurn: {},
    }
    // First poll: key absent. Second poll: key set. Test that endpoint polls
    // again and returns the result. We use REAL timers here because the
    // inter-poll setTimeout is 300ms (negligible for one extra iteration).
    redisGetMock
      .mockResolvedValueOnce(null)                          // poll 1: not yet
      .mockResolvedValueOnce(JSON.stringify(fakeResult))    // poll 2: ready
    redisDelMock.mockResolvedValueOnce(1)

    const resp = await GET(makeReq(), makeCtx('abc'))
    const json = await resp.json()

    expect(json).toEqual({ ready: true, result: fakeResult })
    expect(redisDelMock).toHaveBeenCalledWith('sandbox-result:abc')
  })

  it('L2 timeout: returns ready=false + timeout=true after 30s with fake timers', async () => {
    // Always returns null — never ready. Use fake timers to fast-forward through
    // the 30s POLL_TIMEOUT_MS loop without real wait.
    redisGetMock.mockResolvedValue(null)
    vi.useFakeTimers()

    const respPromise = GET(makeReq(), makeCtx('abc'))

    // Drive the event loop: each poll iteration awaits redis.get (resolves
    // immediately under mock) then setTimeout(300). We advance 31s total to
    // exceed POLL_TIMEOUT_MS=30_000. advanceTimersByTimeAsync is promise-aware,
    // letting awaited mocks resolve between time-advances.
    for (let elapsed = 0; elapsed < 31000; elapsed += 300) {
      await vi.advanceTimersByTimeAsync(300)
    }

    const resp = await respPromise
    const json = await resp.json()

    expect(json).toEqual({ ready: false, timeout: true })
    expect(redisDelMock).not.toHaveBeenCalled()
  })
})
