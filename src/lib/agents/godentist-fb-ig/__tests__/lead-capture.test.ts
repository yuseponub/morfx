/**
 * Tests for godentist-fb-ig/lead-capture.ts pure helper.
 *
 * Standalone agent-godentist-fb-ig — Plan 06 Wave 4 Task 1.
 *
 * Pitfall 5 (off-by-one) coverage: turnCount boundaries 0/1/2/5 +
 * matrix de intent (datos / saludo / quiero_agendar / precio_servicio) +
 * gates con/sin datosCriticos + camposFaltantes [] vs [nombre] vs [todos].
 *
 * resolveLeadCapture es PURO — sin I/O, sin side effects. Tests directos
 * sin mocks.
 */

import { describe, it, expect } from 'vitest'
import { resolveLeadCapture } from '../lead-capture'
import { createInitialState } from '../state'
import type { AgentState, Gates } from '../types'

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

// ============================================================================
// Pitfall 5 — turnCount boundary
// ============================================================================

describe('resolveLeadCapture — Pitfall 5 turnCount boundary', () => {
  it('returns null when turnCount === 0 (pre-merge state, helper has not fired yet)', () => {
    const result = resolveLeadCapture({
      turnCount: 0,
      intent: 'datos',
      state: makeState({ turnCount: 0, datos: { nombre: 'Juan' } }),
      gates: GATES_NONE,
    })
    expect(result).toBeNull()
  })

  it('triggers when turnCount === 1 + intent=datos + datos parciales', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'datos',
      state: makeState({ turnCount: 1, datos: { nombre: 'Juan Perez' } }),
      gates: GATES_NONE,
    })
    expect(result).not.toBeNull()
    expect(result?.accion).toBe('pedir_datos_parcial')
  })

  it('returns null when turnCount === 2 (subsequent turns ignored)', () => {
    const result = resolveLeadCapture({
      turnCount: 2,
      intent: 'datos',
      state: makeState({ turnCount: 2, datos: { nombre: 'Juan' } }),
      gates: GATES_NONE,
    })
    expect(result).toBeNull()
  })

  it('returns null when turnCount === 5 (deep conversation)', () => {
    const result = resolveLeadCapture({
      turnCount: 5,
      intent: 'datos',
      state: makeState({ turnCount: 5 }),
      gates: GATES_NONE,
    })
    expect(result).toBeNull()
  })
})

// ============================================================================
// Intent gating — solo dispara con intent='datos'
// ============================================================================

describe('resolveLeadCapture — intent gating (solo datos)', () => {
  it('returns null when intent === saludo', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'saludo',
      state: makeState({ turnCount: 1 }),
      gates: GATES_NONE,
    })
    expect(result).toBeNull()
  })

  it('returns null when intent === quiero_agendar (transitions handles it)', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'quiero_agendar',
      state: makeState({ turnCount: 1 }),
      gates: GATES_NONE,
    })
    expect(result).toBeNull()
  })

  it('returns null when intent === precio_servicio (informational)', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'precio_servicio',
      state: makeState({ turnCount: 1 }),
      gates: GATES_NONE,
    })
    expect(result).toBeNull()
  })

  it('returns null when intent === otro (fallback)', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'otro',
      state: makeState({ turnCount: 1 }),
      gates: GATES_NONE,
    })
    expect(result).toBeNull()
  })
})

// ============================================================================
// Gates passthrough — datos criticos OK = NO lead capture
// ============================================================================

describe('resolveLeadCapture — gates passthrough', () => {
  it('returns null when datos criticos completos + sin fecha (let sales-track go to pedir_fecha)', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'datos',
      state: makeState({
        turnCount: 1,
        datos: { nombre: 'Juan', telefono: '573001234567', sede_preferida: 'cabecera' },
      }),
      gates: GATES_DATOS_OK,
    })
    expect(result).toBeNull()
  })

  it('returns null when datos criticos + fecha completos (let sales-track go to mostrar_disponibilidad)', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'datos',
      state: makeState({
        turnCount: 1,
        datos: {
          nombre: 'Juan',
          telefono: '573001234567',
          sede_preferida: 'cabecera',
          fecha_preferida: '2026-05-10',
        },
      }),
      gates: GATES_DATOS_FECHA_OK,
    })
    expect(result).toBeNull()
  })
})

// ============================================================================
// Trigger — datos parciales (camposFaltantes calculados correctamente)
// ============================================================================

describe('resolveLeadCapture — trigger camposFaltantes content', () => {
  it('triggers and reason mentions telefono + sede when only nombre present', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'datos',
      state: makeState({ turnCount: 1, datos: { nombre: 'Juan Perez' } }),
      gates: GATES_NONE,
    })
    expect(result).not.toBeNull()
    expect(result!.accion).toBe('pedir_datos_parcial')
    expect(result!.reason).toMatch(/telefono/i)
    expect(result!.reason).toMatch(/sede/i)
  })

  it('triggers and reason mentions nombre + sede when only telefono present', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'datos',
      state: makeState({ turnCount: 1, datos: { telefono: '573001234567' } }),
      gates: GATES_NONE,
    })
    expect(result).not.toBeNull()
    expect(result!.reason).toMatch(/nombre/i)
    expect(result!.reason).toMatch(/sede/i)
  })

  it('triggers when no datos at all (camposFaltantes = [nombre, cedula, telefono, sede_preferida])', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'datos',
      state: makeState({ turnCount: 1 }),
      gates: GATES_NONE,
    })
    expect(result).not.toBeNull()
    expect(result!.accion).toBe('pedir_datos_parcial')
  })

  it('triggers when nombre + telefono present but sede missing', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'datos',
      state: makeState({
        turnCount: 1,
        datos: { nombre: 'Juan', telefono: '573001234567' },
      }),
      gates: GATES_NONE,
    })
    expect(result).not.toBeNull()
    expect(result!.reason).toMatch(/sede/i)
  })
})

// ============================================================================
// Timer signal — L1 start con razon descriptiva
// ============================================================================

describe('resolveLeadCapture — timer signal', () => {
  it('emits start L1 timer when triggered', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'datos',
      state: makeState({ turnCount: 1, datos: { nombre: 'Juan' } }),
      gates: GATES_NONE,
    })
    expect(result).not.toBeNull()
    expect(result!.timerSignal).toBeDefined()
    expect(result!.timerSignal!.type).toBe('start')
    expect(result!.timerSignal!.level).toBe('L1')
    expect(result!.timerSignal!.reason).toMatch(/lead capture turn 1/i)
  })

  it('reason field starts with "Lead capture FB/IG"', () => {
    const result = resolveLeadCapture({
      turnCount: 1,
      intent: 'datos',
      state: makeState({ turnCount: 1, datos: { nombre: 'Juan' } }),
      gates: GATES_NONE,
    })
    expect(result).not.toBeNull()
    expect(result!.reason).toMatch(/Lead capture FB\/IG/)
  })
})
