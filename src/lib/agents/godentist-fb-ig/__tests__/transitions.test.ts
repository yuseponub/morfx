/**
 * Tests for godentist-fb-ig/transitions.ts state machine.
 *
 * Standalone agent-godentist-fb-ig — Plan 06 Wave 4 Task 1.
 *
 * Cubre las branches mas criticas del transition table clonado del godentist:
 *   - initial + saludo / quiero_agendar / datos / info intents
 *   - capturing_data + datos / acknowledgment / timer_expired
 *   - capturing_fecha + datos
 *   - showing_availability + seleccion_horario
 *   - confirming + confirmar / rechazar (regla 42 antes de wildcard 54)
 *   - appointment_registered catch-all
 *   - * + rechazar wildcard (rule 54)
 *   - * + no_interesa
 *   - closed catch-all
 *
 * Pattern: declarative fixtures + first-match wins assertions.
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
  datosCriticos: false,
  fechaElegida: false,
  horarioElegido: false,
  datosCompletos: false,
}

const GATES_DATOS_OK: Gates = {
  datosCriticos: true,
  fechaElegida: false,
  horarioElegido: false,
  datosCompletos: false,
}

const GATES_DATOS_FECHA_OK: Gates = {
  datosCriticos: true,
  fechaElegida: true,
  horarioElegido: false,
  datosCompletos: false,
}

const GATES_DATOS_COMPLETOS: Gates = {
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

function callTx(phase: Phase, on: string, state: AgentState, gates: Gates, changes?: StateChanges) {
  return resolveTransition(phase, on, state, gates, changes)
}

// ============================================================================
// initial phase
// ============================================================================

describe('resolveTransition — initial phase', () => {
  it('Rule 1: initial + saludo -> silence (no timer)', () => {
    const result = callTx('initial', 'saludo', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
    expect(result!.output.timerSignal).toBeUndefined()
  })

  it('Rule 2: initial + quiero_agendar + !datosCriticos -> pedir_datos + L0', () => {
    const result = callTx('initial', 'quiero_agendar', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('pedir_datos')
    expect(result!.output.timerSignal?.type).toBe('start')
    expect(result!.output.timerSignal?.level).toBe('L0')
  })

  it('Rule 3: initial + quiero_agendar + datosCriticos + !fechaElegida -> pedir_fecha + L3', () => {
    const result = callTx('initial', 'quiero_agendar', makeState(), GATES_DATOS_OK)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('pedir_fecha')
    expect(result!.output.timerSignal?.level).toBe('L3')
  })

  it('Rule 4: initial + quiero_agendar + datosCriticos + fechaElegida -> mostrar_disponibilidad + L4', () => {
    const result = callTx('initial', 'quiero_agendar', makeState(), GATES_DATOS_FECHA_OK)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('mostrar_disponibilidad')
    expect(result!.output.timerSignal?.level).toBe('L4')
  })

  it('Rule 5: initial + datos + !datosCriticos -> silence + L1', () => {
    const result = callTx('initial', 'datos', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
    expect(result!.output.timerSignal?.level).toBe('L1')
  })

  it('Rule 6: initial + datos + datosCriticos + !fechaElegida -> pedir_fecha + L3', () => {
    const result = callTx('initial', 'datos', makeState(), GATES_DATOS_OK)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('pedir_fecha')
    expect(result!.output.timerSignal?.level).toBe('L3')
  })

  it('Rule 10: initial + precio_servicio (informational) -> silence + L2', () => {
    const result = callTx('initial', 'precio_servicio', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
    expect(result!.output.timerSignal?.level).toBe('L2')
  })

  it('Rule 15: initial + urgencia -> silence (no timer)', () => {
    const result = callTx('initial', 'urgencia', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
    expect(result!.output.timerSignal).toBeUndefined()
  })

  it('Rule 21: initial + timer_expired:2 -> invitar_agendar', () => {
    const key = systemEventToKey({ type: 'timer_expired', level: 2 })
    expect(key).toBe('timer_expired:2')
    const result = callTx('initial', key, makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('invitar_agendar')
  })
})

// ============================================================================
// capturing_data phase
// ============================================================================

describe('resolveTransition — capturing_data phase', () => {
  it('Rule 22: capturing_data + datos + !datosCriticos -> silence + L1', () => {
    const result = callTx('capturing_data', 'datos', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
    expect(result!.output.timerSignal?.level).toBe('L1')
  })

  it('Rule 23: capturing_data + datos + datosCriticos + !fechaElegida -> pedir_fecha + L3', () => {
    const result = callTx('capturing_data', 'datos', makeState(), GATES_DATOS_OK)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('pedir_fecha')
  })

  it('Rule 27: capturing_data + auto:datos_criticos + !fechaElegida -> pedir_fecha', () => {
    const key = systemEventToKey({ type: 'auto', result: 'datos_criticos' })
    expect(key).toBe('auto:datos_criticos')
    const result = callTx('capturing_data', key, makeState(), GATES_DATOS_OK)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('pedir_fecha')
  })

  it('Rule 30: capturing_data + acknowledgment -> silence + L6', () => {
    const result = callTx('capturing_data', 'acknowledgment', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
    expect(result!.output.timerSignal?.level).toBe('L6')
  })

  it('Rule 31a: capturing_data + timer_expired:0 -> retoma_inicial', () => {
    const result = callTx('capturing_data', 'timer_expired:0', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('retoma_inicial')
  })

  it('Rule 31b: capturing_data + timer_expired:1 -> retoma_datos', () => {
    const result = callTx('capturing_data', 'timer_expired:1', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('retoma_datos')
  })
})

// ============================================================================
// capturing_fecha phase
// ============================================================================

describe('resolveTransition — capturing_fecha phase', () => {
  it('Rule 32: capturing_fecha + datos + fechaElegida -> mostrar_disponibilidad + L4', () => {
    const result = callTx('capturing_fecha', 'datos', makeState(), GATES_DATOS_FECHA_OK)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('mostrar_disponibilidad')
    expect(result!.output.timerSignal?.level).toBe('L4')
  })

  it('Rule 36: capturing_fecha + timer_expired:3 -> retoma_fecha', () => {
    const result = callTx('capturing_fecha', 'timer_expired:3', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('retoma_fecha')
  })
})

// ============================================================================
// showing_availability phase
// ============================================================================

describe('resolveTransition — showing_availability phase', () => {
  it('Rule 37: showing_availability + seleccion_horario -> mostrar_confirmacion + L5', () => {
    const result = callTx('showing_availability', 'seleccion_horario', makeState(), GATES_DATOS_FECHA_OK)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('mostrar_confirmacion')
    expect(result!.output.timerSignal?.level).toBe('L5')
  })

  it('Rule 38: showing_availability + datos + fechaJustSet -> mostrar_disponibilidad', () => {
    const result = callTx(
      'showing_availability',
      'datos',
      makeState(),
      GATES_DATOS_FECHA_OK,
      makeChanges({ fechaJustSet: true }),
    )
    expect(result).not.toBeNull()
    expect(result!.action).toBe('mostrar_disponibilidad')
  })

  it('Rule 40: showing_availability + timer_expired:4 -> retoma_horario', () => {
    const result = callTx('showing_availability', 'timer_expired:4', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('retoma_horario')
  })
})

// ============================================================================
// confirming phase — Rule 42 ordering critical (BEFORE wildcard rule 54)
// ============================================================================

describe('resolveTransition — confirming phase + first-match wins', () => {
  it('Rule 41: confirming + confirmar + datosCompletos -> agendar_cita + cancel timer', () => {
    const result = callTx('confirming', 'confirmar', makeState(), GATES_DATOS_COMPLETOS)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('agendar_cita')
    expect(result!.output.timerSignal?.type).toBe('cancel')
  })

  it('Rule 42 BEFORE Rule 54: confirming + rechazar -> pedir_datos (NOT no_interesa)', () => {
    // CRITICAL ordering test: confirming-specific rule 42 must beat wildcard rule 54.
    const result = callTx('confirming', 'rechazar', makeState(), GATES_DATOS_FECHA_OK)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('pedir_datos')  // Rule 42 (correct data)
    expect(result!.output.timerSignal?.level).toBe('L1')
  })

  it('Rule 43: confirming + datos -> mostrar_confirmacion + L5', () => {
    const result = callTx('confirming', 'datos', makeState(), GATES_DATOS_FECHA_OK)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('mostrar_confirmacion')
  })

  it('Rule 45: confirming + timer_expired:5 -> retoma_confirmacion', () => {
    const result = callTx('confirming', 'timer_expired:5', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('retoma_confirmacion')
  })
})

// ============================================================================
// appointment_registered phase
// ============================================================================

describe('resolveTransition — appointment_registered phase', () => {
  it('Rule 49: appointment_registered + * (any unknown) -> silence', () => {
    const result = callTx('appointment_registered', 'unknown_intent', makeState(), GATES_DATOS_COMPLETOS)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
  })

  it('appointment_registered + saludo -> silence (specific rule before catch-all)', () => {
    const result = callTx('appointment_registered', 'saludo', makeState(), GATES_DATOS_COMPLETOS)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
  })
})

// ============================================================================
// Wildcard transitions (* + rechazar / no_interesa) — Rule 54
// ============================================================================

describe('resolveTransition — wildcard rules', () => {
  it('Rule 54: initial + rechazar -> no_interesa + cancel timer (wildcard match)', () => {
    const result = callTx('initial', 'rechazar', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('no_interesa')
    expect(result!.output.timerSignal?.type).toBe('cancel')
  })

  it('* + no_interesa intent -> no_interesa action + cancel timer', () => {
    const result = callTx('capturing_data', 'no_interesa', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('no_interesa')
    expect(result!.output.timerSignal?.type).toBe('cancel')
  })
})

// ============================================================================
// closed phase catch-all
// ============================================================================

describe('resolveTransition — closed phase catch-all', () => {
  it('closed + any intent -> silence', () => {
    const result = callTx('closed', 'saludo', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
  })

  it('closed + datos -> silence', () => {
    const result = callTx('closed', 'datos', makeState(), GATES_NONE)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('silence')
  })
})

// ============================================================================
// No-match -> null fallback
// ============================================================================

describe('resolveTransition — no match -> null', () => {
  it('initial + acknowledgment (not mapped in initial) -> null fallback', () => {
    const result = callTx('initial', 'acknowledgment', makeState(), GATES_NONE)
    expect(result).toBeNull()
  })
})

// ============================================================================
// systemEventToKey
// ============================================================================

describe('systemEventToKey', () => {
  it('timer_expired -> "timer_expired:N"', () => {
    expect(systemEventToKey({ type: 'timer_expired', level: 0 })).toBe('timer_expired:0')
    expect(systemEventToKey({ type: 'timer_expired', level: 5 })).toBe('timer_expired:5')
  })

  it('auto -> "auto:RESULT"', () => {
    expect(systemEventToKey({ type: 'auto', result: 'datos_criticos' })).toBe('auto:datos_criticos')
  })

  it('unknown event type -> raw type', () => {
    expect(systemEventToKey({ type: 'something_else' })).toBe('something_else')
  })
})
