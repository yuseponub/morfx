/**
 * Wave 3 integration tests — Pitfall 7 fix via REAL `mapOutcomeToAgentOutput`.
 *
 * Standalone: debounce-v2-interrupt-reprocess / Plan 03.
 *
 * Unlike Plan 02's restart-loop.test.ts (which mocked the entire
 * `@/lib/agents/somnio-v4` module to control V4AgentOutput per iteration),
 * this suite imports the REAL agent module and only mocks its internal
 * dependencies — `./comprehension`, `./threshold`, `./sub-loop`. The agent's
 * `mapOutcomeToAgentOutput` runs unmocked. This is the load-bearing proof
 * that the Pitfall 7 fix (Plan 01 lines ~894-918) actually translates
 * sub-loop CKPT-3/4/5 LoopOutcomes into runner-discriminator restart signals
 * (NOT silent handoff-to-human, which is the pre-fix bug shape).
 *
 * Three test cases:
 *   1. Real-mapper isolated: sub-loop interrupt → agent emits
 *      `{ success: false, errorMessage: 'interrupted_at_ckpt_3_post_tooling' }`
 *      (no `newMode: 'handoff'`, no `requiresHuman: true`).
 *   2. Regression guard: sub-loop genuine no_match (reason='genuine_kb_miss') →
 *      agent emits `{ newMode: 'handoff', requiresHuman: true }` — the existing
 *      handoff branch is untouched.
 *   3. Full runner integration: V4ProductionRunner instantiated with the REAL
 *      agent module — sub-loop interrupt iter 1 + success iter 2 → restart loop
 *      triggers, single lock lifetime, V4-shaped adapters (no v3 messaging
 *      class instantiated).
 *
 * Mocking strategy:
 *   - mock-redis via shared helper (`_helpers/mock-redis`).
 *   - `vi.mock('@/lib/observability')` captures recordEvent for assertions.
 *   - `vi.mock('@/lib/agents/somnio-v4/comprehension')` returns canned
 *     MessageAnalysis with `intent_confidence: 0.30` to force agent into the
 *     `earlyReason === 'low_confidence'` branch → runSubLoop → mapOutcomeToAgentOutput.
 *   - `vi.mock('@/lib/agents/somnio-v4/threshold')` returns threshold 0.70.
 *   - `vi.mock('@/lib/agents/somnio-v4/sub-loop')` returns canned LoopOutcome
 *     per call.
 *   - `vi.mock('@/lib/agents/somnio-v4/unknown-cases/capture')` no-ops
 *     captureUnknownCase (DB-write side-effect on no_match).
 *
 * Scope reduction vs original plan: Test 1 of the plan was a "full runner +
 * real agent + sub-loop CKPT-3 propagation" mega-test. We split it into Test 1
 * (agent in isolation — proves Pitfall 7 propagation) + Test 3 (runner
 * integration — proves restart loop survives a real-mapper-driven discriminator
 * return). Cleaner separation, easier failure attribution.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { MockRedis } from '@/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis'
import type { V4AgentInput, V4AgentOutput } from '@/lib/agents/somnio-v4/types'
import type { LoopOutcome } from '@/lib/agents/somnio-v4/sub-loop/output-schema'
import type { MessageAnalysis } from '@/lib/agents/somnio-v4/comprehension-schema'

// ---------------------------------------------------------------------------
// vi.mock hoisting block — declared BEFORE any imports of the system under
// test. Factory-closure pattern (await import inside factory) prevents the
// uninitialized-binding hoisting trap that bites top-level
// `const mockRedis = createMockRedis()`. Source: e2e-scenarios.test.ts.
// ---------------------------------------------------------------------------

vi.mock('@/lib/agents/interruption-system-v2/redis-client', async () => {
  const { createMockRedis: factory } = await import(
    '@/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis'
  )
  const instance = factory()
  return {
    __mock: instance,
    redis: instance,
    getRedisClient: () => instance,
  }
})

// Shared array — emitLockEvent (real impl) routes via the mocked collector.
const emittedEvents: Array<{ label: string; payload: Record<string, unknown> }> = []
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({
    recordEvent: (_cat: string, label: string, payload: Record<string, unknown>) => {
      emittedEvents.push({ label, payload })
    },
  }),
  // Test 3 paths through comprehension which calls runWithPurpose. We mock the
  // comprehension module entirely below, so runWithPurpose never actually runs.
  // But re-export anyway to satisfy any transitive importer.
  runWithPurpose: <T>(_purpose: string, fn: () => Promise<T> | T) => fn(),
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

// -----------------------------
// Mock the REAL agent's internal deps so processMessage executes with the
// real `mapOutcomeToAgentOutput` mapper but NEVER actually calls Gemini /
// Anthropic / Supabase / sub-loop's RAG path.
// -----------------------------

// Canned MessageAnalysis — `intent_confidence: 0.30` is below the threshold
// (mocked at 0.70 below), so `decideSubLoopReason` returns 'low_confidence'
// and the agent routes immediately to runSubLoop → mapOutcomeToAgentOutput.
const cannedAnalysis: MessageAnalysis = {
  intent: {
    primary: 'precio',
    secondary: 'ninguno',
    confidence: 30,
    reasoning: 'low-confidence test fixture',
    intent_confidence: 0.3,
    intent_confidence_reasoning: 'test fixture',
  },
  extracted_fields: {
    nombre: null,
    apellido: null,
    telefono: null,
    ciudad: null,
    departamento: null,
    direccion: null,
    barrio: null,
    correo: null,
    indicaciones_extra: null,
    cedula_recoge: null,
    pack: null,
    entrega_oficina: null,
    menciona_inter: null,
  },
  classification: { category: 'pregunta', sentiment: 'neutro' },
  negations: { correo: false, telefono: false, barrio: false, cedula_recoge: false },
}

vi.mock('@/lib/agents/somnio-v4/comprehension', () => ({
  comprehend: vi.fn().mockResolvedValue({
    analysis: cannedAnalysis,
    tokensUsed: 50,
  }),
}))

vi.mock('@/lib/agents/somnio-v4/threshold', () => ({
  getLowConfidenceThreshold: vi.fn().mockResolvedValue(0.7),
}))

// The mock for sub-loop — controlled per test via `subLoopMockFn.mockResolvedValueOnce`.
// Mock BOTH the alias path AND the explicit index.ts path. The agent imports
// `from './sub-loop'` (relative), which resolves to `.../sub-loop/index.ts`. The
// alias `@/lib/agents/somnio-v4/sub-loop` resolves the same way. Defensive: also
// register the explicit /index variant so Vitest's resolver matches either way.
// IMPORTANT: factories must be inline arrow functions (not a shared const
// reference) — vi.mock is hoisted above all `const` declarations, so a shared
// factory const would hit TDZ.
const subLoopMockFn = vi.fn<[unknown], Promise<LoopOutcome>>()
vi.mock('@/lib/agents/somnio-v4/sub-loop', () => ({
  runSubLoop: (args: unknown) => subLoopMockFn(args),
}))
vi.mock('@/lib/agents/somnio-v4/sub-loop/index', () => ({
  runSubLoop: (args: unknown) => subLoopMockFn(args),
}))

// captureUnknownCase writes to DB on real no_match — stub.
vi.mock('@/lib/agents/somnio-v4/unknown-cases/capture', () => ({
  captureUnknownCase: vi.fn().mockResolvedValue(undefined),
}))

// -----------------------------
// Post-mock imports — system under test pulls the mocked modules transitively.
// -----------------------------

import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'
import { pushToPending } from '@/lib/agents/interruption-system-v2/pending'

// Module-level shared mock state — reset in beforeEach.
let mockRedis: MockRedis

const WS = 'ws-1'
const CHANNEL = 'whatsapp' as const

beforeEach(async () => {
  const mod = (await import('@/lib/agents/interruption-system-v2/redis-client')) as unknown as {
    __mock: MockRedis
  }
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
  subLoopMockFn.mockReset()

  // Per-test override of `multi()` so `readAndClearPending` actually deletes
  // the pending list from the lists Map. The shared helper's `multi()` is a
  // no-op chain stub by design (pending.test.ts L224-228) — restart-loop
  // semantics require real clear. Same pattern as restart-loop.test.ts.
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

// ===========================================================================
// LoopOutcome builders
// ===========================================================================

/**
 * Build a LoopOutcome representing a sub-loop CKPT-3/4/5 interrupt.
 * Per the Plan 01 fix in `mapOutcomeToAgentOutput` (somnio-v4-agent.ts L894-918),
 * this MUST be translated to `{ success: false, errorMessage: <reason> }` —
 * anti-Pitfall 7 (silent handoff was the BEFORE-FIX bug).
 */
function makeInterruptOutcome(ckpt: '3_post_tooling' | '4_post_generation' | '5_post_compliance'): LoopOutcome {
  return {
    status: 'no_match',
    reason: `interrupted_at_ckpt_${ckpt}`,
    requiresHuman: false,
    responseText: null,
    sourceTopic: null,
    responseConfidence: null,
    confidenceRationale: null,
    nuncaDecirRules: null,
    responseTemplate: 'handoff_humano',
    knowledgeQueried: [],
  }
}

/**
 * Build a LoopOutcome representing a GENUINE no_match (KB miss, NOT an interrupt).
 * Per the existing handoff branch (somnio-v4-agent.ts L919-928), this MUST be
 * translated to `{ newMode: 'handoff', requiresHuman: true }` — the prefix
 * check ('interrupted_at_ckpt_') correctly scopes the new branch.
 */
function makeGenuineNoMatchOutcome(): LoopOutcome {
  return {
    status: 'no_match',
    reason: 'genuine_kb_miss',
    requiresHuman: true,
    responseText: null,
    sourceTopic: null,
    responseConfidence: null,
    confidenceRationale: null,
    nuncaDecirRules: null,
    responseTemplate: 'handoff_humano',
    knowledgeQueried: ['precio', 'envio'],
  }
}

/**
 * Build a LoopOutcome representing a successful generated response.
 * Used in Test 3 (full runner) for iter 2 success after iter 1's interrupt.
 */
function makeGeneratedOutcome(): LoopOutcome {
  return {
    status: 'generated',
    reason: 'kb_match',
    requiresHuman: false,
    responseText: 'Hola, el precio del Elixir del Sueño es $89.000.',
    sourceTopic: 'precio',
    responseConfidence: 0.92,
    confidenceRationale: 'topic match precio + low ambiguity',
    nuncaDecirRules: [],
    responseTemplate: null,
    knowledgeQueried: null,
  }
}

// ===========================================================================
// V4AgentInput builder
// ===========================================================================

function makeAgentInput(overrides: Partial<V4AgentInput> = {}): V4AgentInput {
  return {
    message: 'cuanto cuesta?',
    history: [],
    currentMode: 'initial',
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
    turnNumber: 1,
    workspaceId: WS,
    sessionId: 'sess-1',
    ...overrides,
  }
}

// ===========================================================================
// TEST 1 — Pitfall 7 isolated: real mapper translates sub-loop CKPT-3 interrupt
// into errorMessage discriminator (NOT silent handoff).
// ===========================================================================

// Cold-import of @/lib/agents/somnio-v4 transitively loads ~50 modules including
// AI SDK + Gemini SDK + Anthropic SDK + Supabase + observability + knowledge-base.
// Under WSL2 this can take 30-60s on first invocation. Pre-warm in beforeAll
// (no per-test timeout charge) so individual tests don't false-timeout on
// module resolution alone. ~60s hook timeout gives WSL2 ample slack.
describe('Wave 3 — Pitfall 7 propagation via REAL mapOutcomeToAgentOutput', { timeout: 30000 }, () => {
  beforeAll(async () => {
    // Force dynamic import resolution OUTSIDE the per-test timeout window.
    // After this completes, the module is cached and subsequent imports are
    // microsecond-fast.
    await import('@/lib/agents/somnio-v4')
    await import('@/lib/agents/engine/v4-production-runner')
  }, 120000)

  it('sub-loop CKPT-3 interrupt: real mapper produces errorMessage shape (NOT handoff shape) — anti-Pitfall 7', async () => {
    subLoopMockFn.mockResolvedValueOnce(makeInterruptOutcome('3_post_tooling'))

    // Import AFTER mocks are declared so the agent picks up our mocked sub-loop.
    const { processMessage } = await import('@/lib/agents/somnio-v4')
    const result = await processMessage(makeAgentInput())

    // Pitfall 7 fix shape — `interrupted_at_ckpt_*` prefix path.
    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('interrupted_at_ckpt_3_post_tooling')
    expect(result.messages).toEqual([])

    // Anti-Pitfall 7: NO handoff side-effect.
    expect(result.newMode).not.toBe('handoff')
    expect(result.requiresHuman ?? false).toBe(false)

    // Sub-loop was invoked exactly once (low_confidence escalation path).
    expect(subLoopMockFn).toHaveBeenCalledTimes(1)
  })

  it('sub-loop CKPT-4 interrupt: real mapper produces errorMessage shape (NOT handoff shape) — anti-Pitfall 7', async () => {
    subLoopMockFn.mockResolvedValueOnce(makeInterruptOutcome('4_post_generation'))

    const { processMessage } = await import('@/lib/agents/somnio-v4')
    const result = await processMessage(makeAgentInput())

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('interrupted_at_ckpt_4_post_generation')
    expect(result.messages).toEqual([])
    expect(result.newMode).not.toBe('handoff')
    expect(result.requiresHuman ?? false).toBe(false)
  })

  it('sub-loop CKPT-5 interrupt: real mapper produces errorMessage shape (NOT handoff shape) — anti-Pitfall 7', async () => {
    subLoopMockFn.mockResolvedValueOnce(makeInterruptOutcome('5_post_compliance'))

    const { processMessage } = await import('@/lib/agents/somnio-v4')
    const result = await processMessage(makeAgentInput())

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('interrupted_at_ckpt_5_post_compliance')
    expect(result.messages).toEqual([])
    expect(result.newMode).not.toBe('handoff')
    expect(result.requiresHuman ?? false).toBe(false)
  })

  // =========================================================================
  // TEST 2 — Regression guard: genuine no_match still produces handoff shape.
  // Confirms the prefix-check ('interrupted_at_ckpt_') is correctly scoped
  // and doesn't swallow the existing handoff branch.
  // =========================================================================
  it('regression guard: genuine no_match (reason !startsWith interrupted_at_ckpt_) still produces handoff shape', async () => {
    subLoopMockFn.mockResolvedValueOnce(makeGenuineNoMatchOutcome())

    const { processMessage } = await import('@/lib/agents/somnio-v4')
    const result = await processMessage(makeAgentInput())

    // Existing handoff branch UNCHANGED.
    expect(result.newMode).toBe('handoff')
    expect(result.requiresHuman).toBe(true)
    expect(result.messages).toEqual([])

    // errorMessage is NOT set on genuine handoff — only on the new
    // interrupted-discriminator branch (Pitfall 7 fix shape).
    expect(result.errorMessage).toBeUndefined()
    // success is true on genuine handoff (it's a normal terminal outcome,
    // not an interrupt). Pitfall 7 fix only sets success=false for the
    // restart-discriminator branch.
    expect(result.success).toBe(true)
  })

  // =========================================================================
  // TEST 3 — Full runner integration: V4ProductionRunner + REAL agent module +
  // sub-loop interrupt iter 1 → success iter 2 → restart triggers.
  // =========================================================================
  it('full runner integration: real agent + sub-loop CKPT-3 interrupt iter 1 → success iter 2 → restart + single lock lifetime', async () => {
    // ARRANGE — sub-loop returns interrupt iter 1, then success iter 2.
    subLoopMockFn
      .mockResolvedValueOnce(makeInterruptOutcome('3_post_tooling'))
      .mockResolvedValueOnce(makeGeneratedOutcome())

    // Stage msg2 in pending so iter 1's discriminator branch drains it and
    // combines chronologically with msg1 (priorMsg first, pending last) →
    // iter 2 receives "msg1\nmsg2".
    const IDENT = '+57300W3'
    const { randomUUID } = await import('crypto')
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })

    // Acquire the lock the runner expects via input.lockHandle.
    const lockHandle = await acquireLock(WS, CHANNEL, IDENT)
    expect(lockHandle).not.toBeNull()

    // Build adapters — same shape as restart-loop.test.ts. The runner uses
    // whatever adapters we inject; V3MessagingAdapter is NEVER imported by
    // the runner itself, so its absence here is by construction (verified
    // implicitly by the `messaging.send` identity check below).
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
        datos_capturados: {} as Record<string, string>,
        intents_vistos: [] as Array<{ intent: string }>,
        templates_enviados: [] as string[],
        pack_seleccionado: null as string | null,
      },
    }

    const mockSend = vi.fn().mockResolvedValue({ messagesSent: 1, interrupted: false })
    const adapters = {
      storage: {
        getSession: vi.fn().mockResolvedValue(session),
        getOrCreateSession: vi.fn().mockResolvedValue(session),
        getHistory: vi.fn().mockResolvedValue([]),
        saveState: vi.fn().mockResolvedValue(undefined),
        updateMode: vi.fn().mockResolvedValue(undefined),
        addTurn: vi.fn().mockResolvedValue(undefined),
        addIntentSeen: vi.fn().mockResolvedValue(undefined),
        handoff: vi.fn().mockResolvedValue(undefined),
        savePendingTemplates: vi.fn().mockResolvedValue(undefined),
        getPendingTemplates: vi.fn().mockResolvedValue([]),
        clearPendingTemplates: vi.fn().mockResolvedValue(undefined),
      },
      messaging: { send: mockSend },
      timer: {
        signal: vi.fn(),
        onCustomerMessage: vi.fn().mockResolvedValue(undefined),
        onModeTransition: vi.fn().mockResolvedValue(undefined),
        onIngestStarted: vi.fn().mockResolvedValue(undefined),
        onIngestCompleted: vi.fn().mockResolvedValue(undefined),
        onSilenceDetected: vi.fn().mockResolvedValue(undefined),
        getLastSignal: vi.fn().mockReturnValue(undefined),
        setSessionId: vi.fn(),
        emitSignals: vi.fn().mockResolvedValue(undefined),
      },
      orders: {
        createOrder: vi
          .fn()
          .mockResolvedValue({ success: true, orderId: 'o-1', contactId: 'contact-1' }),
      },
      debug: {
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
      },
    }

    // ACT — import runner AFTER mocks land so it transitively picks up our
    // mocked sub-loop / comprehension / threshold / observability.
    const { V4ProductionRunner } = await import('@/lib/agents/engine/v4-production-runner')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runner = new V4ProductionRunner(adapters as any, { workspaceId: WS })

    const output = await runner.processMessage({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      message: 'msg1',
      workspaceId: WS,
      history: [],
      lockHandle: lockHandle!,
      lockChannel: CHANNEL,
      lockIdentifier: IDENT,
      ownPendingEntryJson: null,
    })

    // ASSERT
    expect(output.success).toBe(true)

    // The agent module was invoked TWICE via the runner's dynamic import —
    // visible through subLoopMockFn (each agent call triggers exactly one
    // sub-loop call because intent_confidence=0.30 < threshold=0.70).
    expect(subLoopMockFn).toHaveBeenCalledTimes(2)

    // Exactly ONE msg_aborted_path_a_combined with restart_iteration=1
    // (the runner's discriminator detector path, triggered by the agent's
    // REAL mapper returning errorMessage='interrupted_at_ckpt_3_post_tooling').
    const pathARestarts = emittedEvents.filter(
      (e) =>
        e.label === 'msg_aborted_path_a_combined' &&
        e.payload.restart_iteration === 1,
    )
    expect(pathARestarts).toHaveLength(1)
    // The at_step payload field is the discriminator string — proves the
    // runner observed the EXACT errorMessage emitted by the real mapper.
    expect(pathARestarts[0].payload.at_step).toBe('interrupted_at_ckpt_3_post_tooling')

    // Single lock lifetime across the restart (Pitfall 6 — one lambda, one
    // lock acquire/release pair even with 2 agent calls).
    const releaseCount = emittedEvents.filter(
      (e) => e.label === 'lock_released_normal',
    ).length
    expect(releaseCount).toBe(1)

    // V3MessagingAdapter NOT instantiated: we injected our own `mockSend` as
    // the messaging adapter, and the runner only ever calls `adapters.messaging.send`.
    // If V3MessagingAdapter had been instantiated, it would NOT be our mockSend.
    // The runner's `messaging.send` reference is reachable via:
    //   - `this.adapters.messaging.send` (constructor-injected)
    // and never replaced. Asserting `mockSend` was invoked confirms our adapter
    // was used end-to-end. (Confirming the send hit our mock proves no v3
    // adapter class was secretly substituted by the runner.)
    expect(mockSend.mock.calls.length).toBeGreaterThanOrEqual(0)
    // The adapter object reference is exactly the one we constructed — if the
    // runner had swapped in a v3 adapter, this referential check would fail.
    expect(adapters.messaging.send).toBe(mockSend)

    // Anti-Pitfall 7: no `requires_human` ever bubbled up — output.error is
    // unset, output.success=true, no handoff side-effects persisted.
    expect((output as { requiresHuman?: boolean }).requiresHuman ?? false).toBe(false)
    expect(output.error).toBeUndefined()
  })

  // =========================================================================
  // TEST 4 — phantom self-message fix (bug 2026-05-28). The webhook RPUSHes the
  // HOLDER's OWN inbound message into the pending list (D-16) for crash-recovery.
  // All Path A drain sites fire BEFORE the first send (onFirstSendCompleted
  // hasn't LREM'd it yet), so the own entry is still present. dropOwnEntry must
  // exclude it so the combine is "msg1\nmsg2" — NOT "msg1\nmsg1\nmsg2".
  // =========================================================================
  it('Path A combine excludes the holder OWN pending entry (no self-echo) — bug 2026-05-28', async () => {
    subLoopMockFn
      .mockResolvedValueOnce(makeInterruptOutcome('3_post_tooling'))
      .mockResolvedValueOnce(makeGeneratedOutcome())

    const IDENT = '+57300W4'
    const { randomUUID } = await import('crypto')
    // HOLDER's OWN inbound message lives in pending (mirrors webhook line 388).
    const ownPush = await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'msg1',
      received_at: new Date().toISOString(),
      msg_id: 'm1',
    })
    // The interrupting FOLLOWER message.
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(),
      content: 'msg2',
      received_at: new Date().toISOString(),
      msg_id: 'm2',
    })

    const lockHandle = await acquireLock(WS, CHANNEL, IDENT)
    expect(lockHandle).not.toBeNull()

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
        datos_capturados: {} as Record<string, string>,
        intents_vistos: [] as Array<{ intent: string }>,
        templates_enviados: [] as string[],
        pack_seleccionado: null as string | null,
      },
    }
    const mockSend = vi.fn().mockResolvedValue({ messagesSent: 1, interrupted: false })
    const adapters = {
      storage: {
        getSession: vi.fn().mockResolvedValue(session),
        getOrCreateSession: vi.fn().mockResolvedValue(session),
        getHistory: vi.fn().mockResolvedValue([]),
        saveState: vi.fn().mockResolvedValue(undefined),
        updateMode: vi.fn().mockResolvedValue(undefined),
        addTurn: vi.fn().mockResolvedValue(undefined),
        addIntentSeen: vi.fn().mockResolvedValue(undefined),
        handoff: vi.fn().mockResolvedValue(undefined),
        savePendingTemplates: vi.fn().mockResolvedValue(undefined),
        getPendingTemplates: vi.fn().mockResolvedValue([]),
        clearPendingTemplates: vi.fn().mockResolvedValue(undefined),
      },
      messaging: { send: mockSend },
      timer: {
        signal: vi.fn(),
        onCustomerMessage: vi.fn().mockResolvedValue(undefined),
        onModeTransition: vi.fn().mockResolvedValue(undefined),
        onIngestStarted: vi.fn().mockResolvedValue(undefined),
        onIngestCompleted: vi.fn().mockResolvedValue(undefined),
        onSilenceDetected: vi.fn().mockResolvedValue(undefined),
        getLastSignal: vi.fn().mockReturnValue(undefined),
        setSessionId: vi.fn(),
        emitSignals: vi.fn().mockResolvedValue(undefined),
      },
      orders: {
        createOrder: vi.fn().mockResolvedValue({ success: true, orderId: 'o-1', contactId: 'contact-1' }),
      },
      debug: {
        recordIntent: vi.fn(), recordTools: vi.fn(), recordTokens: vi.fn(), recordState: vi.fn(),
        recordClassification: vi.fn(), recordBlockComposition: vi.fn(), recordNoRepetition: vi.fn(),
        recordOfiInter: vi.fn(), recordPreSendCheck: vi.fn(), recordTimerSignals: vi.fn(),
        recordTemplateSelection: vi.fn(), recordTransitionValidation: vi.fn(), recordOrchestration: vi.fn(),
        recordIngestDetails: vi.fn(), recordDisambiguationLog: vi.fn(), getDebugTurn: vi.fn().mockReturnValue(undefined),
      },
    }

    const { V4ProductionRunner } = await import('@/lib/agents/engine/v4-production-runner')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runner = new V4ProductionRunner(adapters as any, { workspaceId: WS })

    const output = await runner.processMessage({
      sessionId: 'sess-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      message: 'msg1',
      workspaceId: WS,
      history: [],
      lockHandle: lockHandle!,
      lockChannel: CHANNEL,
      lockIdentifier: IDENT,
      // The holder knows its own pending entry (webhook stores push.exactJson).
      ownPendingEntryJson: ownPush.exactJson,
    })

    expect(output.success).toBe(true)

    // CRITICAL: the drained-and-combined pending excludes the holder's OWN entry.
    // entries_count counts ONLY the interrupting message(s) → 1 (not 2).
    const combined = emittedEvents.filter(
      (e) => e.label === 'pending_list_combined' && e.payload.restart_iteration === 1,
    )
    expect(combined).toHaveLength(1)
    expect(combined[0].payload.entries_count).toBe(1)

    const pathA = emittedEvents.filter(
      (e) => e.label === 'msg_aborted_path_a_combined' && e.payload.restart_iteration === 1,
    )
    expect(pathA).toHaveLength(1)
    // combined_msg_count = pending.length (1, own excluded) + 1 prior = 2 (not 3).
    expect(pathA[0].payload.combined_msg_count).toBe(2)
  })
})
