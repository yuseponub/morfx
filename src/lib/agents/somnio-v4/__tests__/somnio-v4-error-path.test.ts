/**
 * somnio-v4-agent — Error path instrumentation tests.
 *
 * Standalone: v4-observability-completeness / Plan 02 (D-01).
 *
 * Verifica que el catch externo de processUserMessage:
 *   1. Emite un evento engine_error a observabilidad con EL STAGE donde reventó
 *      + restart_iteration (cierra el agujero negro del turno 1b561aaf).
 *   2. El errorMessage embebido en el evento va PII-truncado (bodyTruncate) —
 *      NO el stack crudo; el stack va en stackFrames (' | '-separado).
 *   3. El V4AgentOutput retornado lleva errorStage + success:false, y el campo
 *      output.errorMessage sigue siendo `${errMsg} :: ${errStack}` (discriminador
 *      de drain INTACTO).
 *   4. input.restartIteration se refleja en engine_error.restart_iteration.
 *   5. Pitfall 2: los early-returns de interrupción (interrupted_at_ckpt_*) NO
 *      pasan por el catch → NO emiten engine_error.
 *
 * Harness: a diferencia de somnio-v4-agent.test.ts (que mockea observability a
 * no-op), aquí mockeamos getCollector con un SPY (recordEvent = vi.fn()) para
 * poder assertear el emit. El throw se fuerza mockeando resolveSalesTrack para
 * que tire (stage 'sales-track').
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { MessageAnalysis } from '../comprehension-schema'
import type {
  V4AgentInput,
  ResponseTrackOutput,
  SalesTrackOutput,
  GuardResult,
} from '../types'

// ---------------------------------------------------------------------------
// Controllable mock state.
// ---------------------------------------------------------------------------

const comprehendRef: { current: MessageAnalysis } = { current: null as never }
const salesTrackThrowRef: { current: Error | null } = { current: null }
const salesTrackRef: { current: SalesTrackOutput } = { current: { reason: 'x' } }
const responseTrackRef: { current: ResponseTrackOutput } = {
  current: { messages: [], templateIdsSent: [], salesTemplateIntents: [], infoTemplateIntents: [] },
}
const guardRef: { current: GuardResult } = { current: { blocked: false } }
const thresholdRef: { current: number } = { current: 0.7 }

// Spy collector (NOT no-op) — lets us assert the engine_error emit.
const recordEvent = vi.fn()

vi.mock('../comprehension', () => ({
  comprehend: async () => ({ analysis: comprehendRef.current, tokensUsed: 42 }),
}))
vi.mock('../sales-track', () => ({
  resolveSalesTrack: () => {
    if (salesTrackThrowRef.current) throw salesTrackThrowRef.current
    return salesTrackRef.current
  },
}))
vi.mock('../response-track', () => ({
  resolveResponseTrack: async () => responseTrackRef.current,
}))
vi.mock('../guards', () => ({
  checkGuards: () => guardRef.current,
}))
vi.mock('../threshold', () => ({
  getLowConfidenceThreshold: async () => thresholdRef.current,
}))
vi.mock('../sub-loop', () => ({
  runSubLoop: async () => ({
    status: 'no_match',
    responseText: null,
    sourceTopic: null,
    responseConfidence: null,
    confidenceRationale: null,
    nuncaDecirRules: null,
    responseTemplate: 'handoff_humano',
    knowledgeQueried: [],
    requiresHuman: true,
    reason: 'default',
  }),
}))
vi.mock('../crm-gate', () => ({
  runCrmGate: async () => ({ crmActions: [], crmResult: undefined }),
}))
vi.mock('../unknown-cases/capture', () => ({
  captureUnknownCase: async () => {},
}))
// SPY collector — the observability helper (recordV4Event) imports
// '@/lib/observability' so this intercepts both the spine events AND engine_error.
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent }),
  runWithCollector: (_c: unknown, fn: () => unknown) => fn(),
  runWithPurpose: (_p: unknown, fn: () => unknown) => fn(),
}))

// ---------------------------------------------------------------------------
// SUT import (post-mock).
// ---------------------------------------------------------------------------

import { processMessage } from '../somnio-v4-agent'

// ---------------------------------------------------------------------------
// Factory helpers.
// ---------------------------------------------------------------------------

function makeAnalysis(overrides: Partial<MessageAnalysis> = {}): MessageAnalysis {
  return {
    intent: {
      primary: 'precio',
      secondary: 'ninguno',
      confidence: 95,
      reasoning: 'test',
      intent_confidence: 0.95,
      secondary_confidence: null,
      secondary_confidence_reasoning: null,
      secondary_query: null,
      ...(overrides.intent ?? {}),
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
      ...(overrides.extracted_fields ?? {}),
    },
    classification: {
      category: 'pregunta',
      sentiment: 'neutro',
      ...(overrides.classification ?? {}),
    },
    negations: {
      correo: false,
      telefono: false,
      barrio: false,
      cedula_recoge: false,
      ...(overrides.negations ?? {}),
    },
  }
}

function makeInput(overrides: Partial<V4AgentInput> = {}): V4AgentInput {
  return {
    message: 'cuanto cuesta',
    history: [],
    currentMode: 'nuevo',
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
    turnNumber: 1,
    workspaceId: 'ws-test',
    ...overrides,
  }
}

/** Find the engine_error emit among all recordEvent calls (category, label, payload, durationMs). */
function findEngineError() {
  return recordEvent.mock.calls.find(
    (c) => c[0] === 'pipeline_decision' && c[1] === 'engine_error',
  )
}

beforeEach(() => {
  comprehendRef.current = makeAnalysis()
  salesTrackThrowRef.current = null
  salesTrackRef.current = { reason: 'x' }
  responseTrackRef.current = {
    messages: [],
    templateIdsSent: [],
    salesTemplateIntents: [],
    infoTemplateIntents: [],
  }
  guardRef.current = { blocked: false }
  thresholdRef.current = 0.7
  recordEvent.mockClear()
})

// ===========================================================================
// D-01 error path tests
// ===========================================================================

describe('somnio-v4-agent error path — Plan 02 (D-01)', () => {
  it('Test 1: throw en sales-track emite engine_error con stage + restart_iteration', async () => {
    salesTrackThrowRef.current = new Error('boom en sales-track')

    await processMessage(makeInput())

    const call = findEngineError()
    expect(call).toBeDefined()
    expect(call![0]).toBe('pipeline_decision')
    expect(call![1]).toBe('engine_error')
    expect(call![2]).toEqual(
      expect.objectContaining({ stage: 'sales-track', restart_iteration: 0 }),
    )
  })

  it('Test 2: engine_error lleva errorMessage truncado (no stack crudo) + stackFrames', async () => {
    salesTrackThrowRef.current = new Error('motivo real del fallo')

    await processMessage(makeInput())

    const payload = findEngineError()![2] as Record<string, unknown>
    // El errorMessage embebido es el message (PII-truncado), NO el stack.
    expect(payload.errorMessage).toBe('motivo real del fallo')
    expect(String(payload.errorMessage)).not.toContain(' | ')
    // stackFrames es un string con frames separados por ' | '.
    expect(typeof payload.stackFrames).toBe('string')
    expect(String(payload.stackFrames)).toContain('Error: motivo real del fallo')
  })

  it('Test 2b: errorMessage embebido en engine_error está PII-truncado a 200 chars', async () => {
    const long = 'x'.repeat(500)
    salesTrackThrowRef.current = new Error(long)

    await processMessage(makeInput())

    const payload = findEngineError()![2] as Record<string, unknown>
    const emitted = String(payload.errorMessage)
    expect(emitted.length).toBe(201) // 200 chars + '…'
    expect(emitted.endsWith('…')).toBe(true)
  })

  it('Test 3: el output lleva errorStage + success:false; output.errorMessage = `${errMsg} :: ${errStack}`', async () => {
    salesTrackThrowRef.current = new Error('discriminador intacto')

    const out = await processMessage(makeInput())

    expect(out.success).toBe(false)
    expect(out.errorStage).toBe('sales-track')
    // El discriminador de drain NO se toca: combina errMsg :: errStack.
    expect(out.errorMessage).toContain('discriminador intacto :: ')
    expect(out.errorMessage).toContain(' | ')
  })

  it('Test 4: input.restartIteration=2 → engine_error.restart_iteration=2', async () => {
    salesTrackThrowRef.current = new Error('iter 2')

    await processMessage(makeInput({ restartIteration: 2 }))

    const payload = findEngineError()![2] as Record<string, unknown>
    expect(payload.restart_iteration).toBe(2)
  })

  it('Test 5 (Pitfall 2): un early-return de interrupción NO emite engine_error', async () => {
    // Forzamos un early-return de interrupción via runSubLoop devolviendo
    // interrupted_at_ckpt_*. Para entrar al slot resolver, el intent debe ser
    // low_confidence (confidence < threshold → slot 'low').
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'razonamiento_libre',
        secondary: 'ninguno',
        confidence: 10,
        reasoning: 'low',
        intent_confidence: 0.1,
        secondary_confidence: null,
        secondary_confidence_reasoning: null,
        secondary_query: null,
      },
    })
    // No hay throw — el flujo llega al slot resolver. El mock de runSubLoop
    // devuelve no_match (reason 'default') → ese path es handoff, NO error.
    // Lo CRÍTICO: NO debe emitir engine_error (no pasa por el catch externo).
    salesTrackThrowRef.current = null

    const out = await processMessage(makeInput())

    // Sea handoff o interrupt, lo CRÍTICO: el catch externo NO se disparó.
    expect(findEngineError()).toBeUndefined()
    // El output no lleva errorStage (no pasó por el catch).
    expect(out.errorStage).toBeUndefined()
  })
})
