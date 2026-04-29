/**
 * Unit tests for getContactByPhone (Plan 03 / Wave 2).
 *
 * Mocks: @/lib/domain/contacts (searchContacts, getContactById), @/lib/observability (getCollector).
 * Coverage: D-05, D-07, D-08, D-09, D-10, D-18, D-19, D-20, D-23.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { searchContactsMock, getContactByIdMock, recordEventMock } = vi.hoisted(() => ({
  searchContactsMock: vi.fn(),
  getContactByIdMock: vi.fn(),
  recordEventMock: vi.fn(),
}))

vi.mock('@/lib/domain/contacts', () => ({
  searchContacts: searchContactsMock,
  getContactById: getContactByIdMock,
}))

vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: recordEventMock }),
}))

// Import AFTER mocks
import { createCrmQueryTools } from '../index'

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111'
const CTX = { workspaceId: WORKSPACE_ID, invoker: 'test-suite' } as const

function buildContactRow(
  overrides: Partial<{ id: string; phone: string; createdAt: string }> = {},
) {
  return {
    id: overrides.id ?? 'c1',
    name: 'Test Contact',
    phone: overrides.phone ?? '+573001234567',
    email: 'test@example.com',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  }
}

function buildContactDetail(id: string) {
  return {
    id,
    name: 'Test Contact',
    phone: '+573001234567',
    email: 'test@example.com',
    address: null,
    city: null,
    department: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    tags: [],
    customFields: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getContactByPhone — D-09 phone normalization', () => {
  it('returns invalid_phone error for non-numeric input', async () => {
    const tools = createCrmQueryTools(CTX)
    const result = await (
      tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ phone: 'abc' })
    expect(result).toEqual({ status: 'error', error: { code: 'invalid_phone' } })
    expect(searchContactsMock).not.toHaveBeenCalled()

    // Observability: invoked + failed events emitted
    const labels = recordEventMock.mock.calls.map((c) => c[1])
    expect(labels).toEqual(['crm_query_invoked', 'crm_query_failed'])
    const failedPayload = recordEventMock.mock.calls[1][2]
    expect(failedPayload).toMatchObject({
      errorCode: 'invalid_phone',
      tool: 'getContactByPhone',
    })
  })
})

describe('getContactByPhone — D-10 not_found', () => {
  it('returns not_found when domain search yields zero matches', async () => {
    searchContactsMock.mockResolvedValueOnce({ success: true, data: [] })
    const tools = createCrmQueryTools(CTX)
    const result = await (
      tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ phone: '+573001234567' })
    expect(result).toEqual({ status: 'not_found' })

    const completed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_completed')
    expect(completed?.[2]).toMatchObject({
      status: 'not_found',
      tool: 'getContactByPhone',
    })
  })
})

describe('getContactByPhone — D-08 duplicates', () => {
  it('returns newest by createdAt + duplicates_count + duplicates list', async () => {
    searchContactsMock.mockResolvedValueOnce({
      success: true,
      data: [
        buildContactRow({
          id: 'older',
          createdAt: '2026-01-01T00:00:00.000Z',
          phone: '+573001234567',
        }),
        buildContactRow({
          id: 'newer',
          createdAt: '2026-04-01T00:00:00.000Z',
          phone: '+573001234567',
        }),
      ],
    })
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail('newer'),
    })

    const tools = createCrmQueryTools(CTX)
    const result = await (
      tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ phone: '+573001234567' })

    expect(result).toMatchObject({
      status: 'found',
      data: { id: 'newer', duplicates_count: 1, duplicates: ['older'] },
    })

    // getContactById called with the NEWEST id
    expect(getContactByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID }),
      { contactId: 'newer' },
    )

    const completed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_completed')
    expect(completed?.[2]).toMatchObject({ status: 'found', duplicatesCount: 1 })
  })
})

describe('getContactByPhone — happy path single contact', () => {
  it('returns found with duplicates_count: 0', async () => {
    searchContactsMock.mockResolvedValueOnce({
      success: true,
      data: [buildContactRow({ id: 'c1', phone: '+573001234567' })],
    })
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail('c1'),
    })

    const tools = createCrmQueryTools(CTX)
    const result = await (
      tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ phone: '3001234567' })

    expect(result).toMatchObject({
      status: 'found',
      data: { id: 'c1', duplicates_count: 0, duplicates: [] },
    })
  })
})

describe('getContactByPhone — error paths', () => {
  it('returns db_error when searchContacts fails', async () => {
    searchContactsMock.mockResolvedValueOnce({ success: false, error: 'connection lost' })
    const tools = createCrmQueryTools(CTX)
    const result = await (
      tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ phone: '+573001234567' })
    expect(result).toEqual({
      status: 'error',
      error: { code: 'db_error', message: 'connection lost' },
    })
    const failed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_failed')
    expect(failed?.[2]).toMatchObject({ errorCode: 'db_error' })
  })

  it('returns db_error when getContactById fails after match', async () => {
    searchContactsMock.mockResolvedValueOnce({
      success: true,
      data: [buildContactRow({ id: 'c1', phone: '+573001234567' })],
    })
    getContactByIdMock.mockResolvedValueOnce({ success: false, error: 'detail unavailable' })

    const tools = createCrmQueryTools(CTX)
    const result = await (
      tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ phone: '+573001234567' })
    expect(result).toMatchObject({ status: 'error', error: { code: 'db_error' } })
    const failed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_failed')
    expect(failed?.[2]).toMatchObject({ errorCode: 'detail_fetch_failed' })
  })
})

describe('getContactByPhone — D-23 observability redaction', () => {
  it('emits phoneSuffix as last-4-digits of raw input only', async () => {
    searchContactsMock.mockResolvedValueOnce({ success: true, data: [] })
    const tools = createCrmQueryTools(CTX)
    await (
      tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ phone: '+57 300 123 4567' })
    const invoked = recordEventMock.mock.calls.find((c) => c[1] === 'crm_query_invoked')
    expect(invoked?.[2]).toMatchObject({ phoneSuffix: '4567' })
    expect(JSON.stringify(invoked?.[2])).not.toContain('+57')
    expect(JSON.stringify(invoked?.[2])).not.toContain('3001234567')
  })
})

describe('getContactByPhone — D-05 workspace isolation', () => {
  it('passes ctx.workspaceId to domain searchContacts (not from input)', async () => {
    searchContactsMock.mockResolvedValueOnce({ success: true, data: [] })
    const tools = createCrmQueryTools({ workspaceId: 'other-ws-id', invoker: 'test' })
    await (
      tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ phone: '+573001234567' })
    expect(searchContactsMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'other-ws-id' }),
      expect.anything(),
    )
  })
})
