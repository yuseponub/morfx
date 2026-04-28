/**
 * Tests for somnio-pw-confirmation/sales-track.ts orchestrator.
 *
 * Plan 12 Wave 6 — coverage del flujo D-11 multi-turno + pre/post-processing:
 *   - Turn 1 cancelacion → cancelar_con_agendar_pregunta + state.cancelacion_intent_count==1
 *   - Turn 2 cancelacion (post awaiting_schedule_decision) → cancelar_definitivo + requires_human=true
 *   - D-09→D-26 + datos en mismo mensaje → mergeAnalysis primero → confirmar_compra (NO pedir_datos_envio)
 *   - enterCaptura marker cuando accion='pedir_datos_envio'
 *   - D-21 handoff → state.requires_human=true
 *
 * sales-track muta state IN-PLACE (counters/flags), por eso se testea pasando
 * un state mutable y verificando post-call.
 */

import { describe, it, expect } from 'vitest'
import { resolveSalesTrack } from '../sales-track'
import type { AgentState, ActiveOrderPayload } from '../state'
import type { MessageAnalysis } from '../comprehension-schema'

// ============================================================================
// Fixtures
// ============================================================================

function buildActiveOrder(overrides: Partial<ActiveOrderPayload> = {}): ActiveOrderPayload {
  return {
    orderId: 'order-test-1',
    stageId: '42da9d61-6c00-4317-9fd9-2cec9113bd38',
    stageName: 'NUEVO PAG WEB',
    pipelineId: 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8',
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

function buildState(overrides: Partial<AgentState> = {}): AgentState {
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

function buildAnalysis(overrides: Partial<MessageAnalysis> = {}): MessageAnalysis {
  return {
    intent: 'fallback',
    confidence: 0.95,
    datos_extraidos: null,
    notas: null,
    ...overrides,
  } as MessageAnalysis
}

// ============================================================================
// D-11: cancellation multi-turn flow
// ============================================================================

describe('resolveSalesTrack — D-11 cancellation turn 1', () => {
  it('count=0 + intent=cancelar_pedido + phase=awaiting_confirmation → cancelar_con_agendar_pregunta + state.cancelacion_intent_count=1', () => {
    const state = buildState({ cancelacion_intent_count: 0 })
    const analysis = buildAnalysis({ intent: 'cancelar_pedido' })

    const result = resolveSalesTrack({
      phase: 'awaiting_confirmation',
      intent: 'cancelar_pedido',
      state,
      analysis,
    })

    expect(result.accion).toBe('cancelar_con_agendar_pregunta')
    // Counter mutation in-place (D-11 paso 1 setea count=1 para que el proximo
    // "no" en awaiting_schedule_decision caiga al entry #6 cancelar_definitivo).
    expect(state.cancelacion_intent_count).toBe(1)
    // Aun NO requiere humano (turn 1 puede recuperarse via agenda).
    expect(state.requires_human).toBe(false)
  })
})

describe('resolveSalesTrack — D-11 cancellation turn 2', () => {
  it('count=1 + intent=cancelar_pedido + phase=awaiting_schedule_decision → cancelar_definitivo + state.requires_human=true', () => {
    const state = buildState({
      phase: 'awaiting_schedule_decision',
      cancelacion_intent_count: 1,
    })
    const analysis = buildAnalysis({ intent: 'cancelar_pedido' })

    const result = resolveSalesTrack({
      phase: 'awaiting_schedule_decision',
      intent: 'cancelar_pedido',
      state,
      analysis,
    })

    expect(result.accion).toBe('cancelar_definitivo')
    // D-21 stub trigger b: cancelar_definitivo → requires_human=true para handoff.
    expect(state.requires_human).toBe(true)
  })
})

// ============================================================================
// D-09 → D-26 + datos en mismo mensaje (mergeAnalysis pre-process)
// ============================================================================

describe('resolveSalesTrack — D-09→D-26 datos+confirmacion mismo mensaje', () => {
  it('shipping incomplete + analysis.datos_extraidos completa el shipping + intent=confirmar_pedido → confirmar_compra (NO pedir_datos_envio)', () => {
    // State pre-merge: missing direccion + ciudad + departamento.
    const state = buildState({
      datos: {
        nombre: 'Jose',
        apellido: 'Romero',
        telefono: '573001234567',
        direccion: null,
        ciudad: null,
        departamento: null,
      },
      active_order: buildActiveOrder({
        shippingAddress: null,
        shippingCity: null,
        shippingDepartment: null,
      }),
    })

    // Cliente envia: "si, mi direccion es Calle 100 #15-20 Bogota Cundinamarca"
    const analysis = buildAnalysis({
      intent: 'confirmar_pedido',
      datos_extraidos: {
        nombre: null,
        apellido: null,
        telefono: null,
        direccion: 'Calle 100 #15-20',
        ciudad: 'Bogota',
        departamento: 'Cundinamarca',
      },
    })

    const result = resolveSalesTrack({
      phase: 'awaiting_confirmation',
      intent: 'confirmar_pedido',
      state,
      analysis,
    })

    // Pre-merge consumido: shippingComplete tras merge → confirmar_compra (NO pedir_datos_envio).
    expect(result.accion).toBe('confirmar_compra')
    // Datos mergeados se propagan al state original (sales-track muta in-place).
    expect(state.datos.direccion).toBe('Calle 100 #15-20')
    expect(state.datos.ciudad).toBe('Bogota')
    expect(state.datos.departamento).toBe('Cundinamarca')
    // Changes flag derived: shipping just completed.
    expect(result.changes?.shippingJustCompleted).toBe(true)
    expect(result.changes?.hasNewData).toBe(true)
  })
})

// ============================================================================
// enterCaptura marker (engine Plan 11 transiciona a 'capturing_data')
// ============================================================================

describe('resolveSalesTrack — enterCaptura marker', () => {
  it('intent=confirmar_pedido + shipping incomplete + sin datos extraidos → pedir_datos_envio + enterCaptura=true', () => {
    const state = buildState({
      datos: {
        nombre: 'Jose',
        apellido: null,
        telefono: '573001234567',
        direccion: null,
        ciudad: null,
        departamento: null,
      },
      active_order: buildActiveOrder({
        shippingAddress: null,
        shippingCity: null,
        shippingDepartment: null,
      }),
    })
    const analysis = buildAnalysis({ intent: 'confirmar_pedido' })

    const result = resolveSalesTrack({
      phase: 'awaiting_confirmation',
      intent: 'confirmar_pedido',
      state,
      analysis,
    })

    expect(result.accion).toBe('pedir_datos_envio')
    expect(result.enterCaptura).toBe(true)
  })

  it('intent=confirmar_pedido + shipping complete → confirmar_compra + enterCaptura=false', () => {
    const state = buildState() // shipping complete from default fixture
    const analysis = buildAnalysis({ intent: 'confirmar_pedido' })

    const result = resolveSalesTrack({
      phase: 'awaiting_confirmation',
      intent: 'confirmar_pedido',
      state,
      analysis,
    })

    expect(result.accion).toBe('confirmar_compra')
    expect(result.enterCaptura).toBe(false)
  })
})

// ============================================================================
// D-21: handoff sets requires_human flag
// ============================================================================

describe('resolveSalesTrack — D-21 handoff requires_human flag', () => {
  it('intent=pedir_humano → handoff + state.requires_human=true', () => {
    const state = buildState()
    const analysis = buildAnalysis({ intent: 'pedir_humano' })

    const result = resolveSalesTrack({
      phase: 'awaiting_confirmation',
      intent: 'pedir_humano',
      state,
      analysis,
    })

    expect(result.accion).toBe('handoff')
    expect(state.requires_human).toBe(true)
  })

  it('intent=editar_items (V1 → handoff via transition entry #10) → state.requires_human=true', () => {
    const state = buildState()
    const analysis = buildAnalysis({ intent: 'editar_items' })

    const result = resolveSalesTrack({
      phase: 'awaiting_confirmation',
      intent: 'editar_items',
      state,
      analysis,
    })

    expect(result.accion).toBe('handoff')
    expect(state.requires_human).toBe(true)
  })
})
