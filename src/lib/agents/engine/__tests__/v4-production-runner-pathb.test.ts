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
import { VersionConflictError } from '../../errors'

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
//
// M-01 (review): a per-test `checkpointOverrideRef` lets a test surgically force
// a specific ckptId (e.g. CKPT-6b with opts.hasSentAnything) to interrupt WITHOUT
// staging a redis interrupt key (which CKPT-0 would consume first). Returning null
// from the override falls through to the default behavior.
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
  checkpoint: vi.fn(async (
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
  setCheckpointOverride(null)

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

  // =========================================================================
  // H-01 (review) — retry de VersionConflictError. `commitTurn` (vía storage.updateMode con
  // optimistic locking) corre DENTRO de loopBody() del core; el catch del core lo convierte a
  // `{ kind:'error', cause }` SIN re-lanzar. El wrapper DEBE inspeccionar `result.cause instanceof
  // VersionConflictError` y reintentar processMessage (restaura el retry del runner viejo :1124,
  // que era código muerto tras el rewrite). Sin test previo (grep VersionConflict en suites = 0).
  // =========================================================================
  it('H-01: VersionConflictError en updateMode reintenta el turno (máx 3) y eventualmente tiene éxito', async () => {
    const IDENT = '+57300H01'
    // Sin pending → un solo turno limpio que llega a commitTurn → updateMode.

    // newMode 'sales' ≠ current_mode 'initial' → updateMode SÍ se invoca (gated).
    agentMockFn.mockResolvedValue(agentOut({
      templates: [tmpl('t-saludo', 'Hola!')],
      newMode: 'sales',
      intentsVistos: ['saludo'],
    }))

    // Send limpio en cada intento (sin interrupt).
    const mockSend = vi.fn().mockResolvedValue({ messagesSent: 1, interrupted: false })

    const lockHandle = await acquireLock(WS, CHANNEL, IDENT)
    expect(lockHandle).not.toBeNull()

    const { adapters } = makeAdapters(mockSend)
    // updateMode: 1er intento lanza VersionConflictError; 2do intento OK.
    let updateModeCalls = 0
    adapters.storage.updateMode = vi.fn(async () => {
      updateModeCalls++
      if (updateModeCalls === 1) throw new VersionConflictError('sess-1', 1)
      return undefined
    })

    const { V4ProductionRunner } = await import('@/lib/agents/engine/v4-production-runner')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runner = new V4ProductionRunner(adapters as any, { workspaceId: WS })

    const output = await runner.processMessage({
      sessionId: 'sess-1', conversationId: 'conv-1', contactId: 'contact-1',
      message: 'hola', workspaceId: WS, history: [],
      lockHandle: lockHandle!, lockChannel: CHANNEL, lockIdentifier: IDENT,
      ownPendingEntryJson: null,
    })

    // El turno reintentó: éxito tras el retry (NO V4_ENGINE_ERROR).
    expect(output.success).toBe(true)
    expect(output.error).toBeUndefined()
    expect(output.newMode).toBe('sales')
    // updateMode invocado 2 veces (intento fallido + retry OK).
    expect(updateModeCalls).toBe(2)
    // El agente corrió 2 veces (un turno completo por intento — re-entry de processMessage).
    expect(agentMockFn).toHaveBeenCalledTimes(2)
  })

  it('H-01: VersionConflictError persistente agota los 3 reintentos y retorna V4_ENGINE_ERROR', async () => {
    const IDENT = '+57300H01B'

    agentMockFn.mockResolvedValue(agentOut({
      templates: [tmpl('t-saludo', 'Hola!')],
      newMode: 'sales',
      intentsVistos: ['saludo'],
    }))
    const mockSend = vi.fn().mockResolvedValue({ messagesSent: 1, interrupted: false })

    const lockHandle = await acquireLock(WS, CHANNEL, IDENT)
    const { adapters } = makeAdapters(mockSend)
    // updateMode SIEMPRE lanza → agota los reintentos.
    const updateMode = vi.fn(async () => { throw new VersionConflictError('sess-1', 1) })
    adapters.storage.updateMode = updateMode

    const { V4ProductionRunner } = await import('@/lib/agents/engine/v4-production-runner')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runner = new V4ProductionRunner(adapters as any, { workspaceId: WS })

    const output = await runner.processMessage({
      sessionId: 'sess-1', conversationId: 'conv-1', contactId: 'contact-1',
      message: 'hola', workspaceId: WS, history: [],
      lockHandle: lockHandle!, lockChannel: CHANNEL, lockIdentifier: IDENT,
      ownPendingEntryJson: null,
    })

    // Tras agotar MAX_VERSION_CONFLICT_RETRIES (3) → error prod (success:false).
    expect(output.success).toBe(false)
    expect(output.error?.code).toBe('V4_ENGINE_ERROR')
    // Intento inicial (retryCount 0) + 3 reintentos = 4 invocaciones de updateMode.
    expect(updateMode).toHaveBeenCalledTimes(4)
  })

  // =========================================================================
  // M-01 (review) — early-return de CKPT-6b Path B con pending vacío: el output de msg1 fue
  // DESCARTADO (solo se enviaron los pending-templates de un turno previo). El runner viejo
  // retornaba { success:true, messages:[] } SIN newMode/orderCreated. La reescritura exponía el
  // output descartado completo → si traía newMode='handoff', webhook-processor:1053 ejecutaría un
  // handoff fantasma. El fix marca outputDiscarded:true en el core y mapResult los suprime.
  // =========================================================================
  it('M-01: CKPT-6b Path B pending-vacío NO propaga newMode/orderCreated del output descartado', async () => {
    const IDENT = '+57300M01'

    // CKPT-6a corre porque el adapter implementa getPendingTemplates con 1 template pendiente del
    // turno previo → se envía → actuallySentIds.length > 0 en CKPT-6b. El send limpio NO interrumpe.
    const mockSend = vi.fn().mockResolvedValue({ messagesSent: 1, interrupted: false })

    const lockHandle = await acquireLock(WS, CHANNEL, IDENT)
    const { adapters } = makeAdapters(mockSend)
    // Pending-templates de un turno previo (CKPT-6a los envía → actuallySentIds.length > 0).
    adapters.storage.getPendingTemplates = vi.fn().mockResolvedValue([
      { templateId: 'pending-1', content: 'pendiente previo', contentType: 'template', priority: 'CORE' },
    ])
    adapters.storage.clearPendingTemplates = vi.fn().mockResolvedValue(undefined)

    // El output de msg1 trae newMode='handoff' — DEBE ser descartado, NO propagado.
    agentMockFn.mockResolvedValueOnce(agentOut({
      templates: [tmpl('t-precio', '$89.000')],
      newMode: 'handoff',
      crmResult: { success: true, orderId: 'o-fantasma', contactId: 'contact-1' },
    } as Partial<V4AgentOutput>))

    // Forzar SOLO el CKPT-6b (hasSentAnything:true tras enviar el pending-template) a interrumpir
    // con pending VACÍO (pendingListLength 0). CKPT-6a (hasSentAnything:false) y CKPT-0 proceden.
    // El pending list real está vacío (no pushToPending) → drainB.pendingCount === 0 → early-return
    // del output DESCARTADO de msg1. Sin staging de interrupt key (CKPT-0 lo consumiría primero).
    setCheckpointOverride((ckptId, opts) => {
      if (ckptId === 'ckpt_6_pre_send_loop' && opts?.hasSentAnything === true) {
        return { proceed: false, lostLock: false, interrupted: { pendingListLength: 0 } }
      }
      return null
    })

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
    // CRÍTICO (M-01): el newMode='handoff' del output DESCARTADO NO se propaga → no hay handoff
    // fantasma en webhook-processor:1053.
    expect(output.newMode).toBeUndefined()
    // orderCreated/orderId del output descartado tampoco se propagan.
    expect(output.orderCreated).toBeUndefined()
    expect(output.orderId).toBeUndefined()
    // El agente del msg1 corrió una vez (su output fue descartado, no recombinado).
    expect(agentMockFn).toHaveBeenCalledTimes(1)
  })
})
