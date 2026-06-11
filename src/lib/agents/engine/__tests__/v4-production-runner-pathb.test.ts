/**
 * V4ProductionRunner — Path B clean reprocess (bug 2026-05-28).
 *
 * Validates the in-lambda reprocess wired into the runner's TEMPLATE send-loop:
 * when the messaging adapter aborts mid-send (sendResult.interrupted) AFTER ≥1
 * template was delivered, the runner must:
 *   - discard the rest of msg1's response,
 *   - drain the interrupting message(s) from the pending list,
 *   - answer them in the SAME lambda WITHOUT re-greeting (carryState seeds
 *     intents_vistos forward) and WITHOUT re-sending already-sent template IDs
 *     (carryState seeds templates_enviados forward),
 *   - record the FULL set (msg1 partial + msg2 answer) in the final state.
 *
 * Unlike v4-production-runner-restart.test.ts (which drives the REAL agent +
 * mocked sub-loop and therefore only ever exercises the messages-fallback), this
 * suite mocks `@/lib/agents/somnio-v4` so we can return canned outputs WITH
 * `templates` and drive the template send-loop where the interruption handling
 * lives. The adapter's per-template abort is simulated via the injected
 * `messaging.send` mock returning `{ interrupted: true, interruptedAtIndex }`.
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { randomUUID } from 'crypto'
import type { MockRedis } from '../../interruption-system-v2/__tests__/_helpers/mock-redis'
import type { V4AgentInput, V4AgentOutput, ProcessedMessage } from '../../somnio-v4/types'

// ---------------------------------------------------------------------------
// vi.mock hoisting block.
// ---------------------------------------------------------------------------

vi.mock('@/lib/agents/interruption-system-v2/redis-client', async () => {
  const { createMockRedis } = await import(
    '@/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis'
  )
  const instance = createMockRedis()
  return { __mock: instance, redis: instance, getRedisClient: () => instance }
})

const emittedEvents: Array<{ label: string; payload: Record<string, unknown> }> = []
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({
    recordEvent: (_cat: string, label: string, payload: Record<string, unknown>) => {
      emittedEvents.push({ label, payload })
    },
  }),
  runWithCollector: (_c: unknown, fn: () => unknown) => fn(),
}))

vi.mock('@/lib/audit/logger', () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

// Default checkpoint: proceed unless an interrupt key is staged in mock-redis.
// These tests stage NO interrupt key — the interrupt is simulated by the
// messaging.send mock returning `interrupted: true` mid-send-loop.
vi.mock('@/lib/agents/interruption-system-v2/checkpoints', () => ({
  checkpoint: vi.fn(async (_ckptId: string, _h: unknown, ws: unknown, ch: unknown, id: unknown) => {
    if (!mockRedis) return { proceed: true, lostLock: false }
    const all = mockRedis.__getAll()
    const val = all.store.get(`interrupt:${ws}:${ch}:${id}`)
    if (val) {
      all.store.delete(`interrupt:${ws}:${ch}:${id}`)
      return { proceed: false, lostLock: false, interrupted: { pendingListLength: 1 } }
    }
    return { proceed: true, lostLock: false }
  }),
}))

vi.mock('@/lib/agents/interruption-system-v2/lock', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agents/interruption-system-v2/lock')>(
    '@/lib/agents/interruption-system-v2/lock',
  )
  return { ...actual, startHeartbeat: () => () => {} }
})

// Mock the v4 agent — el CORE (turn-orchestrator) importa estáticamente
// `processMessage` desde `@/lib/agents/somnio-v4/somnio-v4-agent` (A13/D-09). El runner viejo
// hacía `await import('../somnio-v4')` (el index); tras el rewire a wrapper del core el specifier
// es el archivo directo del agente. CAMBIO DE SETUP SANCIONADO (A13/Pitfall 8) — los asserts no se tocan.
const agentMockFn = vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()
vi.mock('@/lib/agents/somnio-v4/somnio-v4-agent', () => ({
  processMessage: (input: V4AgentInput) => agentMockFn(input),
}))

// ---------------------------------------------------------------------------

import { acquireLock } from '@/lib/agents/interruption-system-v2/lock'
import { pushToPending } from '@/lib/agents/interruption-system-v2/pending'

let mockRedis: MockRedis
const WS = 'ws-pathb-1'
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
  for (const k of ['set', 'get', 'del', 'expire', 'rpush', 'lrem', 'lrange', 'llen', 'eval', 'multi'] as const) {
    ;(mockRedis[k] as unknown as { mockClear: () => void }).mockClear()
  }
  emittedEvents.length = 0
  agentMockFn.mockReset()

  // Real multi() that actually clears keys (readAndClearPending needs it).
  const allMaps = mockRedis.__getAll()
  interface MultiTx { del: (key: string) => MultiTx; exec: () => Promise<unknown[]> }
  mockRedis.multi.mockImplementation(() => {
    const keys: string[] = []
    const tx: MultiTx = {
      del: vi.fn((k: string): MultiTx => { keys.push(k); return tx }),
      exec: vi.fn(async (): Promise<unknown[]> => {
        for (const k of keys) { allMaps.lists.delete(k); allMaps.store.delete(k); allMaps.ttls.delete(k) }
        return []
      }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tx as any
  })
})

function tmpl(id: string, content: string): ProcessedMessage {
  return { templateId: id, content, contentType: 'texto', priority: 'CORE' } as ProcessedMessage
}

function agentOut(over: Partial<V4AgentOutput>): V4AgentOutput {
  return {
    success: true,
    messages: [],
    templates: [],
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
    totalTokens: 50,
    shouldCreateOrder: false,
    timerSignals: [],
    newMode: 'initial',
    intentInfo: { intent: 'saludo', confidence: 90, intent_confidence: 0.9, timestamp: new Date().toISOString() },
    // somnio-v4-turn-ledger Plan 04: turnLedgerDims es requerido por contrato
    // (commitTurn siempre lo produce). El fixture lo incluye con default vacío para
    // reflejar el contrato real (el runner ahora lo persiste + emite en PATH B).
    turnLedgerDims: { atendido: [], crmActions: [] },
    ...over,
  } as V4AgentOutput
}

function makeAdapters(mockSend: ReturnType<typeof vi.fn>) {
  const session = {
    id: 'sess-1', agent_id: 'somnio-sales-v4', conversation_id: 'conv-1', contact_id: 'contact-1',
    workspace_id: WS, version: 1, status: 'active' as const, current_mode: 'initial',
    state: {
      datos_capturados: {} as Record<string, string>,
      intents_vistos: [] as Array<{ intent: string }>,
      templates_enviados: [] as string[],
      pack_seleccionado: null as string | null,
    },
  }
  const saveState = vi.fn().mockResolvedValue(undefined)
  return {
    saveState,
    adapters: {
      storage: {
        getSession: vi.fn().mockResolvedValue(session),
        getOrCreateSession: vi.fn().mockResolvedValue(session),
        getHistory: vi.fn().mockResolvedValue([]),
        saveState,
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
        signal: vi.fn(), onCustomerMessage: vi.fn().mockResolvedValue(undefined),
        onModeTransition: vi.fn().mockResolvedValue(undefined), onIngestStarted: vi.fn().mockResolvedValue(undefined),
        onIngestCompleted: vi.fn().mockResolvedValue(undefined), onSilenceDetected: vi.fn().mockResolvedValue(undefined),
        getLastSignal: vi.fn().mockReturnValue(undefined), setSessionId: vi.fn(), emitSignals: vi.fn().mockResolvedValue(undefined),
      },
      orders: { createOrder: vi.fn().mockResolvedValue({ success: true, orderId: 'o-1', contactId: 'contact-1' }) },
      debug: {
        recordIntent: vi.fn(), recordTools: vi.fn(), recordTokens: vi.fn(), recordState: vi.fn(),
        recordClassification: vi.fn(), recordBlockComposition: vi.fn(), recordNoRepetition: vi.fn(),
        recordOfiInter: vi.fn(), recordPreSendCheck: vi.fn(), recordTimerSignals: vi.fn(),
        recordTemplateSelection: vi.fn(), recordTransitionValidation: vi.fn(), recordOrchestration: vi.fn(),
        recordIngestDetails: vi.fn(), recordDisambiguationLog: vi.fn(), getDebugTurn: vi.fn().mockReturnValue(undefined),
      },
    },
  }
}

describe('V4ProductionRunner — Path B clean reprocess (bug 2026-05-28)', { timeout: 30000 }, () => {
  // Pre-warm the runner module tree OUTSIDE the per-test timeout (WSL2 cold
  // import of the v4 engine + transitive deps takes 30-60s on first load).
  beforeAll(async () => {
    await import('@/lib/agents/engine/v4-production-runner')
  }, 120000)

  it('mid-send interrupt (≥1 sent) answers the new message clean: no re-greet, no re-send, full record', async () => {
    const IDENT = '+57300PB1'
    // Interrupting message queued by a follower.
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(), content: 'que precio', received_at: new Date().toISOString(), msg_id: 'm2',
    })

    // iter-1: greet turn → 2 templates; adapter sends #1 then aborts before #2.
    // iter-2: answer 'que precio' → 1 template; sends clean.
    agentMockFn
      .mockResolvedValueOnce(agentOut({
        templates: [tmpl('t-saludo', 'Hola!'), tmpl('t-promo', 'Promo!')],
        intentsVistos: ['saludo'],
        intentInfo: { intent: 'saludo', confidence: 90, intent_confidence: 0.9, timestamp: new Date().toISOString() },
      }))
      .mockResolvedValueOnce(agentOut({
        templates: [tmpl('t-precio', '$89.000')],
        intentsVistos: ['saludo', 'precio'],
        intentInfo: { intent: 'precio', confidence: 90, intent_confidence: 0.9, timestamp: new Date().toISOString() },
      }))

    const mockSend = vi.fn()
      .mockResolvedValueOnce({ messagesSent: 1, interrupted: true, interruptedAtIndex: 1 })
      .mockResolvedValueOnce({ messagesSent: 1, interrupted: false })

    const lockHandle = await acquireLock(WS, CHANNEL, IDENT)
    expect(lockHandle).not.toBeNull()

    const { saveState, adapters } = makeAdapters(mockSend)
    const { V4ProductionRunner } = await import('@/lib/agents/engine/v4-production-runner')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runner = new V4ProductionRunner(adapters as any, { workspaceId: WS })

    const output = await runner.processMessage({
      sessionId: 'sess-1', conversationId: 'conv-1', contactId: 'contact-1',
      message: 'hola', workspaceId: WS, history: [],
      lockHandle: lockHandle!, lockChannel: CHANNEL, lockIdentifier: IDENT,
      ownPendingEntryJson: null,
    })

    expect(output.success).toBe(true)

    // Agent invoked twice — the reprocess happened.
    expect(agentMockFn).toHaveBeenCalledTimes(2)
    // iter-2 answers the NEW message only (msg1 NOT recombined).
    expect(agentMockFn.mock.calls[1][0].message).toBe('que precio')
    // No re-greet: iter-2 is seeded with iter-1's intents (saludo already seen).
    expect(agentMockFn.mock.calls[1][0].intentsVistos).toEqual(['saludo'])
    // No re-send: iter-2 is seeded with iter-1's actually-sent template id.
    expect(agentMockFn.mock.calls[1][0].templatesEnviados).toContain('t-saludo')

    // Adapter invoked twice (msg1 partial + msg2 answer).
    expect(mockSend).toHaveBeenCalledTimes(2)

    // Path B event emitted.
    const pathB = emittedEvents.filter((e) => e.label === 'msg_aborted_path_b_solo')
    expect(pathB.length).toBeGreaterThanOrEqual(1)

    // Final templates_enviados union includes BOTH the sent saludo and precio.
    const templateSaves = saveState.mock.calls
      .map((c) => c[1])
      .filter((s: Record<string, unknown>) => Array.isArray(s.templates_enviados))
    const lastTemplateSave = templateSaves[templateSaves.length - 1] as { templates_enviados: string[] }
    expect(lastTemplateSave.templates_enviados).toContain('t-saludo')
    expect(lastTemplateSave.templates_enviados).toContain('t-precio')

    // Single lock lifetime.
    expect(emittedEvents.filter((e) => e.label === 'lock_released_normal')).toHaveLength(1)
  })

  it('accumulación: dos mensajes encolados (msg2+msg3) se contestan juntos en el reprocess', async () => {
    const IDENT = '+57300PB2'
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(), content: 'que precio', received_at: new Date().toISOString(), msg_id: 'm2',
    })
    await pushToPending(WS, CHANNEL, IDENT, {
      entry_uuid: randomUUID(), content: 'y envio?', received_at: new Date().toISOString(), msg_id: 'm3',
    })

    agentMockFn
      .mockResolvedValueOnce(agentOut({ templates: [tmpl('t-saludo', 'Hola!'), tmpl('t-promo', 'Promo!')], intentsVistos: ['saludo'] }))
      .mockResolvedValueOnce(agentOut({ templates: [tmpl('t-precio', '$89.000')], intentsVistos: ['saludo', 'precio'] }))

    const mockSend = vi.fn()
      .mockResolvedValueOnce({ messagesSent: 1, interrupted: true, interruptedAtIndex: 1 })
      .mockResolvedValueOnce({ messagesSent: 1, interrupted: false })

    const lockHandle = await acquireLock(WS, CHANNEL, IDENT)
    const { adapters } = makeAdapters(mockSend)
    const { V4ProductionRunner } = await import('@/lib/agents/engine/v4-production-runner')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runner = new V4ProductionRunner(adapters as any, { workspaceId: WS })

    const output = await runner.processMessage({
      sessionId: 'sess-1', conversationId: 'conv-1', contactId: 'contact-1',
      message: 'hola', workspaceId: WS, history: [],
      lockHandle: lockHandle!, lockChannel: CHANNEL, lockIdentifier: IDENT,
      ownPendingEntryJson: null,
    })

    expect(output.success).toBe(true)
    expect(agentMockFn).toHaveBeenCalledTimes(2)
    // BOTH queued messages combined into the reprocess (whole-list drain).
    expect(agentMockFn.mock.calls[1][0].message).toBe('que precio\ny envio?')
  })
})
