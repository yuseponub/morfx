import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Standalone: debounce-interruption-system-v2 / Plan 06 / Task 6.1
 *
 * Asserts the contract of the v2-lock-cleanup-cron Inngest function:
 *   1. Cron schedule is "TZ=America/Bogota [asterisk]/5 [asterisk] [asterisk] [asterisk] [asterisk]" (D-09 + REVISION B1).
 *   2. Function id is `debounce-v2-lock-cleanup`.
 *   3. The sweep queries `agent_sessions` with status='active' (NOT ended_at IS NULL).
 *   4. Lock keys NOT backed by an active session are DELed and
 *      `lock_orphan_swept_by_cron` is emitted with reason='no_active_session'.
 *   5. Lock keys backed by an active session BUT older than MAX_TURN_AGE_S=60s
 *      are also swept with reason='stale_age' (defense-in-depth).
 *   6. Active + young locks are KEPT (no DEL, no emit).
 *   7. Malformed lock keys (cannot be parsed) are swept with reason='malformed_value'.
 *
 * The Redis client and createAdminClient are mocked heavily — this is a
 * scoped unit test, not E2E (Plan 07 covers that).
 */

// -----------------------------------------------------------------
// Mocks — vi.mock async-factory pattern (Plan 01 / Plan 03 LEARNING).
// Each factory creates its own vi.fn() instances internally; we retrieve
// the mock references AFTER the import via `as ReturnType<typeof vi.fn>`.
// This avoids the "Cannot access X before initialization" hoisting trap.
// -----------------------------------------------------------------

vi.mock('@/lib/agents/interruption-system-v2/redis-client', () => {
  return {
    redis: {
      scan: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
    },
  }
})

vi.mock('@/lib/agents/interruption-system-v2/observability', () => {
  return {
    emitLockEvent: vi.fn(),
  }
})

vi.mock('@/lib/supabase/admin', () => {
  return {
    createAdminClient: vi.fn(),
  }
})

vi.mock('@/lib/audit/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock the Inngest client so we capture { config, trigger, handler } without
// actually starting the runtime.
vi.mock('../../client', () => ({
  inngest: {
    createFunction: (config: unknown, trigger: unknown, handler: unknown) => ({
      config,
      trigger,
      handler,
    }),
  },
}))

// -----------------------------------------------------------------
// Import module under test AFTER mocks; then resolve the mock refs.
// -----------------------------------------------------------------
import { v2LockCleanupCron } from '../v2-lock-cleanup-cron'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { createAdminClient } from '@/lib/supabase/admin'

const mockScan = redis.scan as unknown as ReturnType<typeof vi.fn>
const mockGet = redis.get as unknown as ReturnType<typeof vi.fn>
const mockDel = redis.del as unknown as ReturnType<typeof vi.fn>
const mockEmitLockEvent = emitLockEvent as unknown as ReturnType<typeof vi.fn>
const mockCreateAdminClient = createAdminClient as unknown as ReturnType<typeof vi.fn>

// Chained Supabase builder — each test re-wires via `mockSupabaseEq.mockResolvedValueOnce(...)`.
const mockSupabaseEq = vi.fn()
const mockSupabaseIn = vi.fn()
const mockSupabaseSelect = vi.fn()
const mockSupabaseFrom = vi.fn()

type CronShape = {
  config: { id: string; name: string; retries?: number }
  trigger: { cron: string }
  handler: (ctx: { step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>
}

const fn = v2LockCleanupCron as unknown as CronShape

const mockStep = {
  run: vi.fn(async (_name: string, runner: () => Promise<unknown>) => runner()),
}

beforeEach(() => {
  // resetAllMocks (NOT clearAllMocks) — clears both calls AND queued
  // mockResolvedValueOnce values so tests are fully isolated.
  vi.resetAllMocks()
  // Wire createAdminClient → from() → select() → in() → eq() chain fresh per test.
  mockCreateAdminClient.mockReturnValue({ from: mockSupabaseFrom })
  mockSupabaseFrom.mockReturnValue({ select: mockSupabaseSelect })
  mockSupabaseSelect.mockReturnValue({ in: mockSupabaseIn })
  mockSupabaseIn.mockReturnValue({ eq: mockSupabaseEq })
  // Re-bind the step.run mock so each test can introspect calls.
  mockStep.run.mockImplementation(async (_name: string, runner: () => Promise<unknown>) => runner())
})

describe('v2-lock-cleanup-cron — function declaration shape', () => {
  it('uses cron `TZ=America/Bogota */5 * * * *` schedule', () => {
    expect(fn.trigger).toEqual({ cron: 'TZ=America/Bogota */5 * * * *' })
  })

  it('has id `debounce-v2-lock-cleanup`', () => {
    expect(fn.config.id).toBe('debounce-v2-lock-cleanup')
  })

  it('has bounded retries (retries: 1)', () => {
    expect(fn.config.retries).toBe(1)
  })
})

describe('v2-lock-cleanup-cron — sweep semantics (D-09 verbatim + REVISION B1)', () => {
  it('returns zero counters when no lock:* keys exist', async () => {
    mockScan.mockResolvedValueOnce(['0', []])

    const result = (await fn.handler({ step: mockStep })) as {
      swept: number
      kept: number
      errors: number
      scanned: number
    }

    expect(result).toEqual({
      swept: 0,
      kept: 0,
      errors: 0,
      scanned: 0,
      active_sessions_checked: 0,
    })
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
    expect(mockEmitLockEvent).not.toHaveBeenCalled()
  })

  it('queries agent_sessions with status=`active` (NOT ended_at IS NULL) — REVISION B1 + D-09', async () => {
    mockScan.mockResolvedValueOnce([
      '0',
      ['lock:ws-A:whatsapp:573001112233'],
    ])
    mockGet.mockResolvedValueOnce(
      JSON.stringify({
        holder_uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        started_at: new Date().toISOString(),
        has_sent_anything: false,
      }),
    )
    // Active session matching the lock key — should be KEPT.
    mockSupabaseEq.mockResolvedValueOnce({
      data: [
        {
          id: 'sess-1',
          workspace_id: 'ws-A',
          status: 'active',
          conversation: {
            channel: 'whatsapp',
            phone: '573001112233',
            external_subscriber_id: null,
          },
        },
      ],
      error: null,
    })

    await fn.handler({ step: mockStep })

    expect(mockSupabaseFrom).toHaveBeenCalledWith('agent_sessions')
    expect(mockSupabaseIn).toHaveBeenCalledWith('workspace_id', ['ws-A'])
    expect(mockSupabaseEq).toHaveBeenCalledWith('status', 'active')
  })

  it('sweeps locks WITHOUT a corresponding active session and emits `lock_orphan_swept_by_cron` with reason=`no_active_session`', async () => {
    mockScan.mockResolvedValueOnce([
      '0',
      ['lock:ws-A:whatsapp:573009999999'],
    ])
    mockGet.mockResolvedValueOnce(
      JSON.stringify({
        holder_uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        started_at: new Date().toISOString(),
      }),
    )
    // No active session for that phone.
    mockSupabaseEq.mockResolvedValueOnce({ data: [], error: null })

    const result = (await fn.handler({ step: mockStep })) as { swept: number; kept: number }

    expect(mockDel).toHaveBeenCalledWith('lock:ws-A:whatsapp:573009999999')
    expect(mockEmitLockEvent).toHaveBeenCalledWith(
      'lock_orphan_swept_by_cron',
      expect.objectContaining({
        lock_key: 'lock:ws-A:whatsapp:573009999999',
        reason: 'no_active_session',
        workspaceId: 'ws-A',
        holder_uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      }),
    )
    expect(result.swept).toBe(1)
    expect(result.kept).toBe(0)
  })

  it('sweeps active-but-stale locks (age > MAX_TURN_AGE_S=60s) with reason=`stale_age` (defense-in-depth)', async () => {
    const old = new Date(Date.now() - 120_000).toISOString() // 120s ago
    mockScan.mockResolvedValueOnce([
      '0',
      ['lock:ws-A:whatsapp:573001112233'],
    ])
    mockGet.mockResolvedValueOnce(
      JSON.stringify({
        holder_uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        started_at: old,
      }),
    )
    // Session IS active, BUT the lock has been held for 120s — stale.
    mockSupabaseEq.mockResolvedValueOnce({
      data: [
        {
          id: 'sess-1',
          workspace_id: 'ws-A',
          status: 'active',
          conversation: {
            channel: 'whatsapp',
            phone: '573001112233',
            external_subscriber_id: null,
          },
        },
      ],
      error: null,
    })

    const result = (await fn.handler({ step: mockStep })) as { swept: number; kept: number }

    expect(mockDel).toHaveBeenCalledWith('lock:ws-A:whatsapp:573001112233')
    expect(mockEmitLockEvent).toHaveBeenCalledWith(
      'lock_orphan_swept_by_cron',
      expect.objectContaining({
        lock_key: 'lock:ws-A:whatsapp:573001112233',
        reason: 'stale_age',
        workspaceId: 'ws-A',
      }),
    )
    expect(result.swept).toBe(1)
    expect(result.kept).toBe(0)
  })

  it('keeps active + young locks without DELing or emitting', async () => {
    mockScan.mockResolvedValueOnce([
      '0',
      ['lock:ws-A:whatsapp:573001112233'],
    ])
    mockGet.mockResolvedValueOnce(
      JSON.stringify({
        holder_uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        started_at: new Date().toISOString(), // just acquired
      }),
    )
    mockSupabaseEq.mockResolvedValueOnce({
      data: [
        {
          id: 'sess-1',
          workspace_id: 'ws-A',
          status: 'active',
          conversation: {
            channel: 'whatsapp',
            phone: '573001112233',
            external_subscriber_id: null,
          },
        },
      ],
      error: null,
    })

    const result = (await fn.handler({ step: mockStep })) as { swept: number; kept: number }

    expect(mockDel).not.toHaveBeenCalled()
    expect(mockEmitLockEvent).not.toHaveBeenCalled()
    expect(result.kept).toBe(1)
    expect(result.swept).toBe(0)
  })

  it('sweeps malformed lock keys (cannot be parsed) with reason=`malformed_value`', async () => {
    mockScan.mockResolvedValueOnce([
      '0',
      ['lock:malformed'], // not enough parts — not parsable
    ])
    // No agent_sessions query needed for keys that don't parse (workspaceIds empty).
    // But the cron still runs the query unconditionally if any parsed keys remain.
    mockSupabaseEq.mockResolvedValueOnce({ data: [], error: null })

    const result = (await fn.handler({ step: mockStep })) as { swept: number }

    expect(mockDel).toHaveBeenCalledWith('lock:malformed')
    expect(mockEmitLockEvent).toHaveBeenCalledWith(
      'lock_orphan_swept_by_cron',
      expect.objectContaining({
        lock_key: 'lock:malformed',
        reason: 'malformed_value',
      }),
    )
    expect(result.swept).toBe(1)
  })

  it('uses redis.scan cursor loop (NOT redis.keys) — paginates via cursor', async () => {
    // First call returns batch + non-zero cursor; second call returns empty + cursor=0.
    mockScan
      .mockResolvedValueOnce(['42', ['lock:ws-A:whatsapp:573000000001']])
      .mockResolvedValueOnce(['0', ['lock:ws-A:whatsapp:573000000002']])
    mockGet.mockResolvedValue(
      JSON.stringify({
        holder_uuid: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        started_at: new Date().toISOString(),
      }),
    )
    mockSupabaseEq.mockResolvedValueOnce({ data: [], error: null })

    await fn.handler({ step: mockStep })

    // Two SCAN calls = cursor loop honored.
    expect(mockScan).toHaveBeenCalledTimes(2)
    // First call passed cursor=0; second call passed cursor=42.
    expect(mockScan).toHaveBeenNthCalledWith(1, 0, { match: 'lock:*', count: 200 })
    expect(mockScan).toHaveBeenNthCalledWith(2, 42, { match: 'lock:*', count: 200 })
  })

  it('wraps the sweep work in step.run for Inngest replay safety', async () => {
    mockScan.mockResolvedValueOnce(['0', []])
    await fn.handler({ step: mockStep })
    expect(mockStep.run).toHaveBeenCalledWith('sweep-orphaned-locks', expect.any(Function))
  })

  it('returns errors counter > 0 when agent_sessions query fails (no fail-loud crash)', async () => {
    mockScan.mockResolvedValueOnce(['0', ['lock:ws-A:whatsapp:573001112233']])
    mockSupabaseEq.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    })

    const result = (await fn.handler({ step: mockStep })) as {
      swept: number
      errors: number
      query_error?: string
    }

    expect(result.errors).toBeGreaterThanOrEqual(1)
    expect(result.swept).toBe(0)
    expect(result.query_error).toBe('connection refused')
    // DB error short-circuits before DEL — no DELs should fire.
    expect(mockDel).not.toHaveBeenCalled()
  })
})
