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
  listAuditSessionsForTurn,
  loadAuditSessionById,
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

describe('listAuditSessionsForTurn (Plan 05 extension — history listing)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 11: returns [] when no audits exist for turnId', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    const result = await listAuditSessionsForTurn('turn-empty')

    expect(mocks.fromMock).toHaveBeenCalledWith('agent_audit_sessions')
    expect(chain.eq).toHaveBeenCalledWith('turn_id', 'turn-empty')
    expect(result).toEqual([])
  })

  it('Test 12: orders by updated_at DESC (not created_at) so recent follow-ups bubble up', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    await listAuditSessionsForTurn('turn-x')

    expect(chain.order).toHaveBeenCalledWith('updated_at', { ascending: false })
  })

  it('Test 13: projection excludes messages JSONB and system_prompt to keep payload small', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    await listAuditSessionsForTurn('turn-x')

    const selectArg = chain.select.mock.calls[0][0] as string
    // `messages` MUST NOT appear as a plain projected field. It MAY appear as
    // part of an alias like `message_count:messages` because PostgREST needs
    // the source column for jsonb projection. We assert there is no `messages`
    // token NOT preceded by `:` (i.e. not the rhs of an alias).
    expect(selectArg).not.toMatch(/(^|[\s,])messages([\s,]|$)/)
    expect(selectArg).not.toMatch(/\bsystem_prompt\b/)
    // But MUST include the metadata fields the UI consumes
    expect(selectArg).toMatch(/\bid\b/)
    expect(selectArg).toMatch(/\bhypothesis\b/)
    expect(selectArg).toMatch(/\bcost_usd\b/)
    expect(selectArg).toMatch(/\btotal_turns_in_context\b/)
    expect(selectArg).toMatch(/\btrimmed_count\b/)
    expect(selectArg).toMatch(/\bcreated_at\b/)
    expect(selectArg).toMatch(/\bupdated_at\b/)
  })

  it('Test 14: maps rows to AuditSessionSummary shape with messageCount derived from JSONB array length', async () => {
    // PostgREST cannot return jsonb_array_length without an RPC; we instead
    // request `messages` as a plain field but project array-length via a
    // computed column trick OR the function maps locally. The contract here:
    // the function returns `messageCount` — implementation detail (whether it
    // came from a count(*) RPC, jsonb_array_length on server, or in-memory
    // length on a tiny shipped messages array) is hidden behind the projection.
    //
    // For this test we assert the shape; impl uses a Postgres expression
    // alias `message_count` when selecting (jsonb_array_length(messages)).
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'audit-recent',
            hypothesis: 'recent test',
            message_count: 4,
            cost_usd: '0.012345',
            total_turns_in_context: 5,
            trimmed_count: 0,
            created_at: '2026-04-28T10:00:00Z',
            updated_at: '2026-04-28T11:00:00Z',
          },
          {
            id: 'audit-older',
            hypothesis: null,
            message_count: 2,
            cost_usd: '0.005',
            total_turns_in_context: 3,
            trimmed_count: 1,
            created_at: '2026-04-27T10:00:00Z',
            updated_at: '2026-04-27T10:01:00Z',
          },
        ],
        error: null,
      }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    const result = await listAuditSessionsForTurn('turn-x')

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 'audit-recent',
      hypothesis: 'recent test',
      messageCount: 4,
      costUsd: 0.012345,
      totalTurnsInContext: 5,
      trimmedCount: 0,
      createdAt: '2026-04-28T10:00:00Z',
      updatedAt: '2026-04-28T11:00:00Z',
    })
    expect(result[1].hypothesis).toBeNull()
    expect(result[1].messageCount).toBe(2)
  })

  it('Test 15: throws when select returns an error', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'db down' } }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    await expect(listAuditSessionsForTurn('turn-x')).rejects.toBeDefined()
  })
})

describe('loadAuditSessionById (Plan 05 extension — full audit load)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 16: returns full row with messages JSONB parsed into array', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'a1',
          turn_id: 't1',
          workspace_id: 'w1',
          user_id: 'u1',
          responding_agent_id: 'somnio-recompra-v1',
          conversation_id: 'c1',
          hypothesis: 'h',
          messages: [
            { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
            { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'ok' }] },
          ],
          system_prompt: 'sys',
          total_turns_in_context: 5,
          trimmed_count: 0,
          cost_usd: '0.01',
          created_at: '2026-04-28T10:00:00Z',
          updated_at: '2026-04-28T10:00:01Z',
        },
        error: null,
      }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    const result = await loadAuditSessionById('a1')

    expect(result).not.toBeNull()
    expect(result!.id).toBe('a1')
    expect(result!.turnId).toBe('t1')
    expect(result!.messages).toHaveLength(2)
    expect((result!.messages[0] as any).role).toBe('user')
    expect((result!.messages[1] as any).role).toBe('assistant')
    expect(result!.systemPrompt).toBe('sys')
    expect(result!.costUsd).toBeCloseTo(0.01, 6)
  })

  it('Test 17: returns null when row does not exist (silences 404)', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    const result = await loadAuditSessionById('missing-id')
    expect(result).toBeNull()
  })

  it('Test 18: queries by id with select(*) maybeSingle', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    await loadAuditSessionById('a1')

    expect(mocks.fromMock).toHaveBeenCalledWith('agent_audit_sessions')
    expect(chain.select).toHaveBeenCalledWith('*')
    expect(chain.eq).toHaveBeenCalledWith('id', 'a1')
    expect(chain.maybeSingle).toHaveBeenCalled()
  })

  it('Test 19: throws when select returns an error', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'db down' } }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    await expect(loadAuditSessionById('a1')).rejects.toBeDefined()
  })

  it('Test 20: maps messages array even when JSONB returns empty', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'a1',
          turn_id: 't1',
          workspace_id: 'w1',
          user_id: 'u1',
          responding_agent_id: 'a',
          conversation_id: 'c1',
          hypothesis: null,
          messages: [],
          system_prompt: 'sys',
          total_turns_in_context: 0,
          trimmed_count: 0,
          cost_usd: '0',
          created_at: '2026-04-28T10:00:00Z',
          updated_at: '2026-04-28T10:00:00Z',
        },
        error: null,
      }),
    }
    mocks.fromMock.mockReturnValueOnce(chain)

    const result = await loadAuditSessionById('a1')
    expect(result!.messages).toEqual([])
    expect(result!.hypothesis).toBeNull()
  })
})
