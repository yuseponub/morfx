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
