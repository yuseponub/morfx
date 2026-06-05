/**
 * metaInstagramSender creds-object shape + image-as-followup contract (IG-02).
 * Phase 41 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: `metaInstagramSender` from `@/lib/channels/meta-instagram-sender`
 *   (FUTURE — Plan 41-02 creates it). Per 41-PATTERNS.md it is a thin module the DOMAIN branch
 *   calls directly (NOT registered in the channel-keyed `senders` map — Regla 6) and it takes a
 *   `{ accessToken, pageId }` creds object — NOT a plain key string (mirrors metaFacebookSender;
 *   IG rides the same Page token + Page id).
 *
 *   - sendText(creds, igsid, text, tag?) → forwards the IGSID string + optional HUMAN_AGENT tag to
 *     sendInstagramText, unwraps `message_id` → `externalMessageId`.
 *   - sendImage(creds, igsid, imageUrl, caption?, tag?) → calls sendInstagramImage, then a FOLLOW-UP
 *     sendInstagramText when a caption is present (IG/Messenger have no native image caption — parity
 *     with the FB sender), forwarding the same tag.
 *   - sendMedia(creds, igsid, mediaType, mediaUrl, caption?, tag?) → routes 'image' → sendImage;
 *     'document' maps to the attachmentType 'file'.
 *
 * RED STATE: the module does not exist until Plan 41-02 — `await import(...)` rejects with
 * module-not-found, the intended Wave-1 RED. Each test imports lazily so a missing module
 * produces a clear per-test failure rather than a whole-file collection crash.
 *
 * The underlying meta/instagram-api helpers are mocked so the test inspects what the sender
 * builds/forwards, not a live Graph call.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/meta/instagram-api', () => ({
  // RED-tolerant stubs — these helpers are added in Plan 41-02; mocking them lets the sender
  // be tested in isolation and keeps the failure a clean per-test module-not-found on the SENDER.
  sendInstagramText: vi.fn().mockResolvedValue({ message_id: 'm_IG.text', recipient_id: 'IGSID' }),
  sendInstagramImage: vi.fn().mockResolvedValue({ message_id: 'm_IG.img', recipient_id: 'IGSID' }),
  sendInstagramAttachment: vi.fn().mockResolvedValue({ message_id: 'm_IG.att' }),
  getInstagramUserName: vi.fn().mockResolvedValue(null),
}))

// creds are { accessToken, pageId } — NOT a plain key string (IG uses the Page token + Page id).
const CREDS = { accessToken: 'PAGE_TOKEN_decrypted', pageId: '102938475610293' }
// IGSID > Number.MAX_SAFE_INTEGER — must stay a string end-to-end.
const IGSID = '17841400000000000000'

afterEach(() => {
  vi.clearAllMocks()
})

describe('metaInstagramSender shape (IG-02 / D-IG-08) — creds object {accessToken, pageId} (not a plain key string)', () => {
  it('exposes a ChannelSender-shaped module with sendText / sendImage / sendMedia', async () => {
    const { metaInstagramSender } = await import('@/lib/channels/meta-instagram-sender')
    expect(typeof metaInstagramSender.sendText).toBe('function')
    expect(typeof metaInstagramSender.sendImage).toBe('function')
    expect(typeof metaInstagramSender.sendMedia).toBe('function')
  })

  it('sendText forwards { accessToken, pageId } + IGSID string and unwraps message_id → externalMessageId', async () => {
    const { metaInstagramSender } = await import('@/lib/channels/meta-instagram-sender')
    const api = await import('@/lib/meta/instagram-api')

    const result = await metaInstagramSender.sendText(CREDS, IGSID, 'hola')

    expect(api.sendInstagramText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      IGSID,
      'hola',
      undefined
    )
    // IGSID forwarded as a string verbatim — never Number-coerced.
    const igsidArg = (api.sendInstagramText as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2]
    expect(typeof igsidArg).toBe('string')
    expect(igsidArg).toBe(IGSID)
    // Unwrap message_id → externalMessageId.
    expect(result).toMatchObject({ success: true, externalMessageId: 'm_IG.text' })
  })

  it('sendText forwards an optional HUMAN_AGENT tag to sendInstagramText', async () => {
    const { metaInstagramSender } = await import('@/lib/channels/meta-instagram-sender')
    const api = await import('@/lib/meta/instagram-api')

    await metaInstagramSender.sendText(CREDS, IGSID, 'fuera de ventana', 'HUMAN_AGENT')

    expect(api.sendInstagramText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      IGSID,
      'fuera de ventana',
      'HUMAN_AGENT'
    )
  })
})

describe('metaInstagramSender.sendImage (IG-02) — image then follow-up caption text', () => {
  it('calls sendInstagramImage, then a FOLLOW-UP sendInstagramText when a caption is present', async () => {
    const { metaInstagramSender } = await import('@/lib/channels/meta-instagram-sender')
    const api = await import('@/lib/meta/instagram-api')

    await metaInstagramSender.sendImage(CREDS, IGSID, 'https://cdn.example/x.jpg', 'pie de foto')

    // Image first (no caption field on the attachment payload).
    expect(api.sendInstagramImage).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      IGSID,
      'https://cdn.example/x.jpg',
      undefined
    )
    // Caption sent as a SEPARATE follow-up text (image-as-followup parity with the FB sender).
    expect(api.sendInstagramText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      IGSID,
      'pie de foto',
      undefined
    )
  })

  it('does NOT send a follow-up text when no caption is provided', async () => {
    const { metaInstagramSender } = await import('@/lib/channels/meta-instagram-sender')
    const api = await import('@/lib/meta/instagram-api')

    await metaInstagramSender.sendImage(CREDS, IGSID, 'https://cdn.example/x.jpg')

    expect(api.sendInstagramImage).toHaveBeenCalledTimes(1)
    expect(api.sendInstagramText).not.toHaveBeenCalled()
  })

  it('forwards the same HUMAN_AGENT tag to both the image and the follow-up caption text', async () => {
    const { metaInstagramSender } = await import('@/lib/channels/meta-instagram-sender')
    const api = await import('@/lib/meta/instagram-api')

    await metaInstagramSender.sendImage(CREDS, IGSID, 'https://cdn.example/y.jpg', 'pie', 'HUMAN_AGENT')

    expect(api.sendInstagramImage).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      IGSID,
      'https://cdn.example/y.jpg',
      'HUMAN_AGENT'
    )
    expect(api.sendInstagramText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      IGSID,
      'pie',
      'HUMAN_AGENT'
    )
  })
})

describe('metaInstagramSender.sendMedia (IG-02) — type routing', () => {
  it("routes mediaType 'image' through sendImage", async () => {
    const { metaInstagramSender } = await import('@/lib/channels/meta-instagram-sender')
    const api = await import('@/lib/meta/instagram-api')

    await metaInstagramSender.sendMedia(CREDS, IGSID, 'image', 'https://cdn.example/z.jpg', 'pie')

    // image media is delivered as an image attachment (with follow-up caption).
    expect(api.sendInstagramImage).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      IGSID,
      'https://cdn.example/z.jpg',
      undefined
    )
    expect(api.sendInstagramText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      IGSID,
      'pie',
      undefined
    )
  })

  it("maps mediaType 'document' to the attachmentType 'file'", async () => {
    const { metaInstagramSender } = await import('@/lib/channels/meta-instagram-sender')
    const api = await import('@/lib/meta/instagram-api')

    await metaInstagramSender.sendMedia(CREDS, IGSID, 'document', 'https://cdn.example/doc.pdf')

    // 'document' is sent via the generic attachment edge with attachmentType 'file'.
    expect(api.sendInstagramAttachment).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      IGSID,
      'file',
      'https://cdn.example/doc.pdf',
      undefined
    )
  })
})
