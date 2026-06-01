// ============================================================================
// Standalone v4-media-audio-image — Plan 02 Task 1 (TDD RED)
// Tests for setMessageTranscription domain function (D-04/D-09, Regla 3).
//
// Mocks @/lib/supabase/admin following S-4 pattern (conversations.test.ts).
//
// Asserts:
//   (a) happy path: .update({transcription}).eq('wamid', ...).eq('workspace_id', ...) invoked
//   (b) empty/missing wamid → { success: false } without calling update (short-circuit)
//   (c) supabase error → { success: false, error } propagated
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase admin client mock -------------------------------------------
// Chain: createAdminClient() → from('messages') → update({...}) → eq → eq → resolves
const eqMockInner = vi.fn()
// The chain returned by update() supports .eq().eq() and finally resolves to { error }
// We make eq chainable and the final .eq() resolves when awaited.
type EqChain = { eq: typeof eqMockInner }
eqMockInner.mockImplementation((): EqChain => ({ eq: eqMockInner }))

const updateMock = vi.fn(() => ({ eq: eqMockInner }))
const fromMock = vi.fn(() => ({ update: updateMock }))
const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

// Import AFTER mock registration
import { setMessageTranscription } from '@/lib/domain/messages'

const CTX = { workspaceId: 'ws-abc', cascadeDepth: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  // Re-wire chain after clearAllMocks resets implementations
  eqMockInner.mockImplementation((): EqChain => ({ eq: eqMockInner }))
  updateMock.mockImplementation(() => ({ eq: eqMockInner }))
  fromMock.mockImplementation(() => ({ update: updateMock }))
  createAdminClientMock.mockImplementation(() => ({ from: fromMock }))
})

// ---------------------------------------------------------------------------
// (a) Happy path — correct chain called with right args
// ---------------------------------------------------------------------------
describe('setMessageTranscription — happy path', () => {
  it('calls update with transcription and filters by wamid + workspace_id', async () => {
    // Make the final eq() (workspace_id filter) resolve with no error
    eqMockInner.mockImplementationOnce((): EqChain => ({ eq: eqMockInner })) // first .eq('wamid', ...)
    eqMockInner.mockImplementationOnce(() => Promise.resolve({ error: null })) // second .eq('workspace_id', ...)

    const result = await setMessageTranscription(CTX, {
      wamid: 'wamid-123',
      transcription: 'Hola, quiero un pedido.',
    })

    expect(result).toEqual({ success: true, data: { updated: true } })
    expect(fromMock).toHaveBeenCalledWith('messages')
    expect(updateMock).toHaveBeenCalledWith({ transcription: 'Hola, quiero un pedido.' })
    // First eq call → wamid
    expect(eqMockInner).toHaveBeenCalledWith('wamid', 'wamid-123')
    // Second eq call → workspace_id (Regla 3 workspace isolation)
    expect(eqMockInner).toHaveBeenCalledWith('workspace_id', 'ws-abc')
  })
})

// ---------------------------------------------------------------------------
// (b) Empty / missing wamid → short-circuit, no DB call
// ---------------------------------------------------------------------------
describe('setMessageTranscription — missing wamid guard', () => {
  it('returns { success: false } without calling update when wamid is empty string', async () => {
    const result = await setMessageTranscription(CTX, {
      wamid: '',
      transcription: 'some text',
    })

    expect(result).toMatchObject({ success: false })
    expect(createAdminClientMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// (c) Supabase error → { success: false, error } propagated
// ---------------------------------------------------------------------------
describe('setMessageTranscription — supabase error', () => {
  it('returns { success: false, error } when supabase returns an error', async () => {
    eqMockInner.mockImplementationOnce((): EqChain => ({ eq: eqMockInner })) // .eq('wamid', ...)
    eqMockInner.mockImplementationOnce(() =>
      Promise.resolve({ error: { message: 'DB connection failed' } })
    ) // .eq('workspace_id', ...)

    const result = await setMessageTranscription(CTX, {
      wamid: 'wamid-456',
      transcription: 'texto de prueba',
    })

    expect(result).toEqual({ success: false, error: 'DB connection failed' })
  })
})
