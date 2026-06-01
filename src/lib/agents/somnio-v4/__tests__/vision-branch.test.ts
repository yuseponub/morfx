/**
 * vision-branch.test.ts — Dedicated vision branch in somnio-v4-agent.ts (Plan 04).
 *
 * Verifica el contrato D-05 CORE:
 *  - Cuando input.visionContext está presente, el agente toma un early path
 *    ANTES de comprehend(), llamando runSubLoop con la descripcion como query.
 *  - comprehend() NUNCA se llama cuando visionContext está presente.
 *  - generated (conf 0.9) → output.templates[0].templateId === 'rag:<topic>'
 *  - no_match → newMode 'handoff', requiresHuman true, sin templates (D-07)
 *  - interrupted → success:false, errorMessage empieza con 'interrupted_at_ckpt_'
 *  - visionContext AUSENTE → path normal corre (comprehend sí se llama)
 *
 * standalone v4-media-audio-image Plan 04.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { LoopOutcome } from '../sub-loop/output-schema'
import type { V4AgentInput } from '../types'

// ---------------------------------------------------------------------------
// Controllable mocks
// ---------------------------------------------------------------------------

// runSubLoop outcome (controllable per test)
const subLoopRef: { current: LoopOutcome } = {
  current: {
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
  },
}

// Track whether comprehend was called
let comprehendCallCount = 0

vi.mock('../sub-loop', () => ({
  runSubLoop: async (args: { ctx: { userMessage: string }; reason: string }) => {
    return subLoopRef.current
  },
}))

vi.mock('../comprehension', () => ({
  comprehend: async () => {
    comprehendCallCount++
    return {
      analysis: {
        intent: {
          primary: 'precio',
          secondary: 'ninguno',
          confidence: 95,
          reasoning: 'test',
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
      tokensUsed: 42,
    }
  },
}))

vi.mock('../sales-track', () => ({
  resolveSalesTrack: () => ({ reason: 'test' }),
}))

vi.mock('../response-track', () => ({
  resolveResponseTrack: async () => ({
    messages: ['respuesta normal'],
    templateIdsSent: ['precio_CORE'],
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

vi.mock('../crm-gate', () => ({
  runCrmGate: async () => ({ crmActions: [], crmResult: undefined }),
}))

vi.mock('../unknown-cases/capture', () => ({
  captureUnknownCase: async () => {},
}))

vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: () => {}, setRespondingAgentId: () => {} }),
  runWithCollector: (_c: unknown, fn: () => unknown) => fn(),
  runWithPurpose: (_p: unknown, fn: () => unknown) => fn(),
}))

// ---------------------------------------------------------------------------
// SUT (post-mock)
// ---------------------------------------------------------------------------

import { processMessage } from '../somnio-v4-agent'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeBaseInput(overrides: Partial<V4AgentInput> = {}): V4AgentInput {
  return {
    message: '',
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

function makeVisionInput(overrides: Partial<V4AgentInput> = {}): V4AgentInput {
  return makeBaseInput({
    visionContext: { descripcion: 'foto del frasco ELIXIR DEL SUEÑO', categoria: 'producto' },
    ...overrides,
  })
}

function makeGeneratedOutcome(overrides: Partial<LoopOutcome> = {}): LoopOutcome {
  return {
    status: 'generated',
    responseText: 'El ELIXIR DEL SUEÑO tiene melatonina, valeriana...',
    sourceTopic: 'product-contenido',
    responseConfidence: 0.9,
    confidenceRationale: 'Alta confianza',
    nuncaDecirRules: [],
    responseTemplate: null,
    knowledgeQueried: null,
    requiresHuman: false,
    reason: 'ok',
    ...overrides,
  }
}

function makeNoMatchOutcome(): LoopOutcome {
  return {
    status: 'no_match',
    responseText: null,
    sourceTopic: null,
    responseConfidence: null,
    confidenceRationale: null,
    nuncaDecirRules: null,
    responseTemplate: 'handoff_humano',
    knowledgeQueried: [],
    requiresHuman: true,
    reason: 'no_kb_match',
  }
}

function makeInterruptOutcome(): LoopOutcome {
  return {
    status: 'no_match',
    responseText: null,
    sourceTopic: null,
    responseConfidence: null,
    confidenceRationale: null,
    nuncaDecirRules: null,
    responseTemplate: null,
    knowledgeQueried: null,
    requiresHuman: true,
    reason: 'interrupted_at_ckpt_4_post_generation',
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('vision branch (D-05 dedicated + KB-grounded)', () => {
  beforeEach(() => {
    comprehendCallCount = 0
    subLoopRef.current = makeNoMatchOutcome()
  })

  it('C1: generated (conf 0.9) → rag: template in output.templates', async () => {
    subLoopRef.current = makeGeneratedOutcome()

    const out = await processMessage(makeVisionInput())

    expect(out.success).toBe(true)
    expect(out.templates).toBeDefined()
    expect(out.templates!.length).toBe(1)
    expect(out.templates![0].templateId).toBe('rag:product-contenido')
    expect(out.templates![0].content).toBe('El ELIXIR DEL SUEÑO tiene melatonina, valeriana...')
    expect(out.templates![0].contentType).toBe('texto')
    expect(out.templates![0].priority).toBe('CORE')
    // messages array should contain the responseText
    expect(out.messages.length).toBeGreaterThanOrEqual(1)
  })

  it('C2: no_match → handoff (newMode, requiresHuman, no templates) — D-07', async () => {
    subLoopRef.current = makeNoMatchOutcome()

    const out = await processMessage(makeVisionInput())

    expect(out.success).toBe(true)
    expect(out.newMode).toBe('handoff')
    expect(out.requiresHuman).toBe(true)
    expect(out.templates ?? []).toHaveLength(0)
    expect(out.messages).toHaveLength(0)
  })

  it('C3: interrupt → success:false, errorMessage starts with interrupted_at_ckpt_', async () => {
    subLoopRef.current = makeInterruptOutcome()

    const out = await processMessage(makeVisionInput())

    expect(out.success).toBe(false)
    expect(out.errorMessage).toBeDefined()
    expect(out.errorMessage!.startsWith('interrupted_at_ckpt_')).toBe(true)
  })

  it('C4: visionContext present → comprehend NOT called (D-05 dedicated proof)', async () => {
    subLoopRef.current = makeGeneratedOutcome()

    await processMessage(makeVisionInput())

    expect(comprehendCallCount).toBe(0)
  })

  it('C5: visionContext ABSENT → normal path runs (comprehend called) — regression guard', async () => {
    // Normal text turn: use a full analysis so the normal path doesn't fail
    await processMessage(makeBaseInput({ message: 'cuanto cuesta' }))

    expect(comprehendCallCount).toBeGreaterThanOrEqual(1)
  })
})
