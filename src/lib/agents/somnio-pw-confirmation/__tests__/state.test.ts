/**
 * Tests for somnio-pw-confirmation/state.ts pure helpers.
 *
 * Plan 12 Wave 6 — coverage:
 *   - shippingComplete (RESEARCH §D.3 algorithm verbatim):
 *       6 fields complete                                     → {complete:true, missing:[]}
 *       nombre single-word + apellido=null                    → missing apellido
 *       telefono mal formato (sin 57)                         → missing telefono
 *       telefono valido                                       → no missing
 *       falta direccion / ciudad / departamento               → missing 3 entries
 *   - extractActiveOrder (Open Q3, defensive parsing):
 *       JSON valido con required fields                       → ActiveOrderPayload tipado
 *       JSON malformed o vacio                                → null SIN throw
 *       JSON con shape parcial (sin orderId/stageId/pipelineId) → null
 *   - createInitialState (D-26):
 *       activeOrder + crmContextStatus='ok'                   → phase='awaiting_confirmation'
 *       activeOrder=null                                      → phase='nuevo' (degradacion)
 *       crmContextStatus!='ok'                                → phase='nuevo' (degradacion)
 *   - serialize/deserialize: round-trip fidelity para AgentState completo.
 */

import { describe, it, expect } from 'vitest'
import {
  shippingComplete,
  extractActiveOrder,
  createInitialState,
  serializeState,
  deserializeState,
  type AgentState,
  type ActiveOrderPayload,
  type ContactPayload,
  type DatosCliente,
} from '../state'

// ============================================================================
// Fixtures
// ============================================================================

function buildDatos(overrides: Partial<DatosCliente> = {}): DatosCliente {
  return {
    nombre: 'Jose',
    apellido: 'Romero',
    telefono: '573001234567',
    direccion: 'Cra 10 #20-30',
    ciudad: 'Bucaramanga',
    departamento: 'Santander',
    ...overrides,
  }
}

function buildState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    phase: 'awaiting_confirmation',
    datos: buildDatos(),
    active_order: null,
    intent_history: [],
    acciones: [],
    templatesMostrados: {},
    cancelacion_intent_count: 0,
    requires_human: false,
    crm_context_status: 'ok',
    ...overrides,
  }
}

const VALID_ACTIVE_ORDER: ActiveOrderPayload = {
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
  tags: ['cliente', 'somnio'],
}

// ============================================================================
// shippingComplete — algoritmo VERBATIM RESEARCH §D.3
// ============================================================================

describe('shippingComplete', () => {
  it('all 6 fields present (nombre + apellido split, phone /^57\\d{10}$/, addr/city/dept) → complete=true, missing=[]', () => {
    const state = buildState()
    const result = shippingComplete(state)
    expect(result.complete).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('nombre="Jose" single-word + apellido=null → missing includes apellido', () => {
    const state = buildState({
      datos: buildDatos({ nombre: 'Jose', apellido: null }),
    })
    const result = shippingComplete(state)
    expect(result.complete).toBe(false)
    expect(result.missing).toContain('apellido')
  })

  it('nombre="Jose Romero" multi-word + apellido=null → apellido NOT missing (split implicito RESEARCH §D.3)', () => {
    const state = buildState({
      datos: buildDatos({ nombre: 'Jose Romero', apellido: null }),
    })
    const result = shippingComplete(state)
    expect(result.complete).toBe(true)
    expect(result.missing).not.toContain('apellido')
  })

  it('telefono="3001234567" sin prefijo 57 → missing telefono (regex /^57\\d{10}$/)', () => {
    const state = buildState({
      datos: buildDatos({ telefono: '3001234567' }),
    })
    const result = shippingComplete(state)
    expect(result.complete).toBe(false)
    expect(result.missing).toContain('telefono')
  })

  it('telefono="573001234567" valido (57 + 10 digitos) → telefono NOT missing', () => {
    const state = buildState({
      datos: buildDatos({ telefono: '573001234567' }),
    })
    const result = shippingComplete(state)
    expect(result.missing).not.toContain('telefono')
  })

  it('faltan direccion/ciudad/departamento → missing incluye los 3 (shippingAddress, shippingCity, shippingDepartment)', () => {
    const state = buildState({
      datos: buildDatos({ direccion: null, ciudad: null, departamento: null }),
    })
    const result = shippingComplete(state)
    expect(result.complete).toBe(false)
    expect(result.missing).toEqual(
      expect.arrayContaining(['shippingAddress', 'shippingCity', 'shippingDepartment'])
    )
  })

  it('all fields null → missing incluye los 6 fields (defensive empty case)', () => {
    const state = buildState({
      datos: {
        nombre: null,
        apellido: null,
        telefono: null,
        direccion: null,
        ciudad: null,
        departamento: null,
      },
    })
    const result = shippingComplete(state)
    expect(result.complete).toBe(false)
    expect(result.missing.length).toBe(6)
  })
})

// ============================================================================
// extractActiveOrder — defensive parsing (Open Q3)
// ============================================================================

describe('extractActiveOrder', () => {
  it('JSON valido con required fields → retorna ActiveOrderPayload tipado', () => {
    const json = JSON.stringify(VALID_ACTIVE_ORDER)
    const result = extractActiveOrder(null, json)
    expect(result).not.toBeNull()
    expect(result!.orderId).toBe('order-test-1')
    expect(result!.stageName).toBe('NUEVO PAG WEB')
    expect(result!.totalValue).toBe(77900)
    expect(result!.items).toHaveLength(1)
    expect(result!.items[0].titulo).toBe('ELIXIR DEL SUEÑO')
    expect(result!.tags).toEqual(['cliente', 'somnio'])
  })

  it('JSON malformed → retorna null SIN throw (degradacion graceful)', () => {
    expect(() => extractActiveOrder(null, '{not valid json')).not.toThrow()
    expect(extractActiveOrder(null, '{not valid json')).toBeNull()
  })

  it('JSON empty object {} → retorna null (shape no incluye required orderId/stageId/pipelineId)', () => {
    expect(extractActiveOrder(null, '{}')).toBeNull()
  })

  it('JSON null/undefined/empty string → retorna null sin throw', () => {
    expect(extractActiveOrder(null, null)).toBeNull()
    expect(extractActiveOrder(null, undefined)).toBeNull()
    expect(extractActiveOrder(null, '')).toBeNull()
    expect(extractActiveOrder(null, '   ')).toBeNull()
  })

  it('JSON con orderId pero sin stageId → retorna null (defensive shape check)', () => {
    const partial = JSON.stringify({ orderId: 'x', pipelineId: 'p' })
    expect(extractActiveOrder(null, partial)).toBeNull()
  })
})

// ============================================================================
// createInitialState — D-26
// ============================================================================

describe('createInitialState', () => {
  it('activeOrder + crmContextStatus="ok" → phase="awaiting_confirmation" (D-26)', () => {
    const state = createInitialState({
      activeOrder: VALID_ACTIVE_ORDER,
      contact: null,
      crmContextStatus: 'ok',
    })
    expect(state.phase).toBe('awaiting_confirmation')
    expect(state.active_order).not.toBeNull()
    expect(state.active_order!.orderId).toBe('order-test-1')
  })

  it('activeOrder=null → phase="nuevo" (degradacion graceful, sin pedido)', () => {
    const state = createInitialState({
      activeOrder: null,
      contact: null,
      crmContextStatus: 'ok',
    })
    expect(state.phase).toBe('nuevo')
    expect(state.active_order).toBeNull()
  })

  it('activeOrder presente pero crmContextStatus="error" → phase="nuevo" (reader fallo)', () => {
    const state = createInitialState({
      activeOrder: VALID_ACTIVE_ORDER,
      contact: null,
      crmContextStatus: 'error',
    })
    expect(state.phase).toBe('nuevo')
  })

  it('contact con name="Jose Romero" → datos.nombre="Jose", datos.apellido="Romero" (split por espacio)', () => {
    const contact: ContactPayload = {
      name: 'Jose Romero',
      phone: '573001234567',
      email: null,
      address: null,
      city: null,
      department: null,
    }
    const state = createInitialState({
      activeOrder: null,
      contact,
      crmContextStatus: 'empty',
    })
    expect(state.datos.nombre).toBe('Jose')
    expect(state.datos.apellido).toBe('Romero')
  })

  it('shipping preferred from activeOrder.shipping_*; contact fallback ignorado si order trae', () => {
    const contact: ContactPayload = {
      name: null,
      phone: null,
      email: null,
      address: 'Otra direccion',
      city: 'OtraCiudad',
      department: 'OtroDepto',
    }
    const state = createInitialState({
      activeOrder: VALID_ACTIVE_ORDER,
      contact,
      crmContextStatus: 'ok',
    })
    expect(state.datos.direccion).toBe(VALID_ACTIVE_ORDER.shippingAddress)
    expect(state.datos.ciudad).toBe(VALID_ACTIVE_ORDER.shippingCity)
    expect(state.datos.departamento).toBe(VALID_ACTIVE_ORDER.shippingDepartment)
  })

  it('counters/flags inicializados (cancelacion_intent_count=0, requires_human=false)', () => {
    const state = createInitialState({
      activeOrder: VALID_ACTIVE_ORDER,
      contact: null,
      crmContextStatus: 'ok',
    })
    expect(state.cancelacion_intent_count).toBe(0)
    expect(state.requires_human).toBe(false)
    expect(state.intent_history).toEqual([])
    expect(state.acciones).toEqual([])
  })
})

// ============================================================================
// serialize/deserialize round-trip
// ============================================================================

describe('serializeState/deserializeState', () => {
  it('round-trip fidelity for full state (datos + active_order + counters + flags)', () => {
    const original = buildState({
      phase: 'awaiting_schedule_decision',
      active_order: VALID_ACTIVE_ORDER,
      intent_history: ['saludo', 'confirmar_pedido', 'cancelar_pedido'],
      acciones: ['confirmar_compra', 'cancelar_con_agendar_pregunta'],
      templatesMostrados: { saludo: 1, precio: 2 },
      cancelacion_intent_count: 1,
      requires_human: true,
      crm_context_status: 'ok',
    })

    const serialized = serializeState(original)
    const restored = deserializeState(serialized)

    expect(restored.phase).toBe(original.phase)
    expect(restored.datos).toEqual(original.datos)
    expect(restored.active_order).toEqual(original.active_order)
    expect(restored.intent_history).toEqual(original.intent_history)
    expect(restored.acciones).toEqual(original.acciones)
    expect(restored.templatesMostrados).toEqual(original.templatesMostrados)
    expect(restored.cancelacion_intent_count).toBe(original.cancelacion_intent_count)
    expect(restored.requires_human).toBe(original.requires_human)
    expect(restored.crm_context_status).toBe(original.crm_context_status)
  })

  it('deserialize de Record vacio → defaults seguros (phase="nuevo", datos vacios)', () => {
    const restored = deserializeState({})
    expect(restored.phase).toBe('nuevo')
    expect(restored.datos.nombre).toBeNull()
    expect(restored.cancelacion_intent_count).toBe(0)
    expect(restored.requires_human).toBe(false)
    expect(restored.crm_context_status).toBe('missing')
  })
})
