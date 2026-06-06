/**
 * Inbound Instagram webhook handler contract (IG-01 routing + IG-03 IGSID create-or-get +
 * channel='instagram'). Phase 41 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: `processInstagramWebhook(ev, workspaceId, igAccountId, accessToken?)`
 * from `@/lib/instagram/webhook-handler` (FUTURE — Plan 41-05 creates it). Per 41-PATTERNS.md
 * §2 it is a clone of `processMessengerWebhook` adapted for the Graph `object==='instagram'`
 * event shape:
 *   - `ev.sender.id`    = IGSID (the customer — outbound recipient)
 *   - `ev.recipient.id` = IGID (your Instagram Professional account)
 *   - `ev.message.mid`  = dedup key, `ev.message.text` = body
 *
 * Behaviors pinned (RED until Plan 41-05):
 *   channel — creates a conversation with channel:'instagram', externalSubscriberId: IGSID (string),
 *             phone identifier `ig-${IGSID}`.
 *   IG-03  — resolves-or-creates a contact strictly by (ig_account_id, IGSID); does NOT fuzzy-match
 *            phone/email (D-IG-05) — assert no phone-search path is taken.
 *   self-heal — getInstagramUserName(token, igsid) resolves → healPlaceholderContactName with
 *            placeholderPrefix:'IG-'; on failure → fallback `IG-${IGSID}` and heal NOT called.
 *   IG-01  — stores the message via `receiveMessage` with `waMessageId: ev.message.mid` (idempotent
 *            dedup key).
 *   IGSID  — kept as a STRING throughout (never Number-coerced — Pitfall 3).
 *   D-IG-01 — OMITS any Inngest agent dispatch + v4 lock (human-only inbox) — assert nothing emitted.
 *
 * RED STATE: `@/lib/instagram/webhook-handler` does not exist until Plan 41-05 — `await import(...)`
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
  healPlaceholderContactName: vi.fn(),
}))

// IG name edge is the DIRECT edge getInstagramUserName(token, igsid) — simpler than FB.
vi.mock('@/lib/meta/instagram-api', () => ({
  getInstagramUserName: vi.fn(),
}))

// Inngest — must NOT be invoked (D-IG-01 human-only). Mocked so we can assert zero dispatch.
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
import { resolveOrCreateContact, healPlaceholderContactName } from '@/lib/domain/contacts'
import { getInstagramUserName } from '@/lib/meta/instagram-api'
import { inngest } from '@/lib/inngest/client'

const mockFindOrCreateConversation = findOrCreateConversation as ReturnType<typeof vi.fn>
const mockLinkContact = linkContactToConversation as ReturnType<typeof vi.fn>
const mockReceiveMessage = receiveMessage as ReturnType<typeof vi.fn>
const mockResolveOrCreateContact = resolveOrCreateContact as ReturnType<typeof vi.fn>
const mockHealName = healPlaceholderContactName as ReturnType<typeof vi.fn>
const mockGetName = getInstagramUserName as ReturnType<typeof vi.fn>
const mockInngestSend = inngest.send as ReturnType<typeof vi.fn>

const WS_ID = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
const IG_ACCOUNT_ID = 'IGID_17841400000000123'
const ACCESS_TOKEN = 'PAGE_TOKEN_decrypted'
// IGSID > Number.MAX_SAFE_INTEGER — must stay a string end-to-end.
const IGSID = '17841400000000000000'

function makeEvent() {
  return {
    sender: { id: IGSID },
    recipient: { id: IG_ACCOUNT_ID },
    timestamp: 1748112000000,
    message: { mid: 'm_ig_inbound_xyz', text: 'Hola, ¿precio?' },
  }
}

beforeEach(() => {
  mockFindOrCreateConversation.mockResolvedValue({
    success: true,
    data: { conversationId: 'conv_ig_1' },
  })
  mockLinkContact.mockResolvedValue({ success: true })
  mockReceiveMessage.mockResolvedValue({ success: true, data: { messageId: 'msg_1' } })
  mockResolveOrCreateContact.mockResolvedValue({ success: true, data: { contactId: 'contact_1' } })
  mockHealName.mockResolvedValue({ success: true, data: { healed: true } })
  mockGetName.mockResolvedValue('Ana Pérez')
  phoneSearchSingle.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('processInstagramWebhook — conversation creation (channel=instagram)', () => {
  it('creates a conversation with channel:"instagram", externalSubscriberId=IGSID (string), phone=ig-${IGSID}', async () => {
    const { processInstagramWebhook } = await import('@/lib/instagram/webhook-handler')

    await processInstagramWebhook(makeEvent(), WS_ID, IG_ACCOUNT_ID, ACCESS_TOKEN)

    expect(mockFindOrCreateConversation).toHaveBeenCalledTimes(1)
    const convArgs = mockFindOrCreateConversation.mock.calls[0][1] as Record<string, unknown>
    expect(convArgs).toMatchObject({
      channel: 'instagram',
      externalSubscriberId: IGSID,
      phone: `ig-${IGSID}`,
    })
    // IGSID kept as a string verbatim — never Number-coerced.
    expect(typeof convArgs.externalSubscriberId).toBe('string')
    expect(convArgs.externalSubscriberId).toBe(IGSID)
  })

  it('passes profileName to findOrCreateConversation ONLY when a real name resolved (nameResolved guard)', async () => {
    const { processInstagramWebhook } = await import('@/lib/instagram/webhook-handler')

    // name edge fails → no real name → profileName must NOT be passed (so a race never
    // overwrites a previously-healed good name with IG-${igsid}).
    mockGetName.mockResolvedValueOnce(null)

    await processInstagramWebhook(makeEvent(), WS_ID, IG_ACCOUNT_ID, ACCESS_TOKEN)

    const convArgs = mockFindOrCreateConversation.mock.calls[0][1] as Record<string, unknown>
    expect(convArgs.profileName).toBeUndefined()
  })
})

describe('processInstagramWebhook — contact create-or-get by (ig_account_id, IGSID), NO fuzzy match (IG-03 / D-IG-05)', () => {
  it('resolves-or-creates the contact keyed by the IGSID identity, not a phone/email fuzzy match', async () => {
    const { processInstagramWebhook } = await import('@/lib/instagram/webhook-handler')

    await processInstagramWebhook(makeEvent(), WS_ID, IG_ACCOUNT_ID, ACCESS_TOKEN)

    // The contact is created/fetched by the IGSID identity (ig-account-scoped), never via a phone search.
    expect(mockResolveOrCreateContact).toHaveBeenCalledTimes(1)
    const contactCall = JSON.stringify(mockResolveOrCreateContact.mock.calls[0])
    expect(contactCall).toContain(`ig-${IGSID}`)
  })

  it('does NOT take any phone/email fuzzy-search path (D-IG-05 — no auto-merge)', async () => {
    const { processInstagramWebhook } = await import('@/lib/instagram/webhook-handler')

    await processInstagramWebhook(makeEvent(), WS_ID, IG_ACCOUNT_ID, ACCESS_TOKEN)

    // The ManyChat handler fuzzy-matches by phone via supabase.from('contacts').eq('phone', ...);
    // the Instagram handler must NEVER do that — assert no such search ran.
    expect(phoneSearchSingle).not.toHaveBeenCalled()
  })
})

describe('processInstagramWebhook — name self-heal (placeholderPrefix IG-)', () => {
  it('heals the IG- placeholder when a real name resolves, with placeholderPrefix:"IG-"', async () => {
    const { processInstagramWebhook } = await import('@/lib/instagram/webhook-handler')

    mockGetName.mockResolvedValueOnce('Ana Pérez')

    await processInstagramWebhook(makeEvent(), WS_ID, IG_ACCOUNT_ID, ACCESS_TOKEN)

    expect(mockHealName).toHaveBeenCalledTimes(1)
    const healArgs = mockHealName.mock.calls[0][1] as Record<string, unknown>
    expect(healArgs).toMatchObject({
      contactId: 'contact_1',
      realName: 'Ana Pérez',
      placeholderPrefix: 'IG-',
    })
  })

  it('falls back to IG-${IGSID} and does NOT heal when the name edge returns null', async () => {
    const { processInstagramWebhook } = await import('@/lib/instagram/webhook-handler')

    mockGetName.mockResolvedValueOnce(null)

    await processInstagramWebhook(makeEvent(), WS_ID, IG_ACCOUNT_ID, ACCESS_TOKEN)

    // No real name → heal is NOT invoked (never clobber with the placeholder).
    expect(mockHealName).not.toHaveBeenCalled()
    // The fallback name `IG-${IGSID}` is what flows to resolveOrCreateContact.
    const contactArgs = mockResolveOrCreateContact.mock.calls[0][1] as Record<string, unknown>
    expect(contactArgs.name).toBe(`IG-${IGSID}`)
  })
})

describe('processInstagramWebhook — message store with mid dedup key (IG-01)', () => {
  it('stores the message via receiveMessage using waMessageId = ev.message.mid', async () => {
    const { processInstagramWebhook } = await import('@/lib/instagram/webhook-handler')

    await processInstagramWebhook(makeEvent(), WS_ID, IG_ACCOUNT_ID, ACCESS_TOKEN)

    expect(mockReceiveMessage).toHaveBeenCalledTimes(1)
    const receiveArgs = mockReceiveMessage.mock.calls[0][1] as Record<string, unknown>
    expect(receiveArgs).toMatchObject({
      conversationId: 'conv_ig_1',
      waMessageId: 'm_ig_inbound_xyz',
      messageContent: 'Hola, ¿precio?',
    })
  })
})

describe('processInstagramWebhook — D-IG-01 human-only (no agent dispatch / no v4 lock)', () => {
  it('OMITS any Inngest agent dispatch on inbound (human inbox only)', async () => {
    const { processInstagramWebhook } = await import('@/lib/instagram/webhook-handler')

    await processInstagramWebhook(makeEvent(), WS_ID, IG_ACCOUNT_ID, ACCESS_TOKEN)

    // No agent dispatch, no message_received event, no acquireLock — strictly human inbox.
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// GAP-41-05 — labelInstagramEvent pure helper + never-empty-body fallback.
//
// The handler previously only understood message.text + attachments[0] of type
// image|audio|video|file. Any other IG payload (share/ig_reel/story_mention,
// message.reply_to.story, a top-level reaction, or an unknown subtype) had no
// text + no mapped attachment → stored as { body: '' } (empty bubble — real
// case Ruth Zapata Duarte, conv 89aa0de1). These cases pin the labeling.
// ===========================================================================

describe('labelInstagramEvent — non-standard IG types get a non-empty label (GAP-41-05)', () => {
  it('Test 1: attachment type "share" with payload.url → "[Publicación compartida] <url>"', async () => {
    const { labelInstagramEvent } = await import('@/lib/instagram/webhook-handler')
    const ev = {
      sender: { id: IGSID },
      message: { attachments: [{ type: 'share', payload: { url: 'https://instagram.com/p/abc' } }] },
    }
    expect(labelInstagramEvent(ev)).toBe('[Publicación compartida] https://instagram.com/p/abc')
  })

  it('Test 2: attachment type "ig_reel" (no url) → "[Publicación compartida]"', async () => {
    const { labelInstagramEvent } = await import('@/lib/instagram/webhook-handler')
    const ev = { sender: { id: IGSID }, message: { attachments: [{ type: 'ig_reel' }] } }
    expect(labelInstagramEvent(ev)).toBe('[Publicación compartida]')
  })

  it('Test 3: attachment type "story_mention" → "[Respuesta a tu historia]"', async () => {
    const { labelInstagramEvent } = await import('@/lib/instagram/webhook-handler')
    const ev = { sender: { id: IGSID }, message: { attachments: [{ type: 'story_mention' }] } }
    expect(labelInstagramEvent(ev)).toBe('[Respuesta a tu historia]')
  })

  it('Test 4: message.reply_to.story present (no attachment) → "[Respuesta a tu historia]"', async () => {
    const { labelInstagramEvent } = await import('@/lib/instagram/webhook-handler')
    const ev = { sender: { id: IGSID }, message: { reply_to: { story: { id: 'story_1' } } } }
    expect(labelInstagramEvent(ev)).toBe('[Respuesta a tu historia]')
  })

  it('Test 5: top-level reaction:{ emoji:"❤️" } → "[Reacción: ❤️]"', async () => {
    const { labelInstagramEvent } = await import('@/lib/instagram/webhook-handler')
    const ev = { sender: { id: IGSID }, reaction: { emoji: '❤️' } }
    expect(labelInstagramEvent(ev)).toBe('[Reacción: ❤️]')
  })

  it('Test 6: top-level reaction:{ reaction:"love" } (no emoji) → "[Reacción: love]"', async () => {
    const { labelInstagramEvent } = await import('@/lib/instagram/webhook-handler')
    const ev = { sender: { id: IGSID }, reaction: { reaction: 'love' } }
    expect(labelInstagramEvent(ev)).toBe('[Reacción: love]')
  })

  it('Test 7: a plain text event → null (existing text path handles it)', async () => {
    const { labelInstagramEvent } = await import('@/lib/instagram/webhook-handler')
    const ev = { sender: { id: IGSID }, message: { text: 'hola' } }
    expect(labelInstagramEvent(ev)).toBeNull()
  })

  it('Test 8: a mapped image attachment → null (existing media path handles it)', async () => {
    const { labelInstagramEvent } = await import('@/lib/instagram/webhook-handler')
    const ev = {
      sender: { id: IGSID },
      message: { attachments: [{ type: 'image', payload: { url: 'https://cdn/x.jpg' } }] },
    }
    expect(labelInstagramEvent(ev)).toBeNull()
  })

  it('Test 9: a fully-unknown event (no text/attachment/reaction) → diagnostic, never empty/null', async () => {
    const { labelInstagramEvent } = await import('@/lib/instagram/webhook-handler')
    const ev = { sender: { id: IGSID }, message: { attachments: [{ type: 'weird_new_type' }] } }
    expect(labelInstagramEvent(ev)).toBe('[Mensaje de Instagram no compatible]')
  })
})

describe('processInstagramWebhook — never stores an empty body for non-standard types (GAP-41-05)', () => {
  it('Test 10: a "share" inbound event stores the label as messageContent + contentJson.body (NOT empty)', async () => {
    const { processInstagramWebhook } = await import('@/lib/instagram/webhook-handler')

    const shareEvent = {
      sender: { id: IGSID },
      recipient: { id: IG_ACCOUNT_ID },
      timestamp: 1748112000000,
      message: {
        mid: 'm_ig_share_1',
        attachments: [{ type: 'share', payload: { url: 'https://instagram.com/p/abc' } }],
      },
    }

    await processInstagramWebhook(shareEvent, WS_ID, IG_ACCOUNT_ID, ACCESS_TOKEN)

    expect(mockReceiveMessage).toHaveBeenCalledTimes(1)
    const receiveArgs = mockReceiveMessage.mock.calls[0][1] as Record<string, unknown>
    const label = '[Publicación compartida] https://instagram.com/p/abc'
    expect(receiveArgs.messageContent).toBe(label)
    expect(receiveArgs.messageType).toBe('text')
    expect(receiveArgs.contentJson).toMatchObject({ body: label })
    // The whole point of GAP-41-05: no empty body is ever stored.
    expect((receiveArgs.contentJson as Record<string, unknown>).body).not.toBe('')
  })
})
