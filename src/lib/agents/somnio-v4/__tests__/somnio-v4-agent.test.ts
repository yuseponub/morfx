/**
 * somnio-v4-agent — Turn Ledger construction tests.
 *
 * Standalone: somnio-v4-turn-ledger / Plan 03.
 *
 * Verifica que los 7 commit-paths reales (R1..R6, R10) construyan un TurnLedger
 * COMPLETO (incl. modeTransition + messagesSent, D-17) y pasen por commitTurn,
 * con el FIX CENTRAL D-05: la rama RAG (mapOutcome status='generated') registra
 * atendido kind:'kb_topic' DESDE outcome.* (sourceTopic/responseConfidence/responseText).
 *
 * Harness: en vez de espejar engine-v4-lock.test.ts (que mockea processMessage
 * entero), aquí invocamos el agente REAL con sus DEPENDENCIAS mockeadas
 * (comprehend / guards / sales-track / response-track / runSubLoop / threshold /
 * runCrmGate / observability). Esto deja que la lógica de construcción del
 * ledger del agente corra de verdad y aserta sobre output.turnLedgerDims.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { MessageAnalysis } from '../comprehension-schema'
import type {
  V4AgentInput,
  ResponseTrackOutput,
  SalesTrackOutput,
  GuardResult,
} from '../types'
import type { LoopOutcome } from '../sub-loop/output-schema'

// ---------------------------------------------------------------------------
// Controllable mock state (closure-bound refs read inside vi.mock factories).
// ---------------------------------------------------------------------------

const comprehendRef: { current: MessageAnalysis } = { current: null as never }
const salesTrackRef: { current: SalesTrackOutput } = { current: { reason: 'x' } }
const responseTrackRef: { current: ResponseTrackOutput } = {
  current: { messages: [], templateIdsSent: [], salesTemplateIntents: [], infoTemplateIntents: [] },
}
const guardRef: { current: GuardResult } = { current: { blocked: false } }
const thresholdRef: { current: number } = { current: 0.7 }
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

vi.mock('../comprehension', () => ({
  comprehend: async () => ({ analysis: comprehendRef.current, tokensUsed: 42 }),
}))
vi.mock('../sales-track', () => ({
  resolveSalesTrack: () => salesTrackRef.current,
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
  runSubLoop: async () => subLoopRef.current,
}))
// Plan 06: executeInvocations + el createOrder inline fueron reemplazados por el
// gate CRM (runCrmGate). Lo mockeamos para que devuelva sin crmActions (el ledger
// del user path usa crmGateOut.crmActions; aquí no probamos el sub-loop CRM real).
vi.mock('../crm-gate', () => ({
  runCrmGate: async () => ({ crmActions: [], crmResult: undefined }),
}))
vi.mock('../unknown-cases/capture', () => ({
  captureUnknownCase: async () => {},
}))
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: () => {} }),
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

function makeProcessedMsg(content: string) {
  return {
    templateId: content,
    content,
    contentType: 'texto' as const,
    delayMs: 0,
    priority: 'CORE' as const,
  }
}

beforeEach(() => {
  comprehendRef.current = makeAnalysis()
  salesTrackRef.current = { reason: 'x' }
  responseTrackRef.current = {
    messages: [],
    templateIdsSent: [],
    salesTemplateIntents: [],
    infoTemplateIntents: [],
  }
  guardRef.current = { blocked: false }
  thresholdRef.current = 0.7
})

// ===========================================================================
// Task 1 tests
// ===========================================================================

describe('somnio-v4-agent Turn Ledger — Plan 03 (D-05/D-15/D-17/D-02/D-06)', () => {
  it('RAG ledger (R5, D-05): mapOutcome generated registra kb_topic desde outcome.*', async () => {
    // Force escalation to sub-loop: low confidence < threshold (intent 'otro' sumidero).
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'otro',
        secondary: 'ninguno',
        confidence: 30,
        reasoning: 'fuera de flujo',
        intent_confidence: 0.2,
        secondary_confidence: null,
        secondary_confidence_reasoning: null,
        secondary_query: null,
      },
    })
    subLoopRef.current = {
      status: 'generated',
      responseText: 'La apnea del sueño se asocia con ronquidos...',
      sourceTopic: 'apnea',
      responseConfidence: 0.85,
      confidenceRationale: 'match directo',
      nuncaDecirRules: [],
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'rag_generated',
    }

    const out = await processMessage(makeInput({ message: 'que es la apnea?' }))

    expect(out.turnLedgerDims.atendido).toHaveLength(1)
    const atendido = out.turnLedgerDims.atendido[0]
    expect(atendido).toMatchObject({
      kind: 'kb_topic',
      topic: 'apnea',
      confidence: 0.85,
      texto: 'La apnea del sueño se asocia con ronquidos...',
    })
    // turno presente (state.turnCount tras merge).
    expect(atendido.kind === 'kb_topic' && typeof atendido.turno).toBe('number')
  })

  it('silence ledger (R2, D-15): silencio natural registra atendido kind:silence', async () => {
    // sales-track returns a non-message action; response-track returns no messages.
    salesTrackRef.current = { accion: 'silence', reason: 'sin respuesta necesaria' }
    responseTrackRef.current = {
      messages: [],
      templateIdsSent: [],
      salesTemplateIntents: [],
      infoTemplateIntents: [],
    }

    const out = await processMessage(makeInput({ message: 'ok gracias' }))

    expect(out.turnLedgerDims.atendido).toEqual([{ kind: 'silence' }])
    expect(out.messages).toEqual([])
  })

  it('template ledger (R6): mapOutcome template registra template_intent', async () => {
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'otro',
        secondary: 'ninguno',
        confidence: 40,
        reasoning: 'sumidero',
        intent_confidence: 0.3,
        secondary_confidence: null,
        secondary_confidence_reasoning: null,
        secondary_query: null,
      },
    })
    subLoopRef.current = {
      status: 'template',
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      responseTemplate: 'pedir_datos',
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'template_path',
    }

    const out = await processMessage(makeInput())

    expect(out.turnLedgerDims.atendido).toEqual([
      { kind: 'template_intent', intent: 'otro', templateIds: ['pedir_datos'] },
    ])
  })

  it('ledger COMPLETO modeTransition+messagesSent (R3, D-17): no quedan campos fantasma', async () => {
    // Happy path with messages: sales action + info template + 2 messages.
    salesTrackRef.current = { accion: 'ofrecer_promos', reason: 'cliente pidió precio' }
    responseTrackRef.current = {
      messages: [makeProcessedMsg('precio msg'), makeProcessedMsg('promo msg')],
      templateIdsSent: ['precio_core', 'promo_core'],
      salesTemplateIntents: ['promo_core'],
      infoTemplateIntents: ['precio_core'],
    }

    const out = await processMessage(makeInput({ currentMode: 'nuevo' }))

    // messagesSent reflects templates sent (2). We assert via the persisted dims +
    // the agent newMode (modeTransition.to === newMode). Since modeTransition is NOT
    // persisted by commitTurn (D-17), we assert the OBSERVABLE proxies: messages were
    // sent and the persisted atendido captured both sales_action and template_intent.
    expect(out.messages).toEqual(['precio msg', 'promo msg'])
    expect(out.turnLedgerDims.atendido).toEqual(
      expect.arrayContaining([
        { kind: 'sales_action', accion: 'ofrecer_promos', templateIds: ['promo_core'] },
        { kind: 'template_intent', intent: 'precio', templateIds: ['precio_core'] },
      ]),
    )
    // newMode is the modeTransition.to target (promos action → 'promos' mode).
    expect(out.newMode).toBe('promos')
  })

  it('decisiones intactas (D-02): el ledger no altera intent/sales-action/templates enviados', async () => {
    salesTrackRef.current = { accion: 'ofrecer_promos', reason: 'r' }
    responseTrackRef.current = {
      messages: [makeProcessedMsg('m1')],
      templateIdsSent: ['t1'],
      salesTemplateIntents: ['t1'],
      infoTemplateIntents: [],
    }

    const out = await processMessage(makeInput())

    // Decision outputs identical to what the mocked tracks produced — el ledger es
    // capa de efectos al final, no toca la decisión.
    expect(out.salesTrackInfo?.accion).toBe('ofrecer_promos')
    expect(out.messages).toEqual(['m1'])
    expect(out.templatesEnviados).toContain('t1')
  })

  it('no intra-turn read (D-06): el código fuente del agente NO lee turnLedgerDims', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../somnio-v4-agent.ts'),
      'utf-8',
    )
    // Ninguna LECTURA de turnLedgerDims (acceso .x o [..]). El passthrough del input
    // en los interrupt/error paths usa `input.turnLedgerDims ?? {...}` (eso es lectura
    // del input para descartar el turno, permitido); el grep del plan apunta a
    // `turnLedgerDims.` o `turnLedgerDims[` que serían lecturas de campos internos.
    expect(src).not.toMatch(/turnLedgerDims\s*[.[]/)
  })

  it('R1 guard blocked: handoff registra atendido kind:handoff', async () => {
    guardRef.current = {
      blocked: true,
      decision: { action: 'handoff', reason: 'escape intent', tipoAccion: 'handoff' },
    }

    const out = await processMessage(makeInput())

    expect(out.newMode).toBe('handoff')
    expect(out.turnLedgerDims.atendido).toEqual([
      { kind: 'handoff', reason: 'escape intent' },
    ])
  })

  // =========================================================================
  // Task 2 — R10 (timer / processSystemEvent)
  // =========================================================================

  it('timer ledger (R10): processSystemEvent con acción CRM produce crmActions origen:timer', async () => {
    salesTrackRef.current = { accion: 'crear_orden', reason: 'timer dispara orden' }
    responseTrackRef.current = {
      messages: [makeProcessedMsg('orden creada')],
      templateIdsSent: ['confirmacion_orden'],
      salesTemplateIntents: ['confirmacion_orden'],
      infoTemplateIntents: [],
    }

    const out = await processMessage(
      makeInput({ systemEvent: { type: 'timer_expired', level: 3 } }),
    )

    expect(out.turnLedgerDims.crmActions).toEqual([
      { tool: 'crear_orden', args: {}, result: 'success', origen: 'timer' },
    ])
  })

  it('timer atendido (R10): timer que dispara acción registra sales_action', async () => {
    salesTrackRef.current = { accion: 'ofrecer_promos', reason: 'timer reactiva' }
    responseTrackRef.current = {
      messages: [makeProcessedMsg('promo')],
      templateIdsSent: ['promo_core'],
      salesTemplateIntents: ['promo_core'],
      infoTemplateIntents: [],
    }

    const out = await processMessage(
      makeInput({ systemEvent: { type: 'timer_expired', level: 1 } }),
    )

    expect(out.turnLedgerDims.atendido).toEqual([
      { kind: 'sales_action', accion: 'ofrecer_promos', templateIds: ['promo_core'] },
    ])
    expect(out.newMode).toBe('promos')
    // crmActions vacío (ofrecer_promos no es CRM action).
    expect(out.turnLedgerDims.crmActions).toEqual([])
  })
})
