// ============================================================================
// Standalone routing-channel-fact — Plan 01 Task 1
// Tests for getConversationChannel domain helper (D-04, Regla 3).
//
// Mocks @/lib/supabase/admin so we can assert:
//   - Short-circuit on null/undefined conversationId WITHOUT touching DB (D-04)
//   - workspace_id filter on every query (Regla 3)
//   - Channel value passthrough for valid channels
//   - Null on missing row / query error (consistent with getContactIsClient)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase admin client mock --------------------------------------------
const singleMock = vi.fn()
const eqMock = vi.fn(() => ({ eq: eqMock, single: singleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

import { getConversationChannel } from '@/lib/domain/conversations'

beforeEach(() => {
  vi.clearAllMocks()
  // Restore default chain wiring after clearAllMocks reset implementations.
  eqMock.mockImplementation(() => ({ eq: eqMock, single: singleMock }))
  selectMock.mockImplementation(() => ({ eq: eqMock }))
  fromMock.mockImplementation(() => ({ select: selectMock }))
  createAdminClientMock.mockImplementation(() => ({ from: fromMock }))
})

describe('getConversationChannel — short-circuit (D-04)', () => {
  it('returns null when conversationId is null WITHOUT invoking createAdminClient', async () => {
    const result = await getConversationChannel(null, 'ws-1')
    expect(result).toBeNull()
    expect(createAdminClientMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns null when conversationId is undefined WITHOUT touching DB', async () => {
    const result = await getConversationChannel(undefined, 'ws-1')
    expect(result).toBeNull()
    expect(createAdminClientMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns null when conversationId is empty string WITHOUT touching DB', async () => {
    const result = await getConversationChannel('', 'ws-1')
    expect(result).toBeNull()
    expect(createAdminClientMock).not.toHaveBeenCalled()
  })
})

describe('getConversationChannel — happy path (channel passthrough)', () => {
  it('returns "facebook" when DB row says { channel: "facebook" }', async () => {
    singleMock.mockResolvedValue({ data: { channel: 'facebook' }, error: null })
    const result = await getConversationChannel('conv-1', 'ws-1')
    expect(result).toBe('facebook')
  })

  it('returns "whatsapp" when DB row says { channel: "whatsapp" }', async () => {
    singleMock.mockResolvedValue({ data: { channel: 'whatsapp' }, error: null })
    const result = await getConversationChannel('conv-1', 'ws-1')
    expect(result).toBe('whatsapp')
  })

  it('returns "instagram" when DB row says { channel: "instagram" }', async () => {
    singleMock.mockResolvedValue({ data: { channel: 'instagram' }, error: null })
    const result = await getConversationChannel('conv-1', 'ws-1')
    expect(result).toBe('instagram')
  })
})

describe('getConversationChannel — error / miss → null', () => {
  it('returns null when DB returns error (PGRST116 row not found)', async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no row' } })
    const result = await getConversationChannel('conv-missing', 'ws-1')
    expect(result).toBeNull()
  })

  it('returns null when DB returns null data without error', async () => {
    singleMock.mockResolvedValue({ data: null, error: null })
    const result = await getConversationChannel('conv-1', 'ws-1')
    expect(result).toBeNull()
  })

  it('returns null when channel column is null', async () => {
    singleMock.mockResolvedValue({ data: { channel: null }, error: null })
    const result = await getConversationChannel('conv-1', 'ws-1')
    expect(result).toBeNull()
  })

  it('returns null when channel column is an unknown string', async () => {
    singleMock.mockResolvedValue({ data: { channel: 'tiktok' }, error: null })
    const result = await getConversationChannel('conv-1', 'ws-1')
    expect(result).toBeNull()
  })
})

describe('getConversationChannel — Regla 3 multi-tenant safety', () => {
  it('filters query by workspace_id and id (in that order)', async () => {
    singleMock.mockResolvedValue({ data: { channel: 'whatsapp' }, error: null })
    await getConversationChannel('conv-1', 'ws-42')

    expect(fromMock).toHaveBeenCalledWith('conversations')
    expect(selectMock).toHaveBeenCalledWith('channel')
    // First .eq is workspace_id, second is id. The chained eqMock receives both
    // calls in order — assert by inspecting its call list.
    expect(eqMock).toHaveBeenNthCalledWith(1, 'workspace_id', 'ws-42')
    expect(eqMock).toHaveBeenNthCalledWith(2, 'id', 'conv-1')
    expect(singleMock).toHaveBeenCalledOnce()
  })
})
