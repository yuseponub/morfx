import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  listOrdersMock,
  getOrderByIdMock,
  resolveContactByPhoneMock,
  findActiveOrderForContactMock,
  recordEventMock,
} = vi.hoisted(() => ({
  listOrdersMock: vi.fn(),
  getOrderByIdMock: vi.fn(),
  resolveContactByPhoneMock: vi.fn(),
  findActiveOrderForContactMock: vi.fn(),
  recordEventMock: vi.fn(),
}))

vi.mock('@/lib/domain/orders', () => ({
  listOrders: listOrdersMock,
  getOrderById: getOrderByIdMock,
}))
vi.mock('@/lib/domain/contacts', () => ({
  searchContacts: vi.fn(),
  getContactById: vi.fn(),
}))
vi.mock('../helpers', () => ({
  resolveContactByPhone: resolveContactByPhoneMock,
  findActiveOrderForContact: findActiveOrderForContactMock,
}))
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: recordEventMock }),
}))

import { createCrmQueryTools } from '../index'

const CTX = { workspaceId: 'ws-1', invoker: 'test' } as const
const exec = (toolName: keyof ReturnType<typeof createCrmQueryTools>, input: unknown) => {
  const tools = createCrmQueryTools(CTX)
  return (tools[toolName] as unknown as { execute: (i: unknown) => Promise<unknown> }).execute(input)
}

function buildContact(id = 'c1') {
  return {
    id, name: 'X', phone: '+573001234567', email: null,
    address: null, city: null, department: null,
    createdAt: '2026-01-01T00:00:00Z', archivedAt: null,
    tags: [], customFields: {},
  }
}
function buildOrderListItem(id: string, stageId = 's1', createdAt = '2026-04-01T00:00:00Z') {
  return { id, contactId: 'c1', pipelineId: 'p1', stageId, totalValue: 100, createdAt, archivedAt: null }
}
function buildOrderDetail(id: string) {
  return {
    id, contactId: 'c1', pipelineId: 'p1', stageId: 's1',
    totalValue: 100, description: null,
    shippingAddress: null, shippingCity: null, shippingDepartment: null,
    createdAt: '2026-04-01T00:00:00Z', archivedAt: null,
    items: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── getLastOrderByPhone ───────────────────────────────────────
describe('getLastOrderByPhone', () => {
  it('returns invalid_phone for garbage input', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'invalid_phone' })
    const r = await exec('getLastOrderByPhone', { phone: 'abc' })
    expect(r).toEqual({ status: 'error', error: { code: 'invalid_phone' } })
  })
  it('returns not_found when contact missing', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'not_found' })
    const r = await exec('getLastOrderByPhone', { phone: '+573001234567' })
    expect(r).toEqual({ status: 'not_found' })
  })
  it('returns no_orders + contact when contact has zero orders', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
    const r = await exec('getLastOrderByPhone', { phone: '+573001234567' })
    expect(r).toMatchObject({ status: 'no_orders', contact: { id: 'c1' } })
  })
  it('returns found + full detail when order exists', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    listOrdersMock.mockResolvedValueOnce({ success: true, data: [buildOrderListItem('o1')] })
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: buildOrderDetail('o1') })
    const r = await exec('getLastOrderByPhone', { phone: '+573001234567' })
    expect(r).toMatchObject({ status: 'found', data: { id: 'o1' } })
  })
  it('returns db_error when resolve fails with kind error', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'error', message: 'fail' })
    const r = await exec('getLastOrderByPhone', { phone: '+573001234567' })
    expect(r).toMatchObject({ status: 'error', error: { code: 'db_error' } })
  })
})

// ─── getOrdersByPhone ──────────────────────────────────────────
describe('getOrdersByPhone', () => {
  it('returns ok with count + items', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    listOrdersMock.mockResolvedValueOnce({
      success: true,
      data: [buildOrderListItem('a'), buildOrderListItem('b')],
    })
    const r = await exec('getOrdersByPhone', { phone: '+573001234567', limit: 10, offset: 0 })
    expect(r).toMatchObject({ status: 'ok', count: 2 })
  })
  it('returns no_orders when empty', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
    const r = await exec('getOrdersByPhone', { phone: '+573001234567' })
    expect(r).toMatchObject({ status: 'no_orders' })
  })
  it('threads limit + offset to listOrders', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
    await exec('getOrdersByPhone', { phone: '+573001234567', limit: 5, offset: 10 })
    expect(listOrdersMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contactId: 'c1', limit: 5, offset: 10 }),
    )
  })
  it('returns not_found when contact missing', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'not_found' })
    const r = await exec('getOrdersByPhone', { phone: '+573001234567' })
    expect(r).toEqual({ status: 'not_found' })
  })
})

// ─── getActiveOrderByPhone ─────────────────────────────────────
describe('getActiveOrderByPhone', () => {
  it('D-27: returns config_not_set when configWasEmpty', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    findActiveOrderForContactMock.mockResolvedValueOnce({
      active: null, otherActiveCount: 0, lastTerminal: null, configWasEmpty: true,
    })
    const r = await exec('getActiveOrderByPhone', { phone: '+573001234567' })
    expect(r).toMatchObject({ status: 'config_not_set', contact: { id: 'c1' } })
    const completed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_completed')
    expect(completed?.[2]).toMatchObject({ status: 'config_not_set' })
  })

  it('D-17: returns no_active_order + last_terminal_order detail', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    findActiveOrderForContactMock.mockResolvedValueOnce({
      active: null, otherActiveCount: 0, lastTerminal: buildOrderListItem('term-1'), configWasEmpty: false,
    })
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: buildOrderDetail('term-1') })
    const r = await exec('getActiveOrderByPhone', { phone: '+573001234567' })
    expect(r).toMatchObject({
      status: 'no_active_order',
      contact: { id: 'c1' },
      last_terminal_order: { id: 'term-1' },
    })
  })

  it('D-17: returns no_active_order with no last_terminal_order', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    findActiveOrderForContactMock.mockResolvedValueOnce({
      active: null, otherActiveCount: 0, lastTerminal: null, configWasEmpty: false,
    })
    const r = await exec('getActiveOrderByPhone', { phone: '+573001234567' }) as { status: string; last_terminal_order?: unknown }
    expect(r.status).toBe('no_active_order')
    expect(r.last_terminal_order).toBeUndefined()
  })

  it('D-15: returns found + other_active_orders_count', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    findActiveOrderForContactMock.mockResolvedValueOnce({
      active: buildOrderListItem('act-newest'), otherActiveCount: 2, lastTerminal: null, configWasEmpty: false,
    })
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: buildOrderDetail('act-newest') })
    const r = await exec('getActiveOrderByPhone', { phone: '+573001234567' })
    expect(r).toMatchObject({
      status: 'found',
      data: { id: 'act-newest', other_active_orders_count: 2 },
    })
  })

  it('D-16: threads pipelineId param to helper', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'found', contact: buildContact(), duplicates: [] })
    findActiveOrderForContactMock.mockResolvedValueOnce({
      active: null, otherActiveCount: 0, lastTerminal: null, configWasEmpty: false,
    })
    await exec('getActiveOrderByPhone', { phone: '+573001234567', pipelineId: '00000000-0000-0000-0000-000000000123' })
    expect(findActiveOrderForContactMock).toHaveBeenCalledWith(
      expect.anything(),
      'c1',
      '00000000-0000-0000-0000-000000000123',
    )
  })

  it('returns invalid_phone via resolve', async () => {
    resolveContactByPhoneMock.mockResolvedValueOnce({ kind: 'invalid_phone' })
    const r = await exec('getActiveOrderByPhone', { phone: 'xx' })
    expect(r).toEqual({ status: 'error', error: { code: 'invalid_phone' } })
  })
})

// ─── getOrderById ──────────────────────────────────────────────
describe('getOrderById', () => {
  it('returns found when domain returns data', async () => {
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: buildOrderDetail('o9') })
    const r = await exec('getOrderById', { orderId: '00000000-0000-0000-0000-000000000009' })
    expect(r).toMatchObject({ status: 'found', data: { id: 'o9' } })
  })
  it('returns not_found when data is null', async () => {
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: null })
    const r = await exec('getOrderById', { orderId: '00000000-0000-0000-0000-000000000009' })
    expect(r).toEqual({ status: 'not_found' })
  })
  it('returns db_error when domain fails', async () => {
    getOrderByIdMock.mockResolvedValueOnce({ success: false, error: 'gone' })
    const r = await exec('getOrderById', { orderId: '00000000-0000-0000-0000-000000000009' })
    expect(r).toMatchObject({ status: 'error', error: { code: 'db_error' } })
  })
})
