/**
 * Tests crm-grounding.ts (standalone #2, Plan 02 — Capa 1 Grounding).
 *
 * Cubre los 5 comportamientos del bloque <behavior>:
 *  1. Vista A found -> activeOrder poblado + stageName via STAGE_NAME_BY_UUID.
 *  2. config_not_set fallback -> getLastOrderByPhone + PRE_CONFIRMATION set;
 *     terminal -> activeOrder=null; status ORIGINAL conservado.
 *  3. Vista B passthrough del ledger.
 *  4. snapshot roundtrip (_v4:crm_snapshot) + null graceful sin key.
 *  5. writeCrmSnapshot NUNCA escribe keys _v3:* (D-21).
 *
 * Mock pattern: vi.hoisted() para evitar TDZ con vi.mock factory hoisting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mocks } = vi.hoisted(() => {
  const getActiveOrderByPhoneMock = vi.fn()
  const getLastOrderByPhoneMock = vi.fn()
  const getOrdersByPhoneMock = vi.fn()
  const getContactByPhoneMock = vi.fn()
  const getOrderByIdMock = vi.fn()
  const createCrmQueryToolsMock = vi.fn(() => ({
    getActiveOrderByPhone: { execute: getActiveOrderByPhoneMock },
    getLastOrderByPhone: { execute: getLastOrderByPhoneMock },
    getOrdersByPhone: { execute: getOrdersByPhoneMock },
    getContactByPhone: { execute: getContactByPhoneMock },
    getOrderById: { execute: getOrderByIdMock },
  }))
  return {
    mocks: {
      getActiveOrderByPhoneMock,
      getLastOrderByPhoneMock,
      getOrdersByPhoneMock,
      getContactByPhoneMock,
      getOrderByIdMock,
      createCrmQueryToolsMock,
    },
  }
})

vi.mock('@/lib/agents/shared/crm-query-tools', () => ({
  createCrmQueryTools: mocks.createCrmQueryToolsMock,
}))

// Import AFTER mocks.
import {
  buildCrmGrounding,
  writeCrmSnapshot,
  readCrmSnapshot,
  CRM_SNAPSHOT_KEY,
  type CrmGrounding,
} from '../crm-grounding'
import type { CrmActionRegistrada } from '../types'

const PHONE = '3001234567'
const WORKSPACE = 'a3843b3f-c337-4836-92b5-89c58bb98490'

// UUIDs verificados (RESEARCH §Pattern 2).
const NUEVO_PEDIDO = '6be952b0-0a95-4957-b5f7-62e8fd8eb815'
const CONFIRMADO = '4770a36e-5feb-4eec-a71c-75d54cb2797c'

function orderDetail(stageId: string) {
  return {
    id: 'order-1',
    contactId: 'contact-1',
    pipelineId: 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8',
    stageId,
    totalValue: 119900,
    description: null,
    shippingAddress: 'Calle 1',
    shippingCity: 'Bogota',
    shippingDepartment: 'Cundinamarca',
    createdAt: '2026-05-29T10:00:00Z',
    archivedAt: null,
    closedAt: null,
    items: [
      { id: 'i1', sku: 'ELIXIR-1', title: 'Elixir del Sueno', unitPrice: 119900, quantity: 1, subtotal: 119900 },
    ],
  }
}

function contactDetail() {
  return {
    id: 'contact-1',
    name: 'Doralba',
    phone: PHONE,
    email: 'doralba@example.com',
    address: null,
    city: null,
    department: null,
    createdAt: '2026-05-01T00:00:00Z',
    archivedAt: null,
    tags: [],
    customFields: {},
  }
}

describe('crm-grounding — buildCrmGrounding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getContactByPhoneMock.mockResolvedValue({ status: 'found', data: contactDetail() })
  })

  it('Test 1: Vista A found -> activeOrder poblado + stageName resuelto', async () => {
    mocks.getActiveOrderByPhoneMock.mockResolvedValue({
      status: 'found',
      data: { ...orderDetail(NUEVO_PEDIDO), other_active_orders_count: 0 },
    })

    const g = await buildCrmGrounding({
      workspaceId: WORKSPACE,
      phone: PHONE,
      userMessage: 'hola',
      ledgerCrmActions: [],
    })

    expect(g.activeOrderQueryStatus).toBe('found')
    expect(g.activeOrder).not.toBeNull()
    expect(g.activeOrder!.id).toBe('order-1')
    expect(g.activeOrder!.stageId).toBe(NUEVO_PEDIDO)
    expect(g.activeOrder!.stageName).toBe('NUEVO PEDIDO')
    expect(g.activeOrder!.items).toHaveLength(1)
    expect(g.activeOrder!.items[0]).toEqual({
      sku: 'ELIXIR-1',
      title: 'Elixir del Sueno',
      quantity: 1,
      unitPrice: 119900,
    })
    expect(g.contact).toEqual({ id: 'contact-1', phone: PHONE, email: 'doralba@example.com' })
    // getLastOrderByPhone NO debe llamarse en el happy path.
    expect(mocks.getLastOrderByPhoneMock).not.toHaveBeenCalled()
  })

  it('Test 2a: config_not_set fallback -> ultimo pedido en stage pre-confirmacion expuesto, status ORIGINAL', async () => {
    mocks.getActiveOrderByPhoneMock.mockResolvedValue({
      status: 'config_not_set',
      contact: contactDetail(),
    })
    mocks.getLastOrderByPhoneMock.mockResolvedValue({
      status: 'found',
      data: orderDetail(NUEVO_PEDIDO),
    })

    const g = await buildCrmGrounding({
      workspaceId: WORKSPACE,
      phone: PHONE,
      userMessage: 'quiero comprar',
      ledgerCrmActions: [],
    })

    // status ORIGINAL conservado como senal de observabilidad.
    expect(g.activeOrderQueryStatus).toBe('config_not_set')
    // Pero el pedido se expone porque su stage esta en PRE_CONFIRMATION.
    expect(g.activeOrder).not.toBeNull()
    expect(g.activeOrder!.stageName).toBe('NUEVO PEDIDO')
    expect(mocks.getLastOrderByPhoneMock).toHaveBeenCalledTimes(1)
  })

  it('Test 2b: config_not_set + ultimo pedido en stage terminal -> activeOrder=null', async () => {
    mocks.getActiveOrderByPhoneMock.mockResolvedValue({
      status: 'config_not_set',
      contact: contactDetail(),
    })
    mocks.getLastOrderByPhoneMock.mockResolvedValue({
      status: 'found',
      data: orderDetail(CONFIRMADO), // terminal, NO en PRE_CONFIRMATION
    })

    const g = await buildCrmGrounding({
      workspaceId: WORKSPACE,
      phone: PHONE,
      userMessage: 'gracias',
      ledgerCrmActions: [],
    })

    expect(g.activeOrderQueryStatus).toBe('config_not_set')
    expect(g.activeOrder).toBeNull()
  })

  it('Test 3: Vista B -> ledgerCrmActions passthrough', async () => {
    mocks.getActiveOrderByPhoneMock.mockResolvedValue({ status: 'not_found' })
    const ledger: CrmActionRegistrada[] = [
      { tool: 'moveOrderToStage', args: { orderId: 'order-1' }, result: 'success', origen: 'rag' },
    ]

    const g = await buildCrmGrounding({
      workspaceId: WORKSPACE,
      phone: PHONE,
      userMessage: 'hola',
      ledgerCrmActions: ledger,
    })

    expect(g.ledgerCrmActions).toBe(ledger)
    expect(g.ledgerCrmActions[0].tool).toBe('moveOrderToStage')
    expect(g.rawMessage).toBe('hola')
  })

  it('Test 3b: phone null -> grounding minimo not_found', async () => {
    const g = await buildCrmGrounding({
      workspaceId: WORKSPACE,
      phone: null,
      userMessage: 'sin telefono',
      ledgerCrmActions: [],
    })
    expect(g.activeOrder).toBeNull()
    expect(g.contact).toBeNull()
    expect(g.activeOrderQueryStatus).toBe('not_found')
    expect(g.rawMessage).toBe('sin telefono')
    expect(mocks.getActiveOrderByPhoneMock).not.toHaveBeenCalled()
  })
})

describe('crm-grounding — snapshot helpers (_v4, D-21)', () => {
  function grounding(): CrmGrounding {
    return {
      activeOrder: {
        id: 'order-1',
        stageId: NUEVO_PEDIDO,
        stageName: 'NUEVO PEDIDO',
        createdAt: '2026-05-29T10:00:00Z',
        totalValue: 119900,
        shippingAddress: 'Calle 1',
        shippingCity: 'Bogota',
        shippingDepartment: 'Cundinamarca',
        items: [{ sku: 'ELIXIR-1', title: 'Elixir', quantity: 1, unitPrice: 119900 }],
      },
      contact: { id: 'contact-1', phone: PHONE, email: 'd@e.com' },
      activeOrderQueryStatus: 'config_not_set',
      ledgerCrmActions: [],
      rawMessage: 'x',
    }
  }

  it('Test 4: snapshot roundtrip + key _v4:crm_snapshot + null graceful', () => {
    const datos: Record<string, string> = {}
    writeCrmSnapshot(datos, grounding())

    expect(CRM_SNAPSHOT_KEY).toBe('_v4:crm_snapshot')
    expect(datos[CRM_SNAPSHOT_KEY]).toBeDefined()

    const recovered = readCrmSnapshot(datos)
    expect(recovered).not.toBeNull()
    expect(recovered!.activeOrder!.id).toBe('order-1')
    expect(recovered!.activeOrderQueryStatus).toBe('config_not_set')

    // Sesion sin la key -> null graceful.
    expect(readCrmSnapshot({})).toBeNull()
    // JSON invalido -> null graceful (no lanza).
    expect(readCrmSnapshot({ [CRM_SNAPSHOT_KEY]: '{invalido' })).toBeNull()
  })

  it('Test 5: writeCrmSnapshot NUNCA escribe keys _v3:*', () => {
    const datos: Record<string, string> = {}
    writeCrmSnapshot(datos, grounding())
    const legacyKeys = Object.keys(datos).filter((k) => k.startsWith('_v3:'))
    expect(legacyKeys).toEqual([])
  })
})
