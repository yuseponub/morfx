import { describe, it, expect, vi, beforeEach } from 'vitest'

const { listOrdersMock, getCrmQueryToolsConfigMock, searchContactsMock, getContactByIdMock } = vi.hoisted(() => ({
  listOrdersMock: vi.fn(),
  getCrmQueryToolsConfigMock: vi.fn(),
  searchContactsMock: vi.fn(),
  getContactByIdMock: vi.fn(),
}))

vi.mock('@/lib/domain/orders', () => ({ listOrders: listOrdersMock, getOrderById: vi.fn() }))
vi.mock('@/lib/domain/contacts', () => ({ searchContacts: searchContactsMock, getContactById: getContactByIdMock }))
vi.mock('@/lib/domain/crm-query-tools-config', () => ({ getCrmQueryToolsConfig: getCrmQueryToolsConfigMock }))

import { findActiveOrderForContact, resolveContactByPhone } from '../helpers'

const DOMAIN_CTX = { workspaceId: 'ws-1', source: 'tool-handler' as const }

function order(id: string, stageId: string, createdAt: string) {
  return {
    id,
    contactId: 'c1',
    pipelineId: 'p1',
    stageId,
    totalValue: 100,
    createdAt,
    archivedAt: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findActiveOrderForContact — D-27 empty config', () => {
  it('returns configWasEmpty=true when activeStageIds empty AND no override', async () => {
    getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: [] })
    listOrdersMock.mockResolvedValueOnce({
      success: true,
      data: [order('o1', 'sX', '2026-04-01T00:00:00Z'), order('o2', 'sY', '2026-03-01T00:00:00Z')],
    })

    const r = await findActiveOrderForContact(DOMAIN_CTX, 'c1')
    expect(r.configWasEmpty).toBe(true)
    expect(r.active).toBeNull()
    expect(r.lastTerminal?.id).toBe('o1')
  })

  it('does NOT short-circuit when override provided even if config empty', async () => {
    getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: [] })
    listOrdersMock.mockResolvedValueOnce({
      success: true,
      data: [order('o1', 'sX', '2026-04-01T00:00:00Z')],
    })

    const r = await findActiveOrderForContact(DOMAIN_CTX, 'c1', 'pipeline-override')
    expect(r.configWasEmpty).toBe(false)
    expect(listOrdersMock).toHaveBeenCalledWith(DOMAIN_CTX, expect.objectContaining({ pipelineId: 'pipeline-override' }))
  })
})

describe('findActiveOrderForContact — D-15 multi-active resolution', () => {
  it('returns newest active + otherActiveCount', async () => {
    getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: ['sActive'] })
    listOrdersMock.mockResolvedValueOnce({
      success: true,
      data: [
        order('mid', 'sActive', '2026-03-15T00:00:00Z'),
        order('newest', 'sActive', '2026-04-01T00:00:00Z'),
        order('oldest', 'sActive', '2026-02-01T00:00:00Z'),
        order('terminal1', 'sTerm', '2026-04-10T00:00:00Z'),
      ],
    })

    const r = await findActiveOrderForContact(DOMAIN_CTX, 'c1')
    expect(r.active?.id).toBe('newest')
    expect(r.otherActiveCount).toBe(2)
    expect(r.lastTerminal?.id).toBe('terminal1')
    expect(r.configWasEmpty).toBe(false)
  })
})

describe('findActiveOrderForContact — D-17 last_terminal when no active', () => {
  it('returns active=null + lastTerminal=newest non-active', async () => {
    getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: ['sActive'] })
    listOrdersMock.mockResolvedValueOnce({
      success: true,
      data: [
        order('t-newest', 'sTerm', '2026-04-15T00:00:00Z'),
        order('t-old', 'sTerm', '2026-01-01T00:00:00Z'),
      ],
    })

    const r = await findActiveOrderForContact(DOMAIN_CTX, 'c1')
    expect(r.active).toBeNull()
    expect(r.otherActiveCount).toBe(0)
    expect(r.lastTerminal?.id).toBe('t-newest')
  })
})

describe('findActiveOrderForContact — D-16 pipelineId override priority', () => {
  it('caller override beats config pipeline', async () => {
    getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: 'config-pipe', activeStageIds: ['sA'] })
    listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
    await findActiveOrderForContact(DOMAIN_CTX, 'c1', 'override-pipe')
    expect(listOrdersMock).toHaveBeenCalledWith(DOMAIN_CTX, expect.objectContaining({ pipelineId: 'override-pipe' }))
  })

  it('falls back to config pipeline when no override', async () => {
    getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: 'config-pipe', activeStageIds: ['sA'] })
    listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
    await findActiveOrderForContact(DOMAIN_CTX, 'c1')
    expect(listOrdersMock).toHaveBeenCalledWith(DOMAIN_CTX, expect.objectContaining({ pipelineId: 'config-pipe' }))
  })

  it('passes undefined pipelineId when both null', async () => {
    getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: ['sA'] })
    listOrdersMock.mockResolvedValueOnce({ success: true, data: [] })
    await findActiveOrderForContact(DOMAIN_CTX, 'c1')
    const callArg = listOrdersMock.mock.calls[0][1] as { pipelineId?: string }
    expect(callArg.pipelineId).toBeUndefined()
  })
})

describe('findActiveOrderForContact — error path', () => {
  it('throws when listOrders fails', async () => {
    getCrmQueryToolsConfigMock.mockResolvedValueOnce({ pipelineId: null, activeStageIds: ['sA'] })
    listOrdersMock.mockResolvedValueOnce({ success: false, error: 'db down' })
    await expect(findActiveOrderForContact(DOMAIN_CTX, 'c1')).rejects.toThrow('db down')
  })
})

describe('resolveContactByPhone — sanity', () => {
  it('returns invalid_phone for garbage input', async () => {
    const r = await resolveContactByPhone(DOMAIN_CTX, 'abc')
    expect(r).toEqual({ kind: 'invalid_phone' })
  })
})
