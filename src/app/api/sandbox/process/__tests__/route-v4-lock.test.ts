/**
 * Sandbox process route — HOLDER/FOLLOWER + Regla 6 anchor scenarios.
 *
 * Plan 04 Task 4.2 of standalone `debounce-v2-sandbox-integration`.
 *
 * Validates Plan 02's `src/app/api/sandbox/process/route.ts` v4 branch:
 *   - R1 HOLDER: acquireLock returns LockHandle → v4Engine called with full lock fields.
 *   - R2 FOLLOWER: acquireLock returns null → deferred=true response, NO engine call.
 *   - R3 D-02 Option C lock key: channel='whatsapp' literal + identifier='sandbox-{id}'.
 *   - R4 fail-open: acquireLock throws → emit redis_unavailable_fallback_failed + engine
 *     called with lockHandle=null + HTTP 200 (not 500).
 *   - R5 missing sandboxSessionId → HTTP 400.
 *   - R6/R7/R8/R9 Regla 6 anchors (negative-assertion pattern that tolerates
 *     non-v4 engine throws under mocks — load-bearing claim is "NO
 *     interruption-system-v2 primitive was invoked" when agentId !== v4).
 *   - R10 Pitfall 3 collector wrap: runWithCollector called with a fn that invokes
 *     the v4Engine; ObservabilityCollector constructed with triggerKind='sandbox'.
 *
 * Source: 04-PLAN.md must_haves R1..R10.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE the route import (vi.mock hoists).
// ---------------------------------------------------------------------------

const acquireLockMock = vi.fn()
const pushToPendingMock = vi.fn()
const emitLockEventMock = vi.fn()
const redisSetMock = vi.fn()
const redisGetMock = vi.fn()
const redisDelMock = vi.fn()

vi.mock('@/lib/agents/interruption-system-v2/lock', () => ({
  acquireLock: acquireLockMock,
}))
vi.mock('@/lib/agents/interruption-system-v2/pending', () => ({
  pushToPending: pushToPendingMock,
}))
vi.mock('@/lib/agents/interruption-system-v2/observability', () => ({
  emitLockEvent: emitLockEventMock,
}))
vi.mock('@/lib/agents/interruption-system-v2/redis-client', () => ({
  redis: {
    set: redisSetMock,
    get: redisGetMock,
    del: redisDelMock,
  },
}))

// crypto.randomUUID — deterministic for tests.
vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto')
  return {
    ...actual,
    randomUUID: vi.fn(() => 'test-uuid-1234-5678'),
  }
})

// Engine mocks — one per agent path.
const v4EngineProcessMock = vi.fn()
vi.mock('@/lib/agents/somnio-v4/engine-v4', () => ({
  SomnioV4Engine: vi.fn().mockImplementation(() => ({ processMessage: v4EngineProcessMock })),
}))

const v2EngineProcessMock = vi.fn()
vi.mock('@/lib/agents/somnio-v2/engine-v2', () => ({
  SomnioV2Engine: vi.fn().mockImplementation(() => ({ processMessage: v2EngineProcessMock })),
}))

const v3EngineProcessMock = vi.fn()
vi.mock('@/lib/agents/somnio-v3/engine-v3', () => ({
  SomnioV3Engine: vi.fn().mockImplementation(() => ({ processMessage: v3EngineProcessMock })),
}))

const recompraEngineProcessMock = vi.fn()
vi.mock('@/lib/agents/somnio-recompra/engine-recompra', () => ({
  SomnioRecompraEngine: vi.fn().mockImplementation(() => ({ processMessage: recompraEngineProcessMock })),
}))

// UnifiedEngine — v1 default path.
const unifiedEngineProcessMock = vi.fn()
vi.mock('@/lib/agents/engine/unified-engine', () => ({
  UnifiedEngine: vi.fn().mockImplementation(() => ({ processMessage: unifiedEngineProcessMock })),
}))

// createSandboxAdapters — returns minimal stub; UnifiedEngine is fully mocked.
vi.mock('@/lib/agents/engine-adapters/sandbox', () => ({
  createSandboxAdapters: vi.fn(() => ({})),
}))

// Observability collector + runWithCollector pass-through.
const recordEventMock = vi.fn()
const ObservabilityCollectorCtorMock = vi.fn().mockImplementation(() => ({
  recordEvent: recordEventMock,
}))
const runWithCollectorMock = vi.fn((_collector: unknown, fn: () => unknown) => fn())
vi.mock('@/lib/observability', () => ({
  runWithCollector: runWithCollectorMock,
  ObservabilityCollector: ObservabilityCollectorCtorMock,
}))

// Supabase auth — always authenticated.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'test-user-id' } } }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'admin' } }),
    })),
  })),
}))

// initializeTools + side-effect imports — no-op.
vi.mock('@/lib/tools/init', () => ({ initializeTools: vi.fn() }))
vi.mock('@/lib/agents/somnio', () => ({}))
vi.mock('@/lib/agents/crm', () => ({}))

// ---------------------------------------------------------------------------
// Import POST handler AFTER all mocks.
// ---------------------------------------------------------------------------

import { POST } from '@/app/api/sandbox/process/route'

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3020/api/sandbox/process', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeV4Body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    agentId: 'somnio-sales-v4',
    message: 'hello',
    state: {
      currentMode: 'initial',
      intentsVistos: [],
      templatesEnviados: [],
      datosCapturados: {},
      packSeleccionado: null,
      accionesEjecutadas: [],
    },
    history: [],
    turnNumber: 1,
    workspaceId: 'ws-test-1',
    sandboxSessionId: 'abc',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Default mock behavior in beforeEach.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  acquireLockMock.mockResolvedValue(null)
  pushToPendingMock.mockResolvedValue({ exactJson: '{"content":"hello"}', pendingListLength: 1 })
  v4EngineProcessMock.mockResolvedValue({
    success: true,
    messages: ['v4 reply'],
    newState: {},
    debugTurn: {},
  })
  v2EngineProcessMock.mockResolvedValue({ success: true, messages: ['v2 reply'] })
  v3EngineProcessMock.mockResolvedValue({ success: true, messages: ['v3 reply'] })
  recompraEngineProcessMock.mockResolvedValue({ success: true, messages: ['recompra reply'] })
  unifiedEngineProcessMock.mockResolvedValue({
    success: true,
    messages: ['v1 reply'],
    newState: {},
    debugTurn: {},
  })
  runWithCollectorMock.mockImplementation((_c, fn) => fn())
})

// ===========================================================================
// NDJSON stream helper (post-streaming refactor 2026-05-27).
// The route now returns application/x-ndjson with one JSON line per chunk.
// Tests must drain the stream before asserting on emits / engine calls
// because the route's stream.start callback runs asynchronously AFTER the
// Response object is returned.
// ===========================================================================
async function drainNdjsonStream(resp: Response): Promise<Record<string, unknown>[]> {
  if (!resp.body) return []
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const chunks: Record<string, unknown>[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        chunks.push(JSON.parse(line))
      } catch {
        // skip malformed lines
      }
    }
  }
  if (buffer.trim()) {
    try {
      chunks.push(JSON.parse(buffer))
    } catch {
      // skip
    }
  }
  return chunks
}

// ===========================================================================
// R1..R10 scenarios
// ===========================================================================

describe('POST /api/sandbox/process — R1..R10 v4 lock branch + Regla 6 anchors', () => {
  it('R1 HOLDER: acquireLock returns LockHandle → SomnioV4Engine called with full lock fields', async () => {
    acquireLockMock.mockResolvedValueOnce({
      key: 'lock:ws-test-1:whatsapp:sandbox-abc',
      holderUuid: 'h-uuid-1',
      startedAt: '2026-05-27T00:00:00Z',
    })

    const resp = await POST(makeReq(makeV4Body()))
    const chunks = await drainNdjsonStream(resp)

    expect(resp.status).toBe(200)
    // HOLDER stream emits 'message' chunks (one per template the engine
    // produced) plus a final 'complete' chunk. No 'deferred' chunk.
    expect(chunks.some((c) => c.type === 'deferred')).toBe(false)
    const completeChunk = chunks.find((c) => c.type === 'complete')
    expect(completeChunk).toBeDefined()
    expect(completeChunk!.success).toBe(true)

    // Engine called exactly once with full lock fields.
    expect(v4EngineProcessMock).toHaveBeenCalledTimes(1)
    const engineInput = v4EngineProcessMock.mock.calls[0][0]
    expect(engineInput.lockHandle).toEqual(
      expect.objectContaining({ holderUuid: 'h-uuid-1' }),
    )
    expect(engineInput.lockChannel).toBe('whatsapp')
    expect(engineInput.lockIdentifier).toBe('sandbox-abc')
    expect(engineInput.sandboxSessionId).toBe('abc')
    expect(engineInput.ownPendingEntryJson).toBe('{"content":"hello"}')

    // pushToPending called for HOLDER too (engine consumes ownPendingEntryJson).
    expect(pushToPendingMock).toHaveBeenCalled()

    // lock_acquired emitted.
    const acquiredEmits = emitLockEventMock.mock.calls.filter(
      (c) => c[0] === 'lock_acquired',
    )
    expect(acquiredEmits.length).toBeGreaterThanOrEqual(1)
  })

  // =========================================================================
  // R2 FOLLOWER
  // =========================================================================
  it('R2 FOLLOWER: acquireLock returns null → deferred=true chunk in stream, engine NOT called', async () => {
    acquireLockMock.mockResolvedValueOnce(null)
    pushToPendingMock.mockResolvedValueOnce({
      exactJson: '{"content":"hello"}',
      pendingListLength: 2,
    })

    const resp = await POST(makeReq(makeV4Body()))
    const chunks = await drainNdjsonStream(resp)

    expect(resp.status).toBe(200)
    const deferredChunk = chunks.find((c) => c.type === 'deferred')
    expect(deferredChunk).toEqual({
      type: 'deferred',
      success: true,
      deferred: true,
      sandboxSessionId: 'abc',
      reason: 'follower_appended_to_pending',
      pendingListLength: 2,
    })

    // Engine NOT invoked.
    expect(v4EngineProcessMock).not.toHaveBeenCalled()

    // pushToPending was called.
    expect(pushToPendingMock).toHaveBeenCalled()

    // Interrupt key written with ex:60 + key shape matching the FOLLOWER path.
    expect(redisSetMock).toHaveBeenCalledWith(
      expect.stringMatching(/^interrupt:.*:whatsapp:sandbox-abc$/),
      expect.any(String),
      expect.objectContaining({ ex: 60 }),
    )

    // Follower events emitted.
    const followerEmits = emitLockEventMock.mock.calls.filter(
      (c) => c[0] === 'lock_acquire_failed_follower',
    )
    expect(followerEmits.length).toBeGreaterThanOrEqual(1)
    const interruptEmits = emitLockEventMock.mock.calls.filter(
      (c) => c[0] === 'interrupt_written',
    )
    expect(interruptEmits.length).toBeGreaterThanOrEqual(1)
  })

  // =========================================================================
  // R3 — D-02 Option C lock key shape
  // =========================================================================
  it('R3 D-02 Option C lock key shape: channel literal "whatsapp", identifier "sandbox-{id}"', async () => {
    acquireLockMock.mockResolvedValueOnce({
      key: 'lock:ws-test-1:whatsapp:sandbox-abc',
      holderUuid: 'h1',
      startedAt: '2026-05-27T00:00:00Z',
    })

    await POST(makeReq(makeV4Body()))

    expect(acquireLockMock).toHaveBeenCalledTimes(1)
    const callArgs = acquireLockMock.mock.calls[0]
    // [workspaceId, channel, identifier] per acquireLock(wsId, lockChannel, lockIdentifier).
    expect(callArgs[1]).toBe('whatsapp')  // LITERAL — never 'sandbox'
    expect(callArgs[2]).toMatch(/^sandbox-/)
    expect(callArgs[2]).toBe('sandbox-abc')
  })

  // =========================================================================
  // R4 — fail-open: acquireLock throws → emit + engine called with lockHandle=null
  // =========================================================================
  it('R4 fail-open: acquireLock throws → emit redis_unavailable_fallback_failed + engine called with lockHandle=null + HTTP 200', async () => {
    acquireLockMock.mockRejectedValueOnce(new Error('Redis down'))

    const resp = await POST(makeReq(makeV4Body()))
    // Drain stream so the stream.start callback (which contains the
    // fail-open emit + engine call) finishes before assertions.
    await drainNdjsonStream(resp)

    expect(resp.status).toBe(200)

    // Fail-open event emitted.
    const failEmits = emitLockEventMock.mock.calls.filter(
      (c) => c[0] === 'redis_unavailable_fallback_failed',
    )
    expect(failEmits.length).toBeGreaterThanOrEqual(1)

    // Engine called with lockHandle=null (skip-guarded path).
    expect(v4EngineProcessMock).toHaveBeenCalledTimes(1)
    const engineInput = v4EngineProcessMock.mock.calls[0][0]
    expect(engineInput.lockHandle).toBeNull()
  })

  // =========================================================================
  // R5 — sandboxSessionId missing → 400
  // =========================================================================
  it('R5 sandboxSessionId missing: HTTP 400 with proper error message', async () => {
    const body = makeV4Body()
    delete body.sandboxSessionId

    const resp = await POST(makeReq(body))
    const json = await resp.json()

    expect(resp.status).toBe(400)
    expect(json).toEqual({ error: 'sandboxSessionId required for v4 sandbox' })

    // No lock primitives invoked.
    expect(acquireLockMock).not.toHaveBeenCalled()
    expect(pushToPendingMock).not.toHaveBeenCalled()
    expect(emitLockEventMock).not.toHaveBeenCalled()
    expect(v4EngineProcessMock).not.toHaveBeenCalled()
  })

  // =========================================================================
  // R6 — Regla 6 anchor v3 (BLOCKER 2 negative-assertion pattern)
  // =========================================================================
  it('R6 Regla 6 anchor v3: agentId=somnio-sales-v3 → ZERO interruption-system-v2 primitive invocations', async () => {
    // Negative-assertion pattern: we accept non-v3 engine instantiation failures
    // under test mocks — the assertion is that NO interruption-system-v2
    // primitive was invoked, which proves Regla 6 byte-identity at the API
    // entrypoint when agentId !== 'somnio-sales-v4'.
    try {
      await POST(makeReq({
        agentId: 'somnio-sales-v3',
        message: 'hi',
        state: {
          currentMode: 'initial',
          intentsVistos: [],
          templatesEnviados: [],
          datosCapturados: {},
          packSeleccionado: null,
          accionesEjecutadas: [],
        },
        history: [],
        turnNumber: 1,
        workspaceId: 'ws-test-1',
      }))
    } catch { /* expected — engine may fail under mock */ }
    expect(acquireLockMock).not.toHaveBeenCalled()
    expect(pushToPendingMock).not.toHaveBeenCalled()
    expect(emitLockEventMock).not.toHaveBeenCalled()
  })

  // =========================================================================
  // R7 — Regla 6 anchor v2
  // =========================================================================
  it('R7 Regla 6 anchor v2: agentId=somnio-sales-v2 → ZERO interruption-system-v2 primitive invocations', async () => {
    try {
      await POST(makeReq({
        agentId: 'somnio-sales-v2',
        message: 'hi',
        state: {
          currentMode: 'initial',
          intentsVistos: [],
          templatesEnviados: [],
          datosCapturados: {},
          packSeleccionado: null,
          accionesEjecutadas: [],
        },
        history: [],
        turnNumber: 1,
        workspaceId: 'ws-test-1',
      }))
    } catch { /* expected — engine may fail under mock */ }
    expect(acquireLockMock).not.toHaveBeenCalled()
    expect(pushToPendingMock).not.toHaveBeenCalled()
    expect(emitLockEventMock).not.toHaveBeenCalled()
  })

  // =========================================================================
  // R8 — Regla 6 anchor recompra
  // =========================================================================
  it('R8 Regla 6 anchor recompra: agentId=somnio-recompra-v1 → ZERO interruption-system-v2 primitive invocations', async () => {
    try {
      await POST(makeReq({
        agentId: 'somnio-recompra-v1',
        message: 'hi',
        state: {
          currentMode: 'initial',
          intentsVistos: [],
          templatesEnviados: [],
          datosCapturados: {},
          packSeleccionado: null,
          accionesEjecutadas: [],
        },
        history: [],
        turnNumber: 1,
        workspaceId: 'ws-test-1',
      }))
    } catch { /* expected — engine may fail under mock */ }
    expect(acquireLockMock).not.toHaveBeenCalled()
    expect(pushToPendingMock).not.toHaveBeenCalled()
    expect(emitLockEventMock).not.toHaveBeenCalled()
  })

  // =========================================================================
  // R9 — Regla 6 anchor v1 default (no agentId)
  // =========================================================================
  it('R9 Regla 6 anchor v1 default: no agentId → ZERO interruption-system-v2 primitive invocations', async () => {
    // BLOCKER 2 negative-assertion pattern: load-bearing claim is the negative
    // assertion that NO interruption-system-v2 primitive was invoked when
    // agentId is not v4. The wrapped try/catch is defensive insurance against
    // unexpected throws from the v1 import/branch chain under mocks.
    try {
      await POST(makeReq({
        message: 'hi',
        state: {
          currentMode: 'initial',
          intentsVistos: [],
          templatesEnviados: [],
          datosCapturados: {},
          packSeleccionado: null,
          accionesEjecutadas: [],
        },
        history: [],
        turnNumber: 1,
        workspaceId: 'ws-test-1',
      }))
    } catch { /* expected — engine may fail under mock */ }
    expect(acquireLockMock).not.toHaveBeenCalled()
    expect(pushToPendingMock).not.toHaveBeenCalled()
    expect(emitLockEventMock).not.toHaveBeenCalled()
  })

  // =========================================================================
  // R10 — Pitfall 3 collector wrap
  // =========================================================================
  it('R10 Pitfall 3 collector wrap: runWithCollector called with fn that invokes engine; ObservabilityCollector ctor with triggerKind=sandbox', async () => {
    acquireLockMock.mockResolvedValueOnce({
      key: 'lock:ws-test-1:whatsapp:sandbox-abc',
      holderUuid: 'h1',
      startedAt: '2026-05-27T00:00:00Z',
    })

    const resp = await POST(makeReq(makeV4Body()))
    // Drain so the stream.start callback (which contains runWithCollector
    // + engine invocation) finishes before assertions.
    await drainNdjsonStream(resp)

    // runWithCollector called exactly once with (collector, fn) pair.
    expect(runWithCollectorMock).toHaveBeenCalledTimes(1)
    const [collectorArg, fnArg] = runWithCollectorMock.mock.calls[0]
    expect(collectorArg).toBeDefined()
    expect(typeof fnArg).toBe('function')

    // ObservabilityCollector instantiated with triggerKind='sandbox' (Task 2.0
    // extended the TriggerKind union with this literal — WARNING 1 fix).
    expect(ObservabilityCollectorCtorMock).toHaveBeenCalledTimes(1)
    const ctorArg = ObservabilityCollectorCtorMock.mock.calls[0][0]
    expect(ctorArg).toEqual(
      expect.objectContaining({
        triggerKind: 'sandbox',
        agentId: 'somnio-sales-v4',
        conversationId: 'abc',
        workspaceId: 'ws-test-1',
      }),
    )

    // The wrapped function actually invoked the engine.
    expect(v4EngineProcessMock).toHaveBeenCalledTimes(1)
  })
})
