// ============================================================================
// Tests for domain layer extensions added by Plan 02 Task 3 (B-4 + B-1 fixes).
// Phase: agent-lifecycle-router (standalone)
//
// Coverage:
//   - orders.ts: getActiveOrderForContact, getLastDeliveredOrderDate,
//     countOrdersInLastNDays, isContactInRecompraPipeline
//   - tags.ts: getContactTags, listAllTags
//   - messages.ts: getLastInboundMessageAt, getInboundConversationsLastNDays
//   - workspace-agent-config.ts (NEW): getWorkspaceRecompraEnabled (B-1)
//
// All tests mock @/lib/supabase/admin via vi.mock — same pattern as domain.test.ts.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSupabase: { from: ReturnType<typeof vi.fn> } = { from: vi.fn() }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

import {
  getActiveOrderForContact,
  getLastDeliveredOrderDate,
  countOrdersInLastNDays,
  isContactInRecompraPipeline,
} from '@/lib/domain/orders'
import { getContactTags, listAllTags } from '@/lib/domain/tags'
import { getLastInboundMessageAt, getInboundConversationsLastNDays } from '@/lib/domain/messages'
import { getWorkspaceRecompraEnabled } from '@/lib/domain/workspace-agent-config'

const ws = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const contactId = 'contact-1'

beforeEach(() => {
  vi.clearAllMocks()
})

// ----------------------------------------------------------------------------
// orders.ts extensions (B-4)
// ----------------------------------------------------------------------------

describe('orders extensions (B-4)', () => {
  it('getActiveOrderForContact returns { id, stage_kind, created_at } shape', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'o1',
        created_at: '2026-04-25T10:00:00Z',
        pipeline_stages: { name: 'REPARTO', is_closed: false },
      },
      error: null,
    })
    const limitMock = vi.fn().mockReturnValue({ single: singleMock })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const isMock = vi.fn().mockReturnValue({ order: orderMock })
    const eq2 = vi.fn().mockReturnValue({ is: isMock })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await getActiveOrderForContact(contactId, ws)
    expect(result).toEqual({
      id: 'o1',
      stage_kind: 'REPARTO',
      created_at: '2026-04-25T10:00:00Z',
    })
    expect(mockSupabase.from).toHaveBeenCalledWith('orders')
    expect(eq1).toHaveBeenCalledWith('workspace_id', ws)
    expect(eq2).toHaveBeenCalledWith('contact_id', contactId)
    expect(isMock).toHaveBeenCalledWith('archived_at', null)
  })

  it('getActiveOrderForContact returns null when no order found', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    const limitMock = vi.fn().mockReturnValue({ single: singleMock })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const isMock = vi.fn().mockReturnValue({ order: orderMock })
    const eq2 = vi.fn().mockReturnValue({ is: isMock })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await getActiveOrderForContact(contactId, ws)
    expect(result).toBeNull()
  })

  it('getLastDeliveredOrderDate returns ISO timestamp when delivered order exists', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { updated_at: '2026-04-20T12:00:00Z' },
      error: null,
    })
    const limitMock = vi.fn().mockReturnValue({ single: singleMock })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const ilikeMock = vi.fn().mockReturnValue({ order: orderMock })
    const eq2 = vi.fn().mockReturnValue({ ilike: ilikeMock })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await getLastDeliveredOrderDate(contactId, ws)
    expect(result).toBe('2026-04-20T12:00:00Z')
  })

  it('countOrdersInLastNDays returns count integer with workspace + contact + gte filter', async () => {
    const gteMock = vi.fn().mockResolvedValue({ count: 3, error: null })
    const eq2 = vi.fn().mockReturnValue({ gte: gteMock })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await countOrdersInLastNDays(contactId, ws, 7)
    expect(result).toBe(3)
    expect(eq1).toHaveBeenCalledWith('workspace_id', ws)
    expect(eq2).toHaveBeenCalledWith('contact_id', contactId)
    // ISO timestamp passed to gte('created_at', sinceISO)
    const gteArgs = gteMock.mock.calls[0]
    expect(gteArgs[0]).toBe('created_at')
    expect(typeof gteArgs[1]).toBe('string')
    expect(gteArgs[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('countOrdersInLastNDays returns 0 when count is null', async () => {
    const gteMock = vi.fn().mockResolvedValue({ count: null, error: null })
    const eq2 = vi.fn().mockReturnValue({ gte: gteMock })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })
    expect(await countOrdersInLastNDays(contactId, ws, 7)).toBe(0)
  })

  it('isContactInRecompraPipeline returns true when count > 0', async () => {
    // Implementation joins orders → pipelines via pipeline_id. Test the public contract: boolean.
    const eq3 = vi.fn().mockResolvedValue({ count: 2, error: null })
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await isContactInRecompraPipeline(contactId, ws)
    expect(result).toBe(true)
  })

  it('isContactInRecompraPipeline returns false when count = 0', async () => {
    const eq3 = vi.fn().mockResolvedValue({ count: 0, error: null })
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await isContactInRecompraPipeline(contactId, ws)
    expect(result).toBe(false)
  })
})

// ----------------------------------------------------------------------------
// tags.ts extensions (B-4)
// ----------------------------------------------------------------------------

describe('tags extensions (B-4)', () => {
  it('getContactTags returns string[] of tag names', async () => {
    const eq2 = vi.fn().mockResolvedValue({
      data: [{ tags: { name: 'vip' } }, { tags: { name: 'forzar_humano' } }],
      error: null,
    })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await getContactTags(contactId, ws)
    expect(result).toEqual(['vip', 'forzar_humano'])
    expect(mockSupabase.from).toHaveBeenCalledWith('contact_tags')
  })

  it('getContactTags returns empty array on null data', async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await getContactTags(contactId, ws)
    expect(result).toEqual([])
  })

  it('listAllTags returns DomainResult with name+color array', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [{ name: 'vip', color: '#ff0000' }],
      error: null,
    })
    const eq1 = vi.fn().mockReturnValue({ order: orderMock })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await listAllTags({ workspaceId: ws })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([{ name: 'vip', color: '#ff0000' }])
    }
    expect(eq1).toHaveBeenCalledWith('workspace_id', ws)
  })
})

// ----------------------------------------------------------------------------
// messages.ts extensions (B-4)
// ----------------------------------------------------------------------------

describe('messages extensions (B-4)', () => {
  it('getLastInboundMessageAt returns ISO timestamp when inbound exists', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { created_at: '2026-04-25T10:00:00Z' },
      error: null,
    })
    const limitMock = vi.fn().mockReturnValue({ single: singleMock })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const eq3 = vi.fn().mockReturnValue({ order: orderMock })
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await getLastInboundMessageAt(contactId, ws)
    expect(result).toBe('2026-04-25T10:00:00Z')
    expect(eq1).toHaveBeenCalledWith('workspace_id', ws)
    expect(eq2).toHaveBeenCalledWith('contact_id', contactId)
    expect(eq3).toHaveBeenCalledWith('direction', 'inbound')
  })

  it('getLastInboundMessageAt returns null when none', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    const limitMock = vi.fn().mockReturnValue({ single: singleMock })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const eq3 = vi.fn().mockReturnValue({ order: orderMock })
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    expect(await getLastInboundMessageAt(contactId, ws)).toBeNull()
  })

  it('getInboundConversationsLastNDays dedupes by conversation_id', async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [
        { conversation_id: 'c1', contact_id: 'ct1', created_at: '2026-04-25T10:00:00Z' },
        { conversation_id: 'c1', contact_id: 'ct1', created_at: '2026-04-25T09:00:00Z' }, // dup
        { conversation_id: 'c2', contact_id: 'ct2', created_at: '2026-04-24T10:00:00Z' },
      ],
      error: null,
    })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const gteMock = vi.fn().mockReturnValue({ order: orderMock })
    const eq2 = vi.fn().mockReturnValue({ gte: gteMock })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    const result = await getInboundConversationsLastNDays(ws, 7, 500)
    expect(result.length).toBe(2)
    expect(result.map((r) => r.conversation_id).sort()).toEqual(['c1', 'c2'])
  })

  it('getInboundConversationsLastNDays handles null data', async () => {
    const limitMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const gteMock = vi.fn().mockReturnValue({ order: orderMock })
    const eq2 = vi.fn().mockReturnValue({ gte: gteMock })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    expect(await getInboundConversationsLastNDays(ws, 7, 500)).toEqual([])
  })
})

// ----------------------------------------------------------------------------
// workspace-agent-config.ts (B-1 fix — NEW file)
// ----------------------------------------------------------------------------

describe('workspace-agent-config (B-1 fix)', () => {
  it('getWorkspaceRecompraEnabled returns true by default if no config (PGRST116)', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })
    const eq1 = vi.fn().mockReturnValue({ single: singleMock })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    expect(await getWorkspaceRecompraEnabled(ws)).toBe(true)
  })

  it('getWorkspaceRecompraEnabled returns config value when set (false)', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { recompra_enabled: false },
      error: null,
    })
    const eq1 = vi.fn().mockReturnValue({ single: singleMock })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    expect(await getWorkspaceRecompraEnabled(ws)).toBe(false)
  })

  it('getWorkspaceRecompraEnabled returns config value when set (true)', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { recompra_enabled: true },
      error: null,
    })
    const eq1 = vi.fn().mockReturnValue({ single: singleMock })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    })

    expect(await getWorkspaceRecompraEnabled(ws)).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('workspace_agent_config')
    expect(eq1).toHaveBeenCalledWith('workspace_id', ws)
  })
})
