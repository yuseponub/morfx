import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock createRawAdminClient BEFORE importing load-session-snapshot.
// vi.hoisted prevents "Cannot access before initialization" on hoisted mock factories.
const { mockSessionsSelect, mockStateSelect, mockSessionsChain, mockStateChain, mockFrom } =
  vi.hoisted(() => {
    const sessionsSelect = vi.fn()
    const stateSelect = vi.fn()
    const sessionsChain: Record<string, unknown> = {}
    const stateChain: Record<string, unknown> = {}
    sessionsChain.select = vi.fn(() => sessionsChain)
    sessionsChain.eq = vi.fn(() => sessionsChain)
    sessionsChain.order = vi.fn(() => sessionsChain)
    sessionsChain.limit = vi.fn(() => sessionsChain)
    sessionsChain.maybeSingle = sessionsSelect
    sessionsChain.single = sessionsSelect
    stateChain.select = vi.fn(() => stateChain)
    stateChain.eq = vi.fn(() => stateChain)
    stateChain.maybeSingle = stateSelect
    stateChain.single = stateSelect
    const from = vi.fn((table: string) => {
      if (table === 'agent_sessions') return sessionsChain
      if (table === 'session_state') return stateChain
      throw new Error(`unexpected table: ${table}`)
    })
    return {
      mockSessionsSelect: sessionsSelect,
      mockStateSelect: stateSelect,
      mockSessionsChain: sessionsChain,
      mockStateChain: stateChain,
      mockFrom: from,
    }
  })

vi.mock('@/lib/supabase/admin', () => ({
  createRawAdminClient: () => ({ from: mockFrom }),
}))

import { loadSessionSnapshot } from '../load-session-snapshot'

describe('loadSessionSnapshot — createRawAdminClient + no projection (D-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset chain methods so re-wiring is consistent across tests
    mockSessionsChain.select = vi.fn(() => mockSessionsChain)
    mockSessionsChain.eq = vi.fn(() => mockSessionsChain)
    mockSessionsChain.order = vi.fn(() => mockSessionsChain)
    mockSessionsChain.limit = vi.fn(() => mockSessionsChain)
    mockStateChain.select = vi.fn(() => mockStateChain)
    mockStateChain.eq = vi.fn(() => mockStateChain)
  })

  it('returns full session_state JSON when active session exists', async () => {
    mockSessionsSelect.mockResolvedValue({
      data: { id: 'session-uuid-1' },
      error: null,
    })
    mockStateSelect.mockResolvedValue({
      data: {
        session_id: 'session-uuid-1',
        datos_capturados: {
          nombre: 'Jose',
          phone: '+57...',
          _v3: { crm_context: {} },
        },
        updated_at: '2026-04-24T10:00:00Z',
      },
      error: null,
    })

    const result = await loadSessionSnapshot('conv-uuid-1')

    expect(result.sessionId).toBe('session-uuid-1')
    expect(result.snapshot).toEqual({
      session_id: 'session-uuid-1',
      datos_capturados: {
        nombre: 'Jose',
        phone: '+57...',
        _v3: { crm_context: {} },
      },
      updated_at: '2026-04-24T10:00:00Z',
    })
  })

  it('returns null snapshot when no active session', async () => {
    mockSessionsSelect.mockResolvedValue({
      data: null,
      error: null,
    })

    const result = await loadSessionSnapshot('conv-uuid-no-session')

    expect(result.sessionId).toBeNull()
    expect(result.snapshot).toBeNull()
  })

  it('queries agent_sessions by conversation_id + is_active + orders by created_at desc', async () => {
    mockSessionsSelect.mockResolvedValue({ data: { id: 'x' }, error: null })
    mockStateSelect.mockResolvedValue({ data: {}, error: null })

    await loadSessionSnapshot('conv-123')

    expect(mockFrom).toHaveBeenCalledWith('agent_sessions')
    expect(mockSessionsChain.eq).toHaveBeenCalledWith('conversation_id', 'conv-123')
    expect(mockSessionsChain.eq).toHaveBeenCalledWith('is_active', true)
    expect(mockSessionsChain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    })
    expect(mockSessionsChain.limit).toHaveBeenCalledWith(1)
  })

  it('does NOT filter or transform the snapshot (D-06 — raw JSON)', async () => {
    const rawState = {
      session_id: 'x',
      datos_capturados: {
        nested: { deep: { structure: true } },
        array: [1, 2, 3],
      },
      internal_field: 'should still appear',
    }
    mockSessionsSelect.mockResolvedValue({ data: { id: 'x' }, error: null })
    mockStateSelect.mockResolvedValue({ data: rawState, error: null })

    const result = await loadSessionSnapshot('c')

    expect(result.snapshot).toEqual(rawState)
  })
})
