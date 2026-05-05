/**
 * Tests for godentist-fb-ig/sales-track.ts orchestrator + lead-capture hook.
 *
 * Standalone agent-godentist-fb-ig — Plan 06 Wave 4 Task 2.
 *
 * Cubre:
 *   - D-09 lead-capture hook: turn 1 + intent=datos + sin datos criticos -> pedir_datos_parcial
 *   - Lead-capture passthrough: turn 1 + intent=datos + datos OK -> sales-track normal
 *   - Lead-capture turn boundary: turn 2 + intent=datos -> sales-track normal (NO lead capture)
 *   - Non-data intents: quiero_agendar / precio_servicio / saludo
 *   - Timer expired event path
 *   - Auto-trigger datos_criticos
 *   - Fallback (no transition)
 *
 * Mock observability collector para evitar logs ruidosos.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock observability ANTES de importar sales-track
vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getCollector: () => ({
      recordEvent: vi.fn(),
      setRespondingAgentId: vi.fn(),
    }),
    runWithPurpose: async (_purpose: string, fn: () => Promise<unknown>) => fn(),
  }
})

import { resolveSalesTrack } from '../sales-track'
import { createInitialState } from '../state'
import type { AgentState, Gates, Phase, SalesEvent } from '../types'
import type { StateChanges } from '../transitions'

// ============================================================================
// Fixtures
// ============================================================================

function makeState(overrides: Partial<AgentState> & { datos?: Partial<AgentState['datos']> } = {}): AgentState {
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

function userMsg(intent: string, category: string = 'datos'): SalesEvent {
  return { type: 'user_message', intent, category }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// D-09 lead-capture hook (turn 1 short-circuit)
// ============================================================================

describe('resolveSalesTrack — D-09 lead-capture hook', () => {
  it('turn 1 + intent=datos + sin datos criticos -> pedir_datos_parcial (lead-capture short-circuit)', () => {
    const state = makeState({
      turnCount: 1,
      datos: { nombre: 'Juan Perez' },  // missing telefono + sede
    })
    const result = resolveSalesTrack({
      phase: 'initial' as Phase,
      state,
      gates: GATES_NONE,
      event: userMsg('datos'),
    })
    expect(result.accion).toBe('pedir_datos_parcial')
    expect(result.reason).toMatch(/Lead capture FB\/IG/)
    expect(result.timerSignal?.level).toBe('L1')
  })

  it('turn 1 + intent=datos + datos criticos OK + sin fecha -> NO lead capture (normal sales-track to pedir_fecha)', () => {
    const state = makeState({
      turnCount: 1,
      datos: { nombre: 'Juan', telefono: '573001234567', sede_preferida: 'cabecera' },
    })
    const result = resolveSalesTrack({
      phase: 'initial' as Phase,
      state,
      gates: GATES_DATOS_OK,
      event: userMsg('datos'),
    })
    // Lead-capture passthrough: gates.datosCriticos = true -> resolveLeadCapture returns null.
    // Sales-track normal -> Rule 6 (initial + datos + datosCriticos + !fechaElegida) -> pedir_fecha.
    expect(result.accion).toBe('pedir_fecha')
    expect(result.reason).not.toMatch(/Lead capture FB\/IG/)
  })

  it('turn 1 + intent=datos + datos + fecha OK -> NO lead capture (normal sales-track to mostrar_disponibilidad)', () => {
    const state = makeState({
      turnCount: 1,
      datos: {
        nombre: 'Juan',
        telefono: '573001234567',
        sede_preferida: 'cabecera',
        fecha_preferida: '2026-05-10',
      },
    })
    const result = resolveSalesTrack({
      phase: 'initial' as Phase,
      state,
      gates: GATES_DATOS_FECHA_OK,
      event: userMsg('datos'),
    })
    expect(result.accion).toBe('mostrar_disponibilidad')
    expect(result.reason).not.toMatch(/Lead capture FB\/IG/)
  })

  it('turn 2 + intent=datos -> NO lead capture (turnCount boundary, normal sales-track)', () => {
    const state = makeState({
      turnCount: 2,
      datos: { nombre: 'Juan' },  // partial data
    })
    const result = resolveSalesTrack({
      phase: 'capturing_data' as Phase,
      state,
      gates: GATES_NONE,
      event: userMsg('datos'),
    })
    // Lead-capture turn boundary: turnCount=2 -> resolveLeadCapture returns null.
    // Sales-track normal -> Rule 22 (capturing_data + datos + !datosCriticos) -> silence + L1.
    expect(result.accion).toBe('silence')
    expect(result.reason).not.toMatch(/Lead capture FB\/IG/)
  })

  it('turn 0 + intent=datos -> NO lead capture (pre-merge boundary)', () => {
    const state = makeState({ turnCount: 0, datos: { nombre: 'Juan' } })
    const result = resolveSalesTrack({
      phase: 'initial' as Phase,
      state,
      gates: GATES_NONE,
      event: userMsg('datos'),
    })
    expect(result.reason ?? '').not.toMatch(/Lead capture FB\/IG/)
  })
})

// ============================================================================
// Non-data intents — lead-capture NO triggered
// ============================================================================

describe('resolveSalesTrack — non-data intents', () => {
  it('turn 1 + intent=quiero_agendar + sin datos -> pedir_datos (Rule 2, NOT lead-capture)', () => {
    const state = makeState({ turnCount: 1 })
    const result = resolveSalesTrack({
      phase: 'initial' as Phase,
      state,
      gates: GATES_NONE,
      event: userMsg('quiero_agendar'),
    })
    expect(result.accion).toBe('pedir_datos')
    expect(result.reason).not.toMatch(/Lead capture FB\/IG/)
  })

  it('turn 1 + intent=precio_servicio (informational) -> silence + L2 (NO lead-capture)', () => {
    const state = makeState({ turnCount: 1 })
    const result = resolveSalesTrack({
      phase: 'initial' as Phase,
      state,
      gates: GATES_NONE,
      event: userMsg('precio_servicio', 'pregunta'),
    })
    expect(result.accion).toBe('silence')
    expect(result.timerSignal?.level).toBe('L2')
  })

  it('turn 1 + intent=saludo -> silence (Rule 1, NO timer, NO lead-capture)', () => {
    const state = makeState({ turnCount: 1 })
    const result = resolveSalesTrack({
      phase: 'initial' as Phase,
      state,
      gates: GATES_NONE,
      event: userMsg('saludo'),
    })
    expect(result.accion).toBe('silence')
  })
})

// ============================================================================
// Timer expired event path
// ============================================================================

describe('resolveSalesTrack — timer_expired path', () => {
  it('phase=initial + timer_expired:2 -> invitar_agendar (Rule 21)', () => {
    const state = makeState({ turnCount: 3 })
    const result = resolveSalesTrack({
      phase: 'initial' as Phase,
      state,
      gates: GATES_NONE,
      event: { type: 'timer_expired', level: 2 },
    })
    expect(result.accion).toBe('invitar_agendar')
  })

  it('phase=capturing_data + timer_expired:1 -> retoma_datos (Rule 31b)', () => {
    const state = makeState({ turnCount: 2 })
    const result = resolveSalesTrack({
      phase: 'capturing_data' as Phase,
      state,
      gates: GATES_NONE,
      event: { type: 'timer_expired', level: 1 },
    })
    expect(result.accion).toBe('retoma_datos')
  })

  it('timer_expired in closed phase -> matches catch-all wildcard (silence)', () => {
    const state = makeState({ turnCount: 1 })
    const result = resolveSalesTrack({
      phase: 'closed' as Phase,
      state,
      gates: GATES_NONE,
      event: { type: 'timer_expired', level: 0 },
    })
    // closed phase has * + * -> silence (catch-all). timer_expired:0 matches the wildcard.
    expect(result.accion).toBe('silence')
  })

  it('timer_expired without matching transition (showing_availability + level 0) -> reason describes no transition', () => {
    const state = makeState({ turnCount: 1 })
    const result = resolveSalesTrack({
      phase: 'showing_availability' as Phase,
      state,
      gates: GATES_NONE,
      event: { type: 'timer_expired', level: 0 },
    })
    // showing_availability has no timer_expired:0 rule -> sales-track returns reason describing the miss.
    expect(result.accion).toBeUndefined()
    expect(result.reason).toMatch(/no transition/i)
  })
})

// ============================================================================
// Auto-trigger datos_criticos
// ============================================================================

describe('resolveSalesTrack — auto-trigger datos_criticos', () => {
  it('changes.datosCriticosJustCompleted + !fechaElegida + intent=datos -> pedir_fecha (auto-trigger)', () => {
    const state = makeState({
      turnCount: 2,
      datos: { nombre: 'Juan', telefono: '573001234567', sede_preferida: 'cabecera' },
    })
    const result = resolveSalesTrack({
      phase: 'capturing_data' as Phase,
      state,
      gates: GATES_DATOS_OK,
      event: userMsg('datos'),
      changes: makeChanges({ datosCriticosJustCompleted: true, hasNewData: true, filled: 1, newFields: ['sede_preferida'] }),
    })
    // Rule 27: capturing_data + auto:datos_criticos + !fechaElegida -> pedir_fecha
    expect(result.accion).toBe('pedir_fecha')
  })

  it('datosCriticosJustCompleted + intent=precio_servicio (informational) -> defer auto-trigger, return Rule 29 silence', () => {
    const state = makeState({
      turnCount: 2,
      datos: { nombre: 'Juan', telefono: '573001234567', sede_preferida: 'cabecera' },
    })
    const result = resolveSalesTrack({
      phase: 'capturing_data' as Phase,
      state,
      gates: GATES_DATOS_OK,
      event: userMsg('precio_servicio', 'pregunta'),
      changes: makeChanges({ datosCriticosJustCompleted: true }),
    })
    // Auto-trigger DEFERRED for informational intents — falls to Rule 29 (info during capture).
    expect(result.accion).toBe('silence')
  })
})

// ============================================================================
// Partial data timer (dataTimerSignal fallback)
// ============================================================================

describe('resolveSalesTrack — partial data timer', () => {
  it('hasNewData + filled>0 + !datosCriticos + no transition match -> dataTimerSignal L1 fallback', () => {
    // initial + acknowledgment is unmatched -> falls to default with dataTimerSignal
    const state = makeState({ turnCount: 1, datos: { nombre: 'Juan' } })
    const result = resolveSalesTrack({
      phase: 'initial' as Phase,
      state,
      gates: GATES_NONE,
      event: userMsg('acknowledgment', 'irrelevante'),
      changes: makeChanges({ hasNewData: true, filled: 1, newFields: ['nombre'] }),
    })
    // No transition for initial + acknowledgment -> fallback path
    expect(result.accion).toBeUndefined()
    expect(result.timerSignal?.level).toBe('L1')
  })
})
