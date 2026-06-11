/**
 * Tests for varixcenter/transitions.ts state machine (diseño §7).
 *
 * Standalone agent-varixcenter — Plan 04 Wave 2 Task 3.
 *
 * Cubre las branches mas criticas de la tabla §7:
 *   - initial + saludo / quiero_agendar (3 gates) / datos (solo-triage vs personales) / info -> L2
 *   - capturing_data + datos / acknowledgment / auto:datos_criticos / timer_expired:1
 *   - capturing_fecha + datos (fecha / sin fecha) / timer_expired:3
 *   - showing_availability + seleccion_horario / timer_expired:4
 *   - confirming + confirmar (datosCompletos) / rechazar -> no_interesa (#30 antes del wildcard 42)
 *   - appointment_registered catch-all
 *   - * + rechazar wildcard (#42)
 *   - closed catch-all
 *   - sin sede (gate verificado)
 */

import { describe, it, expect } from 'vitest'
import { resolveTransition, systemEventToKey } from '../transitions'
import { createInitialState } from '../state'
import type { AgentState, Gates, Phase } from '../types'
import type { StateChanges } from '../transitions'

// ============================================================================
// Fixture factory
// ============================================================================

type StateOverrides = Omit<Partial<AgentState>, 'datos'> & {
  datos?: Partial<AgentState['datos']>
}

function makeState(overrides: StateOverrides = {}): AgentState {
  const base = createInitialState()
  const { datos, ...rest } = overrides
  return {
    ...base,
    ...rest,
    datos: { ...base.datos, ...(datos ?? {}) },
  }
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

const GATES_DATOS_FECHA_OK: Gates = {
  triageCompleto: false,
  datosCriticos: true,
  fechaElegida: true,
  horarioElegido: false,
  datosCompletos: false,
}

const GATES_COMPLETOS: Gates = {
  triageCompleto: true,
  datosCriticos: true,
  fechaElegida: true,
  horarioElegido: true,
  datosCompletos: true,
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

// ============================================================================
// Desde initial
// ============================================================================

describe('transitions — initial phase', () => {
  it('saludo -> silence (no timer)', () => {
    const r = resolveTransition('initial', 'saludo', makeState(), GATES_NONE)
    expect(r?.action).toBe('silence')
    expect(r?.output.timerSignal).toBeUndefined()
  })

  it('quiero_agendar + !datosCriticos -> pedir_datos (L1)', () => {
    const r = resolveTransition('initial', 'quiero_agendar', makeState(), GATES_NONE)
    expect(r?.action).toBe('pedir_datos')
    expect(r?.output.timerSignal?.level).toBe('L1')
  })

  it('quiero_agendar + datosCriticos + !fechaElegida -> pedir_fecha (L3)', () => {
    const r = resolveTransition('initial', 'quiero_agendar', makeState(), GATES_DATOS_OK)
    expect(r?.action).toBe('pedir_fecha')
    expect(r?.output.timerSignal?.level).toBe('L3')
  })

  it('quiero_agendar + datosCriticos + fechaElegida -> mostrar_disponibilidad (L4)', () => {
    const r = resolveTransition('initial', 'quiero_agendar', makeState(), GATES_DATOS_FECHA_OK)
    expect(r?.action).toBe('mostrar_disponibilidad')
    expect(r?.output.timerSignal?.level).toBe('L4')
  })

  it('datos solo-triage (ciudad/tipo_venas) -> silence + L2 (matiz §7*)', () => {
    const changes = makeChanges({ newFields: ['ciudad', 'tipo_venas'], filled: 2, hasNewData: true })
    const r = resolveTransition('initial', 'datos', makeState(), GATES_NONE, changes)
    expect(r?.action).toBe('silence')
    expect(r?.output.timerSignal?.level).toBe('L2')
  })

  it('datos personales + !datosCriticos -> pedir_datos_parcial (L1)', () => {
    const changes = makeChanges({ newFields: ['nombre', 'telefono'], filled: 2, hasNewData: true })
    const r = resolveTransition('initial', 'datos', makeState(), GATES_NONE, changes)
    expect(r?.action).toBe('pedir_datos_parcial')
    expect(r?.output.timerSignal?.level).toBe('L1')
  })

  it('info intent (precio_tratamiento) -> silence + L2', () => {
    const r = resolveTransition('initial', 'precio_tratamiento', makeState(), GATES_NONE)
    expect(r?.action).toBe('silence')
    expect(r?.output.timerSignal?.level).toBe('L2')
  })

  it('sintomas_descripcion -> silence + L2 (template no_diagnostico)', () => {
    const r = resolveTransition('initial', 'sintomas_descripcion', makeState(), GATES_NONE)
    expect(r?.action).toBe('silence')
    expect(r?.output.timerSignal?.level).toBe('L2')
  })

  it('timer_expired:2 -> invitar_agendar', () => {
    const r = resolveTransition('initial', 'timer_expired:2', makeState(), GATES_NONE)
    expect(r?.action).toBe('invitar_agendar')
  })
})

// ============================================================================
// Desde capturing_data
// ============================================================================

describe('transitions — capturing_data phase', () => {
  it('datos + !datosCriticos -> pedir_datos_parcial (L1)', () => {
    const r = resolveTransition('capturing_data', 'datos', makeState(), GATES_NONE)
    expect(r?.action).toBe('pedir_datos_parcial')
    expect(r?.output.timerSignal?.level).toBe('L1')
  })

  it('datos + datosCriticos + !fechaElegida -> pedir_fecha (L3)', () => {
    const r = resolveTransition('capturing_data', 'datos', makeState(), GATES_DATOS_OK)
    expect(r?.action).toBe('pedir_fecha')
  })

  it('auto:datos_criticos + !fechaElegida -> pedir_fecha (L3)', () => {
    const key = systemEventToKey({ type: 'auto', result: 'datos_criticos' })
    const r = resolveTransition('capturing_data', key, makeState(), GATES_DATOS_OK)
    expect(r?.action).toBe('pedir_fecha')
  })

  it('acknowledgment -> silence + L6', () => {
    const r = resolveTransition('capturing_data', 'acknowledgment', makeState(), GATES_NONE)
    expect(r?.action).toBe('silence')
    expect(r?.output.timerSignal?.level).toBe('L6')
  })

  it('timer_expired:1 -> retoma_datos', () => {
    const r = resolveTransition('capturing_data', 'timer_expired:1', makeState(), GATES_NONE)
    expect(r?.action).toBe('retoma_datos')
  })
})

// ============================================================================
// Desde capturing_fecha
// ============================================================================

describe('transitions — capturing_fecha phase', () => {
  it('datos + fechaElegida -> mostrar_disponibilidad (L4)', () => {
    const r = resolveTransition('capturing_fecha', 'datos', makeState(), GATES_DATOS_FECHA_OK)
    expect(r?.action).toBe('mostrar_disponibilidad')
  })

  it('datos + !fechaElegida -> silence (restart L3)', () => {
    const r = resolveTransition('capturing_fecha', 'datos', makeState(), GATES_DATOS_OK)
    expect(r?.action).toBe('silence')
    expect(r?.output.timerSignal?.level).toBe('L3')
  })

  it('timer_expired:3 -> retoma_fecha', () => {
    const r = resolveTransition('capturing_fecha', 'timer_expired:3', makeState(), GATES_NONE)
    expect(r?.action).toBe('retoma_fecha')
  })
})

// ============================================================================
// Desde showing_availability
// ============================================================================

describe('transitions — showing_availability phase', () => {
  it('seleccion_horario -> mostrar_confirmacion (L5)', () => {
    const r = resolveTransition('showing_availability', 'seleccion_horario', makeState(), GATES_DATOS_FECHA_OK)
    expect(r?.action).toBe('mostrar_confirmacion')
    expect(r?.output.timerSignal?.level).toBe('L5')
  })

  it('datos nueva fecha (fechaJustSet) -> mostrar_disponibilidad (L4)', () => {
    const changes = makeChanges({ fechaJustSet: true, hasNewData: true, filled: 1 })
    const r = resolveTransition('showing_availability', 'datos', makeState(), GATES_DATOS_FECHA_OK, changes)
    expect(r?.action).toBe('mostrar_disponibilidad')
  })

  it('timer_expired:4 -> retoma_horario', () => {
    const r = resolveTransition('showing_availability', 'timer_expired:4', makeState(), GATES_NONE)
    expect(r?.action).toBe('retoma_horario')
  })
})

// ============================================================================
// Desde confirming
// ============================================================================

describe('transitions — confirming phase', () => {
  it('confirmar + datosCompletos -> agendar_cita (cancel)', () => {
    const r = resolveTransition('confirming', 'confirmar', makeState(), GATES_COMPLETOS)
    expect(r?.action).toBe('agendar_cita')
    expect(r?.output.timerSignal?.type).toBe('cancel')
  })

  it('rechazar -> no_interesa (#30 antes del wildcard 42)', () => {
    const r = resolveTransition('confirming', 'rechazar', makeState(), GATES_COMPLETOS)
    expect(r?.action).toBe('no_interesa')
    expect(r?.output.timerSignal?.type).toBe('cancel')
  })

  it('datos correccion -> mostrar_confirmacion (L5)', () => {
    const r = resolveTransition('confirming', 'datos', makeState(), GATES_COMPLETOS)
    expect(r?.action).toBe('mostrar_confirmacion')
    expect(r?.output.timerSignal?.level).toBe('L5')
  })

  it('timer_expired:5 -> retoma_confirmacion', () => {
    const r = resolveTransition('confirming', 'timer_expired:5', makeState(), GATES_NONE)
    expect(r?.action).toBe('retoma_confirmacion')
  })
})

// ============================================================================
// appointment_registered + wildcard + closed
// ============================================================================

describe('transitions — terminal phases + wildcards', () => {
  it('appointment_registered + info -> silence', () => {
    const r = resolveTransition('appointment_registered', 'precio_tratamiento', makeState(), GATES_COMPLETOS)
    expect(r?.action).toBe('silence')
  })

  it('appointment_registered + cualquier intent -> silence (catch-all)', () => {
    const r = resolveTransition('appointment_registered', 'quiero_agendar', makeState(), GATES_COMPLETOS)
    expect(r?.action).toBe('silence')
  })

  it('* + rechazar fuera de confirming -> no_interesa (#42)', () => {
    const r = resolveTransition('capturing_data', 'rechazar', makeState(), GATES_NONE)
    expect(r?.action).toBe('no_interesa')
  })

  it('closed + cualquier intent -> silence', () => {
    const r = resolveTransition('closed', 'quiero_agendar', makeState(), GATES_NONE)
    expect(r?.action).toBe('silence')
  })

  it('no match -> null (fallback)', () => {
    const r = resolveTransition('showing_availability', 'acknowledgment', makeState(), GATES_NONE)
    expect(r).toBeNull()
  })
})

// ============================================================================
// systemEventToKey
// ============================================================================

describe('systemEventToKey', () => {
  it('maps timer_expired level to timer_expired:N', () => {
    expect(systemEventToKey({ type: 'timer_expired', level: 2 })).toBe('timer_expired:2')
  })
  it('maps auto result to auto:result', () => {
    expect(systemEventToKey({ type: 'auto', result: 'datos_criticos' })).toBe('auto:datos_criticos')
  })
})
