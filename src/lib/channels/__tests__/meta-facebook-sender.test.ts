/**
 * metaFacebookSender creds-object shape + image-as-followup contract (FB-02).
 * Phase 40 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: `metaFacebookSender` from `@/lib/channels/meta-facebook-sender`
 *   (FUTURE — Plan 02 creates it). Per 40-PATTERNS.md it is a thin module the DOMAIN branch
 *   calls directly (NOT registered in the channel-keyed `senders` map — Regla 6) and it takes a
 *   `{ accessToken, pageId }` creds object — NOT an `apiKey` string (mirrors metaWhatsappSender).
 *
 *   - sendText(creds, psid, text, tag?) → forwards the PSID string + optional HUMAN_AGENT tag to
 *     sendMessengerText, unwraps `message_id` → `externalMessageId`.
 *   - sendImage(creds, psid, imageUrl, caption?, tag?) → calls sendMessengerImage, then a FOLLOW-UP
 *     sendMessengerText when a caption is present (Messenger has no native image caption — parity
 *     with manychatFacebookSender), forwarding the same tag.
 *
 * RED STATE: the module does not exist until Plan 02 — `await import(...)` rejects with
 * module-not-found, the intended Wave-1 RED. Each test imports lazily so a missing module
 * produces a clear per-test failure rather than a whole-file collection crash.
 *
 * The underlying meta/messenger-api helpers are mocked so the test inspects what the sender
 * builds/forwards, not a live Graph call.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/meta/messenger-api', () => ({
  // RED-tolerant stubs — these helpers are added in Plan 02; mocking them lets the sender
  // be tested in isolation and keeps the failure a clean per-test module-not-found on the SENDER.
  sendMessengerText: vi.fn().mockResolvedValue({ message_id: 'm_AG.text', recipient_id: 'PSID' }),
  sendMessengerImage: vi.fn().mockResolvedValue({ message_id: 'm_AG.img', recipient_id: 'PSID' }),
  getMessengerUserProfile: vi.fn().mockResolvedValue({}),
}))

const CREDS = { accessToken: 'PAGE_TOKEN_decrypted', pageId: '102938475610293' }
// PSID > Number.MAX_SAFE_INTEGER — must stay a string end-to-end.
const PSID = '24178263901234567'

afterEach(() => {
  vi.clearAllMocks()
})

describe('metaFacebookSender shape (FB-02 / D-08) — creds object {accessToken, pageId} (NOT apiKey)', () => {
  it('exposes a ChannelSender-shaped module with sendText / sendImage', async () => {
    const { metaFacebookSender } = await import('@/lib/channels/meta-facebook-sender')
    expect(typeof metaFacebookSender.sendText).toBe('function')
    expect(typeof metaFacebookSender.sendImage).toBe('function')
  })

  it('sendText forwards { accessToken, pageId } + PSID string and unwraps message_id → externalMessageId', async () => {
    const { metaFacebookSender } = await import('@/lib/channels/meta-facebook-sender')
    const api = await import('@/lib/meta/messenger-api')

    const result = await metaFacebookSender.sendText(CREDS, PSID, 'hola')

    expect(api.sendMessengerText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      PSID,
      'hola',
      undefined
    )
    // PSID forwarded as a string verbatim — never Number-coerced.
    const psidArg = (api.sendMessengerText as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2]
    expect(typeof psidArg).toBe('string')
    expect(psidArg).toBe(PSID)
    // Unwrap message_id → externalMessageId.
    expect(result).toMatchObject({ success: true, externalMessageId: 'm_AG.text' })
  })

  it('sendText forwards an optional HUMAN_AGENT tag to sendMessengerText', async () => {
    const { metaFacebookSender } = await import('@/lib/channels/meta-facebook-sender')
    const api = await import('@/lib/meta/messenger-api')

    await metaFacebookSender.sendText(CREDS, PSID, 'fuera de ventana', 'HUMAN_AGENT')

    expect(api.sendMessengerText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      PSID,
      'fuera de ventana',
      'HUMAN_AGENT'
    )
  })
})

describe('metaFacebookSender.sendImage (FB-02) — image then follow-up caption text', () => {
  it('calls sendMessengerImage, then a FOLLOW-UP sendMessengerText when a caption is present', async () => {
    const { metaFacebookSender } = await import('@/lib/channels/meta-facebook-sender')
    const api = await import('@/lib/meta/messenger-api')

    await metaFacebookSender.sendImage(CREDS, PSID, 'https://cdn.example/x.jpg', 'pie de foto')

    // Image first (no caption field on the attachment payload).
    expect(api.sendMessengerImage).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      PSID,
      'https://cdn.example/x.jpg',
      undefined
    )
    // Caption sent as a SEPARATE follow-up text (image-as-followup parity with manychatFacebookSender).
    expect(api.sendMessengerText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      PSID,
      'pie de foto',
      undefined
    )
  })

  it('does NOT send a follow-up text when no caption is provided', async () => {
    const { metaFacebookSender } = await import('@/lib/channels/meta-facebook-sender')
    const api = await import('@/lib/meta/messenger-api')

    await metaFacebookSender.sendImage(CREDS, PSID, 'https://cdn.example/x.jpg')

    expect(api.sendMessengerImage).toHaveBeenCalledTimes(1)
    expect(api.sendMessengerText).not.toHaveBeenCalled()
  })

  it('forwards the same HUMAN_AGENT tag to both the image and the follow-up caption text', async () => {
    const { metaFacebookSender } = await import('@/lib/channels/meta-facebook-sender')
    const api = await import('@/lib/meta/messenger-api')

    await metaFacebookSender.sendImage(CREDS, PSID, 'https://cdn.example/y.jpg', 'pie', 'HUMAN_AGENT')

    expect(api.sendMessengerImage).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      PSID,
      'https://cdn.example/y.jpg',
      'HUMAN_AGENT'
    )
    expect(api.sendMessengerText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.pageId,
      PSID,
      'pie',
      'HUMAN_AGENT'
    )
  })
})
