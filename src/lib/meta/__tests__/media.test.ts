/**
 * Meta Cloud API media contracts (WA-02 media-by-link gating, WA-06 upload + inbound download).
 * Phase 39 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * Contracts under test:
 *   sendWhatsAppMedia(token, pnid, to, type, link, caption?, filename?)  — `@/lib/meta/api` (NEW, WA-02).
 *     caption ∈ {image, video, document}; filename ∈ {document}; audio/sticker carry NEITHER
 *     (RESEARCH Pitfall 4 / §2). Mirrors the proven 360dialog `sendMediaMessage` gating.
 *   uploadMedia(token, pnid, mime, file)  — `@/lib/meta/media` (NEW, WA-06, §6).
 *     multipart POST to /{phoneNumberId}/media with messaging_product=whatsapp, type=<mime>, file=<binary>.
 *     MUST use a dedicated multipart fetch — NOT metaRequest (which forces application/json).
 *   downloadMedia(token, mediaId)  — `@/lib/meta/media` (NEW, WA-06, §7 / Pitfall 3).
 *     two-step: GET /{media_id} → { url } ; then GET url with Authorization: Bearer (NOT a hostname
 *     rewrite — Meta returns the real CDN url, ~5min expiry) → binary for rehost to Supabase Storage.
 *
 * RED STATE: meta/media.ts does not exist and sendWhatsAppMedia is not exported from meta/api.ts yet
 * (Plan 02/06 ship them). The gating tests call an undefined export (throws), and the upload/download
 * tests `await import('@/lib/meta/media')` which rejects module-not-found — both the intended Wave 0 RED.
 * We stub global fetch so once the helpers exist the assertions pin the exact wire shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { META_BASE_URL } from '@/lib/meta/constants'
import {
  // RED: sendWhatsAppMedia is added to meta/api.ts in Plan 02 (WA-02, §2).
  // @ts-expect-error — not yet exported.
  sendWhatsAppMedia,
} from '@/lib/meta/api'

const TOKEN = 'BISUAT_decrypted'
const PNID = '1134593926408063'
const TO = '+573001234567'

let fetchMock: ReturnType<typeof vi.fn>

function jsonBodyOf(callIndex = -1): Record<string, unknown> {
  const init = fetchMock.mock.calls.at(callIndex)![1] as RequestInit
  return JSON.parse(init.body as string)
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [{ id: 'wamid.media.1' }] }),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('sendWhatsAppMedia (WA-02) — caption/filename gating per type (Pitfall 4, §2)', () => {
  it('image carries caption, no filename', async () => {
    await sendWhatsAppMedia(TOKEN, PNID, TO, 'image', 'https://x/p.jpg', 'una foto')
    const body = jsonBodyOf()
    expect(body.type).toBe('image')
    expect(body.image).toEqual({ link: 'https://x/p.jpg', caption: 'una foto' })
  })

  it('video carries caption', async () => {
    await sendWhatsAppMedia(TOKEN, PNID, TO, 'video', 'https://x/v.mp4', 'un video')
    expect((jsonBodyOf().video as Record<string, unknown>)).toMatchObject({
      link: 'https://x/v.mp4',
      caption: 'un video',
    })
  })

  it('document carries BOTH caption and filename', async () => {
    await sendWhatsAppMedia(TOKEN, PNID, TO, 'document', 'https://x/d.pdf', 'factura', 'factura.pdf')
    expect(jsonBodyOf().document).toEqual({
      link: 'https://x/d.pdf',
      caption: 'factura',
      filename: 'factura.pdf',
    })
  })

  it('audio carries NO caption (Meta rejects it)', async () => {
    await sendWhatsAppMedia(TOKEN, PNID, TO, 'audio', 'https://x/a.ogg', 'ignored')
    const audio = jsonBodyOf().audio as Record<string, unknown>
    expect(audio).toEqual({ link: 'https://x/a.ogg' })
    expect(audio).not.toHaveProperty('caption')
  })

  it('sticker carries NO caption', async () => {
    await sendWhatsAppMedia(TOKEN, PNID, TO, 'sticker', 'https://x/s.webp', 'ignored')
    const sticker = jsonBodyOf().sticker as Record<string, unknown>
    expect(sticker).toEqual({ link: 'https://x/s.webp' })
    expect(sticker).not.toHaveProperty('caption')
  })
})

describe('uploadMedia (WA-06) — multipart, NOT metaRequest (§6)', () => {
  it('POSTs multipart/form-data to /{phoneNumberId}/media with messaging_product/type/file and returns media_id', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'MEDIA_ID_777' }) })

    const media = await import('@/lib/meta/media')
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    const id = await media.uploadMedia(TOKEN, PNID, 'image/jpeg', file)

    expect(id).toBe('MEDIA_ID_777')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain(`/${PNID}/media`)

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.method || '').toUpperCase()).toBe('POST')
    // Body is FormData (multipart), NOT a JSON string.
    expect(init.body).toBeInstanceOf(FormData)
    const form = init.body as FormData
    expect(form.get('messaging_product')).toBe('whatsapp')
    expect(form.get('type')).toBe('image/jpeg')
    expect(form.get('file')).toBeTruthy()
    // The Content-Type must NOT be forced to application/json (multipart boundary set by fetch).
    const headers = (init.headers ?? {}) as Record<string, string>
    const ct = headers['Content-Type'] ?? headers['content-type'] ?? ''
    expect(ct).not.toMatch(/application\/json/)
  })
})

describe('downloadMedia inbound (WA-06) — two-step Bearer download (§7, Pitfall 3)', () => {
  it('GETs /{media_id} for the url, then GETs the url with Authorization: Bearer (no hostname rewrite)', async () => {
    const CDN_URL = 'https://lookaside.fbsbx.com/whatsapp_business/attachments/abc?token=z'
    fetchMock
      // step 1: GET /{media_id} → { url, mime_type }
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: CDN_URL, mime_type: 'image/jpeg', id: 'MEDIA_ID_777' }),
      })
      // step 2: GET url (binary)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
        headers: { get: () => null },
      })

    const media = await import('@/lib/meta/media')
    const result = await media.downloadMedia(TOKEN, 'MEDIA_ID_777')

    expect(result.mimeType).toBe('image/jpeg')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // step 1 hits the media-id metadata endpoint with Bearer
    const url1 = String(fetchMock.mock.calls[0][0])
    expect(url1).toContain('/MEDIA_ID_777')
    const init1 = (fetchMock.mock.calls[0][1] || {}) as RequestInit
    expect(JSON.stringify(init1)).toMatch(/Bearer/i)

    // step 2 downloads the real CDN url AS-IS (no lookaside→proxy rewrite) with Bearer auth
    const url2 = String(fetchMock.mock.calls[1][0])
    expect(url2).toBe(CDN_URL)
    expect(url2).toContain('lookaside.fbsbx.com')
    const init2 = (fetchMock.mock.calls[1][1] || {}) as RequestInit
    expect(JSON.stringify(init2)).toMatch(/Bearer/i)
  })
})
