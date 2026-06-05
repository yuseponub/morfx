/**
 * Meta Instagram Send API + display-name payload contracts (IG-02).
 * Phase 41 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contracts under test (all FUTURE in `@/lib/meta/instagram-api`, Plan 41-02 creates them,
 * against Graph v22.0 `/{pageId}/messages` with Bearer = Page access token — IG rides the
 * SAME Page endpoint/token as FB Messenger):
 *   sendInstagramText(token, pageId, igsid, text, tag?)    — RED until Plan 41-02.
 *   sendInstagramImage(token, pageId, igsid, imageUrl, tag?) — RED until Plan 41-02.
 *   getInstagramUserName(token, igsid)                     — RED until Plan 41-02.
 *
 * Payloads verified in 41-RESEARCH.md §Code Examples (cross-checked against the
 * Instagram Send API docs). We stub global fetch (the real `metaRequest` uses fetch
 * captured at module load — mirrors the FB messenger-api.test.ts approach) and inspect
 * the exact body/URL/Authorization on the wire.
 *
 * RED STATE: `@/lib/meta/instagram-api` does NOT exist yet (Plan 41-02 ships it). The
 * static import throws module-not-found → the whole file fails RED. That is the
 * intended Wave-1 RED — Plan 41-02 turns it GREEN. No production module is created here.
 *
 * Key contracts pinned:
 *   - inside-24h text → messaging_type: 'RESPONSE' (no tag).
 *   - outside-24h text → messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT'.
 *   - NO `messaging_product` field anywhere in the body (that is a WhatsApp Cloud API
 *     thing — Pitfall: IG/Messenger must never set it). Asserted on the raw body string.
 *   - image → attachment {type:'image', payload:{url, is_reusable:true}} — NO caption field.
 *   - IGSID is forwarded as a STRING verbatim, even when it exceeds Number.MAX_SAFE_INTEGER
 *     (never Number-coerced — Pitfall 3 / 41-RESEARCH §Pitfalls).
 *   - getInstagramUserName hits the DIRECT edge GET /{IGSID}?fields=name,username and
 *     returns the name (or @username), null on failure (best-effort — simpler than FB).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { META_BASE_URL } from '@/lib/meta/constants'
import {
  sendInstagramText,
  sendInstagramImage,
  getInstagramUserName,
} from '@/lib/meta/instagram-api'

const TOKEN = 'PAGE_TOKEN_decrypted'
// IG rides the SAME Page → recipient sends still POST to /{pageId}/messages with the Page token.
const PAGE_ID = '102938475610293'
// An IGSID larger than Number.MAX_SAFE_INTEGER (9007199254740991) — must survive as a
// string verbatim; Number()-coercing it would silently corrupt the recipient.
const IGSID = '17841400000000000000'

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
    json: async () => ({ message_id: 'm_IG.1', recipient_id: IGSID }),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('sendInstagramText (IG-02) — inside 24h → RESPONSE', () => {
  it('POSTs { messaging_type:RESPONSE, recipient:{id:IGSID}, message:{text} } to /{pageId}/messages with Bearer', async () => {
    await sendInstagramText(TOKEN, PAGE_ID, IGSID, 'Hola 👋')

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PAGE_ID}/messages`)
    expect((lastCall()[1] as RequestInit).method).toBe('POST')
    expect(lastAuthHeader()).toBe(`Bearer ${TOKEN}`)
    expect(lastBody()).toEqual({
      messaging_type: 'RESPONSE',
      recipient: { id: IGSID },
      message: { text: 'Hola 👋' },
    })
  })

  it('NEVER places a messaging_product field on the wire (that is WhatsApp-only)', async () => {
    await sendInstagramText(TOKEN, PAGE_ID, IGSID, 'sin campo de WhatsApp Cloud')

    // The serialized body must NOT carry messaging_product (a WhatsApp Cloud API field).
    expect(lastRawBody()).not.toContain('messaging_product')
    expect(lastBody()).not.toHaveProperty('messaging_product')
  })

  it('forwards the IGSID as a STRING verbatim (never Number-coerced — Pitfall 3)', async () => {
    await sendInstagramText(TOKEN, PAGE_ID, IGSID, 'precision check')

    // The exact IGSID string must appear on the wire with no precision loss.
    expect(lastRawBody()).toContain(`"${IGSID}"`)
    expect((lastBody().recipient as { id: unknown }).id).toBe(IGSID)
    expect((lastBody().recipient as { id: unknown }).id).not.toBe(Number(IGSID))
  })

  it('NEVER emits a RESPONSE-arm tag (no message tag when inside the window)', async () => {
    await sendInstagramText(TOKEN, PAGE_ID, IGSID, 'sin tag')
    expect(lastBody()).not.toHaveProperty('tag')
    expect(lastBody().messaging_type).toBe('RESPONSE')
  })
})

describe('sendInstagramText (IG-02) — outside 24h → MESSAGE_TAG / HUMAN_AGENT', () => {
  it('POSTs { messaging_type:MESSAGE_TAG, tag:HUMAN_AGENT, recipient, message } when given the HUMAN_AGENT tag', async () => {
    await sendInstagramText(TOKEN, PAGE_ID, IGSID, 'Seguimos disponibles 🙂', 'HUMAN_AGENT')

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PAGE_ID}/messages`)
    expect(lastBody()).toEqual({
      messaging_type: 'MESSAGE_TAG',
      tag: 'HUMAN_AGENT',
      recipient: { id: IGSID },
      message: { text: 'Seguimos disponibles 🙂' },
    })
  })

  it('still omits messaging_product on the HUMAN_AGENT path', async () => {
    await sendInstagramText(TOKEN, PAGE_ID, IGSID, 'tag check', 'HUMAN_AGENT')

    expect(lastBody().tag).toBe('HUMAN_AGENT')
    expect(lastRawBody()).not.toContain('messaging_product')
  })
})

describe('sendInstagramImage (IG-02) — attachment shape, NO caption field', () => {
  it('POSTs the image attachment with payload { url, is_reusable:true } and no caption', async () => {
    await sendInstagramImage(TOKEN, PAGE_ID, IGSID, 'https://cdn.example/x.jpg')

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PAGE_ID}/messages`)
    expect(lastBody()).toEqual({
      messaging_type: 'RESPONSE',
      recipient: { id: IGSID },
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
    // And still never messaging_product.
    expect(lastRawBody()).not.toContain('messaging_product')
  })

  it('places the HUMAN_AGENT tag on the image send when outside the window', async () => {
    await sendInstagramImage(TOKEN, PAGE_ID, IGSID, 'https://cdn.example/y.jpg', 'HUMAN_AGENT')

    expect(lastBody()).toMatchObject({
      messaging_type: 'MESSAGE_TAG',
      tag: 'HUMAN_AGENT',
      recipient: { id: IGSID },
      message: { attachment: { type: 'image', payload: { is_reusable: true } } },
    })
  })
})

describe('getInstagramUserName (IG-03 / D-IG-05) — direct edge, best-effort', () => {
  it('GETs /{IGSID}?fields=name,username with Bearer and returns the name', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'Ana Pérez', username: 'ana.perez' }),
    })

    const name = await getInstagramUserName(TOKEN, IGSID)

    expect(lastUrl()).toBe(`${META_BASE_URL}/${IGSID}?fields=name,username`)
    expect(lastAuthHeader()).toBe(`Bearer ${TOKEN}`)
    expect(name).toBe('Ana Pérez')
  })

  it('falls back to @username when name is absent', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: 'ana.perez' }),
    })

    const name = await getInstagramUserName(TOKEN, IGSID)
    expect(name).toBe('@ana.perez')
  })

  it('degrades gracefully (returns null, never throws) on fetch failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'profile unavailable', code: 100 } }),
    })

    // Best-effort: must NOT throw — returns null so the caller falls back to IG-${igsid}.
    const name = await getInstagramUserName(TOKEN, IGSID)
    expect(name).toBeNull()
  })
})
