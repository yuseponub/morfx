/**
 * Tests for varixcenter/sales-track.ts (motor generico de transiciones).
 *
 * Standalone agent-varixcenter — Plan 04 Wave 2 Task 3.
 *
 * Verifica que el motor: 1) resuelve timer_expired, 2) auto-trigger por datosCriticosJustCompleted,
 * 3) intent -> tabla, 4) fallback (response track responde). Sin lead-capture (varixcenter no lo usa).
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: vi.fn() }),
}))

import { resolveSalesTrack } from '../sales-track'
import { createInitialState } from '../state'
import type { AgentState, Gates } from '../types'
import type { StateChanges } from '../transitions'

function makeState(overrides: Partial<AgentState['datos']> = {}): AgentState {
  const base = createInitialState()
  return { ...base, datos: { ...base.datos, ...overrides } }
}

const GATES_NONE: Gates = {
  triageCompleto: false,
  datosCriticos: false,
  fechaElegida: false,
  horarioElegido: false,
  datosCompletos: false,
}

const GATES_DATOS_OK: Gates = {
  triageCompleto: false,
  datosCriticos: true,
  fechaElegida: false,
  horarioElegido: false,
  datosCompletos: false,
}

function makeChanges(overrides: Partial<StateChanges> = {}): StateChanges {
  return {
    newFields: [],
    filled: 0,
    hasNewData: false,
    datosCriticosJustCompleted: false,
    fechaJustSet: false,
    ...overrides,
  }
}

describe('resolveSalesTrack', () => {
  it('timer_expired:1 in capturing_data -> retoma_datos', () => {
    const out = resolveSalesTrack({
      phase: 'capturing_data',
      state: makeState(),
      gates: GATES_NONE,
      event: { type: 'timer_expired', level: 1 },
    })
    expect(out.accion).toBe('retoma_datos')
  })

  it('quiero_agendar in initial + !datosCriticos -> pedir_datos', () => {
    const out = resolveSalesTrack({
      phase: 'initial',
      state: makeState(),
      gates: GATES_NONE,
      event: { type: 'user_message', intent: 'quiero_agendar', category: 'pregunta' },
    })
    expect(out.accion).toBe('pedir_datos')
    expect(out.timerSignal?.level).toBe('L1')
  })

  it('auto-trigger: datosCriticosJustCompleted in capturing_data -> pedir_fecha', () => {
    const out = resolveSalesTrack({
      phase: 'capturing_data',
      state: makeState({ nombre: 'Paola', telefono: '573001234567', cedula: '109' }),
      gates: GATES_DATOS_OK,
      event: { type: 'user_message', intent: 'datos', category: 'datos' },
      changes: makeChanges({ datosCriticosJustCompleted: true, hasNewData: true, filled: 1 }),
    })
    expect(out.accion).toBe('pedir_fecha')
  })

  it('informational intent defers auto-trigger (response track answers first)', () => {
    // datosCriticosJustCompleted + intent informational -> no auto-trigger; intent precio_tratamiento
    // en capturing_data cae a silence (info -> restart L1)
    const out = resolveSalesTrack({
      phase: 'capturing_data',
      state: makeState({ nombre: 'Paola', telefono: '573001234567', cedula: '109' }),
      gates: GATES_DATOS_OK,
      event: { type: 'user_message', intent: 'precio_tratamiento', category: 'pregunta' },
      changes: makeChanges({ datosCriticosJustCompleted: true, hasNewData: true, filled: 1 }),
    })
    expect(out.accion).toBe('silence')
  })

  it('unmatched intent in showing_availability -> fallback (no accion)', () => {
    const out = resolveSalesTrack({
      phase: 'showing_availability',
      state: makeState(),
      gates: GATES_NONE,
      event: { type: 'user_message', intent: 'acknowledgment', category: 'irrelevante' },
    })
    expect(out.accion).toBeUndefined()
    expect(out.reason).toMatch(/No transition/i)
  })
})
