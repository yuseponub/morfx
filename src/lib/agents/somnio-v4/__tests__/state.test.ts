/**
 * State serialization + Turn Ledger commit tests — standalone somnio-v4-turn-ledger Plan 01.
 *
 * Cubre:
 *  - commitTurn roundtrip: serializa working state COMPLETO + SOLO el subset
 *    persistido del ledger ({atendido, crmActions}). NO persiste
 *    modeTransition/comprehension/messagesSent (D-17 — esos van a observability en Plan 04).
 *  - deserialize legacy graceful: deserializeState SIN el param de dims no rompe
 *    (espejo del backward-compat de accionesEjecutadas, state.ts:357-383).
 *  - texto truncation: un atendido kb_topic con texto > 500 chars se trunca antes
 *    de persistir (T-ledger-01 — no inflar el jsonb).
 *  - redacción mínima PII en crmActions.args (T-ledger-02 — phone last-4 / email masked).
 *
 * Patrón espejado de los seeds/aserciones de accionesEjecutadas en engine-v4-lock.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { commitTurn, serializeState, deserializeState, createInitialState } from '../state'
import type { AgentState, TurnLedger } from '../types'

function makeWorkingState(): AgentState {
  const s = createInitialState()
  s.datos.nombre = 'Ana'
  s.datos.telefono = '3001234567'
  s.pack = '2x'
  s.intentsVistos = ['saludo', 'precio']
  s.templatesMostrados = ['t-saludo', 't-precio']
  s.turnCount = 3
  s.accionesEjecutadas = [{ tipo: 'ofrecer_promos', turno: 2, origen: 'bot' }]
  return s
}

function makeLedger(overrides: Partial<TurnLedger> = {}): TurnLedger {
  return {
    comprehension: { intent: 'precio', secondary: 'envio', confidence: 0.91 },
    atendido: [
      { kind: 'kb_topic', topic: 'apnea', confidence: 0.88, texto: 'El elixir ayuda a...', turno: 3 },
    ],
    crmActions: [
      {
        tool: 'createOrder',
        args: { pack: '2x' },
        result: 'success',
        origen: 'determinista',
      },
    ],
    modeTransition: { from: 'capturing', to: 'confirming' },
    messagesSent: 2,
    ...overrides,
  }
}

describe('commitTurn', () => {
  it('roundtrip: serializa working state COMPLETO + SOLO el subset persistido del ledger (D-17)', () => {
    const ws = makeWorkingState()
    const ledger = makeLedger()

    const result = commitTurn(ws, ledger)

    // Incluye TODO lo de serializeState
    const baseline = serializeState(ws)
    expect(result.datosCapturados).toEqual(baseline.datosCapturados)
    expect(result.packSeleccionado).toBe(baseline.packSeleccionado)
    expect(result.intentsVistos).toEqual(baseline.intentsVistos)
    expect(result.templatesEnviados).toEqual(baseline.templatesEnviados)
    expect(result.accionesEjecutadas).toEqual(baseline.accionesEjecutadas)

    // MÁS las dims persistibles
    expect(result.turnLedgerDims.atendido).toHaveLength(1)
    expect(result.turnLedgerDims.atendido[0]).toMatchObject({ kind: 'kb_topic', topic: 'apnea' })
    expect(result.turnLedgerDims.crmActions).toHaveLength(1)
    expect(result.turnLedgerDims.crmActions[0]).toMatchObject({ tool: 'createOrder', result: 'success' })

    // D-17: NO persiste modeTransition / comprehension / messagesSent
    const dimsKeys = Object.keys(result.turnLedgerDims)
    expect(dimsKeys).toEqual(['atendido', 'crmActions'])
    expect(dimsKeys).not.toContain('modeTransition')
    expect(dimsKeys).not.toContain('messagesSent')
    expect(dimsKeys).not.toContain('comprehension')
  })

  it('trunca texto de kb_topic a 500 chars antes de persistir (T-ledger-01)', () => {
    const ws = makeWorkingState()
    const longText = 'x'.repeat(900)
    const ledger = makeLedger({
      atendido: [{ kind: 'kb_topic', topic: 'apnea', confidence: 0.8, texto: longText, turno: 3 }],
    })

    const result = commitTurn(ws, ledger)
    const persisted = result.turnLedgerDims.atendido[0]
    expect(persisted.kind).toBe('kb_topic')
    if (persisted.kind === 'kb_topic') {
      expect(persisted.texto.length).toBeLessThanOrEqual(500)
    }
  })

  it('no toca atendido sin texto (template_intent / silence) al truncar', () => {
    const ws = makeWorkingState()
    const ledger = makeLedger({
      atendido: [
        { kind: 'template_intent', intent: 'saludo', templateIds: ['t-saludo'] },
        { kind: 'silence' },
      ],
    })
    const result = commitTurn(ws, ledger)
    expect(result.turnLedgerDims.atendido).toEqual([
      { kind: 'template_intent', intent: 'saludo', templateIds: ['t-saludo'] },
      { kind: 'silence' },
    ])
  })

  it('redacción mínima de phone/email en crmActions.args (T-ledger-02)', () => {
    const ws = makeWorkingState()
    const ledger = makeLedger({
      crmActions: [
        {
          tool: 'createContact',
          args: { phone: '3001234567', email: 'ana.perez@example.com', nombre: 'Ana' },
          result: 'success',
          origen: 'determinista',
        },
      ],
    })
    const result = commitTurn(ws, ledger)
    const args = result.turnLedgerDims.crmActions[0].args
    // phone: last-4 visible, resto enmascarado
    expect(String(args.phone)).toContain('4567')
    expect(String(args.phone)).not.toBe('3001234567')
    // email: local-part enmascarado, dominio visible
    expect(String(args.email)).toContain('example.com')
    expect(String(args.email)).not.toContain('ana.perez')
    // campos no-PII intactos
    expect(args.nombre).toBe('Ana')
  })

  it('commitTurn con ledger vacío produce dims vacías', () => {
    const ws = makeWorkingState()
    const ledger = makeLedger({ atendido: [], crmActions: [] })
    const result = commitTurn(ws, ledger)
    expect(result.turnLedgerDims).toEqual({ atendido: [], crmActions: [] })
  })
})

describe('carryState preserva ledger en reprocess Path B (P3)', () => {
  // Precedente del mecanismo carryState / Path B reprocess: engine-v4-lock.test.ts
  // :746-797 ("E10 Path B reprocess seeds from iter-0 state"). Allí el harness usa el
  // engine completo + Redis mock. Aquí lo verificamos al nivel de la unidad que importa
  // para el ledger (P3): el carryState que el engine construye desde `output.turnLedgerDims`
  // (engine-v4.ts:459-468) se reusa como seed de la iteración siguiente, que vuelve a
  // commitTurn con SU propio ledger. La invariante P3 = el reprocess no PIERDE ni
  // DOUBLE-registra el efecto de la iteración previa.

  function makeIter1State(): AgentState {
    const s = createInitialState()
    s.intentsVistos = ['saludo']
    s.templatesMostrados = ['saludo_core']
    s.turnCount = 1
    return s
  }

  it('iter-2 (reprocess Path B) hereda el kb_topic de iter-1 vía carryState sin perderlo ni double-registrarlo', () => {
    // --- iter-1: registra un kb_topic. commitTurn produce las dims persistidas. ---
    const iter1State = makeIter1State()
    const iter1Ledger = makeLedger({
      atendido: [
        { kind: 'kb_topic', topic: 'apnea', confidence: 0.88, texto: 'info apnea', turno: 1 },
      ],
      crmActions: [],
    })
    const iter1Out = commitTurn(iter1State, iter1Ledger)

    // El engine arma carryState desde output.turnLedgerDims (engine-v4.ts:468) y lo
    // pasa como seedState.turnLedgerDims a la iteración siguiente (engine-v4.ts:281).
    const carriedDims = iter1Out.turnLedgerDims
    expect(carriedDims.atendido).toHaveLength(1)
    expect(carriedDims.atendido[0]).toMatchObject({ kind: 'kb_topic', topic: 'apnea' })

    // --- iter-2: reprocess. El working state parte del estado de iter-1 (no re-greet)
    // y registra un NUEVO kb_topic. Las dims de iter-1 viajan vía input.turnLedgerDims
    // (restauradas), y el agente combina lo previo + lo nuevo en el ledger del turno. ---
    const iter2State: AgentState = { ...iter1State, turnCount: 2 }
    const iter2Ledger = makeLedger({
      atendido: [
        // El previo (heredado por carryState — el agente lo re-incluye al construir el
        // ledger del turno a partir de las dims restauradas) …
        ...carriedDims.atendido,
        // … más el nuevo del reprocess.
        { kind: 'kb_topic', topic: 'precio', confidence: 0.92, texto: 'info precio', turno: 2 },
      ],
      crmActions: [],
    })
    const iter2Out = commitTurn(iter2State, iter2Ledger)

    // P3: el ledger de iter-2 contiene el kb_topic de iter-1 + el nuevo — sin perder.
    const topics = iter2Out.turnLedgerDims.atendido.filter(
      (a): a is Extract<typeof a, { kind: 'kb_topic' }> => a.kind === 'kb_topic',
    )
    expect(topics.map((t) => t.topic)).toEqual(['apnea', 'precio'])
    // Sin double-register: 'apnea' aparece exactamente una vez.
    expect(topics.filter((t) => t.topic === 'apnea')).toHaveLength(1)
  })

  it('turnCount no se double-incrementa: vive en AgentState (mergeAnalysis), no en el ledger', () => {
    const iter1State = makeIter1State() // turnCount = 1
    const iter1Out = commitTurn(iter1State, makeLedger({ atendido: [], crmActions: [] }))
    // commitTurn / TurnLedgerDims NO expone turnCount — no puede tocarlo.
    expect(iter1Out).not.toHaveProperty('turnCount')
    expect(Object.keys(iter1Out.turnLedgerDims)).toEqual(['atendido', 'crmActions'])

    // El reprocess parte del MISMO working state (carryState no incrementa turnCount;
    // el incremento ocurre solo en mergeAnalysis del nuevo mensaje). Simulamos que el
    // reprocess re-commita el mismo working state → turnCount estable.
    const iter2Out = commitTurn(iter1State, makeLedger({ atendido: [], crmActions: [] }))
    // serializeState refleja el turnCount del working state (1) en ambos commits — el
    // ledger jamás lo altera ni lo suma dos veces.
    expect(iter1State.turnCount).toBe(1)
    expect(iter2Out).not.toHaveProperty('turnCount')
  })
})

describe('deserializeState backward-compat (D-16)', () => {
  it('deserialize SIN el param de dims no rompe — estado idéntico al actual', () => {
    const ws = makeWorkingState()
    const serialized = serializeState(ws)

    // Llamada legacy: sin el nuevo param turnLedgerDims
    const restored = deserializeState(
      serialized.datosCapturados,
      serialized.packSeleccionado,
      serialized.intentsVistos,
      serialized.templatesEnviados,
      serialized.accionesEjecutadas,
    )

    expect(restored.datos.nombre).toBe('Ana')
    expect(restored.datos.telefono).toBe('3001234567')
    expect(restored.pack).toBe('2x')
    expect(restored.intentsVistos).toEqual(['saludo', 'precio'])
    expect(restored.templatesMostrados).toEqual(['t-saludo', 't-precio'])
    expect(restored.turnCount).toBe(3)
    expect(restored.accionesEjecutadas).toEqual([
      { tipo: 'ofrecer_promos', turno: 2, origen: 'bot' },
    ])
  })

  it('deserialize con el param de dims (default graceful) no afecta el working state', () => {
    const ws = createInitialState()
    const serialized = serializeState(ws)
    const restored = deserializeState(
      serialized.datosCapturados,
      serialized.packSeleccionado,
      serialized.intentsVistos,
      serialized.templatesEnviados,
      serialized.accionesEjecutadas,
      { atendido: [], crmActions: [] },
    )
    // AgentState no contiene las dims (working state); solo verifica que no rompe
    expect(restored.turnCount).toBe(0)
    expect(restored.accionesEjecutadas).toEqual([])
  })
})
