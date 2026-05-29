/**
 * Tests for somnio-v4 transitions.ts state machine.
 *
 * Coverage:
 * - Test 1: resolveTransition con phase='initial' + on='quiero_comprar' (datos vacíos)
 *           retorna acción 'pedir_datos' (transition table match esperado del clone v3).
 * - Test 2: resolveTransition con entry no-matched retorna null (saludo en initial NO
 *           tiene entry — fallback a INFORMATIONAL_INTENTS branch en response-track).
 * - Test 3: systemEventToKey('timer_expired', level=3) retorna 'timer_expired:3'.
 * - Test 4: TRANSITIONS array tiene >= 30 entradas (sanity check de clone correcto —
 *           v3 transitions.ts tiene ~36 entries; clone debe preservar todas).
 *
 * Standalone: somnio-sales-v4
 */

import { describe, it, expect } from 'vitest'
import {
  TRANSITIONS,
  resolveTransition,
  systemEventToKey,
} from '../transitions'
import { createInitialState, computeGates } from '../state'
import type { AgentState, Gates } from '../types'

// ============================================================================
// Fixtures
// ============================================================================

function buildEmptyState(): AgentState {
  return createInitialState()
}

function buildGates(state: AgentState): Gates {
  return computeGates(state)
}

// ============================================================================
// Test 1: pedir_datos en initial + quiero_comprar sin datos críticos
// ============================================================================

describe('resolveTransition', () => {
  it('Test 1: phase=initial + on=quiero_comprar (datos vacíos) → action=pedir_datos', () => {
    const state = buildEmptyState()
    const gates = buildGates(state)

    const result = resolveTransition('initial', 'quiero_comprar', state, gates)

    expect(result).not.toBeNull()
    expect(result?.action).toBe('pedir_datos')
    expect(result?.output.enterCaptura).toBe(true)
    expect(result?.output.timerSignal?.type).toBe('start')
    expect(result?.output.timerSignal?.level).toBe('L0')
  })

  it('Test 2: phase=initial + on=saludo → null (no entry — handled by INFORMATIONAL_INTENTS)', () => {
    const state = buildEmptyState()
    const gates = buildGates(state)

    const result = resolveTransition('initial', 'saludo', state, gates)

    expect(result).toBeNull()
  })
})

// ============================================================================
// Test 3: systemEventToKey
// ============================================================================

describe('systemEventToKey', () => {
  it('Test 3: timer_expired with level=3 → "timer_expired:3"', () => {
    const key = systemEventToKey({ type: 'timer_expired', level: 3 })
    expect(key).toBe('timer_expired:3')
  })

  it('also encodes auto events: auto:datos_completos', () => {
    const key = systemEventToKey({ type: 'auto', result: 'datos_completos' })
    expect(key).toBe('auto:datos_completos')
  })

  it('falls back to event.type for unknown events', () => {
    const key = systemEventToKey({ type: 'unknown_event' })
    expect(key).toBe('unknown_event')
  })
})

// ============================================================================
// Test 4: TRANSITIONS array sanity check
// ============================================================================

describe('TRANSITIONS array', () => {
  it('Test 4: TRANSITIONS has at least 30 entries (clone-v3 sanity)', () => {
    expect(TRANSITIONS.length).toBeGreaterThanOrEqual(30)
  })

  it('every entry has phase, on, action, resolve fields', () => {
    for (const entry of TRANSITIONS) {
      expect(entry.phase).toBeDefined()
      expect(entry.on).toBeDefined()
      expect(entry.action).toBeDefined()
      expect(typeof entry.resolve).toBe('function')
    }
  })
})

// ============================================================================
// Lifecycle rediseñado (standalone somnio-v4-crm-subloop): D-15/D-17/D-18/D-19
// ============================================================================

/** Build a state with all critical fields filled (normal mode → datosCriticos=true). */
function buildStateDatosCriticos(): AgentState {
  const state = buildEmptyState()
  state.datos.nombre = 'Ana'
  state.datos.apellido = 'Gomez'
  state.datos.telefono = '3001234567'
  state.datos.ciudad = 'Bogota'
  state.datos.departamento = 'Cundinamarca'
  state.datos.direccion = 'Calle 1 # 2-3'
  // extras negados para que datosCompletos no sea relevante al test
  state.negaciones.correo = true
  state.negaciones.barrio = true
  return state
}

describe('Lifecycle rediseñado (D-15/D-17/D-18/D-19)', () => {
  it('D-18: confirmar + datosCriticos + packElegido → confirmar_orden (NO crear_orden)', () => {
    // D-18: el pedido nace temprano (cascaron). confirmar ya no CREA, solo mueve a CONFIRMADO.
    const state = buildStateDatosCriticos()
    state.pack = '2x'
    const gates = buildGates(state)
    expect(gates.datosCriticos).toBe(true)
    expect(gates.packElegido).toBe(true)

    const result = resolveTransition('confirming', 'confirmar', state, gates)

    expect(result).not.toBeNull()
    expect(result?.action).toBe('confirmar_orden')
    // confirmar_orden ya NO es crear_orden (cascaron ya existe)
    expect(result?.action).not.toBe('crear_orden')
    // timer cancelado al mover a CONFIRMADO
    expect(result?.output.timerSignal?.type).toBe('cancel')
  })

  it('D-19: timer L3 (promos_shown + timer_expired:3) → recordar_promo', () => {
    const state = buildStateDatosCriticos()
    const gates = buildGates(state)

    const result = resolveTransition('promos_shown', 'timer_expired:3', state, gates)

    expect(result).not.toBeNull()
    expect(result?.action).toBe('recordar_promo')
    // D-19: timer solo RECUERDA, no crea. cancel previene doble-recordatorio.
    expect(result?.output.timerSignal?.type).toBe('cancel')
  })

  it('D-19: timer L4 (confirming + timer_expired:4) → recordar_confirmacion', () => {
    const state = buildStateDatosCriticos()
    state.pack = '1x'
    const gates = buildGates(state)

    const result = resolveTransition('confirming', 'timer_expired:4', state, gates)

    expect(result).not.toBeNull()
    expect(result?.action).toBe('recordar_confirmacion')
    expect(result?.output.timerSignal?.type).toBe('cancel')
  })

  it('D-17: seleccion_pack + datosCriticos → mostrar_confirmacion (sin cambio; updateOrder vive en el gate)', () => {
    const state = buildStateDatosCriticos()
    state.pack = '3x'
    const gates = buildGates(state)

    const result = resolveTransition('promos_shown', 'seleccion_pack', state, gates)

    expect(result).not.toBeNull()
    expect(result?.action).toBe('mostrar_confirmacion')
    expect(result?.output.timerSignal?.level).toBe('L4')
  })

  it('regresion: confirmar SIN pack → ofrecer_promos (caso existente sigue verde)', () => {
    const state = buildStateDatosCriticos()
    // sin pack
    const gates = buildGates(state)
    expect(gates.packElegido).toBe(false)

    const result = resolveTransition('promos_shown', 'confirmar', state, gates)

    expect(result).not.toBeNull()
    expect(result?.action).toBe('ofrecer_promos')
  })
})
