/**
 * getConversationsPage server action contract (F-1, whatsapp-inbox-reliability plan 05).
 *
 * Contract under test: `getConversationsPage(filters, cursor)` from
 * `@/app/actions/conversations` — keyset pagination over the `get_conversations_page`
 * RPC (migration 20260611160000, applied in prod) + `.in('id', pageIds)` re-join +
 * opaque base64 cursor `{ sort, sortIsNull, id }`.
 *
 * Behaviors pinned:
 *   - page 1 (null cursor) → RPC receives p_cursor_sort=null, p_cursor_is_null=false,
 *     p_cursor_id=null, p_limit=50.
 *   - workspaceId comes from getRequestAuth() and is passed as p_workspace_id —
 *     NEVER from the client filters object (T-wir-10).
 *   - filters.search passes ONLY as the typed p_search RPC param (T-wir-09).
 *   - full page (50 rows) → hasMore=true + nextCursor decodes to the LAST RPC row.
 *   - nextCursor round-trips: feeding it back produces the original p_cursor_* params.
 *   - last row with last_customer_message_at === null → cursor with sortIsNull:true.
 *   - NULL-band paging (the P1 bug the RPC fixes): page 2 of a NULL-`lcm` tail
 *     passes p_cursor_is_null:true and returns the tail rows, NOT [].
 *   - empty result → { conversations: [], hasMore: false, nextCursor: null }.
 *   - the action re-sorts the `.in()` re-join to the RPC's id order (authoritative).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  joinIn: vi.fn(),
  getRequestAuth: vi.fn(),
}))

vi.mock('@/lib/auth/request-auth', () => ({
  getRequestAuth: mocks.getRequestAuth,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/domain/conversations', () => ({
  assignConversation: vi.fn(),
  archiveConversation: vi.fn(),
  linkContactToConversation: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: mocks.joinIn,
      })),
    })),
  })),
  createAdminClient: vi.fn(),
}))

import { getConversationsPage } from '@/app/actions/conversations'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const PAGE_SIZE = 50

function uuid(i: number): string {
  return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
}

/** Base conversations row as the RPC (RETURNS SETOF conversations) emits it. */
function makeRow(i: number, lcm: string | null) {
  return {
    id: uuid(i),
    workspace_id: WORKSPACE_ID,
    phone: `+57300000${String(i).padStart(4, '0')}`,
    contact_id: null,
    status: 'active',
    is_read: true,
    unread_count: 0,
    last_message_at: '2026-06-10T12:00:00+00:00',
    last_customer_message_at: lcm,
    last_message_preview: `msg ${i}`,
  }
}

/** Joined row as the `.in('id', pageIds)` re-join emits it (nested contact+tags). */
function makeJoinedRow(row: ReturnType<typeof makeRow>) {
  return { ...row, contact: null }
}

function decodeCursor(cursor: string): { sort: string | null; sortIsNull: boolean; id: string } {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'))
}

beforeEach(() => {
  // mockReset on the bare mocks (NOT vi.resetAllMocks, which would wipe the
  // createClient factory implementation): drops stale mockResolvedValueOnce
  // queues. An empty page never consumes its queued joinIn once-impl (the
  // action returns before the re-join), so clearAllMocks would leak it.
  vi.clearAllMocks()
  mocks.rpc.mockReset()
  mocks.joinIn.mockReset()
  mocks.getRequestAuth.mockReset()
  mocks.getRequestAuth.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: uuid(999) })
})

/** Wire the RPC + re-join mocks for a given set of base rows. */
function primePage(rows: Array<ReturnType<typeof makeRow>>) {
  mocks.rpc.mockResolvedValueOnce({ data: rows, error: null })
  if (rows.length > 0) {
    // Empty pages short-circuit before the re-join — do not queue a join impl.
    mocks.joinIn.mockResolvedValueOnce({ data: rows.map(makeJoinedRow), error: null })
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getConversationsPage (F-1 keyset, whatsapp-inbox-reliability)', () => {
  it('page 1 (null cursor) calls the RPC with null cursor params and limit 50', async () => {
    primePage([makeRow(1, '2026-06-11T10:00:00+00:00')])

    await getConversationsPage({ status: 'active', sortBy: 'last_customer_message' }, null)

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    const [fnName, params] = mocks.rpc.mock.calls[0]
    expect(fnName).toBe('get_conversations_page')
    expect(params).toMatchObject({
      p_workspace_id: WORKSPACE_ID,
      p_sort: 'last_customer_message_at',
      p_status: 'active',
      p_cursor_sort: null,
      p_cursor_is_null: false,
      p_cursor_id: null,
      p_limit: PAGE_SIZE,
    })
  })

  it('p_workspace_id comes from getRequestAuth, never from the filters object', async () => {
    primePage([])

    // Hostile client tries to smuggle another workspace through filters.
    await getConversationsPage(
      { status: 'active', workspaceId: 'evil-workspace-id' } as never,
      null
    )

    const [, params] = mocks.rpc.mock.calls[0]
    expect(params.p_workspace_id).toBe(WORKSPACE_ID)
  })

  it('passes search ONLY as the typed p_search param (no interpolation)', async () => {
    primePage([])
    const hostile = "O'Brien%;DROP TABLE conversations;--"

    await getConversationsPage({ status: 'active', search: hostile }, null)

    const [, params] = mocks.rpc.mock.calls[0]
    expect(params.p_search).toBe(hostile)
  })

  it('full page (50 rows) → hasMore=true + nextCursor decodes to the last row', async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) =>
      makeRow(i + 1, `2026-06-11T10:${String(59 - i).padStart(2, '0')}:00+00:00`)
    )
    primePage(rows)

    const result = await getConversationsPage({ status: 'active' }, null)

    expect(result.conversations).toHaveLength(PAGE_SIZE)
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).not.toBeNull()

    const last = rows[rows.length - 1]
    const decoded = decodeCursor(result.nextCursor!)
    expect(decoded).toEqual({
      sort: last.last_customer_message_at,
      sortIsNull: false,
      id: last.id,
    })
  })

  it('round-trips the cursor: feeding nextCursor back produces the original p_cursor_* params', async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) =>
      makeRow(i + 1, `2026-06-11T09:${String(59 - i).padStart(2, '0')}:00+00:00`)
    )
    primePage(rows)
    const page1 = await getConversationsPage({ status: 'active' }, null)
    const decoded = decodeCursor(page1.nextCursor!)

    primePage([makeRow(100, '2026-06-11T08:00:00+00:00')])
    await getConversationsPage({ status: 'active' }, page1.nextCursor)

    const [, params] = mocks.rpc.mock.calls[1]
    expect(params.p_cursor_sort).toBe(decoded.sort)
    expect(params.p_cursor_is_null).toBe(decoded.sortIsNull)
    expect(params.p_cursor_id).toBe(decoded.id)
  })

  it('last row with last_customer_message_at === null → cursor with sortIsNull: true', async () => {
    const rows = [
      makeRow(1, '2026-06-11T10:00:00+00:00'),
      makeRow(2, null), // outbound-only conversation (NULL band starts)
    ]
    primePage(rows)

    const result = await getConversationsPage({ status: 'active' }, null)

    const decoded = decodeCursor(result.nextCursor!)
    expect(decoded.sortIsNull).toBe(true)
    expect(decoded.sort).toBeNull()
    expect(decoded.id).toBe(uuid(2))
  })

  it('NULL-band paging (P1): page 2 of a NULL-lcm tail passes p_cursor_is_null=true and returns the tail rows, not []', async () => {
    // Cursor from a NULL-sorted row (the band the chained .or() approach silently drops).
    const nullBandCursor = Buffer.from(
      JSON.stringify({ sort: null, sortIsNull: true, id: uuid(40) })
    ).toString('base64')

    const tailRows = [makeRow(41, null), makeRow(42, null), makeRow(43, null)]
    primePage(tailRows)

    const result = await getConversationsPage({ status: 'active' }, nullBandCursor)

    const [, params] = mocks.rpc.mock.calls[0]
    expect(params.p_cursor_is_null).toBe(true)
    expect(params.p_cursor_sort).toBeNull()
    expect(params.p_cursor_id).toBe(uuid(40))

    // The action returns the mocked tail rows — NOT an empty page.
    expect(result.conversations).toHaveLength(3)
    expect(result.conversations.map(c => c.id)).toEqual([uuid(41), uuid(42), uuid(43)])
    expect(result.hasMore).toBe(false) // 3 < 50
  })

  it('empty result → { conversations: [], hasMore: false, nextCursor: null }', async () => {
    primePage([])

    const result = await getConversationsPage({ status: 'active' }, null)

    expect(result).toEqual({ conversations: [], hasMore: false, nextCursor: null })
  })

  it('short page (< 50) → hasMore=false but nextCursor still encodes the last row', async () => {
    primePage([makeRow(1, '2026-06-11T10:00:00+00:00')])

    const result = await getConversationsPage({ status: 'active' }, null)

    expect(result.hasMore).toBe(false)
    expect(decodeCursor(result.nextCursor!).id).toBe(uuid(1))
  })

  it('re-sorts the .in() re-join to the RPC id order (RPC order is authoritative)', async () => {
    const rowA = makeRow(1, '2026-06-11T10:00:00+00:00')
    const rowB = makeRow(2, '2026-06-11T09:00:00+00:00')
    mocks.rpc.mockResolvedValueOnce({ data: [rowA, rowB], error: null })
    // .in() does NOT preserve order — simulate it coming back reversed.
    mocks.joinIn.mockResolvedValueOnce({
      data: [makeJoinedRow(rowB), makeJoinedRow(rowA)],
      error: null,
    })

    const result = await getConversationsPage({ status: 'active' }, null)

    expect(result.conversations.map(c => c.id)).toEqual([rowA.id, rowB.id])
  })

  it('transforms nested contact tags into the flat ConversationWithDetails shape', async () => {
    const row = makeRow(1, '2026-06-11T10:00:00+00:00')
    const tag = { id: uuid(500), name: 'VIP', color: '#ff0000' }
    mocks.rpc.mockResolvedValueOnce({ data: [row], error: null })
    mocks.joinIn.mockResolvedValueOnce({
      data: [{
        ...row,
        contact: {
          id: uuid(200),
          name: 'Sandra Pérez',
          phone: row.phone,
          is_client: true,
          tags: [{ tag }],
        },
      }],
      error: null,
    })

    const result = await getConversationsPage({ status: 'active' }, null)

    expect(result.conversations[0].tags).toEqual([tag])
    expect(result.conversations[0].contact?.name).toBe('Sandra Pérez')
    expect(result.conversations[0].contact?.tags).toBeUndefined()
  })

  it('maps unassigned filter (assigned_to === null) to p_unassigned=true', async () => {
    primePage([])

    await getConversationsPage({ status: 'active', assigned_to: null }, null)

    const [, params] = mocks.rpc.mock.calls[0]
    expect(params.p_unassigned).toBe(true)
    expect(params.p_assigned_to).toBeNull()
  })

  it('maps tag + agent filters to p_tag_id / p_agent_attended RPC params', async () => {
    primePage([])
    const tagId = uuid(700)

    await getConversationsPage(
      { status: 'active', tag_id: tagId, agent_attended: true },
      null
    )

    const [, params] = mocks.rpc.mock.calls[0]
    expect(params.p_tag_id).toBe(tagId)
    expect(params.p_agent_attended).toBe(true)
  })

  it('RPC error → empty page (no throw)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })

    const result = await getConversationsPage({ status: 'active' }, null)

    expect(result).toEqual({ conversations: [], hasMore: false, nextCursor: null })
  })

  it('no auth → empty page', async () => {
    mocks.getRequestAuth.mockResolvedValueOnce(null)

    const result = await getConversationsPage({ status: 'active' }, null)

    expect(result).toEqual({ conversations: [], hasMore: false, nextCursor: null })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
