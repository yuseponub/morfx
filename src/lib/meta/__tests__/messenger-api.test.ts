/**
 * Meta Messenger Send API + user-profile payload contracts (FB-02).
 * Phase 40 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contracts under test (all FUTURE in `@/lib/meta/messenger-api`, Plan 02 creates them,
 * against Graph v22.0 `/{pageId}/messages` with Bearer = Page access token):
 *   sendMessengerText(token, pageId, psid, text, tag?)   — RED until Plan 02.
 *   sendMessengerImage(token, pageId, psid, imageUrl, tag?) — RED until Plan 02.
 *   getMessengerUserProfile(token, psid)                 — RED until Plan 02.
 *
 * Payloads verified in 40-RESEARCH.md §Code Examples (cross-checked against the
 * Messenger Send API docs). We stub global fetch (the real `metaRequest` uses fetch
 * captured at module load — mirrors the Phase 39 send.test.ts approach) and inspect
 * the exact body/URL/Authorization on the wire.
 *
 * RED STATE: `@/lib/meta/messenger-api` does NOT exist yet (Plan 02 ships it). The
 * static import throws module-not-found → the whole file fails RED. That is the
 * intended Wave-1 RED — Plan 02 turns it GREEN. No production module is created here.
 *
 * Key contracts pinned:
 *   - inside-24h text → messaging_type: 'RESPONSE' (no tag).
 *   - outside-24h text → messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT'.
 *   - image → attachment {type:'image', payload:{url, is_reusable:true}} — NO caption field.
 *   - PSID is forwarded as a STRING verbatim, even when it exceeds Number.MAX_SAFE_INTEGER
 *     (never Number-coerced — Pitfall 5).
 *   - the DEAD tags CONFIRMED_EVENT_UPDATE / ACCOUNT_UPDATE / POST_PURCHASE_UPDATE are
 *     NEVER emitted (removed 2026-04-27 → error 100). The only tag ever sent is HUMAN_AGENT.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { META_BASE_URL } from '@/lib/meta/constants'
import {
  sendMessengerText,
  sendMessengerImage,
  getMessengerUserProfile,
} from '@/lib/meta/messenger-api'

const TOKEN = 'PAGE_TOKEN_decrypted'
const PAGE_ID = '102938475610293'
// A PSID larger than Number.MAX_SAFE_INTEGER (9007199254740991) — must survive as a
// string verbatim; Number()-coercing it would silently corrupt the recipient.
const PSID = '24178263901234567'

let fetchMock: ReturnType<typeof vi.fn>

function lastCall() {
  return fetchMock.mock.calls.at(-1)!
}
function lastUrl(): string {
  return String(lastCall()[0])
}
function lastBody(): Record<string, unknown> {
  const init = lastCall()[1] as RequestInit
  return JSON.parse(init.body as string)
}
function lastRawBody(): string {
  const init = lastCall()[1] as RequestInit
  return init.body as string
}
function lastAuthHeader(): string {
  const init = lastCall()[1] as RequestInit
  const headers = (init.headers ?? {}) as Record<string, string>
  return headers['Authorization'] ?? ''
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ message_id: 'm_AG.1', recipient_id: PSID }),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('sendMessengerText (FB-02) — inside 24h → RESPONSE', () => {
  it('POSTs { messaging_type:RESPONSE, recipient:{id:PSID}, message:{text} } to /{pageId}/messages with Bearer', async () => {
    await sendMessengerText(TOKEN, PAGE_ID, PSID, 'Hola 👋')

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PAGE_ID}/messages`)
    expect((lastCall()[1] as RequestInit).method).toBe('POST')
    expect(lastAuthHeader()).toBe(`Bearer ${TOKEN}`)
    expect(lastBody()).toEqual({
      messaging_type: 'RESPONSE',
      recipient: { id: PSID },
      message: { text: 'Hola 👋' },
    })
  })

  it('forwards the PSID as a STRING verbatim (never Number-coerced — Pitfall 5)', async () => {
    await sendMessengerText(TOKEN, PAGE_ID, PSID, 'precision check')

    // The exact PSID string must appear on the wire with no precision loss.
    expect(lastRawBody()).toContain(`"${PSID}"`)
    expect((lastBody().recipient as { id: unknown }).id).toBe(PSID)
    expect((lastBody().recipient as { id: unknown }).id).not.toBe(Number(PSID))
  })

  it('NEVER emits a RESPONSE-arm tag (no message tag when inside the window)', async () => {
    await sendMessengerText(TOKEN, PAGE_ID, PSID, 'sin tag')
    expect(lastBody()).not.toHaveProperty('tag')
    expect(lastBody().messaging_type).toBe('RESPONSE')
  })
})

describe('sendMessengerText (FB-02) — outside 24h → MESSAGE_TAG / HUMAN_AGENT', () => {
  it('POSTs { messaging_type:MESSAGE_TAG, tag:HUMAN_AGENT, recipient, message } when given the HUMAN_AGENT tag', async () => {
    await sendMessengerText(TOKEN, PAGE_ID, PSID, 'Seguimos disponibles 🙂', 'HUMAN_AGENT')

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PAGE_ID}/messages`)
    expect(lastBody()).toEqual({
      messaging_type: 'MESSAGE_TAG',
      tag: 'HUMAN_AGENT',
      recipient: { id: PSID },
      message: { text: 'Seguimos disponibles 🙂' },
    })
  })

  it('the only message tag ever placed on the wire is HUMAN_AGENT (dead tags NEVER emitted)', async () => {
    await sendMessengerText(TOKEN, PAGE_ID, PSID, 'tag check', 'HUMAN_AGENT')

    const body = lastBody()
    // Negative assertions: the tags removed 2026-04-27 must never appear.
    expect(body.tag).toBe('HUMAN_AGENT')
    expect(body.tag).not.toBe('CONFIRMED_EVENT_UPDATE')
    expect(body.tag).not.toBe('ACCOUNT_UPDATE')
    expect(body.tag).not.toBe('POST_PURCHASE_UPDATE')
    expect(lastRawBody()).not.toContain('CONFIRMED_EVENT_UPDATE')
    expect(lastRawBody()).not.toContain('ACCOUNT_UPDATE')
    expect(lastRawBody()).not.toContain('POST_PURCHASE_UPDATE')
  })
})

describe('sendMessengerImage (FB-02) — attachment shape, NO caption field', () => {
  it('POSTs the image attachment with payload { url, is_reusable:true } and no caption', async () => {
    await sendMessengerImage(TOKEN, PAGE_ID, PSID, 'https://cdn.example/x.jpg')

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PAGE_ID}/messages`)
    expect(lastBody()).toEqual({
      messaging_type: 'RESPONSE',
      recipient: { id: PSID },
      message: {
        attachment: {
          type: 'image',
          payload: { url: 'https://cdn.example/x.jpg', is_reusable: true },
        },
      },
    })
    // Image attachments have NO caption field — caption is a separate follow-up text.
    const message = lastBody().message as Record<string, unknown>
    expect(message).not.toHaveProperty('text')
    expect(message).not.toHaveProperty('caption')
  })

  it('places the HUMAN_AGENT tag on the image send when outside the window', async () => {
    await sendMessengerImage(TOKEN, PAGE_ID, PSID, 'https://cdn.example/y.jpg', 'HUMAN_AGENT')

    expect(lastBody()).toMatchObject({
      messaging_type: 'MESSAGE_TAG',
      tag: 'HUMAN_AGENT',
      recipient: { id: PSID },
      message: { attachment: { type: 'image', payload: { is_reusable: true } } },
    })
  })
})

describe('getMessengerUserProfile (FB-02 / D-04) — best-effort profile fetch', () => {
  it('GETs /{psid}?fields=first_name,last_name,profile_pic with Bearer', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ first_name: 'Ana', last_name: 'Pérez', profile_pic: 'https://x/p.jpg' }),
    })

    const profile = await getMessengerUserProfile(TOKEN, PSID)

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PSID}?fields=first_name,last_name,profile_pic`)
    expect(lastAuthHeader()).toBe(`Bearer ${TOKEN}`)
    expect(profile).toMatchObject({ first_name: 'Ana', last_name: 'Pérez' })
  })

  it('degrades gracefully (resolves to an empty/degraded object, never throws) on fetch failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'profile unavailable', code: 100 } }),
    })

    // Best-effort: must NOT throw — falls back to an empty/degraded object.
    const profile = await getMessengerUserProfile(TOKEN, PSID)
    expect(profile).toBeDefined()
    expect(profile.first_name).toBeUndefined()
  })
})
