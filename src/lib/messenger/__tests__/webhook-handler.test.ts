/**
 * Inbound Messenger webhook handler contract (FB-01 routing + FB-03 PSID create-or-get +
 * FB-04 channel='facebook'). Phase 40 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: `processMessengerWebhook(ev, workspaceId, pageId)` from
 * `@/lib/messenger/webhook-handler` (FUTURE — Plan 05 creates it). Per 40-PATTERNS.md it is a
 * clone of `processManyChatWebhook` adapted for the Graph `object==='page'` event shape:
 *   - `ev.sender.id`    = PSID (the customer — outbound recipient)
 *   - `ev.recipient.id` = pageId (your page)
 *   - `ev.message.mid`  = dedup key, `ev.message.text` = body
 *
 * Behaviors pinned (RED until Plan 05):
 *   FB-04 — creates a conversation with channel:'facebook', externalSubscriberId: PSID (string),
 *           phone identifier `fb-${PSID}`.
 *   FB-03 — resolves-or-creates a contact strictly by (page_id, PSID); does NOT fuzzy-match
 *           phone/email (D-04/D-05) — assert no phone-search path is taken.
 *   FB-01 — stores the message via `receiveMessage` with `waMessageId: ev.message.mid` (idempotent
 *           dedup key).
 *   PSID  — kept as a STRING throughout (never Number-coerced — Pitfall 5).
 *   D-12  — OMITS any Inngest agent dispatch (human-only inbox) — assert no agent event emitted.
 *
 * RED STATE: `@/lib/messenger/webhook-handler` does not exist until Plan 05 — `await import(...)`
 * rejects with module-not-found, the intended Wave-1 RED. Each test imports lazily so a missing
 * module produces a clear per-test failure rather than a whole-file collection crash. Every domain
 * dependency is mocked so the eventual GREEN run asserts the contract, not a live DB call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — observable domain + profile dependencies.
// ---------------------------------------------------------------------------

vi.mock('@/lib/domain/conversations', () => ({
  findOrCreateConversation: vi.fn(),
  linkContactToConversation: vi.fn(),
}))

vi.mock('@/lib/domain/messages', () => ({
  receiveMessage: vi.fn(),
}))

vi.mock('@/lib/domain/contacts', () => ({
  resolveOrCreateContact: vi.fn(),
}))

vi.mock('@/lib/meta/messenger-api', () => ({
  getMessengerUserProfile: vi.fn(),
}))

// Inngest — must NOT be invoked (D-12 human-only). Imported by the module if at all; mocked so
// we can assert zero dispatch.
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn() },
}))

// Supabase admin — the handler may read/write via domain only; provide a no-op chainable builder
// so any incidental query (e.g. a fuzzy phone search, which we assert is NEVER taken) is observable.
const phoneSearchSingle = vi.fn(async () => ({ data: null, error: null }))
vi.mock('@/lib/supabase/admin', () => {
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = vi.fn(chain)
    builder.eq = vi.fn(chain)
    builder.update = vi.fn(chain)
    builder.insert = vi.fn(() => builder)
    builder.single = phoneSearchSingle
    builder.then = undefined
    return builder
  }
  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn(() => makeBuilder()),
    })),
  }
})

import { findOrCreateConversation, linkContactToConversation } from '@/lib/domain/conversations'
import { receiveMessage } from '@/lib/domain/messages'
import { resolveOrCreateContact } from '@/lib/domain/contacts'
import { getMessengerUserProfile } from '@/lib/meta/messenger-api'
import { inngest } from '@/lib/inngest/client'

const mockFindOrCreateConversation = findOrCreateConversation as ReturnType<typeof vi.fn>
const mockLinkContact = linkContactToConversation as ReturnType<typeof vi.fn>
const mockReceiveMessage = receiveMessage as ReturnType<typeof vi.fn>
const mockResolveOrCreateContact = resolveOrCreateContact as ReturnType<typeof vi.fn>
const mockGetProfile = getMessengerUserProfile as ReturnType<typeof vi.fn>
const mockInngestSend = inngest.send as ReturnType<typeof vi.fn>

const WS_ID = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
const PAGE_ID = '102938475610293'
// PSID > Number.MAX_SAFE_INTEGER — must stay a string end-to-end.
const PSID = '24178263901234567'

function makeEvent() {
  return {
    sender: { id: PSID },
    recipient: { id: PAGE_ID },
    timestamp: 1700000000000,
    message: { mid: 'm_inbound_xyz', text: 'hola' },
  }
}

beforeEach(() => {
  mockFindOrCreateConversation.mockResolvedValue({
    success: true,
    data: { conversationId: 'conv_fb_1' },
  })
  mockLinkContact.mockResolvedValue({ success: true })
  mockReceiveMessage.mockResolvedValue({ success: true, data: { messageId: 'msg_1' } })
  mockResolveOrCreateContact.mockResolvedValue({ success: true, data: { id: 'contact_1' } })
  mockGetProfile.mockResolvedValue({ first_name: 'Ana', last_name: 'Pérez' })
  phoneSearchSingle.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('processMessengerWebhook — conversation creation (FB-04)', () => {
  it('creates a conversation with channel:"facebook", externalSubscriberId=PSID (string), phone=fb-${PSID}', async () => {
    const { processMessengerWebhook } = await import('@/lib/messenger/webhook-handler')

    await processMessengerWebhook(makeEvent(), WS_ID, PAGE_ID)

    expect(mockFindOrCreateConversation).toHaveBeenCalledTimes(1)
    const convArgs = mockFindOrCreateConversation.mock.calls[0][1] as Record<string, unknown>
    expect(convArgs).toMatchObject({
      channel: 'facebook',
      externalSubscriberId: PSID,
      phone: `fb-${PSID}`,
    })
    // PSID kept as a string verbatim — never Number-coerced.
    expect(typeof convArgs.externalSubscriberId).toBe('string')
    expect(convArgs.externalSubscriberId).toBe(PSID)
  })
})

describe('processMessengerWebhook — contact create-or-get by (page_id, PSID), NO fuzzy match (FB-03 / D-04)', () => {
  it('resolves-or-creates the contact keyed by the PSID identity, not a phone/email fuzzy match', async () => {
    const { processMessengerWebhook } = await import('@/lib/messenger/webhook-handler')

    await processMessengerWebhook(makeEvent(), WS_ID, PAGE_ID)

    // The contact is created/fetched by the PSID identity (page-scoped), never via a phone search.
    expect(mockResolveOrCreateContact).toHaveBeenCalledTimes(1)
    const contactCall = JSON.stringify(mockResolveOrCreateContact.mock.calls[0])
    expect(contactCall).toContain(PSID)
  })

  it('does NOT take any phone/email fuzzy-search path (D-04/D-05 — no auto-merge)', async () => {
    const { processMessengerWebhook } = await import('@/lib/messenger/webhook-handler')

    await processMessengerWebhook(makeEvent(), WS_ID, PAGE_ID)

    // The ManyChat handler fuzzy-matches by phone via supabase.from('contacts').eq('phone', ...);
    // the Messenger handler must NEVER do that — assert no such search ran.
    expect(phoneSearchSingle).not.toHaveBeenCalled()
  })
})

describe('processMessengerWebhook — message store with mid dedup key (FB-01)', () => {
  it('stores the message via receiveMessage using waMessageId = ev.message.mid', async () => {
    const { processMessengerWebhook } = await import('@/lib/messenger/webhook-handler')

    await processMessengerWebhook(makeEvent(), WS_ID, PAGE_ID)

    expect(mockReceiveMessage).toHaveBeenCalledTimes(1)
    const receiveArgs = mockReceiveMessage.mock.calls[0][1] as Record<string, unknown>
    expect(receiveArgs).toMatchObject({
      conversationId: 'conv_fb_1',
      waMessageId: 'm_inbound_xyz',
      messageContent: 'hola',
    })
  })
})

describe('processMessengerWebhook — D-12 human-only (no agent dispatch)', () => {
  it('OMITS any Inngest agent dispatch on inbound (human inbox only)', async () => {
    const { processMessengerWebhook } = await import('@/lib/messenger/webhook-handler')

    await processMessengerWebhook(makeEvent(), WS_ID, PAGE_ID)

    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
