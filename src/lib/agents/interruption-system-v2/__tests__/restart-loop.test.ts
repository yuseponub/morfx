/**
 * Restart-loop scenarios — Plan 02 of standalone debounce-v2-interrupt-reprocess.
 *
 * Validates the Plan 01 scaffolding in `src/lib/agents/engine/v4-production-runner.ts`:
 *   - outer `while (shouldRestart)` loop
 *   - agent-discriminator detector (output.errorMessage.startsWith('interrupted_at_ckpt_'))
 *   - token accumulator across restart iterations (Pitfall 2)
 *   - restart_iteration payload field (Pitfall 3 — distinguishes restart 1 vs 5)
 *   - single lock lifetime across cascading restarts (Pitfall 6 — heartbeat OUTSIDE while)
 *   - Path B preserves current behavior post-send (D-01 + D-05)
 *   - Regla 6: v3/godentist/recompra/pw-confirmation paths byte-identical
 *
 * Mirrors the proven pattern from `e2e-scenarios.test.ts` (mock-redis via
 * `vi.mock('../redis-client')` factory closure + emittedEvents capture via
 * `vi.mock('@/lib/observability')`). Uses canned V4AgentOutput values per
 * iteration via `vi.mock('@/lib/agents/somnio-v4')` so iter N's V4AgentInput
 * can be asserted via `mockFn.mock.calls[N-1]`.
 *
 * Source: 02-PLAN.md (D-09) + 01-SUMMARY.md (line numbers of Plan 01 scaffolding).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'crypto'
import type { MockRedis } from './_helpers/mock-redis'
import type { V4AgentInput, V4AgentOutput } from '../../somnio-v4/types'

// ---------------------------------------------------------------------------
// vi.mock hoisting block — declared BEFORE any imports of the system under
// test (V4ProductionRunner pulls these mocks transitively). The factory
// closure pattern (await import inside the factory) avoids the
// uninitialized-binding hoisting trap that bites a top-level
// `const mockRedis = createMockRedis()` declaration. Source: e2e-scenarios.test.ts.
// ---------------------------------------------------------------------------

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

// Mock the somnio-v4 agent processMessage — canned outputs per iteration.
// Vitest 1.x typed-args form: vi.fn<TArgs[], TReturn>().
// El CORE (turn-orchestrator) importa estáticamente desde `@/lib/agents/somnio-v4/somnio-v4-agent`
// (A13/D-09 — mismo specifier que el mock v3 de abajo). El runner viejo hacía `await import('../somnio-v4')`
// (el index); tras el rewire a wrapper del core el specifier es el archivo directo. CAMBIO DE SETUP
// SANCIONADO (A13/Pitfall 8) — los asserts no se tocan.
const agentMockFn = vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()
vi.mock('@/lib/agents/somnio-v4/somnio-v4-agent', () => ({
  processMessage: (input: V4AgentInput) => agentMockFn(input),
}))

// Mock the somnio-v3 agent module so S5b's V3ProductionRunner call doesn't
// hang on real DB / module loading. We don't care about v3's output — only
// that the v3 path emits ZERO interruption-system-v2 events (it doesn't
// import that module at all, so even with a working agent it would emit 0).
vi.mock('@/lib/agents/somnio-v3/somnio-v3-agent', () => ({
  processMessage: vi.fn().mockResolvedValue({
    success: true,
    messages: [],
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
    totalTokens: 0,
    shouldCreateOrder: false,
    timerSignals: [],
  }),
}))

// ---------------------------------------------------------------------------
// Test fixture imports (post-mock so the SUT picks up the mocked modules).
// ---------------------------------------------------------------------------

import { V4ProductionRunner } from '@/lib/agents/engine/v4-production-runner'
import type { EngineInput, EngineAdapters } from '@/lib/agents/engine/types'
import { acquireLock } from '../lock'
import { pushToPending } from '../pending'

// ---------------------------------------------------------------------------
// Module-level shared mock state — reset in beforeEach.
// ---------------------------------------------------------------------------

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
  agentMockFn.mockReset()

  // Override `multi()` per-test so `readAndClearPending` actually deletes the
  // list from the mock's lists Map. The shared helper's `multi()` is
  // intentionally a no-op chain stub (pending.test.ts lines 224-228 documents
  // this design choice — that suite only verifies call shape, not cleared
  // state). The restart-loop runner relies on real clear semantics across
  // cascading restarts, so the override deletes from BOTH `lists` and `store`
  // Maps via direct __getAll() access. (The helper's standalone `del` vi.fn
  // only touches `store` + `ttls` — it does not delete list keys.)
  const allMaps = mockRedis.__getAll()
  // Explicit type annotation breaks the self-reference cycle (TS7022) caused
  // by `del` returning `tx` from inside the same object literal.
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
// Mock-adapter factories — minimal vitest doubles satisfying the
// StorageAdapter / TimerAdapter / MessagingAdapter / OrdersAdapter / DebugAdapter
// contracts the runner actually calls under happy + interrupt paths.
// ---------------------------------------------------------------------------

const WS = 'ws-1'
const CHANNEL = 'whatsapp' as const

function makeMockStorage(
  initialDatos: Record<string, string> = {},
  initialPendingTemplates: unknown[] = [],
): EngineAdapters['storage'] {
  const session = {
    id: 'sess-1',
    agent_id: 'somnio-sales-v4',
    conversation_id: 'conv-1',
    contact_id: 'contact-1',
    workspace_id: WS,
    version: 1,
    status: 'active' as const,
    current_mode: 'initial',
    state: {
      datos_capturados: { ...initialDatos },
      intents_vistos: [] as Array<{ intent: string }>,
      templates_enviados: [] as string[],
      pack_seleccionado: null,
    },
  }
  const pendingTemplatesState = [...initialPendingTemplates]
  return {
    getSession: vi.fn().mockResolvedValue(session),
    getOrCreateSession: vi.fn().mockResolvedValue(session),
    getHistory: vi.fn().mockResolvedValue([]),
    saveState: vi.fn().mockResolvedValue(undefined),
    updateMode: vi.fn().mockResolvedValue(undefined),
    addTurn: vi.fn().mockResolvedValue(undefined),
    addIntentSeen: vi.fn().mockResolvedValue(undefined),
    handoff: vi.fn().mockResolvedValue(undefined),
    savePendingTemplates: vi.fn(async (_sid: string, p: unknown[]) => {
      pendingTemplatesState.splice(0, pendingTemplatesState.length, ...p)
    }),
    getPendingTemplates: vi.fn(async () => [...pendingTemplatesState]),
    clearPendingTemplates: vi.fn(async () => {
      pendingTemplatesState.length = 0
    }),
  }
}

function makeMockMessaging(
  sendImpl?: EngineAdapters['messaging']['send'],
): EngineAdapters['messaging'] {
  return {
    send:
      sendImpl ??
      vi.fn().mockResolvedValue({ messagesSent: 1, interrupted: false }),
  }
}

function makeMockTimer(): EngineAdapters['timer'] {
  return {
    signal: vi.fn(),
    onCustomerMessage: vi.fn().mockResolvedValue(undefined),
    onModeTransition: vi.fn().mockResolvedValue(undefined),
    onIngestStarted: vi.fn().mockResolvedValue(undefined),
    onIngestCompleted: vi.fn().mockResolvedValue(undefined),
    onSilenceDetected: vi.fn().mockResolvedValue(undefined),
    getLastSignal: vi.fn().mockReturnValue(undefined),
    // Optional V4 extras the runner probes for via duck-typing
    setSessionId: vi.fn(),
    emitSignals: vi.fn().mockResolvedValue(undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

function makeMockOrders(): EngineAdapters['orders'] {
  return {
    createOrder: vi.fn().mockResolvedValue({ success: true, orderId: 'o-1', contactId: 'contact-1' }),
  }
}

function makeMockDebug(): EngineAdapters['debug'] {
  // All record* methods are no-ops; getDebugTurn returns undefined (production shape).
  return {
    recordIntent: vi.fn(),
    recordTools: vi.fn(),
    recordTokens: vi.fn(),
    recordState: vi.fn(),
    recordClassification: vi.fn(),
    recordBlockComposition: vi.fn(),
    recordNoRepetition: vi.fn(),
    recordOfiInter: vi.fn(),
    recordPreSendCheck: vi.fn(),
    recordTimerSignals: vi.fn(),
    recordTemplateSelection: vi.fn(),
    recordTransitionValidation: vi.fn(),
    recordOrchestration: vi.fn(),
    recordIngestDetails: vi.fn(),
    recordDisambiguationLog: vi.fn(),
    getDebugTurn: vi.fn().mockReturnValue(undefined),
  }
}

function makeAdapters(
  overrides: Partial<EngineAdapters> = {},
): EngineAdapters {
  return {
    storage: overrides.storage ?? makeMockStorage(),
    messaging: overrides.messaging ?? makeMockMessaging(),
    timer: overrides.timer ?? makeMockTimer(),
    orders: overrides.orders ?? makeMockOrders(),
    debug: overrides.debug ?? makeMockDebug(),
  }
}

async function makeEngineInput(
  overrides: Partial<EngineInput> = {},
  identifier = '+57300',
): Promise<EngineInput> {
  const lockHandle = await acquireLock(WS, CHANNEL, identifier)
  expect(lockHandle).not.toBeNull()
  return {
    sessionId: 'sess-1',
    conversationId: 'conv-1',
    contactId: 'contact-1',
    message: 'msg1',
    workspaceId: WS,
    history: [],
    lockHandle: lockHandle!,
    lockChannel: CHANNEL,
    lockIdentifier: identifier,
    ownPendingEntryJson: null,
    ...overrides,
  }
}

/**
 * Build a successful canned V4AgentOutput. Caller can override any field.
 */
function makeSuccessOutput(overrides: Partial<V4AgentOutput> = {}): V4AgentOutput {
  return {
    success: true,
    messages: ['reply'],
    templates: [],
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
    turnLedgerDims: { atendido: [], crmActions: [] },
    totalTokens: 100,
    shouldCreateOrder: false,
    timerSignals: [],
    ...overrides,
  }
}

/**
 * Build a canned V4AgentOutput that triggers the agent-discriminator restart
 * (output.errorMessage starts with `interrupted_at_ckpt_`).
 */
function makeInterruptOutput(totalTokens: number, ckpt = '1_post_comprehension'): V4AgentOutput {
  return {
    success: false,
    messages: [],
    errorMessage: `interrupted_at_ckpt_${ckpt}`,
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
    turnLedgerDims: { atendido: [], crmActions: [] },
    totalTokens,
    shouldCreateOrder: false,
    timerSignals: [],
  }
}

// ===========================================================================
// S1 — Happy path: 1 msg, no interrupt → no restart_iteration, tokens = single iteration
// ===========================================================================

describe('restart-loop S1..S5 (Plan 02 D-09)', () => {
  it('S1 happy path: single iteration, no restart_iteration in any event payload, tokens = single iter', async () => {
    agentMockFn.mockResolvedValueOnce(makeSuccessOutput({ totalTokens: 100 }))

    const adapters = makeAdapters()
    const runner = new V4ProductionRunner(adapters, { workspaceId: WS })
    const input = await makeEngineInput()

    const output = await runner.processMessage(input)

    expect(output.success).toBe(true)
    expect(output.tokensUsed).toBe(100)

    // No restart_iteration field in any payload.
    const restartEvents = emittedEvents.filter(
      (e) => 'restart_iteration' in e.payload,
    )
    expect(restartEvents).toHaveLength(0)

    // Lifecycle events present.
    const labels = emittedEvents.map((e) => e.label)
    expect(labels).toContain('lock_released_normal')

    // Agent invoked exactly once.
    expect(agentMockFn).toHaveBeenCalledTimes(1)
  })

  // ===========================================================================
  // S2 — Path A restart 1x: agent returns interrupt iter 1, success iter 2
  // ===========================================================================
  it('S2 Path A restart 1x: agent returns interrupted_at_ckpt_1 → drain pending + restart + success on iter 2', async () => {
    // Iter 1: in-agent CKPT-1 interrupt.
    agentMockFn.mockResolvedValueOnce(makeInterruptOutput(50))
    // Iter 2: success.
    agentMockFn.mockResolvedValueOnce(makeSuccessOutput({ totalTokens: 75, messages: ['combined reply'] }))

    // Stage msg2 in pending list BEFORE the runner kicks off.
    // The runner's readAndClearPending will drain this when handling the
    // agent-discriminator branch and combine with the prior msg (msg1).
    await pushToPending(WS, CHANNEL, '+57300S2', {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })

    const adapters = makeAdapters()
    const runner = new V4ProductionRunner(adapters, { workspaceId: WS })
    const input = await makeEngineInput({ message: 'msg1' }, '+57300S2')

    const output = await runner.processMessage(input)

    expect(output.success).toBe(true)
    // Pitfall 2: token accumulator across iterations — iter1 (50) + iter2 (75) = 125.
    expect(output.tokensUsed).toBe(125)

    // Exactly ONE msg_aborted_path_a_combined with restart_iteration=1.
    const pathARestarts = emittedEvents.filter(
      (e) =>
        e.label === 'msg_aborted_path_a_combined' &&
        e.payload.restart_iteration === 1,
    )
    expect(pathARestarts).toHaveLength(1)

    // Exactly ONE pending_list_combined with restart_iteration=1.
    const pendingCombined = emittedEvents.filter(
      (e) =>
        e.label === 'pending_list_combined' &&
        e.payload.restart_iteration === 1,
    )
    expect(pendingCombined).toHaveLength(1)

    // Iter 2's V4AgentInput.message == combined string (chronological:
    // prior msg first, then drained pending entries).
    expect(agentMockFn).toHaveBeenCalledTimes(2)
    const iter2Input = agentMockFn.mock.calls[1][0]
    expect(iter2Input.message).toBe('msg1\nmsg2')

    // Single lock lifetime (Pitfall 6 — no heartbeat stacking).
    const releaseCount = emittedEvents.filter((e) => e.label === 'lock_released_normal').length
    expect(releaseCount).toBe(1)
  })

  // ===========================================================================
  // S3 — Path A restart 2x: cascading interrupts via agent-discriminator twice.
  //
  // Design note: we DO NOT use CKPT-0 to catch iter 2's interrupt because
  // `readAndClearPending` only clears the pending list — it does NOT delete
  // the `interrupt:` key (TTL-only). If we wrote an interrupt key, CKPT-0
  // would catch it on EVERY iteration and infinite-loop. Instead we trigger
  // the restart cascade twice via the agent-discriminator branch (iter 1
  // returns interrupted_at_ckpt_*, iter 2 returns interrupted_at_ckpt_*,
  // iter 3 returns success). Each iter's agent mock implementation stages
  // the next inbound's msg into the pending list as a side-effect, so the
  // discriminator branch drains it on the next iteration.
  // ===========================================================================
  it('S3 Path A restart 2x: cascading interrupts via agent-discriminator → 3 iterations, tokens sum, single lock lifetime', async () => {
    const IDENT = '+57300S3'

    // Stage msg2 BEFORE iter 1 runs — drained by iter 1's discriminator branch.
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })

    // Iter 1: agent returns interrupted_at_ckpt_1. No side effect — pending list
    // already contains [msg2] (pre-staged above), so iter 1's discriminator
    // branch drains exactly ["msg2"] and combines chronologically with msg1
    // (priorMsg first, pending last) → effectiveMessage = "msg1\nmsg2".
    agentMockFn.mockImplementationOnce(async () => {
      return makeInterruptOutput(50)
    })

    // Iter 2: agent stages msg3 DURING its call (simulating a new inbound
    // arriving while iter 2's agent is running) then returns
    // interrupted_at_ckpt_2. Iter 2's discriminator branch drains ["msg3"] and
    // combines chronologically with prior turnEffectiveMessage
    // ("msg1\nmsg2") → effectiveMessage = "msg1\nmsg2\nmsg3".
    agentMockFn.mockImplementationOnce(async () => {
      await pushToPending(WS, CHANNEL, IDENT, {
        entry_uuid: randomUUID(),
        content: 'msg3',
        received_at: new Date().toISOString(),
        msg_id: 'm3',
      })
      return makeInterruptOutput(40, '2_post_state_machine')
    })

    // Iter 3: success — agent called with full combined message.
    agentMockFn.mockResolvedValueOnce(makeSuccessOutput({ totalTokens: 80, messages: ['final combined reply'] }))

    const adapters = makeAdapters()
    const runner = new V4ProductionRunner(adapters, { workspaceId: WS })
    const input = await makeEngineInput({ message: 'msg1' }, IDENT)

    const output = await runner.processMessage(input)

    expect(output.success).toBe(true)
    // Pitfall 2: tokens sum across all 3 iterations. Iter 1 = 50, Iter 2 = 40, Iter 3 = 80 = 170.
    expect(output.tokensUsed).toBe(170)

    // TWO msg_aborted_path_a_combined events with restart_iteration 1 then 2.
    const pathARestarts = emittedEvents.filter((e) => e.label === 'msg_aborted_path_a_combined')
    expect(pathARestarts).toHaveLength(2)
    expect(pathARestarts[0].payload.restart_iteration).toBe(1)
    expect(pathARestarts[1].payload.restart_iteration).toBe(2)

    // Agent invoked THREE times (one per iteration).
    expect(agentMockFn).toHaveBeenCalledTimes(3)
    const finalInput = agentMockFn.mock.calls[2][0]
    // Iter 1 input.message = "msg1" (pending empty since msg2 push happened first
    // but discriminator hasn't run; agent reads turnEffectiveMessage which is
    // input.message since effectiveMessage is null on iter 1 entry).
    //
    // Wait — actually iter 1 STAGES msg2 BEFORE calling the agent (via the
    // pre-runner pushToPending), so by the time iter 1's agent runs, pending
    // contains [msg2]. But the runner already built `turnEffectiveMessage =
    // input.message` ("msg1") at the top of the body BEFORE the agent call. So
    // iter 1 sees message="msg1".
    //
    // After iter 1 returns interrupted, the discriminator drains pending
    // (["msg2"]) and sets effectiveMessage = "msg1\nmsg2" (chronological:
    // priorMsg first, pending last). Iter 2 enters, turnEffectiveMessage =
    // "msg1\nmsg2". Iter 2's mock stages msg3 into pending DURING its
    // execution. Iter 2 returns interrupted. Discriminator drains pending
    // (["msg3"]) and sets effectiveMessage = "msg1\nmsg2\nmsg3". Iter 3
    // enters with turnEffectiveMessage = "msg1\nmsg2\nmsg3".
    expect(finalInput.message).toBe('msg1\nmsg2\nmsg3')

    // Single lock lifetime (Pitfall 6 — heartbeat OUTSIDE while loop).
    const releaseCount = emittedEvents.filter((e) => e.label === 'lock_released_normal').length
    expect(releaseCount).toBe(1)
  })

  // ===========================================================================
  // S4 — Path B at CKPT-6b: pending-templates from a prior turn sent →
  // CKPT-6b interrupt → CLEAN REPROCESS (bug 2026-05-28). Behavior CHANGED from
  // the original parent design (which deferred — "NO restart, pending kept"):
  // per the product decision, the interrupting message must NEVER be orphaned,
  // so CKPT-6b Path B now drains the pending list and answers the new message in
  // the SAME lambda (carrying state forward so it does not re-greet). The runner
  // re-runs once; the pending list ends EMPTY.
  // ===========================================================================
  it('S4 Path B at CKPT-6b: prior-turn pending-templates sent → interrupt → drains + reprocesses the new message (no orphan)', async () => {
    const IDENT = '+57300S4'

    // iter-1 agent output (discarded — its templates are never sent because
    // CKPT-6b catches the interrupt first). iter-2 answers the drained 'msg2'.
    agentMockFn.mockResolvedValueOnce(makeSuccessOutput({ totalTokens: 100 }))
    agentMockFn.mockResolvedValueOnce(makeSuccessOutput({ totalTokens: 80 }))

    // Storage: pre-populate pending_templates from a prior interrupted turn.
    // The runner sends these first, populating actuallySentIds. Then CKPT-6b
    // (post-pending-templates) detects an interrupt → Path B branch.
    const storage = makeMockStorage({}, [
      { templateId: 'pending-tmpl-1', content: 'pending template body', contentType: 'texto', priority: 'CORE' },
    ])

    // Messaging: pending templates send returns 1 sent, no interrupt. Then any
    // subsequent send for THIS turn's templates would not fire (we return Path B
    // before that block runs).
    const messaging = makeMockMessaging(
      vi.fn().mockResolvedValueOnce({ messagesSent: 1, interrupted: false }),
    )

    // Stage msg2 in pending list (REMAINS post-turn — Path B does NOT drain
    // pending; the next inbound's lambda will combine).
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })

    // Stage the interrupt key BEFORE the runner gets to CKPT-6b. (Both
    // CKPT-0 and CKPT-6a would also catch this if we put it before then,
    // but those are Path A — for Path B we need actuallySentIds.length > 0,
    // which only happens after pending-templates from a prior turn are sent.
    // So we delay writing the interrupt key until after the pending-templates
    // send — we do that by writing it inside the messaging.send mock's first call.)
    const messagingWithInterruptHook = makeMockMessaging(
      vi.fn()
        .mockImplementationOnce(async () => {
          // Write interrupt key AFTER pending templates are sent so CKPT-6b
          // (which runs AFTER getPendingTemplates+send) catches it.
          await mockRedis.set(`interrupt:${WS}:${CHANNEL}:${IDENT}`, 'm2', { ex: 60 })
          return { messagesSent: 1, interrupted: false }
        })
        // iter-2 messages-fallback send (msg2's reply has no templates → 0 sent
        // via adapter, mirroring the real parent's no-templates early return).
        .mockResolvedValue({ messagesSent: 0, interrupted: false }),
    )
    // Suppress unused-warning for the first messaging instance — we use the hook variant.
    void messaging

    const adapters = makeAdapters({ storage, messaging: messagingWithInterruptHook })
    const runner = new V4ProductionRunner(adapters, { workspaceId: WS })
    const input = await makeEngineInput({ message: 'msg1' }, IDENT)

    const output = await runner.processMessage(input)

    expect(output.success).toBe(true)

    // Path B event emitted (msg_aborted_path_b_solo from runner's CKPT-6b branch).
    const pathBEvents = emittedEvents.filter((e) => e.label === 'msg_aborted_path_b_solo')
    expect(pathBEvents.length).toBeGreaterThanOrEqual(1)

    // The interrupting message was DRAINED + reprocessed (NOT deferred): a
    // pending_list_combined with restart_iteration=1 is emitted for the reprocess.
    const reprocess = emittedEvents.filter(
      (e) => e.label === 'pending_list_combined' && e.payload.restart_iteration === 1,
    )
    expect(reprocess).toHaveLength(1)

    // Pending list ends EMPTY — Path B now drains it (no orphaned message).
    const all = mockRedis.__getAll()
    const pendingKey = `pending:${WS}:${CHANNEL}:${IDENT}`
    expect(all.lists.get(pendingKey)?.length ?? 0).toBe(0)

    // Agent invoked TWICE (iter-1 discarded + iter-2 answers the new message).
    expect(agentMockFn).toHaveBeenCalledTimes(2)
    // iter-2 answers the drained 'msg2' (NOT recombined with msg1).
    expect(agentMockFn.mock.calls[1][0].message).toBe('msg2')

    // Single lock lifetime (Pitfall 6 — heartbeat OUTSIDE while loop).
    const releaseCount = emittedEvents.filter((e) => e.label === 'lock_released_normal').length
    expect(releaseCount).toBe(1)
  })

  // ===========================================================================
  // S5 — Regla 6: v3/godentist/recompra/pw-confirmation paths byte-identical.
  // Three-fold check: (a) static grep, (b) git-diff via Bash (in verification
  // step, not here), (c) behavioral V3ProductionRunner emits zero lock events.
  // ===========================================================================
  describe('S5 Regla 6 — v3/sibling paths byte-identical', () => {
    it('S5a static: zero interruption-system-v2 imports + zero shouldRestart/restart_iteration/interrupted_at_ckpt_ refs in non-v4 paths', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const ROOT = path.resolve(__dirname, '../../../../..')

      const v3Paths = [
        'src/lib/agents/engine/v3-production-runner.ts',
        'src/lib/agents/somnio-v3',
        'src/lib/agents/godentist',
        'src/lib/agents/godentist-fb-ig',
        'src/lib/agents/somnio-recompra',
        'src/lib/agents/somnio-pw-confirmation',
      ]

      const offending: Array<{ file: string; line: number; text: string }> = []
      const FORBIDDEN_RE =
        /interruption-system-v2|shouldRestart|restart_iteration|interrupted_at_ckpt_/

      const walk = (p: string) => {
        const stat = fs.statSync(p)
        if (stat.isDirectory()) {
          for (const entry of fs.readdirSync(p)) {
            // Skip __tests__ subtrees within sibling agents (tests legitimately
            // grep for these strings; production code must not contain them).
            if (entry === '__tests__') continue
            walk(path.join(p, entry))
          }
        } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
          const content = fs.readFileSync(p, 'utf-8')
          if (!FORBIDDEN_RE.test(content)) return
          // Per-line check, skipping comment-only lines.
          const lines = content.split('\n')
          lines.forEach((rawLine, idx) => {
            const trimmed = rawLine.trim()
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
            if (FORBIDDEN_RE.test(rawLine)) {
              offending.push({ file: p, line: idx + 1, text: trimmed.slice(0, 120) })
            }
          })
        }
      }

      for (const rel of v3Paths) {
        const abs = path.join(ROOT, rel)
        if (fs.existsSync(abs)) walk(abs)
      }

      expect(offending).toEqual([])
    })

    it('S5b behavioral: V3ProductionRunner emits zero lock/interrupt/restart events during a turn', async () => {
      emittedEvents.length = 0

      // Dynamic import keeps S5a runnable even if V3 fails to load.
      const { V3ProductionRunner } = await import('@/lib/agents/engine/v3-production-runner')

      const adapters = makeAdapters()
      const runner = new V3ProductionRunner(adapters, { workspaceId: WS })

      // V3 EngineInput: same shape as V4, but lockHandle/lockChannel/lockIdentifier
      // are unused by V3 path. We deliberately omit them to mirror the production
      // call site (webhook handler only injects lockHandle when v4 is detected).
      const v3Input: EngineInput = {
        sessionId: 'sess-v3',
        conversationId: 'conv-v3',
        contactId: 'contact-v3',
        message: 'msg_v3',
        workspaceId: WS,
        history: [],
      }

      // We don't care whether the v3 runner SUCCEEDS — many v3 internals require
      // DB connectivity / module registrations we haven't faked. We ONLY care that
      // NO lock-related events were emitted during the attempt, because v3 must
      // not import the interruption-v2 module at all.
      try {
        await runner.processMessage(v3Input)
      } catch {
        // ignore — runner may throw because storage adapter returns a mocked
        // session that doesn't satisfy every v3 invariant; that's fine.
      }

      const lockEvents = emittedEvents.filter(
        (e) =>
          e.label.startsWith('lock_') ||
          e.label.startsWith('interrupt_') ||
          e.label.startsWith('msg_aborted_') ||
          e.label === 'pending_list_combined' ||
          e.label === 'heartbeat_renewed' ||
          e.label === 'zombie_lambda_exit' ||
          e.label === 'follower_woke' ||
          e.label === 'redis_unavailable_fallback_failed' ||
          'restart_iteration' in e.payload,
      )
      expect(lockEvents).toHaveLength(0)
    })
  })
})
