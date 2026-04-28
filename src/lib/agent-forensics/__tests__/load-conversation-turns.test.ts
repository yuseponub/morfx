import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const fromMock = vi.fn()
  const createRawAdminClientMock = vi.fn(() => ({ from: fromMock }))
  return { fromMock, createRawAdminClientMock }
})

vi.mock('@/lib/supabase/admin', () => ({
  createRawAdminClient: mocks.createRawAdminClientMock,
}))

import { loadConversationTurns } from '../load-conversation-turns'

function makeSessionChain(data: { created_at: string } | null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  }
  return chain
}

function makeTurnsChain(result: { data: any[] | null; error: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
  return chain
}

describe('loadConversationTurns (D-14, D-19, RESEARCH §1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses session.created_at as lower bound when active session exists', async () => {
    const sessionChain = makeSessionChain({ created_at: '2026-04-23T10:00:00Z' })
    const turnsChain = makeTurnsChain({
      data: [
        {
          id: 't1',
          conversation_id: 'c1',
          workspace_id: 'w1',
          agent_id: 'somnio-v3',
          responding_agent_id: 'somnio-recompra-v1',
          started_at: '2026-04-23T10:01:00Z',
          finished_at: '2026-04-23T10:01:01Z',
          duration_ms: 1000,
          event_count: 5,
          query_count: 2,
          ai_call_count: 1,
          total_tokens: 100,
          total_cost_usd: 0.001,
          error: null,
          trigger_kind: 'user_message',
          current_mode: null,
          new_mode: null,
        },
      ],
      error: null,
    })
    mocks.fromMock
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(turnsChain)

    const result = await loadConversationTurns('c1', '2026-04-23T11:00:00Z')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
    expect(result[0].respondingAgentId).toBe('somnio-recompra-v1')
    // Lower bound = session.created_at
    expect(turnsChain.gte).toHaveBeenCalledWith('started_at', '2026-04-23T10:00:00Z')
  })

  it('falls back to 7-day window when no active session', async () => {
    const sessionChain = makeSessionChain(null)
    const turnsChain = makeTurnsChain({ data: [], error: null })
    mocks.fromMock
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(turnsChain)

    const anchor = '2026-04-23T10:00:00Z'
    await loadConversationTurns('c1', anchor)

    // Lower bound = anchor - 7 days
    const expectedLower = new Date(
      new Date(anchor).getTime() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString()
    expect(turnsChain.gte).toHaveBeenCalledWith('started_at', expectedLower)
  })

  it('orders ASC and limits to 50', async () => {
    const sessionChain = makeSessionChain(null)
    const turnsChain = makeTurnsChain({ data: [], error: null })
    mocks.fromMock.mockReturnValueOnce(sessionChain).mockReturnValueOnce(turnsChain)

    await loadConversationTurns('c1', '2026-04-23T10:00:00Z')

    expect(turnsChain.order).toHaveBeenCalledWith('started_at', { ascending: true })
    expect(turnsChain.limit).toHaveBeenCalledWith(50)
  })

  it('selects responding_agent_id (D-19 includes crm-reader auto)', async () => {
    const sessionChain = makeSessionChain(null)
    const turnsChain = makeTurnsChain({ data: [], error: null })
    mocks.fromMock.mockReturnValueOnce(sessionChain).mockReturnValueOnce(turnsChain)

    await loadConversationTurns('c1', '2026-04-23T10:00:00Z')

    const selectCall = turnsChain.select.mock.calls[0][0] as string
    expect(selectCall).toContain('responding_agent_id')
    expect(selectCall).toContain('agent_id')
  })

  it('throws when query errors', async () => {
    const sessionChain = makeSessionChain(null)
    const turnsChain = makeTurnsChain({
      data: null,
      error: { message: 'connection refused' },
    })
    mocks.fromMock.mockReturnValueOnce(sessionChain).mockReturnValueOnce(turnsChain)

    await expect(
      loadConversationTurns('c1', '2026-04-23T10:00:00Z'),
    ).rejects.toBeDefined()
  })

  it('maps DB rows to TurnSummary shape (camelCase + null fallbacks)', async () => {
    const sessionChain = makeSessionChain(null)
    const turnsChain = makeTurnsChain({
      data: [
        {
          id: 't2',
          conversation_id: 'c1',
          workspace_id: 'w1',
          agent_id: 'somnio-v3',
          responding_agent_id: null,
          started_at: '2026-04-23T10:00:00Z',
          finished_at: null,
          duration_ms: null,
          event_count: 0,
          query_count: 0,
          ai_call_count: 0,
          total_tokens: 0,
          total_cost_usd: '0',
          error: null,
          trigger_kind: null,
          current_mode: null,
          new_mode: null,
        },
      ],
      error: null,
    })
    mocks.fromMock.mockReturnValueOnce(sessionChain).mockReturnValueOnce(turnsChain)

    const result = await loadConversationTurns('c1', '2026-04-23T10:00:00Z')

    expect(result[0].respondingAgentId).toBeNull()
    expect(result[0].hasError).toBe(false)
    expect(result[0].finishedAt).toBeNull()
    expect(result[0].totalCostUsd).toBe(0)
  })
})
