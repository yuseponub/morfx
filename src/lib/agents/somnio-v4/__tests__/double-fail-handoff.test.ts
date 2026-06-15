/**
 * somnio-v4-agent — Double-fail LLM handoff tests.
 *
 * Standalone: v4-llm-fallback-resilience / Plan 04 (D-05 + D-06).
 *
 * Verifica que cuando el fallback Gemini→Haiku falla en ambos proveedores:
 *   1. El sentinel 'llm_providers_down:' sobrevive el re-wrap de comprehension.ts
 *      (string assertion — PROVIDERS_DOWN_SENTINEL presente como substring).
 *   2. El agente devuelve success:false + requiresHuman:true + newMode:'handoff'
 *      + handoffReasonDetail set (D-06 coexistencia con D-05).
 *   3. Errores genuinos (non-sentinel) devuelven success:false SIN handoff flags
 *      (Pitfall #7 del RESEARCH — silent handoff bug class).
 *   4. engine_error observability NO se suprime en el doble-fallo (D-05).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PROVIDERS_DOWN_SENTINEL } from '../llm-fallback'
import type { V4AgentInput } from '../types'

// ---------------------------------------------------------------------------
// Controllable mock refs.
// ---------------------------------------------------------------------------

/** Controls whether comprehend throws and with which error. */
const comprehendThrowRef: { current: Error | null } = { current: null }

const recordEvent = vi.fn()

// ---------------------------------------------------------------------------
// Module mocks — must be declared before SUT import.
// ---------------------------------------------------------------------------

vi.mock('../comprehension', () => ({
  comprehend: async () => {
    if (comprehendThrowRef.current) throw comprehendThrowRef.current
    // Default success: return a minimal analysis so the happy-path runs.
    return {
      analysis: {
        intent: {
          primary: 'precio',
          secondary: 'ninguno',
          confidence: 95,
          reasoning: 'ok',
          intent_confidence: 0.95,
          secondary_confidence: null,
          secondary_confidence_reasoning: null,
          secondary_query: null,
        },
        extracted_fields: {
          nombre: null, apellido: null, telefono: null, ciudad: null,
          departamento: null, direccion: null, barrio: null, correo: null,
          indicaciones_extra: null, cedula_recoge: null, pack: null,
          entrega_oficina: null, menciona_inter: null,
        },
        classification: { category: 'pregunta', sentiment: 'neutro' },
        negations: { correo: false, telefono: false, barrio: false, cedula_recoge: false },
      },
      tokensUsed: 0,
    }
  },
}))

vi.mock('../sales-track', () => ({
  resolveSalesTrack: () => ({ reason: 'test' }),
}))

vi.mock('../response-track', () => ({
  resolveResponseTrack: async () => ({
    messages: [],
    templateIdsSent: [],
    salesTemplateIntents: [],
    infoTemplateIntents: [],
  }),
}))

vi.mock('../guards', () => ({
  checkGuards: () => ({ blocked: false }),
}))

vi.mock('../threshold', () => ({
  getLowConfidenceThreshold: async () => 0.7,
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

// SPY collector so we can assert engine_error emit.
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

/** Simula el re-wrap que hace comprehension.ts:197-201 al capturar el error del LLM. */
function rewrapSentinelError(callSite = 'comprehension'): Error {
  const sentinel = `${PROVIDERS_DOWN_SENTINEL} callSite=${callSite} gemini=billing anthropic=Error`
  // Replica exacta del re-wrap en comprehension.ts:197-201:
  return new Error(
    `[Comprehension-v4 generateText] Error: ${sentinel} | ` +
    `finishReason="no-finishReason" | text="no-text" | cause="no-cause" | response="no-response"`,
  )
}

function findEngineErrorCall() {
  return recordEvent.mock.calls.find(
    (c) => c[0] === 'pipeline_decision' && c[1] === 'engine_error',
  )
}

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  comprehendThrowRef.current = null
  recordEvent.mockClear()
})

// ===========================================================================
// Tests
// ===========================================================================

describe('double-fail-handoff — sentinel survival + handoff coexistence (D-05 + D-06)', () => {
  it('Test 1: sentinel sobrevive el re-wrap de comprehension', () => {
    // Verificación de string pura — sin agente.
    const rewrapped = rewrapSentinelError()
    expect(rewrapped.message).toContain(PROVIDERS_DOWN_SENTINEL)
    // .includes() debe ser true (Pitfall #7: usar includes, NO startsWith).
    expect(rewrapped.message.includes(PROVIDERS_DOWN_SENTINEL)).toBe(true)
    // El mensaje es más que el sentinel solo (está re-envuelto).
    expect(rewrapped.message.startsWith(PROVIDERS_DOWN_SENTINEL)).toBe(false)
  })

  it('Test 2: error con sentinel → success:false + requiresHuman:true + newMode:handoff', async () => {
    comprehendThrowRef.current = rewrapSentinelError()

    const out = await processMessage(makeInput())

    // D-05: success sigue siendo false (NO se convierte en success).
    expect(out.success).toBe(false)
    // D-06: handoff flags presentes.
    expect(out.requiresHuman).toBe(true)
    expect(out.newMode).toBe('handoff')
    expect(out.handoffReasonDetail).toBe('ambos proveedores LLM caídos (Gemini + Haiku)')
  })

  it('Test 3: error con sentinel → engine_error observability NO suprimido (D-05)', async () => {
    comprehendThrowRef.current = rewrapSentinelError()

    await processMessage(makeInput())

    const call = findEngineErrorCall()
    expect(call).toBeDefined()
    expect(call![0]).toBe('pipeline_decision')
    expect(call![1]).toBe('engine_error')
  })

  it('Test 4: error NO-sentinel → success:false SIN handoff flags (Pitfall #7 — no silent handoff bug)', async () => {
    comprehendThrowRef.current = new Error('NoObjectGeneratedError: schema mismatch')

    const out = await processMessage(makeInput())

    expect(out.success).toBe(false)
    // Sin handoff flags en error genuino.
    expect(out.requiresHuman).toBeUndefined()
    expect(out.newMode).toBeUndefined()
    expect(out.handoffReasonDetail).toBeUndefined()
  })

  it('Test 5: error con sentinel lleva errorStage del stage donde reventó (D-01)', async () => {
    comprehendThrowRef.current = rewrapSentinelError()

    const out = await processMessage(makeInput())

    // El stage en el catch es 'comprehension' (currentStage al momento del throw).
    expect(out.errorStage).toBe('comprehension')
  })
})
