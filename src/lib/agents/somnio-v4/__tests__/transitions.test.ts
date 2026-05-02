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
