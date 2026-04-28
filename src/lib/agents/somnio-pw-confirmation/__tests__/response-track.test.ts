/**
 * Tests for somnio-pw-confirmation/response-track.ts template selection logic.
 *
 * Plan 12 Wave 6 — coverage de `resolveSalesActionTemplates` (puro switch sobre
 * TipoAccion + selector dinamico zone-based para confirmar_compra). Adicional:
 * test de smoke de INFORMATIONAL_INTENTS (plomeria con resolveResponseTrack).
 *
 * Decisiones lockeadas testeadas:
 *   - D-10:  confirmar_compra + ciudad zona same_day  → confirmacion_orden_same_day
 *   - D-10:  confirmar_compra + ciudad zona transp    → confirmacion_orden_transportadora
 *   - D-12:  pedir_datos_envio + missing fields       → pedir_datos_post_compra + campos_faltantes
 *   - D-12:  actualizar_direccion                     → confirmar_direccion_post_compra
 *            con direccion_completa = "{direccion}, {ciudad}, {departamento}"
 *            (INCLUYE departamento — leccion recompra-template-catalog 2026-04-23)
 *   - D-11:  cancelar_con_agendar_pregunta            → agendar_pregunta
 *   - D-11:  cancelar_definitivo                      → cancelado_handoff
 *   - D-13:  editar_items                             → cancelado_handoff (V1 handoff)
 *   - D-14:  mover_a_falta_confirmar                  → claro_que_si_esperamos
 *   - D-21:  handoff                                  → cancelado_handoff
 *
 * Mock pattern clonado de somnio-recompra/__tests__/response-track.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mock TemplateManager + lookupDeliveryZone BEFORE import (vi.mock hoists).
// Use vi.hoisted() so mock fns are visible to vi.mock factories (which run at
// the very top after hoisting — top-level `const` would not yet be initialized).
// ============================================================================

const {
  getTemplatesForIntentsMock,
  processTemplatesMock,
  lookupDeliveryZoneMock,
  formatDeliveryTimeMock,
} = vi.hoisted(() => ({
  getTemplatesForIntentsMock: vi.fn(),
  processTemplatesMock: vi.fn(),
  lookupDeliveryZoneMock: vi.fn(),
  formatDeliveryTimeMock: vi.fn(),
}))

vi.mock('@/lib/agents/somnio/template-manager', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    getTemplatesForIntents: getTemplatesForIntentsMock,
    processTemplates: processTemplatesMock,
  })),
}))

vi.mock('@/lib/agents/somnio-v3/delivery-zones', () => ({
  lookupDeliveryZone: lookupDeliveryZoneMock,
  formatDeliveryTime: formatDeliveryTimeMock,
}))

// Imports AFTER mocks
import { resolveSalesActionTemplates } from '../response-track'
import { INFORMATIONAL_INTENTS } from '../constants'
import type { AgentState, ActiveOrderPayload } from '../state'

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

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// INFORMATIONAL_INTENTS smoke test
// ============================================================================

describe('INFORMATIONAL_INTENTS', () => {
  it('includes registro_sanitario (D-27 — clonado verbatim de sales-v3)', () => {
    expect(INFORMATIONAL_INTENTS.has('registro_sanitario')).toBe(true)
  })

  it('includes precio (smoke test informational set)', () => {
    expect(INFORMATIONAL_INTENTS.has('precio')).toBe(true)
  })

  it('includes tiempo_entrega (alto-nivel, response-track resuelve zone-specific)', () => {
    expect(INFORMATIONAL_INTENTS.has('tiempo_entrega')).toBe(true)
  })
})

// ============================================================================
// D-10: confirmar_compra + zone-based template selection
// ============================================================================

describe('resolveSalesActionTemplates — D-10 confirmar_compra zone-based', () => {
  it('ciudad="Bucaramanga" zona same_day → confirmacion_orden_same_day + tiempo_estimado HOY/MAÑANA', async () => {
    lookupDeliveryZoneMock.mockResolvedValueOnce({
      zone: 'same_day',
      cutoffHour: 14,
      cutoffMinutes: 0,
      carrier: 'domiciliario propio',
    })
    formatDeliveryTimeMock.mockReturnValueOnce('HOY mismo')

    const state = buildState({
      datos: {
        nombre: 'Jose',
        apellido: 'Romero',
        telefono: '573001234567',
        direccion: 'Cra 10 #20-30',
        ciudad: 'Bucaramanga',
        departamento: 'Santander',
      },
    })

    const result = await resolveSalesActionTemplates('confirmar_compra', state)

    expect(result.intents).toEqual(['confirmacion_orden_same_day'])
    expect(result.extraContext?.tiempo_estimado).toBe('HOY mismo')
    expect(result.extraContext?.items).toContain('ELIXIR DEL SUEÑO')
    expect(result.extraContext?.total).toBe('$77,900')
    expect(lookupDeliveryZoneMock).toHaveBeenCalledWith('Bucaramanga')
  })

  it('ciudad="Medellin" zona 2_4_days → confirmacion_orden_transportadora + tiempo_estimado en 2-4 dias habiles', async () => {
    lookupDeliveryZoneMock.mockResolvedValueOnce({
      zone: '2_4_days',
      cutoffHour: null,
      cutoffMinutes: 0,
      carrier: 'transportadora',
    })
    formatDeliveryTimeMock.mockReturnValueOnce('en 2-4 dias habiles')

    const state = buildState({
      datos: {
        nombre: 'Jose',
        apellido: 'Romero',
        telefono: '573001234567',
        direccion: 'Cl 10 #20-30',
        ciudad: 'Medellin',
        departamento: 'Antioquia',
      },
    })

    const result = await resolveSalesActionTemplates('confirmar_compra', state)

    expect(result.intents).toEqual(['confirmacion_orden_transportadora'])
    expect(result.extraContext?.tiempo_estimado).toBe('en 2-4 dias habiles')
  })

  it('sin ciudad (fallback) → confirmacion_orden_transportadora con tiempo_estimado por defecto', async () => {
    const state = buildState({
      datos: {
        nombre: 'Jose',
        apellido: 'Romero',
        telefono: '573001234567',
        direccion: 'X',
        ciudad: null,
        departamento: null,
      },
    })

    const result = await resolveSalesActionTemplates('confirmar_compra', state)

    expect(result.intents).toEqual(['confirmacion_orden_transportadora'])
    expect(result.extraContext?.tiempo_estimado).toBe('en 2-4 dias habiles')
    expect(lookupDeliveryZoneMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// D-12: pedir_datos_envio + actualizar_direccion
// ============================================================================

describe('resolveSalesActionTemplates — D-12 pedir_datos_envio', () => {
  it('shipping incomplete (apellido + departamento missing) → pedir_datos_post_compra con campos_faltantes', async () => {
    const state = buildState({
      datos: {
        nombre: 'Jose',
        apellido: null, // missing
        telefono: '573001234567',
        direccion: 'Cra 10',
        ciudad: 'Bucaramanga',
        departamento: null, // missing
      },
    })

    const result = await resolveSalesActionTemplates('pedir_datos_envio', state)

    expect(result.intents).toEqual(['pedir_datos_post_compra'])
    expect(result.extraContext?.campos_faltantes).toContain('Apellido')
    expect(result.extraContext?.campos_faltantes).toContain('Departamento')
  })
})

describe('resolveSalesActionTemplates — D-12 actualizar_direccion direccion_completa con departamento', () => {
  it('direccion_completa = "Cra 10 #20-30, Bucaramanga, Santander" (INCLUYE departamento)', async () => {
    const state = buildState({
      datos: {
        nombre: 'Jose',
        apellido: 'Romero',
        telefono: '573001234567',
        direccion: 'Cra 10 #20-30',
        ciudad: 'Bucaramanga',
        departamento: 'Santander',
      },
    })

    const result = await resolveSalesActionTemplates('actualizar_direccion', state)

    expect(result.intents).toEqual(['confirmar_direccion_post_compra'])
    expect(result.extraContext?.direccion_completa).toBe('Cra 10 #20-30, Bucaramanga, Santander')
    // D-12 lock: depto INCLUIDO (vs leccion recompra-template-catalog 2026-04-23)
    expect(result.extraContext?.direccion_completa).toContain('Santander')
  })

  it('drops null departamento via filter(Boolean) — no orphan trailing comma', async () => {
    const state = buildState({
      datos: {
        nombre: 'Jose',
        apellido: 'Romero',
        telefono: '573001234567',
        direccion: 'Cra 10 #20-30',
        ciudad: 'Bucaramanga',
        departamento: null,
      },
    })

    const result = await resolveSalesActionTemplates('actualizar_direccion', state)

    const dc = result.extraContext?.direccion_completa ?? ''
    expect(dc).not.toMatch(/, ,/)
    expect(dc).not.toMatch(/, $/)
    expect(dc).toBe('Cra 10 #20-30, Bucaramanga')
  })
})

// ============================================================================
// D-11 + D-13 + D-14 + D-21: handoff / agendar / claro / cancelado
// ============================================================================

describe('resolveSalesActionTemplates — D-11 cancelar_con_agendar_pregunta → agendar_pregunta', () => {
  it('paso 1 cancelacion → agendar_pregunta (sin extraContext)', async () => {
    const state = buildState()
    const result = await resolveSalesActionTemplates('cancelar_con_agendar_pregunta', state)
    expect(result.intents).toEqual(['agendar_pregunta'])
  })
})

describe('resolveSalesActionTemplates — D-11 cancelar_definitivo / D-13 editar_items / D-21 handoff → cancelado_handoff', () => {
  it('cancelar_definitivo → cancelado_handoff', async () => {
    const state = buildState()
    const result = await resolveSalesActionTemplates('cancelar_definitivo', state)
    expect(result.intents).toEqual(['cancelado_handoff'])
  })

  it('editar_items (V1) → cancelado_handoff (handoff humano)', async () => {
    const state = buildState()
    const result = await resolveSalesActionTemplates('editar_items', state)
    expect(result.intents).toEqual(['cancelado_handoff'])
  })

  it('handoff (D-21) → cancelado_handoff', async () => {
    const state = buildState()
    const result = await resolveSalesActionTemplates('handoff', state)
    expect(result.intents).toEqual(['cancelado_handoff'])
  })
})

describe('resolveSalesActionTemplates — D-14 mover_a_falta_confirmar → claro_que_si_esperamos', () => {
  it('mover_a_falta_confirmar → claro_que_si_esperamos (acuse de "espera lo pienso")', async () => {
    const state = buildState()
    const result = await resolveSalesActionTemplates('mover_a_falta_confirmar', state)
    expect(result.intents).toEqual(['claro_que_si_esperamos'])
  })
})

describe('resolveSalesActionTemplates — noop → array vacio', () => {
  it('noop → intents=[] (engine handles informational fallthrough)', async () => {
    const state = buildState()
    const result = await resolveSalesActionTemplates('noop', state)
    expect(result.intents).toEqual([])
  })
})
