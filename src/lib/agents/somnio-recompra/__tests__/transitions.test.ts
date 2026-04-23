/**
 * Tests for transitions.ts state machine — post somnio-recompra-template-catalog redesign.
 *
 * Covers:
 * - D-04: quiero_comprar in initial → action 'preguntar_direccion' with L5 timer
 * - D-05 + Q#1: saludo in initial → resolveTransition returns null (handled by response-track INFORMATIONAL_INTENTS branch)
 * - Regression: other entries (datos, confirmar_direccion, seleccion_pack, no_interesa, confirmar) unchanged
 */

import { describe, it, expect } from 'vitest'
import { resolveTransition } from '../transitions'
import { createPreloadedState, computeGates } from '../state'
import type { AgentState, Gates } from '../types'

// ============================================================================
// Fixtures
// ============================================================================

function buildPreloadedState(): AgentState {
  return createPreloadedState({
    nombre: 'Jose',
    apellido: 'Romero',
    telefono: '+573001234567',
    direccion: 'Calle 48A #27-85',
    ciudad: 'Bucaramanga',
    departamento: 'Santander',
  })
}

function buildGatesForPreloaded(state: AgentState): Gates {
  return computeGates(state)
}

// ============================================================================
// D-05 + Q#1: saludo has no transition entry in initial phase
// ============================================================================

describe('resolveTransition — D-05 + Q#1 saludo fallback', () => {
  it('returns null for initial + saludo (entry removed — fallback to response-track INFORMATIONAL_INTENTS branch)', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)

    const result = resolveTransition('initial', 'saludo', state, gates)

    expect(result).toBeNull()
  })

  it('returns null for saludo in any non-initial phase too (was never matched pre-change either)', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)

    expect(resolveTransition('promos_shown', 'saludo', state, gates)).toBeNull()
    expect(resolveTransition('confirming', 'saludo', state, gates)).toBeNull()
  })
})

// ============================================================================
// D-04: quiero_comprar in initial → preguntar_direccion with L5 timer
// ============================================================================

describe('resolveTransition — D-04 quiero_comprar redesign', () => {
  it('returns action=preguntar_direccion + timerSignal L5 for initial + quiero_comprar', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)

    const result = resolveTransition('initial', 'quiero_comprar', state, gates)

    expect(result).not.toBeNull()
    expect(result!.action).toBe('preguntar_direccion')
    expect(result!.output.timerSignal).toEqual({
      type: 'start',
      level: 'L5',
      reason: 'quiero_comprar → preguntar direccion',
    })
    expect(result!.output.reason).toMatch(/confirmar direccion antes de promos/)
  })

  it('does NOT match ofrecer_promos anymore for quiero_comprar in initial', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)

    const result = resolveTransition('initial', 'quiero_comprar', state, gates)

    expect(result!.action).not.toBe('ofrecer_promos')
  })
})

// ============================================================================
// Regression: untouched entries
// ============================================================================

describe('resolveTransition — regression (untouched entries)', () => {
  it('initial + datos with datosCriticos=true → ofrecer_promos', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)

    const result = resolveTransition('initial', 'datos', state, gates)

    expect(result).not.toBeNull()
    expect(result!.action).toBe('ofrecer_promos')
  })

  it('initial + confirmar_direccion → ofrecer_promos (completes the quiero_comprar flow)', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)

    const result = resolveTransition('initial', 'confirmar_direccion', state, gates)

    expect(result).not.toBeNull()
    expect(result!.action).toBe('ofrecer_promos')
  })

  it('promos_shown + seleccion_pack with datosCriticos=true → mostrar_confirmacion', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)

    const result = resolveTransition('promos_shown', 'seleccion_pack', state, gates)

    expect(result).not.toBeNull()
    expect(result!.action).toBe('mostrar_confirmacion')
  })

  it('any-phase + no_interesa → no_interesa', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)

    expect(resolveTransition('initial', 'no_interesa', state, gates)!.action).toBe('no_interesa')
    expect(resolveTransition('promos_shown', 'no_interesa', state, gates)!.action).toBe('no_interesa')
    expect(resolveTransition('confirming', 'no_interesa', state, gates)!.action).toBe('no_interesa')
  })

  it('confirming + confirmar with datosCriticos+packElegido → crear_orden', () => {
    const state = buildPreloadedState()
    state.pack = '2x'
    const gates = buildGatesForPreloaded(state)

    const result = resolveTransition('confirming', 'confirmar', state, gates)

    expect(result).not.toBeNull()
    expect(result!.action).toBe('crear_orden')
  })
})
