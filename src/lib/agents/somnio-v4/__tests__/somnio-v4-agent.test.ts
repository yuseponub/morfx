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

// Hybrid slot resolver harness (v4-hybrid Plan 03):
//   - subLoopQueue: when non-empty, runSubLoop dequeues one outcome per call
//     (FIFO) — lets a single turn drive DIFFERENT outcomes for primary vs
//     secondary (low+low case). When empty, falls back to subLoopRef.current.
//   - subLoopCalls: records { userMessage } per invocation for ordering/T-2 asserts.
const subLoopQueue: { current: LoopOutcome[] } = { current: [] }
const subLoopCalls: { current: { userMessage: string }[] } = { current: [] }

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
  runSubLoop: async (args: { ctx: { userMessage: string } }) => {
    subLoopCalls.current.push({ userMessage: args.ctx.userMessage })
    if (subLoopQueue.current.length > 0) {
      return subLoopQueue.current.shift() as LoopOutcome
    }
    return subLoopRef.current
  },
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
  subLoopQueue.current = []
  subLoopCalls.current = []
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

  it('defensive (R6): a RAG slot returning status=template (never expected from runRagSubLoop) becomes a partial handoff', async () => {
    // In the RAG-generative architecture, low_confidence/razonamiento_libre route
    // through runRagSubLoop which only emits generated|no_match — never template.
    // A template status reaching the slot resolver is therefore unexpected and is
    // defensively escalated to handoff (the slot produced no usable generated text).
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

    // No generated text, no covered template → pure handoff.
    expect(out.newMode).toBe('handoff')
    expect(out.requiresHuman).toBe(true)
    expect(out.turnLedgerDims.atendido).toEqual([{ kind: 'handoff', reason: 'template_path' }])
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

// ===========================================================================
// v4-hybrid Plan 03 — Hybrid slot resolver (the 4-case matrix + partial
// handoff + interrupt-not-handoff).
//
// The slot resolver runs at the END of the pipeline. Covered intents keep
// their deterministic template (we mock response-track to return them). Low
// intents escalate to runSubLoop (mocked via subLoopQueue / subLoopRef). RAG
// text is injected as a synthetic `rag:<topic>` CORE ProcessedMessage ordered
// primary→secondary (D-11).
// ===========================================================================

function makeGenerated(topic: string, text: string, confidence = 0.85): LoopOutcome {
  return {
    status: 'generated',
    responseText: text,
    sourceTopic: topic,
    responseConfidence: confidence,
    confidenceRationale: 'match',
    nuncaDecirRules: [],
    responseTemplate: null,
    knowledgeQueried: null,
    requiresHuman: false,
    reason: 'rag_generated',
  }
}

function makeNoMatch(reason: string): LoopOutcome {
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
    reason,
  }
}

describe('hybrid slot resolver (v4-hybrid)', () => {
  it('covered+covered: runSubLoop NOT called; templates only from response-track; no handoff', async () => {
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'precio',
        secondary: 'tiempo_entrega',
        confidence: 95,
        reasoning: 'ambos cubiertos',
        intent_confidence: 0.95,
        secondary_confidence: 0.9,
        secondary_confidence_reasoning: 'cubierto',
        secondary_query: 'cuando llega?',
      },
    })
    responseTrackRef.current = {
      messages: [makeProcessedMsg('precio'), makeProcessedMsg('tiempo_entrega')],
      templateIdsSent: ['precio', 'tiempo_entrega'],
      salesTemplateIntents: [],
      infoTemplateIntents: ['precio', 'tiempo_entrega'],
    }

    const out = await processMessage(makeInput({ message: 'cuanto vale y cuando llega?' }))

    expect(subLoopCalls.current).toHaveLength(0)
    expect(out.templates?.map((t) => t.templateId)).toEqual(['precio', 'tiempo_entrega'])
    expect(out.newMode).not.toBe('handoff')
    expect(out.requiresHuman).toBeUndefined()
  })

  it('covered+low: runSubLoop called ONCE with secondary_query; covered template THEN rag:<topic> (D-11)', async () => {
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'precio',
        secondary: 'contraindicaciones',
        confidence: 92,
        reasoning: 'precio cubierto, apnea low',
        intent_confidence: 0.92,
        secondary_confidence: 0.25,
        secondary_confidence_reasoning: 'fuera de catálogo',
        secondary_query: 'puedo tomarlo si tengo apnea?',
      },
    })
    responseTrackRef.current = {
      messages: [makeProcessedMsg('precio')],
      templateIdsSent: ['precio'],
      salesTemplateIntents: [],
      infoTemplateIntents: ['precio'],
    }
    subLoopQueue.current = [makeGenerated('contraindicaciones', 'Con apnea, consulte a su médico...')]

    const out = await processMessage(
      makeInput({ message: 'cuánto vale y lo puedo tomar si tengo apnea?' }),
    )

    expect(subLoopCalls.current).toHaveLength(1)
    expect(subLoopCalls.current[0].userMessage).toBe('puedo tomarlo si tengo apnea?')
    expect(out.templates?.map((t) => t.templateId)).toEqual([
      'precio',
      'rag:contraindicaciones',
    ])
    expect(out.newMode).not.toBe('handoff')
  })

  it('low+covered: runSubLoop called ONCE with RAW message (T-2); rag BEFORE covered template; ledger kb_topic + template_intent', async () => {
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'otro',
        secondary: 'precio',
        confidence: 30,
        reasoning: 'primary fuera de flujo, secondary cubierto',
        intent_confidence: 0.2,
        secondary_confidence: 0.9,
        secondary_confidence_reasoning: 'cubierto',
        secondary_query: 'cuanto cuesta?',
      },
    })
    responseTrackRef.current = {
      messages: [makeProcessedMsg('precio')],
      templateIdsSent: ['precio'],
      salesTemplateIntents: [],
      infoTemplateIntents: ['precio'],
    }
    subLoopQueue.current = [makeGenerated('filosofia', 'El sueño es importante...')]

    const out = await processMessage(
      makeInput({ message: 'por que dormimos y cuanto cuesta?' }),
    )

    expect(subLoopCalls.current).toHaveLength(1)
    // T-2: low primary receives the RAW message.
    expect(subLoopCalls.current[0].userMessage).toBe('por que dormimos y cuanto cuesta?')
    // RAG (primary) BEFORE covered template (secondary) per D-11.
    expect(out.templates?.map((t) => t.templateId)).toEqual(['rag:filosofia', 'precio'])
    expect(out.turnLedgerDims.atendido).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'kb_topic', topic: 'filosofia' }),
        expect.objectContaining({ kind: 'template_intent', intent: 'otro' }),
      ]),
    )
  })

  it('low+low: runSubLoop called TWICE (sequential); two rag messages; ledger has 2 kb_topic', async () => {
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'otro',
        secondary: 'contraindicaciones',
        confidence: 25,
        reasoning: 'ambos fuera de catálogo',
        intent_confidence: 0.2,
        secondary_confidence: 0.2,
        secondary_confidence_reasoning: 'low',
        secondary_query: 'sirve para la apnea?',
      },
    })
    // Both low → response-track emits nothing covered.
    responseTrackRef.current = {
      messages: [],
      templateIdsSent: [],
      salesTemplateIntents: [],
      infoTemplateIntents: [],
    }
    subLoopQueue.current = [
      makeGenerated('filosofia', 'El sueño...'),
      makeGenerated('contraindicaciones', 'Con apnea...'),
    ]

    const out = await processMessage(makeInput({ message: 'por que dormimos y sirve para apnea?' }))

    expect(subLoopCalls.current).toHaveLength(2)
    // Sequential order: primary (raw) first, then secondary (secondary_query).
    expect(subLoopCalls.current[0].userMessage).toBe('por que dormimos y sirve para apnea?')
    expect(subLoopCalls.current[1].userMessage).toBe('sirve para la apnea?')
    expect(out.templates?.map((t) => t.templateId)).toEqual([
      'rag:filosofia',
      'rag:contraindicaciones',
    ])
    const kbTopics = out.turnLedgerDims.atendido.filter((a) => a.kind === 'kb_topic')
    expect(kbTopics).toHaveLength(2)
  })

  it('partial handoff (covered+low, RAG no_match): covered template SENT + newMode=handoff + requiresHuman (R1-A)', async () => {
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'precio',
        secondary: 'contraindicaciones',
        confidence: 92,
        reasoning: 'precio cubierto, apnea no resoluble',
        intent_confidence: 0.92,
        secondary_confidence: 0.2,
        secondary_confidence_reasoning: 'fuera de scope',
        secondary_query: 'sirve para la apnea severa?',
      },
    })
    responseTrackRef.current = {
      messages: [makeProcessedMsg('precio')],
      templateIdsSent: ['precio'],
      salesTemplateIntents: [],
      infoTemplateIntents: ['precio'],
    }
    subLoopQueue.current = [makeNoMatch('out_of_scope')]

    const out = await processMessage(makeInput({ message: 'cuánto vale y sirve para apnea severa?' }))

    // R1-A: the resolved slot's message is NOT dropped.
    expect(out.templates && out.templates.length).toBeGreaterThan(0)
    expect(out.templates?.map((t) => t.templateId)).toEqual(['precio'])
    expect(out.messages).toEqual(['precio'])
    expect(out.newMode).toBe('handoff')
    expect(out.requiresHuman).toBe(true)
    // Ledger combines template_intent (covered) + handoff (escalated slot).
    expect(out.turnLedgerDims.atendido).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'template_intent' }),
        { kind: 'handoff', reason: 'out_of_scope' },
      ]),
    )
  })

  it('interrupt mid-slot: secondary RAG returns interrupted_at_ckpt_3 → errorMessage, NOT handoff (R1-B/R6-A)', async () => {
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'precio',
        secondary: 'contraindicaciones',
        confidence: 92,
        reasoning: 'precio cubierto, secondary low',
        intent_confidence: 0.92,
        secondary_confidence: 0.2,
        secondary_confidence_reasoning: 'low',
        secondary_query: 'puedo tomarlo si tengo apnea?',
      },
    })
    responseTrackRef.current = {
      messages: [makeProcessedMsg('precio')],
      templateIdsSent: ['precio'],
      salesTemplateIntents: [],
      infoTemplateIntents: ['precio'],
    }
    subLoopQueue.current = [makeNoMatch('interrupted_at_ckpt_3_post_tooling')]

    const out = await processMessage(makeInput({ message: 'cuánto vale y apnea?' }))

    expect(out.success).toBe(false)
    expect(out.errorMessage).toBe('interrupted_at_ckpt_3_post_tooling')
    // R1-B: an interrupt is NOT a handoff and discards the turn (no sends).
    expect(out.newMode).not.toBe('handoff')
    expect(out.messages).toEqual([])
  })

  it('interrupt short-circuit: primary interrupt skips secondary RAG (only 1 invocation)', async () => {
    comprehendRef.current = makeAnalysis({
      intent: {
        primary: 'otro',
        secondary: 'contraindicaciones',
        confidence: 25,
        reasoning: 'ambos low',
        intent_confidence: 0.2,
        secondary_confidence: 0.2,
        secondary_confidence_reasoning: 'low',
        secondary_query: 'apnea?',
      },
    })
    responseTrackRef.current = {
      messages: [],
      templateIdsSent: [],
      salesTemplateIntents: [],
      infoTemplateIntents: [],
    }
    subLoopQueue.current = [
      makeNoMatch('interrupted_at_ckpt_4_post_generation'),
      makeGenerated('contraindicaciones', 'no debería llegar'),
    ]

    const out = await processMessage(makeInput({ message: 'por que dormimos y apnea?' }))

    // Short-circuit: the secondary slot is NOT invoked after a primary interrupt.
    expect(subLoopCalls.current).toHaveLength(1)
    expect(out.errorMessage).toBe('interrupted_at_ckpt_4_post_generation')
    expect(out.newMode).not.toBe('handoff')
  })
})
