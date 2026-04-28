/**
 * Tests for somnio-pw-confirmation/transitions.ts state machine.
 *
 * Plan 12 Wave 6 — coverage of locked decisions:
 *   - D-09 → D-26: confirmacion + shipping complete → confirmar_compra
 *   - D-09 → D-26: confirmacion + shipping INCOMPLETE → pedir_datos_envio
 *   - D-10:        confirmar_compra accion (mover a CONFIRMADO en Plan 11/Plan 10)
 *   - D-11:        cancelacion 1er "no" → cancelar_con_agendar_pregunta
 *   - D-11:        cancelacion 2do "no" → cancelar_definitivo
 *   - D-11 alt:    awaiting_schedule_decision + agendar → mover_a_falta_confirmar
 *   - D-12:        cualquier phase + cambiar_direccion → actualizar_direccion
 *   - D-13 V1:     editar_items → handoff (V1.1 implementaria edicion real)
 *   - D-14:        esperar → mover_a_falta_confirmar
 *   - D-21:        pedir_humano → handoff (defense-in-depth — guards.ts R1 tambien lo atrapa)
 *   - Default fallback: cualquier intent no mapeado → noop
 *
 * Pattern clonado de somnio-recompra/__tests__/transitions.test.ts (declarative
 * fixtures + first-match wins). Helper `createPreloadedState` se define inline
 * porque state.ts NO exporta uno (a diferencia de recompra/state.ts:80).
 */

import { describe, it, expect } from 'vitest'
import { resolveTransition } from '../transitions'
import type { AgentState, ActiveOrderPayload } from '../state'

// ============================================================================
// Fixture factory (helper inline — state.ts no exporta createPreloadedState)
// ============================================================================

const STAGE_NUEVO_PAG_WEB = '42da9d61-6c00-4317-9fd9-2cec9113bd38'
const PIPELINE_ID = 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8'

function buildActiveOrder(overrides: Partial<ActiveOrderPayload> = {}): ActiveOrderPayload {
  return {
    orderId: 'order-test-1',
    stageId: STAGE_NUEVO_PAG_WEB,
    stageName: 'NUEVO PAG WEB',
    pipelineId: PIPELINE_ID,
    totalValue: 77900,
    items: [{ titulo: 'ELIXIR DEL SUEÑO', cantidad: 1, unitPrice: 77900 }],
    shippingAddress: 'Cra 10 #20-30',
    shippingCity: 'Bucaramanga',
    shippingDepartment: 'Santander',
    customerName: 'Jose Romero',
    customerPhone: '573001234567',
    customerEmail: null,
    tags: [],
    ...overrides,
  }
}

function createPreloadedState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    phase: 'awaiting_confirmation',
    datos: {
      nombre: 'Jose',
      apellido: 'Romero',
      telefono: '573001234567',
      direccion: 'Cra 10 #20-30',
      ciudad: 'Bucaramanga',
      departamento: 'Santander',
    },
    active_order: buildActiveOrder(),
    intent_history: [],
    acciones: [],
    templatesMostrados: {},
    cancelacion_intent_count: 0,
    requires_human: false,
    crm_context_status: 'ok',
    ...overrides,
  }
}

// ============================================================================
// D-09 → D-26 + D-10: confirmacion del cliente
// ============================================================================

describe('resolveTransition — D-09→D-26 confirmacion happy path', () => {
  it('phase=awaiting_confirmation + intent=confirmar_pedido + shipping complete → accion=confirmar_compra (D-10)', () => {
    const state = createPreloadedState()
    const result = resolveTransition({
      phase: 'awaiting_confirmation',
      intent: 'confirmar_pedido',
      state,
    })
    expect(result.accion).toBe('confirmar_compra')
    expect(result.reason).toBe('confirmation_with_complete_shipping')
  })
})

describe('resolveTransition — D-09→D-26 missing shipping', () => {
  it('phase=awaiting_confirmation + intent=confirmar_pedido + shipping incomplete → accion=pedir_datos_envio', () => {
    const state = createPreloadedState({
      datos: {
        nombre: 'Jose',
        apellido: null, // missing
        telefono: '573001234567',
        direccion: 'Cra 10 #20-30',
        ciudad: 'Bucaramanga',
        departamento: null, // missing
      },
    })
    const result = resolveTransition({
      phase: 'awaiting_confirmation',
      intent: 'confirmar_pedido',
      state,
    })
    expect(result.accion).toBe('pedir_datos_envio')
    expect(result.reason).toBe('confirmation_blocked_missing_shipping')
  })
})

describe('resolveTransition — D-10 alternate awaiting state', () => {
  it('phase=awaiting_confirmation_post_data_capture + intent=confirmar_pedido + shipping complete → confirmar_compra', () => {
    const state = createPreloadedState({ phase: 'awaiting_confirmation_post_data_capture' })
    const result = resolveTransition({
      phase: 'awaiting_confirmation_post_data_capture',
      intent: 'confirmar_pedido',
      state,
    })
    expect(result.accion).toBe('confirmar_compra')
  })
})

// ============================================================================
// D-11: cancellation flow (multi-turn)
// ============================================================================

describe('resolveTransition — D-11 cancellation step 1 (1er "no")', () => {
  it('phase=awaiting_confirmation + intent=cancelar_pedido + count=0 → cancelar_con_agendar_pregunta', () => {
    const state = createPreloadedState({ cancelacion_intent_count: 0 })
    const result = resolveTransition({
      phase: 'awaiting_confirmation',
      intent: 'cancelar_pedido',
      state,
    })
    expect(result.accion).toBe('cancelar_con_agendar_pregunta')
    expect(result.reason).toBe('first_no_offer_schedule')
  })
})

describe('resolveTransition — D-11 cancellation step 2 (2do "no")', () => {
  it('phase=awaiting_schedule_decision + intent=cancelar_pedido → cancelar_definitivo (handoff silencioso)', () => {
    const state = createPreloadedState({
      phase: 'awaiting_schedule_decision',
      cancelacion_intent_count: 1,
    })
    const result = resolveTransition({
      phase: 'awaiting_schedule_decision',
      intent: 'cancelar_pedido',
      state,
    })
    expect(result.accion).toBe('cancelar_definitivo')
    expect(result.reason).toBe('second_no_handoff')
  })
})

describe('resolveTransition — D-11 alt path (agenda accepted)', () => {
  it('phase=awaiting_schedule_decision + intent=agendar → mover_a_falta_confirmar', () => {
    const state = createPreloadedState({ phase: 'awaiting_schedule_decision' })
    const result = resolveTransition({
      phase: 'awaiting_schedule_decision',
      intent: 'agendar',
      state,
    })
    expect(result.accion).toBe('mover_a_falta_confirmar')
    expect(result.reason).toBe('schedule_accepted')
  })
})

// ============================================================================
// D-12: cambiar_direccion en cualquier phase
// ============================================================================

describe('resolveTransition — D-12 cambiar_direccion', () => {
  it('phase=awaiting_confirmation + intent=cambiar_direccion → actualizar_direccion', () => {
    const state = createPreloadedState()
    const result = resolveTransition({
      phase: 'awaiting_confirmation',
      intent: 'cambiar_direccion',
      state,
    })
    expect(result.accion).toBe('actualizar_direccion')
    expect(result.reason).toBe('address_change_requested')
  })

  it('phase=awaiting_address_confirmation + intent=cambiar_direccion → actualizar_direccion (loop)', () => {
    const state = createPreloadedState({ phase: 'awaiting_address_confirmation' })
    const result = resolveTransition({
      phase: 'awaiting_address_confirmation',
      intent: 'cambiar_direccion',
      state,
    })
    expect(result.accion).toBe('actualizar_direccion')
    // entry #4 (awaiting_address_confirmation specific) gana antes que entry #5 (* wildcard)
    expect(result.reason).toBe('address_re_change_requested')
  })

  it('phase=capturing_data + intent=cambiar_direccion → actualizar_direccion (wildcard match)', () => {
    const state = createPreloadedState({ phase: 'capturing_data' })
    const result = resolveTransition({
      phase: 'capturing_data',
      intent: 'cambiar_direccion',
      state,
    })
    expect(result.accion).toBe('actualizar_direccion')
  })
})

// ============================================================================
// D-13 V1: editar_items → handoff (deferred edicion real a V1.1)
// ============================================================================

describe('resolveTransition — D-13 V1 editar_items handoff', () => {
  it('phase=awaiting_confirmation + intent=editar_items → handoff (V1 escala humano)', () => {
    const state = createPreloadedState()
    const result = resolveTransition({
      phase: 'awaiting_confirmation',
      intent: 'editar_items',
      state,
    })
    expect(result.accion).toBe('handoff')
    expect(result.reason).toBe('edit_items_v1_handoff')
  })
})

// ============================================================================
// D-14: esperar → mover_a_falta_confirmar
// ============================================================================

describe('resolveTransition — D-14 esperar / "lo pienso"', () => {
  it('any phase + intent=esperar → mover_a_falta_confirmar', () => {
    const state = createPreloadedState()
    const result = resolveTransition({
      phase: 'awaiting_confirmation',
      intent: 'esperar',
      state,
    })
    expect(result.accion).toBe('mover_a_falta_confirmar')
    expect(result.reason).toBe('wait_acknowledged')
  })
})

// ============================================================================
// D-21: pedir_humano → handoff (defense-in-depth, guards.ts R1 tambien)
// ============================================================================

describe('resolveTransition — D-21 pedir_humano handoff', () => {
  it('any phase + intent=pedir_humano → handoff (defense-in-depth con guards.ts R1)', () => {
    const state = createPreloadedState()
    const result = resolveTransition({
      phase: 'awaiting_confirmation',
      intent: 'pedir_humano',
      state,
    })
    expect(result.accion).toBe('handoff')
    expect(result.reason).toBe('human_requested')
  })
})

// ============================================================================
// Default fallback: intents informacionales y no mapeados → noop
// ============================================================================

describe('resolveTransition — default fallback noop', () => {
  it('intent=fallback (no mapped, no informational) → accion=noop con reason=no_matching_transition', () => {
    const state = createPreloadedState()
    const result = resolveTransition({
      phase: 'awaiting_confirmation',
      intent: 'fallback',
      state,
    })
    expect(result.accion).toBe('noop')
    expect(result.reason).toBe('no_matching_transition')
  })

  it('intent=precio (informacional) → accion=noop con reason=informational_query_response_track_handles', () => {
    const state = createPreloadedState()
    const result = resolveTransition({
      phase: 'awaiting_confirmation',
      intent: 'precio',
      state,
    })
    expect(result.accion).toBe('noop')
    expect(result.reason).toBe('informational_query_response_track_handles')
  })
})

// ============================================================================
// Regression: first-match wins ordering (entry #6 antes de #7)
// ============================================================================

describe('resolveTransition — first-match wins regression', () => {
  it('phase=awaiting_schedule_decision + cancelar_pedido NO cae a entry #7 (cancelar_con_agendar) aunque count=0', () => {
    const state = createPreloadedState({
      phase: 'awaiting_schedule_decision',
      cancelacion_intent_count: 0, // counter no se incremento (defensive case)
    })
    const result = resolveTransition({
      phase: 'awaiting_schedule_decision',
      intent: 'cancelar_pedido',
      state,
    })
    // Entry #6 (awaiting_schedule_decision + cancelar) MUST win over entry #7
    // (INITIAL_AWAITING_STATES + cancelar + count=0) — phases are disjoint, but
    // ordering matters as documented in transitions.ts.
    expect(result.accion).toBe('cancelar_definitivo')
  })
})
