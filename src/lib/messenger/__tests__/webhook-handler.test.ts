/**
 * Inbound Messenger webhook handler contract (FB-01 routing + FB-03 PSID create-or-get +
 * FB-04 channel='facebook'). Phase 40 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: `processMessengerWebhook(ev, workspaceId, pageId)` from
 * `@/lib/messenger/webhook-handler` (FUTURE — Plan 05 creates it). Per 40-PATTERNS.md it is a
 * clone of the legacy FB/IG inbound handler (now decommissioned), adapted for the Graph
 * `object==='page'` event shape:
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
 *
 * Standalone: godentist-fbig-meta-direct-cutover (Plan 02) — THE WIRE.
 * The D-12 human-only assertion is REPLACED: the handler now ALWAYS emits
 * `agent/whatsapp.message_received` after a successful (non-dedup) store,
 * mirroring the legacy FB/IG dispatch. The agent-vs-silence gate is DOWNSTREAM
 * (webhook-processor.ts); the handler MUST NOT import or call the router.
 *   wire   — emits agent/whatsapp.message_received once with lockChannel='facebook'.
 *   dedup  — does NOT dispatch on a dedup no-op (receiveMessage messageId === '').
 *   D-03   — Regla 6 source-grep gate: the handler source never mentions the router.
 *
 * Every domain dependency + the registry-helper + the 4 interruption-v2 modules
 * are mocked so the run asserts the contract, not live Redis/DB I/O.
 */

import { readFileSync } from 'fs'
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
  healPlaceholderContactName: vi.fn(),
}))

vi.mock('@/lib/meta/messenger-api', () => ({
  getMessengerUserProfile: vi.fn(),
  getMessengerUserName: vi.fn(async () => 'Ana Pérez'),
}))

// Plan 02 wire: the handler dynamically imports `@/inngest/client` (NOT the
// legacy `@/lib/inngest/client` path) — mock the real import target so the
// spy intercepts the dispatch.
vi.mock('@/inngest/client', () => ({ inngest: { send: vi.fn() } }))

// Plan 02 wire: the new dependencies the handler pulls in for the agent
// dispatch — mocked so the handler runs without Redis/registry I/O.
vi.mock('@/lib/agents/registry-helpers', () => ({
  resolveAgentIdForWorkspace: vi.fn(async () => 'godentist'),
}))
vi.mock('@/lib/agents/interruption-system-v2/lock', () => ({
  acquireLock: vi.fn(async () => null),
}))
vi.mock('@/lib/agents/interruption-system-v2/pending', () => ({
  pushToPending: vi.fn(async () => ({ exactJson: '{}', pendingListLength: 1 })),
}))
vi.mock('@/lib/agents/interruption-system-v2/redis-client', () => ({
  redis: { set: vi.fn(async () => 'OK') },
}))
vi.mock('@/lib/agents/interruption-system-v2/observability', () => ({
  emitLockEvent: vi.fn(),
}))

// Supabase admin — table-aware chainable builder.
//   - A `.from('contacts').single()` is the FUZZY PHONE SEARCH path we assert is
//     NEVER taken (D-04/D-05). `phoneSearchSingle` tracks it.
//   - Plan 02 wire: a `.from('conversations').single()` is the NEW contact_id
//     fetch for the agent event; it returns the conversation's contact_id.
const phoneSearchSingle = vi.fn(async () => ({ data: null, error: null }))
const conversationContactSingle = vi.fn(async () => ({
  data: { contact_id: 'contact_1' },
  error: null,
}))
vi.mock('@/lib/supabase/admin', () => {
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = vi.fn(chain)
    builder.eq = vi.fn(chain)
    builder.update = vi.fn(chain)
    builder.insert = vi.fn(() => builder)
    builder.single = table === 'conversations' ? conversationContactSingle : phoneSearchSingle
    builder.then = undefined
    return builder
  }
  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => makeBuilder(table)),
    })),
  }
})

import { findOrCreateConversation, linkContactToConversation } from '@/lib/domain/conversations'
import { receiveMessage } from '@/lib/domain/messages'
import { resolveOrCreateContact, healPlaceholderContactName } from '@/lib/domain/contacts'
import { getMessengerUserName } from '@/lib/meta/messenger-api'
import { inngest } from '@/inngest/client'

const mockFindOrCreateConversation = findOrCreateConversation as ReturnType<typeof vi.fn>
const mockLinkContact = linkContactToConversation as ReturnType<typeof vi.fn>
const mockReceiveMessage = receiveMessage as ReturnType<typeof vi.fn>
const mockResolveOrCreateContact = resolveOrCreateContact as ReturnType<typeof vi.fn>
const mockHealName = healPlaceholderContactName as ReturnType<typeof vi.fn>
const mockGetName = getMessengerUserName as ReturnType<typeof vi.fn>
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
  mockResolveOrCreateContact.mockResolvedValue({ success: true, data: { contactId: 'contact_1' } })
  mockHealName.mockResolvedValue({ success: true, data: { healed: true } })
  mockGetName.mockResolvedValue('Ana Pérez')
  phoneSearchSingle.mockResolvedValue({ data: null, error: null })
  conversationContactSingle.mockResolvedValue({ data: { contact_id: 'contact_1' }, error: null })
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

    // The legacy FB/IG handler fuzzy-matched by phone via supabase.from('contacts').eq('phone', ...);
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

describe('processMessengerWebhook — Plan 02 wire (agent dispatch)', () => {
  it('emits agent/whatsapp.message_received once with the facebook lockChannel', async () => {
    const { processMessengerWebhook } = await import('@/lib/messenger/webhook-handler')

    await processMessengerWebhook(makeEvent(), WS_ID, PAGE_ID)

    expect(mockInngestSend).toHaveBeenCalledTimes(1)
    const arg = mockInngestSend.mock.calls[0][0] as { name: string; data: Record<string, unknown> }
    expect(arg.name).toBe('agent/whatsapp.message_received')
    expect(arg.data).toMatchObject({
      conversationId: 'conv_fb_1',
      messageId: 'm_inbound_xyz',
      lockChannel: 'facebook',
    })
  })

  it('does NOT dispatch on a dedup no-op (receiveMessage messageId === "")', async () => {
    mockReceiveMessage.mockResolvedValueOnce({ success: true, data: { messageId: '' } })
    const { processMessengerWebhook } = await import('@/lib/messenger/webhook-handler')

    await processMessengerWebhook(makeEvent(), WS_ID, PAGE_ID)

    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})

describe('processMessengerWebhook — Regla 6 / D-03 (gate stays downstream)', () => {
  it('D-03/Regla 6 — handler never imports or calls the router (routeAgent absent in source)', () => {
    const src = readFileSync('src/lib/messenger/webhook-handler.ts', 'utf8')
    expect(src).not.toMatch(/routeAgent/)
  })
})
