/**
 * Engine v4 lock-lifecycle scenarios — Plan 04 of standalone
 * `debounce-v2-sandbox-integration` (Task 4.1).
 *
 * Validates the Plan 01 scaffolding in `src/lib/agents/somnio-v4/engine-v4.ts`:
 *   - outer try/finally con heartbeat lifecycle (Pitfall 6 — outside while)
 *   - while(shouldRestart) restart-loop
 *   - 3 Path A restart sites (CKPT-0, agent-discriminator, CKPT-6)
 *   - CKPT-7.N synthetic per-template (NO restart — Path A on i=0, Path B on i>0)
 *   - Pitfall 5 sandbox-result write BEFORE finally release
 *   - LostLockError catch → zombie_lambda_exit + V4_ZOMBIE_LAMBDA_EXIT return
 *   - lockHandle null fail-open (no event emits when no lock)
 *
 * Mirrors the proven pattern from `interruption-system-v2/__tests__/restart-loop.test.ts`
 * (mock-redis via vi.mock factory closure + emittedEvents capture via
 * vi.mock('@/lib/observability') + canned V4AgentOutput per iteration via
 * `vi.mock('@/lib/agents/somnio-v4/somnio-v4-agent')`).
 *
 * E5/E6/E7 use a controllable `checkpointOverride` toggle that lets the test
 * inject per-ckptId behavior WITHOUT vi.resetModules() / vi.doMock pairs (those
 * OOM the worker on the v4 module tree). The override is a let-binding read
 * inside a single vi.mock factory; tests set it in `beforeEach` / inside `it`
 * and reset to null before completion. Documented in 04-SUMMARY.md.
 *
 * Source: 04-PLAN.md (must_haves E1..E8) + 01-SUMMARY.md (line numbers of Plan 01).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'crypto'
import type { MockRedis } from '../../interruption-system-v2/__tests__/_helpers/mock-redis'
import type { V4AgentInput, V4AgentOutput } from '../types'
import type { SandboxState } from '@/lib/sandbox/types'

// ---------------------------------------------------------------------------
// vi.mock hoisting block — declared BEFORE any imports of the system under
// test. Factory closure pattern (await import inside the factory) avoids the
// uninitialized-binding hoisting trap. Source: e2e-scenarios.test.ts.
// ---------------------------------------------------------------------------

vi.mock('@/lib/agents/interruption-system-v2/redis-client', async () => {
  const { createMockRedis } = await import(
    '@/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis'
  )
  const instance = createMockRedis()
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
  runWithCollector: (_c: unknown, fn: () => unknown) => fn(),
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

// Mock the somnio-v4 agent processMessage — canned outputs per iteration.
const agentMockFn = vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()
vi.mock('@/lib/agents/somnio-v4/somnio-v4-agent', () => ({
  processMessage: (input: V4AgentInput) => agentMockFn(input),
}))

// ---------------------------------------------------------------------------
// Checkpoint helper mock — controllable per-test via a closure-bound override.
// Default: behavior mimics the real checkpoint (reads interrupt key from
// mock-redis store; returns interrupted=true if set, else proceed=true).
// Tests override via the `checkpointOverride` setter to surgically simulate
// CKPT-7.N interrupts or LostLockError without resetModules/doMock pairs
// (which OOM the worker on the v4 module tree).
// ---------------------------------------------------------------------------

interface CheckpointResultMock {
  proceed: boolean
  lostLock?: boolean
  interrupted?: { pendingListLength: number } | false
}

type CheckpointOverride = (
  ckptId: string,
  opts: { templateIndex?: number; hasSentAnything?: boolean } | undefined,
) => CheckpointResultMock | null

const checkpointOverrideRef: { current: CheckpointOverride | null } = { current: null }
function setCheckpointOverride(fn: CheckpointOverride | null): void {
  checkpointOverrideRef.current = fn
}

vi.mock('@/lib/agents/interruption-system-v2/checkpoints', () => ({
  checkpoint: vi.fn(
    async (
      ckptId: string,
      _h: unknown,
      ws: unknown,
      ch: unknown,
      id: unknown,
      opts?: { templateIndex?: number; hasSentAnything?: boolean },
    ) => {
      if (checkpointOverrideRef.current) {
        const r = checkpointOverrideRef.current(ckptId, opts)
        if (r) return r
      }
      // Default behavior: peek into mock-redis for an interrupt key. If
      // present, return interrupted (and clear it so cascading checkpoints
      // don't re-fire from the same staged key). Otherwise proceed.
      if (!mockRedis) return { proceed: true, lostLock: false }
      const interruptKey = `interrupt:${ws}:${ch}:${id}`
      const all = mockRedis.__getAll()
      const val = all.store.get(interruptKey)
      if (val) {
        all.store.delete(interruptKey)
        all.ttls.delete(interruptKey)
        const pendingKey = `pending:${ws}:${ch}:${id}`
        const pendingLen = (all.lists.get(pendingKey) ?? []).length
        return { proceed: false, lostLock: false, interrupted: { pendingListLength: pendingLen } }
      }
      return { proceed: true, lostLock: false }
    },
  ),
}))

// ---------------------------------------------------------------------------
// Test fixture imports (post-mock so the SUT picks up the mocked modules).
// ---------------------------------------------------------------------------

import { SomnioV4Engine, type V4EngineInput } from '../engine-v4'
import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'
import { pushToPending } from '@/lib/agents/interruption-system-v2/pending'

// ---------------------------------------------------------------------------
// Module-level shared mock state — reset in beforeEach.
// ---------------------------------------------------------------------------

let mockRedis: MockRedis

const WS = 'ws-test-1'
const CHANNEL = 'whatsapp' as const

beforeEach(async () => {
  const mod = (await import(
    '@/lib/agents/interruption-system-v2/redis-client'
  )) as unknown as { __mock: MockRedis }
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
  agentMockFn.mockReset()
  setCheckpointOverride(null)

  // Real multi() impl that actually clears list keys (same pattern as
  // restart-loop.test.ts — the shared helper's multi() is a no-op chain stub).
  const allMaps = mockRedis.__getAll()
  interface MultiTx {
    del: (key: string) => MultiTx
    exec: () => Promise<unknown[]>
  }
  mockRedis.multi.mockImplementation(() => {
    const keysToDelete: string[] = []
    const tx: MultiTx = {
      del: vi.fn((key: string): MultiTx => {
        keysToDelete.push(key)
        return tx
      }),
      exec: vi.fn(async (): Promise<unknown[]> => {
        for (const key of keysToDelete) {
          allMaps.lists.delete(key)
          allMaps.store.delete(key)
          allMaps.ttls.delete(key)
        }
        return []
      }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tx as any
  })
})

// ---------------------------------------------------------------------------
// Factory helpers.
// ---------------------------------------------------------------------------

function makeBaseState(): SandboxState {
  return {
    currentMode: 'initial',
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
  }
}

async function makeBaseInput(
  overrides: Partial<V4EngineInput> = {},
  identifier = 'sandbox-test-abc',
  withLock = true,
): Promise<V4EngineInput> {
  const base: V4EngineInput = {
    message: 'msg1',
    state: makeBaseState(),
    history: [],
    turnNumber: 1,
    workspaceId: WS,
    ...overrides,
  }
  if (withLock) {
    const lockHandle = await acquireLock(WS, CHANNEL, identifier)
    expect(lockHandle).not.toBeNull()
    const sandboxSessionId = identifier.startsWith('sandbox-')
      ? identifier.replace(/^sandbox-/, '')
      : identifier
    return {
      ...base,
      lockHandle,
      lockChannel: CHANNEL,
      lockIdentifier: identifier,
      ownPendingEntryJson: null,
      sandboxSessionId,
    }
  }
  return base
}

function makeAgentOutputSuccess(
  messages: string[],
  totalTokens: number,
): V4AgentOutput {
  return {
    success: true,
    messages,
    templates: [],
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
    totalTokens,
    shouldCreateOrder: false,
    timerSignals: [],
  }
}

function makeAgentOutputInterrupt(totalTokens: number, ckpt = '3_post_tooling'): V4AgentOutput {
  return {
    success: false,
    messages: [],
    errorMessage: `interrupted_at_ckpt_${ckpt}`,
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
    totalTokens,
    shouldCreateOrder: false,
    timerSignals: [],
  }
}

// ===========================================================================
// E1..E8 scenarios
// ===========================================================================

describe('SomnioV4Engine lock-lifecycle E1..E8 (Plan 04 D-04 + D-06 + D-14)', () => {
  it('E1 happy path: lockHandle present → heartbeat + ckpt + lock_released_normal + sandbox-result write', async () => {
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['reply'], 100))

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput()
    const sandboxResultSpy = vi.spyOn(mockRedis, 'set')

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    expect(result.messages).toEqual(['reply'])
    expect(result.debugTurn?.tokens?.tokensUsed).toBe(100)

    // lock_released_normal emitted exactly once.
    const releases = emittedEvents.filter((e) => e.label === 'lock_released_normal')
    expect(releases).toHaveLength(1)

    // No interrupt/abort events on happy path.
    const aborts = emittedEvents.filter(
      (e) =>
        e.label === 'msg_aborted_path_a_combined' ||
        e.label === 'msg_aborted_path_b_solo' ||
        e.label === 'zombie_lambda_exit',
    )
    expect(aborts).toHaveLength(0)

    // Pitfall 5: sandbox-result:{id} was written BEFORE release.
    const sandboxResultCall = sandboxResultSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('sandbox-result:'),
    )
    expect(sandboxResultCall).toBeDefined()
    expect(sandboxResultCall![0]).toBe(`sandbox-result:${input.sandboxSessionId}`)
    expect(sandboxResultCall![2]).toEqual(expect.objectContaining({ ex: 60 }))

    // Agent invoked exactly once.
    expect(agentMockFn).toHaveBeenCalledTimes(1)
  })

  // =========================================================================
  // E2 — CKPT-0 interrupt + combine + restart
  // =========================================================================
  it('E2 CKPT-0 interrupt: pre-staged pending + interrupt key → drain + combine chronologically + restart iter 2', async () => {
    const IDENT = 'sandbox-test-e2'

    // Iter 1: agent NEVER called because CKPT-0 catches the interrupt first.
    // Iter 2: agent called with combined message → success.
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['combined reply'], 80))

    // Stage msg2 in pending list + interrupt key BEFORE engine runs.
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })
    await mockRedis.set(
      `interrupt:${WS}:${CHANNEL}:${IDENT}`,
      'm2',
      { ex: 60 },
    )

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput({ message: 'msg1' }, IDENT)

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    expect(result.messages).toEqual(['combined reply'])

    // Exactly ONE msg_aborted_path_a_combined with restart_iteration=1.
    const pathARestarts = emittedEvents.filter(
      (e) =>
        e.label === 'msg_aborted_path_a_combined' &&
        e.payload.restart_iteration === 1,
    )
    expect(pathARestarts).toHaveLength(1)
    expect(pathARestarts[0].payload.at_step).toBe('ckpt_0_post_acquire')

    // Exactly ONE pending_list_combined with restart_iteration=1.
    const pendingCombined = emittedEvents.filter(
      (e) =>
        e.label === 'pending_list_combined' &&
        e.payload.restart_iteration === 1,
    )
    expect(pendingCombined).toHaveLength(1)

    // Agent invoked ONCE (iter 2 only — iter 1 was caught at CKPT-0).
    expect(agentMockFn).toHaveBeenCalledTimes(1)
    const iter2Input = agentMockFn.mock.calls[0][0]
    // Chronological order (commit 494d3bb4): priorMsg FIRST, pending APPENDED.
    expect(iter2Input.message).toBe('msg1\nmsg2')

    // Single lock lifetime (Pitfall 6 — heartbeat OUTSIDE while loop).
    const releaseCount = emittedEvents.filter((e) => e.label === 'lock_released_normal').length
    expect(releaseCount).toBe(1)
  })

  // =========================================================================
  // E3 — Agent-discriminator restart: tokens accumulate across iterations
  // =========================================================================
  it('E3 agent-discriminator: iter 1 returns interrupted_at_ckpt_3 → iter 2 success; tokens accumulate (50+80=130)', async () => {
    const IDENT = 'sandbox-test-e3'

    // Pre-stage msg2 so the discriminator branch can drain on iter 1.
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })

    // Iter 1: agent returns interrupt. Iter 2: success.
    agentMockFn.mockResolvedValueOnce(makeAgentOutputInterrupt(50, '3_post_tooling'))
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['combined reply'], 80))

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput({ message: 'msg1' }, IDENT)

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    // Token accumulator across restarts: 50 + 80 = 130.
    expect(result.debugTurn?.tokens?.tokensUsed).toBe(130)

    // Exactly ONE Path A combine event from the agent-discriminator branch.
    const pathARestarts = emittedEvents.filter(
      (e) =>
        e.label === 'msg_aborted_path_a_combined' &&
        e.payload.restart_iteration === 1,
    )
    expect(pathARestarts).toHaveLength(1)
    expect(pathARestarts[0].payload.at_step).toBe('interrupted_at_ckpt_3_post_tooling')

    // Agent invoked twice (one interrupt + one success).
    expect(agentMockFn).toHaveBeenCalledTimes(2)
    const iter2Input = agentMockFn.mock.calls[1][0]
    expect(iter2Input.message).toBe('msg1\nmsg2')

    // Single lock lifetime.
    const releaseCount = emittedEvents.filter((e) => e.label === 'lock_released_normal').length
    expect(releaseCount).toBe(1)
  })

  // =========================================================================
  // E4 — CKPT-6 interrupt: agent stages msg2+interrupt during call
  // =========================================================================
  it('E4 CKPT-6 interrupt: agent stages msg2+interrupt during call → CKPT-6 catches → restart', async () => {
    const IDENT = 'sandbox-test-e4'

    // Use override to enforce: CKPT-0 pass; agent runs; discriminator pass
    // (agent returns success not interrupt — that requires CKPT-6 specifically
    // to catch). CKPT-6 returns interrupted on iter 1, proceed on iter 2.
    let ck6CallCount = 0
    setCheckpointOverride((ckptId) => {
      if (ckptId === 'ckpt_6_pre_send_loop') {
        ck6CallCount++
        if (ck6CallCount === 1) {
          return { proceed: false, lostLock: false, interrupted: { pendingListLength: 1 } }
        }
        return { proceed: true, lostLock: false }
      }
      return null  // fall through to default behavior for other ckpts
    })

    // Iter 1: agent stages msg2 BEFORE returning. CKPT-6 (which fires AFTER
    // agent return) catches via our override. Engine drains pending + restarts.
    agentMockFn.mockImplementationOnce(async () => {
      await pushToPending(WS, CHANNEL, IDENT, {
        entry_uuid: randomUUID(),
        content: 'msg2',
        received_at: new Date().toISOString(),
        msg_id: 'm2',
      })
      return makeAgentOutputSuccess(['iter1 reply (will be discarded)'], 50)
    })
    // Iter 2: success.
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['combined reply'], 80))

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput({ message: 'msg1' }, IDENT)

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    expect(result.messages).toEqual(['combined reply'])
    // Tokens accumulate (50 iter1 + 80 iter2).
    expect(result.debugTurn?.tokens?.tokensUsed).toBe(130)

    // The CKPT-6 emit has at_step='ckpt_6_pre_send_loop'.
    const ck6Aborts = emittedEvents.filter(
      (e) =>
        e.label === 'msg_aborted_path_a_combined' &&
        e.payload.at_step === 'ckpt_6_pre_send_loop',
    )
    expect(ck6Aborts).toHaveLength(1)
    expect(ck6Aborts[0].payload.restart_iteration).toBe(1)

    // Agent invoked twice.
    expect(agentMockFn).toHaveBeenCalledTimes(2)

    const releaseCount = emittedEvents.filter((e) => e.label === 'lock_released_normal').length
    expect(releaseCount).toBe(1)
  })

  // =========================================================================
  // E5 — CKPT-7.1 first-template interrupt (i=0) → Path A combine + restart
  // (nothing sent yet this iteration, so combine prior + new and re-run).
  // =========================================================================
  it('E5 CKPT-7.1 first-template (i=0) interrupt: Path A combine prior+new, restart, combined reply', async () => {
    const IDENT = 'sandbox-test-e5'
    // Stage the interrupting message in pending (NO interrupt key → CKPT-0/6
    // default-proceed; only the forced CKPT-7.0 override fires the interrupt).
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })

    let ck7Fired = false
    setCheckpointOverride((ckptId, opts) => {
      if (ckptId === 'ckpt_7_pre_template' && opts?.templateIndex === 0 && !ck7Fired) {
        ck7Fired = true
        return { proceed: false, lostLock: false, interrupted: { pendingListLength: 1 } }
      }
      return null
    })

    // Iter 1 agent output is discarded (interrupt at CKPT-7.0 before any send).
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['msg-A', 'msg-B'], 50))
    // Iter 2 runs with combined message → sends combined reply.
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['combined reply'], 80))

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput({ message: 'msg1' }, IDENT)

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    // Nothing sent in iter 1 (i=0 break) → result is iter 2's combined reply.
    expect(result.messages).toEqual(['combined reply'])

    // Path A combine at CKPT-7.0 WITH restart_iteration=1.
    const path_a = emittedEvents.filter(
      (e) =>
        e.label === 'msg_aborted_path_a_combined' &&
        e.payload.at_step === 'ckpt_7_pre_template_0',
    )
    expect(path_a).toHaveLength(1)
    expect(path_a[0].payload.restart_iteration).toBe(1)

    // Iter 2 invoked with combined message (prior first, pending appended).
    expect(agentMockFn).toHaveBeenCalledTimes(2)
    expect(agentMockFn.mock.calls[1][0].message).toBe('msg1\nmsg2')

    const releaseCount = emittedEvents.filter((e) => e.label === 'lock_released_normal').length
    expect(releaseCount).toBe(1)
  })

  // =========================================================================
  // E6 — CKPT-7.N mid-send interrupt (i>0) WITH a pending message → Path B:
  // keep what was sent, abort the rest, and ANSWER the interrupting message.
  // =========================================================================
  it('E6 CKPT-7.N mid-send (i>0) interrupt with pending: keeps sent template, answers the new message', async () => {
    const IDENT = 'sandbox-test-e6'
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })

    let ck7Fired = false
    setCheckpointOverride((ckptId, opts) => {
      if (ckptId === 'ckpt_7_pre_template' && opts?.templateIndex === 1 && !ck7Fired) {
        ck7Fired = true
        return { proceed: false, lostLock: false, interrupted: { pendingListLength: 1 } }
      }
      return null
    })

    // Iter 1: agent for msg1 → ['msg-A','msg-B']; msg-A is sent, then CKPT-7.1
    // aborts. Iter 2: agent for the new message 'msg2' → ['precio reply'].
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['msg-A', 'msg-B'], 50))
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['precio reply'], 80))

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput({ message: 'msg1' }, IDENT)

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    // Already-sent template preserved + the new message's answer appended.
    expect(result.messages).toEqual(['msg-A', 'precio reply'])

    // Path B solo at CKPT-7.1 (templates_sent_before_abort=1).
    const path_b = emittedEvents.filter((e) => e.label === 'msg_aborted_path_b_solo')
    expect(path_b).toHaveLength(1)
    expect(path_b[0].payload.templates_sent_before_abort).toBe(1)

    // Path B reprocess emits pending_list_combined with restart_iteration=1.
    const pendingCombined = emittedEvents.filter(
      (e) =>
        e.label === 'pending_list_combined' &&
        e.payload.at_step === 'ckpt_7_pre_template_1',
    )
    expect(pendingCombined).toHaveLength(1)

    // Iter 2 invoked with the NEW message ONLY (prior msg already answered).
    expect(agentMockFn).toHaveBeenCalledTimes(2)
    expect(agentMockFn.mock.calls[1][0].message).toBe('msg2')

    const releaseCount = emittedEvents.filter((e) => e.label === 'lock_released_normal').length
    expect(releaseCount).toBe(1)
  })

  // =========================================================================
  // E6b — CKPT-7.N mid-send interrupt (i>0) with NO pending message → Path B
  // aborts the rest and does NOT restart (nothing new to answer).
  // =========================================================================
  it('E6b CKPT-7.N mid-send (i>0) interrupt with empty pending: keeps sent template, NO restart', async () => {
    setCheckpointOverride((ckptId, opts) => {
      if (ckptId === 'ckpt_7_pre_template' && opts?.templateIndex === 1) {
        return { proceed: false, lostLock: false, interrupted: { pendingListLength: 0 } }
      }
      return null
    })

    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['msg-A', 'msg-B'], 100))

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput({ message: 'msg1' }, 'sandbox-test-e6b')

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    // Only first template sent; second aborted; no new message to answer.
    expect(result.messages).toEqual(['msg-A'])

    const path_b = emittedEvents.filter((e) => e.label === 'msg_aborted_path_b_solo')
    expect(path_b).toHaveLength(1)
    expect(path_b[0].payload.templates_sent_before_abort).toBe(1)

    // No restart (empty pending) → agent invoked exactly once.
    expect(agentMockFn).toHaveBeenCalledTimes(1)
  })

  // =========================================================================
  // E7 — LostLockError → V4_ZOMBIE_LAMBDA_EXIT + sandbox-result still written
  // =========================================================================
  it('E7 LostLockError: checkpoint returns lostLock=true → zombie_lambda_exit emitted + V4_ZOMBIE_LAMBDA_EXIT returned + sandbox-result still written', async () => {
    setCheckpointOverride(() => ({ proceed: false, lostLock: true, interrupted: false }))

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput({ message: 'msg1' }, 'sandbox-test-e7')
    const sandboxResultSpy = vi.spyOn(mockRedis, 'set')

    const result = await engine.processMessage(input)

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('V4_ZOMBIE_LAMBDA_EXIT')
    expect(result.messages).toEqual([])

    // zombie_lambda_exit emitted.
    const zombies = emittedEvents.filter((e) => e.label === 'zombie_lambda_exit')
    expect(zombies).toHaveLength(1)

    // sandbox-result key still written (Pitfall 5 — even zombie path writes
    // so FOLLOWER long-poll doesn't hang).
    const sandboxWrites = sandboxResultSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('sandbox-result:'),
    )
    expect(sandboxWrites.length).toBeGreaterThanOrEqual(1)
    expect(sandboxWrites[0][0]).toBe(`sandbox-result:${input.sandboxSessionId}`)

    // Agent was NOT invoked — lostLock at CKPT-0 short-circuits before agent call.
    expect(agentMockFn).not.toHaveBeenCalled()
  })

  // =========================================================================
  // E8 — lockHandle null fail-open: no checkpoints, no events, agent runs normally
  // =========================================================================
  it('E8 lockHandle null fail-open: no event emits, no checkpoint dispatch, agent invoked normally', async () => {
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['reply'], 100))

    const engine = new SomnioV4Engine()
    // Pass NO lockHandle (legacy pre-this-standalone path).
    const input = await makeBaseInput({}, 'sandbox-test-e8', false)
    expect(input.lockHandle).toBeUndefined()

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    expect(result.messages).toEqual(['reply'])

    // ZERO lock/abort/interrupt/zombie events.
    const lockRelated = emittedEvents.filter(
      (e) =>
        e.label.startsWith('lock_') ||
        e.label.includes('aborted') ||
        e.label.includes('interrupt') ||
        e.label === 'zombie_lambda_exit' ||
        e.label === 'pending_list_combined' ||
        e.label === 'heartbeat_renewed',
    )
    expect(lockRelated).toHaveLength(0)

    // Agent invoked once.
    expect(agentMockFn).toHaveBeenCalledTimes(1)
  })

  // =========================================================================
  // E9 — phantom self-message fix (bug 2026-05-28): the HOLDER pushes its OWN
  // inbound message into the pending list (route/webhook) for crash-recovery.
  // On a Path A combine the drain must EXCLUDE the holder's own entry (by
  // entry_uuid via ownPendingEntryJson) so the original message is not echoed
  // back into the combined effectiveMessage.
  // =========================================================================
  it('E9 phantom self-message: holder own entry in pending is excluded from the combine drain', async () => {
    const IDENT = 'sandbox-test-e9'

    // HOLDER's own inbound message lives in pending (mirrors route line 261).
    const ownPush = await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'hola',
      received_at: new Date().toISOString(),
      msg_id: 'm1',
    })
    // The interrupting FOLLOWER message.
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'que precio',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })
    await mockRedis.set(`interrupt:${WS}:${CHANNEL}:${IDENT}`, 'm2', { ex: 60 })

    // Iter 2 runs with the combined message.
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['combined reply'], 80))

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput({ message: 'hola' }, IDENT)
    // The holder knows its own pending entry (route stores push.exactJson).
    input.ownPendingEntryJson = ownPush.exactJson

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    expect(agentMockFn).toHaveBeenCalledTimes(1)
    // CRITICAL: combined message is "hola\nque precio" — NOT "hola\nhola\nque precio".
    // The holder's own "hola" entry was filtered out of the drain.
    expect(agentMockFn.mock.calls[0][0].message).toBe('hola\nque precio')
  })

  // =========================================================================
  // E10 — Path B reprocess does NOT re-greet (bug 2026-05-28): the reprocess
  // iteration must seed from iter-0's resulting state (carryState) so the agent
  // knows the saludo/templates were already sent. Without it, the response-track
  // re-seeds from the original empty state and re-greets.
  // =========================================================================
  it('E10 Path B reprocess seeds from iter-0 state (no re-greet): iter-2 receives intentsVistos from iter-1', async () => {
    const IDENT = 'sandbox-test-e10'
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'que precio',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })

    let ck7Fired = false
    setCheckpointOverride((ckptId, opts) => {
      if (ckptId === 'ckpt_7_pre_template' && opts?.templateIndex === 1 && !ck7Fired) {
        ck7Fired = true
        return { proceed: false, lostLock: false, interrupted: { pendingListLength: 1 } }
      }
      return null
    })

    // Iter 1: the saludo turn — sends 'saludo msg' (template 0), then CKPT-7.1
    // aborts before 'promo msg'. Crucially, iter-1's output records that the
    // saludo intent was seen + the saludo template was sent.
    agentMockFn.mockResolvedValueOnce({
      ...makeAgentOutputSuccess(['saludo msg', 'promo msg'], 50),
      intentsVistos: ['saludo'],
      templatesEnviados: ['saludo_core'],
    })
    // Iter 2: answers 'que precio'.
    agentMockFn.mockResolvedValueOnce(makeAgentOutputSuccess(['precio reply'], 80))

    const engine = new SomnioV4Engine()
    const input = await makeBaseInput({ message: 'hola' }, IDENT)

    const result = await engine.processMessage(input)

    expect(result.success).toBe(true)
    expect(result.messages).toEqual(['saludo msg', 'precio reply'])

    expect(agentMockFn).toHaveBeenCalledTimes(2)
    const iter2Input = agentMockFn.mock.calls[1][0]
    // Reprocess answers the NEW message only…
    expect(iter2Input.message).toBe('que precio')
    // …AND carries iter-1's state forward so the agent knows it already greeted.
    expect(iter2Input.intentsVistos).toEqual(['saludo'])
    expect(iter2Input.templatesEnviados).toEqual(['saludo_core'])
  })
})
