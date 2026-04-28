import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const fromMock = vi.fn()
  return { fromMock }
})

vi.mock('@/lib/supabase/admin', () => ({
  createRawAdminClient: () => ({ from: mocks.fromMock }),
}))

import {
  createAuditSession,
  appendToAuditSession,
  loadAuditSession,
} from '../audit-session-store'

describe('createAuditSession (D-17 insert)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 1: calls insert + select(id).single() on agent_audit_sessions', async () => {
    const insertMock = vi.fn().mockReturnThis()
    const selectMock = vi.fn().mockReturnThis()
    const singleMock = vi
      .fn()
      .mockResolvedValue({ data: { id: 'new-uuid-1' }, error: null })
    const chain: any = {
      insert: insertMock,
      select: selectMock,
      single: singleMock,
    }
    insertMock.mockReturnValue(chain)
    selectMock.mockReturnValue(chain)
    mocks.fromMock.mockReturnValueOnce(chain)

    const result = await createAuditSession({
      turnId: 't1',
      workspaceId: 'w1',
      userId: 'u1',
      conversationId: 'c1',
      respondingAgentId: 'somnio-recompra-v1',
      hypothesis: 'test hypothesis',
      messages: [{ role: 'user', content: 'a' }],
      systemPrompt: 'sys',
      totalTurnsInContext: 5,
      trimmedCount: 0,
      costUsd: 0.001,
    })

    expect(mocks.fromMock).toHaveBeenCalledWith('agent_audit_sessions')
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(result.id).toBe('new-uuid-1')
  })

  it('Test 2: insert payload uses snake_case keys', async () => {
    const insertMock = vi.fn().mockReturnThis()
    const selectMock = vi.fn().mockReturnThis()
    const singleMock = vi
      .fn()
      .mockResolvedValue({ data: { id: 'x' }, error: null })
    const chain: any = {
      insert: insertMock,
      select: selectMock,
      single: singleMock,
    }
    insertMock.mockReturnValue(chain)
    selectMock.mockReturnValue(chain)
    mocks.fromMock.mockReturnValueOnce(chain)

    await createAuditSession({
      turnId: 't1',
      workspaceId: 'w1',
      userId: 'u1',
      conversationId: 'c1',
      respondingAgentId: 'agent',
      hypothesis: null,
      messages: [],
      systemPrompt: 'sys',
      totalTurnsInContext: 3,
      trimmedCount: 1,
      costUsd: 0.005,
    })

    const payload = insertMock.mock.calls[0][0]
    expect(payload.turn_id).toBe('t1')
    expect(payload.workspace_id).toBe('w1')
    expect(payload.user_id).toBe('u1')
    expect(payload.conversation_id).toBe('c1')
    expect(payload.responding_agent_id).toBe('agent')
    expect(payload.hypothesis).toBeNull()
    expect(payload.system_prompt).toBe('sys')
    expect(payload.total_turns_in_context).toBe(3)
    expect(payload.trimmed_count).toBe(1)
    expect(payload.cost_usd).toBe(0.005)
    // snake_case ONLY — no camelCase leak
    expect(payload).not.toHaveProperty('turnId')
    expect(payload).not.toHaveProperty('workspaceId')
  })

  it('Test 3: returns { id } from inserted row', async () => {
    const insertMock = vi.fn().mockReturnThis()
    const selectMock = vi.fn().mockReturnThis()
    const singleMock = vi
      .fn()
      .mockResolvedValue({ data: { id: 'extracted-id' }, error: null })
    const chain: any = {
      insert: insertMock,
      select: selectMock,
      single: singleMock,
    }
    insertMock.mockReturnValue(chain)
    selectMock.mockReturnValue(chain)
    mocks.fromMock.mockReturnValueOnce(chain)

    const result = await createAuditSession({
      turnId: 't1',
      workspaceId: 'w1',
      userId: 'u1',
      conversationId: 'c1',
      respondingAgentId: 'a',
      hypothesis: null,
      messages: [],
      systemPrompt: 's',
      totalTurnsInContext: 0,
      trimmedCount: 0,
      costUsd: 0,
    })

    expect(result).toEqual({ id: 'extracted-id' })
  })

  it('Test 4: throws when insert returns error', async () => {
    const insertMock = vi.fn().mockReturnThis()
    const selectMock = vi.fn().mockReturnThis()
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'duplicate key' },
    })
    const chain: any = {
      insert: insertMock,
      select: selectMock,
      single: singleMock,
    }
    insertMock.mockReturnValue(chain)
    selectMock.mockReturnValue(chain)
    mocks.fromMock.mockReturnValueOnce(chain)

    await expect(
      createAuditSession({
        turnId: 't1',
        workspaceId: 'w1',
        userId: 'u1',
        conversationId: 'c1',
        respondingAgentId: 'a',
        hypothesis: null,
        messages: [],
        systemPrompt: 's',
        totalTurnsInContext: 0,
        trimmedCount: 0,
        costUsd: 0,
      }),
    ).rejects.toBeDefined()
  })
})

describe('appendToAuditSession (D-17 update)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 5: calls update with messages and summed cost_usd', async () => {
    // First call: SELECT cost_usd
    const selectChain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { cost_usd: 0.01 }, error: null }),
    }
    // Second call: UPDATE
    const updateMock = vi.fn().mockReturnThis()
    const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const updateChain: any = {
      update: updateMock,
      eq: eqMock,
    }
    updateMock.mockReturnValue(updateChain)
    mocks.fromMock
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(updateChain)

    await appendToAuditSession('id1', {
      messages: [{ role: 'user', content: 'follow-up' }],
      costUsdDelta: 0.005,
    })

    expect(updateMock).toHaveBeenCalledTimes(1)
    const updatePayload = updateMock.mock.calls[0][0]
    expect(updatePayload.messages).toEqual([
      { role: 'user', content: 'follow-up' },
    ])
    expect(updatePayload.cost_usd).toBeCloseTo(0.015, 6)
    expect(eqMock).toHaveBeenCalledWith('id', 'id1')
  })

  it('Test 6: SELECT first to read current cost_usd before UPDATE', async () => {
    const selectChain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { cost_usd: 0.02 }, error: null }),
    }
    const updateMock = vi.fn().mockReturnThis()
    const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const updateChain: any = { update: updateMock, eq: eqMock }
    updateMock.mockReturnValue(updateChain)
    mocks.fromMock
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(updateChain)

    await appendToAuditSession('id2', { messages: [], costUsdDelta: 0.003 })

    expect(selectChain.select).toHaveBeenCalledWith('cost_usd')
    expect(updateMock.mock.calls[0][0].cost_usd).toBeCloseTo(0.023, 6)
  })

  it('Test 7: throws when row does not exist', async () => {
    const selectChain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mocks.fromMock.mockReturnValueOnce(selectChain)

    await expect(
      appendToAuditSession('missing-id', { messages: [], costUsdDelta: 0 }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('loadAuditSession (read)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 8: calls select(*) + eq(id) + maybeSingle', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    await loadAuditSession('id1')

    expect(chain.select).toHaveBeenCalledWith('*')
    expect(chain.eq).toHaveBeenCalledWith('id', 'id1')
    expect(chain.maybeSingle).toHaveBeenCalled()
  })

  it('Test 9: returns null when row does not exist', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    const result = await loadAuditSession('missing')
    expect(result).toBeNull()
  })

  it('Test 10: maps snake_case row to AuditSessionRow camelCase shape', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'audit-1',
          turn_id: 't1',
          workspace_id: 'w1',
          user_id: 'u1',
          responding_agent_id: 'somnio-recompra-v1',
          conversation_id: 'c1',
          hypothesis: 'test',
          messages: [{ role: 'user' }],
          system_prompt: 'sys',
          total_turns_in_context: 5,
          trimmed_count: 2,
          cost_usd: '0.123456',
          created_at: '2026-04-28T10:00:00Z',
          updated_at: '2026-04-28T10:00:01Z',
        },
        error: null,
      }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    const result = await loadAuditSession('audit-1')
    expect(result).toEqual({
      id: 'audit-1',
      turnId: 't1',
      workspaceId: 'w1',
      userId: 'u1',
      respondingAgentId: 'somnio-recompra-v1',
      conversationId: 'c1',
      hypothesis: 'test',
      messages: [{ role: 'user' }],
      systemPrompt: 'sys',
      totalTurnsInContext: 5,
      trimmedCount: 2,
      costUsd: 0.123456,
      createdAt: '2026-04-28T10:00:00Z',
      updatedAt: '2026-04-28T10:00:01Z',
    })
  })
})
