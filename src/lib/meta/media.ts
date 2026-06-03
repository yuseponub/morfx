// ============================================================================
// Phase 39: Meta Cloud API Media Service (WA-06)
// Outbound upload (multipart → media_id), inbound two-step Bearer download,
// and rehost to Supabase Storage (whatsapp-media bucket).
//
// Mirrors the proven 360dialog analogs (Regla 6 — copied, not modified):
//   - download two-step:  src/lib/whatsapp/api.ts `downloadMedia` (:263-296)
//   - rehost to Storage:   src/lib/whatsapp/webhook-handler.ts `downloadAndUploadMedia` (:632-679)
//                          + `getExtensionFromMime` (:684-704)
// Swaps the base URL → Meta Graph + the auth header → Bearer; and (Pitfall 3 / §7)
// SKIPS the 360dialog hostname rewrite — Meta returns the real CDN url, which we
// fetch AS-IS with `Authorization: Bearer` and must download IMMEDIATELY (~5 min expiry).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { META_BASE_URL } from './constants'

// ----------------------------------------------------------------------------
// SSRF + resource-exhaustion guards (T-39-07)
// ----------------------------------------------------------------------------

/**
 * Allowed Meta CDN hosts for the inbound binary GET. The metadata endpoint
 * (`GET /{media_id}`) returns a `url` we then fetch with the Bearer token;
 * asserting the host is a Meta domain before that fetch prevents SSRF.
 */
function assertMetaCdnHost(rawUrl: string): void {
  let host: string
  try {
    host = new URL(rawUrl).hostname.toLowerCase()
  } catch {
    throw new Error('Invalid media url')
  }
  const allowed =
    host === 'lookaside.fbsbx.com' ||
    host.endsWith('.fbsbx.com') ||
    host.endsWith('.facebook.com') ||
    host.endsWith('.fbcdn.net')
  if (!allowed) {
    // Never include the token; the url alone is safe to surface for debugging.
    throw new Error(`Refusing to download media from non-Meta host: ${host}`)
  }
}

/**
 * Per-type documented size caps (bytes). Used to abort oversized downloads.
 * image 5MB, sticker 500KB, audio/video 16MB, document 100MB.
 */
function maxBytesForMime(mime: string): number {
  const MB = 1024 * 1024
  if (mime.startsWith('image/webp')) return 512 * 1024 // sticker
  if (mime.startsWith('image/')) return 5 * MB
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 16 * MB
  return 100 * MB // documents + fallback
}

// ----------------------------------------------------------------------------
// Outbound upload (multipart → media_id)
// ----------------------------------------------------------------------------

/**
 * Upload a media file to Meta's CDN and obtain a reusable `media_id` (WA-06, §6).
 *
 * Uses a dedicated multipart `fetch` — NOT `metaRequest`, which forces
 * `Content-Type: application/json`. `FormData` lets `fetch` set the multipart
 * boundary header itself.
 *
 * For chat media we send by `link` (sendWhatsAppMedia); this upload path is for
 * template header media + large files.
 *
 * @param accessToken - Meta access token (decrypted) — only in the Bearer header, never logged (T-39-01).
 * @param phoneNumberId - Sending phone number ID
 * @param mime - MIME type (e.g. 'image/jpeg')
 * @param file - File bytes as a Blob/File
 * @returns The Meta media id
 */
export async function uploadMedia(
  accessToken: string,
  phoneNumberId: string,
  mime: string,
  file: Blob
): Promise<string> {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', mime)
  form.append('file', file)

  const response = await fetch(`${META_BASE_URL}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: {
      // No Content-Type — fetch sets multipart/form-data boundary from FormData.
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      err?.error?.message || `Media upload failed: ${response.status}`
    )
  }

  const { id } = (await response.json()) as { id: string }
  if (!id) throw new Error('Media upload response missing id')
  return id
}

// ----------------------------------------------------------------------------
// Inbound metadata + two-step Bearer download
// ----------------------------------------------------------------------------

export interface MediaUrlInfo {
  url: string
  mime_type: string
  file_size?: number
  sha256?: string
  id?: string
}

/**
 * Resolve a media id to its (short-lived) CDN url + metadata (WA-06, §7 step 1).
 * `GET /{media_id}` with Bearer.
 */
export async function getMediaUrl(
  accessToken: string,
  mediaId: string
): Promise<MediaUrlInfo> {
  const response = await fetch(`${META_BASE_URL}/${mediaId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      err?.error?.message || `Failed to resolve media url: ${response.status}`
    )
  }

  return (await response.json()) as MediaUrlInfo
}

/**
 * Two-step inbound download (WA-06, §7 / Pitfall 3 — mirror 360dialog `downloadMedia`):
 *   1. GET /{media_id} → { url, mime_type }
 *   2. GET url with Authorization: Bearer (NO hostname rewrite — Meta returns the real CDN url)
 *
 * The CDN url expires ~5 min after issuance, so the caller MUST download immediately.
 * SSRF guard (T-39-07): the url host is asserted to be a Meta CDN domain before the
 * binary GET; the download is capped to the per-type documented size.
 *
 * @param accessToken - Meta access token (decrypted) — only in Bearer headers, never logged (T-39-01).
 * @param mediaId - Media id from the inbound webhook
 * @returns The file buffer + metadata
 */
export async function downloadMedia(
  accessToken: string,
  mediaId: string
): Promise<{ buffer: ArrayBuffer; mimeType: string; filename?: string }> {
  // Step 1: metadata
  const info = await getMediaUrl(accessToken, mediaId)

  // SSRF guard before fetching the (attacker-influenceable in theory) url.
  assertMetaCdnHost(info.url)

  // Step 2: binary — Meta url AS-IS (no lookaside→proxy rewrite), Bearer auth.
  const response = await fetch(info.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`)
  }

  const mimeType = info.mime_type || 'application/octet-stream'

  // Resource-exhaustion guard: reject if the declared size exceeds the cap.
  const cap = maxBytesForMime(mimeType)
  if (typeof info.file_size === 'number' && info.file_size > cap) {
    throw new Error(
      `Media exceeds size cap for ${mimeType} (${info.file_size} > ${cap})`
    )
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > cap) {
    throw new Error(
      `Downloaded media exceeds size cap for ${mimeType} (${buffer.byteLength} > ${cap})`
    )
  }

  const contentDisposition = response.headers?.get?.('content-disposition')
  const filename = contentDisposition?.match(/filename="(.+)"/)?.[1]

  return { buffer, mimeType, filename }
}

// ----------------------------------------------------------------------------
// Rehost to Supabase Storage (whatsapp-media bucket)
// ----------------------------------------------------------------------------

/**
 * Map MIME type to file extension.
 * Copied verbatim from webhook-handler.ts `getExtensionFromMime` (:684-704) (Regla 6).
 */
function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'audio/aac': '.aac',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/amr': '.amr',
    'audio/opus': '.opus',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'text/plain': '.txt',
  }
  return map[mimeType] || ''
}

/**
 * Download inbound Meta CDN media and re-host it on Supabase Storage (WA-06).
 * Returns null if download/upload fails (caller should save the message without media).
 *
 * Mirrors `downloadAndUploadMedia` (webhook-handler.ts:632-679): path
 * `inbound/{ws}/{conv}/{ts}_{safeName}`, `upsert:false`, returns `getPublicUrl`.
 *
 * @param accessToken - Meta access token (decrypted) — never logged (T-39-01).
 * @param mediaId - Media id from the inbound webhook
 * @param workspaceId - Owning workspace
 * @param conversationId - Owning conversation
 * @param mimeType - Optional MIME hint (falls back to the metadata value)
 */
export async function downloadAndRehostMedia(
  accessToken: string,
  mediaId: string,
  workspaceId: string,
  conversationId: string,
  mimeType?: string
): Promise<{ url: string; mimeType: string; filename?: string } | null> {
  console.log('[meta-media] Attempting media download:', {
    mediaId,
    workspaceId,
    hasToken: !!accessToken,
  })
  try {
    const media = await downloadMedia(accessToken, mediaId)
    console.log('[meta-media] Media downloaded:', {
      mimeType: media.mimeType,
      size: media.buffer.byteLength,
      hasFilename: !!media.filename,
    })

    const effectiveMime =
      media.mimeType || mimeType || 'application/octet-stream'
    const ext = getExtensionFromMime(effectiveMime)
    const safeName = media.filename
      ? media.filename
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_')
      : `${mediaId}${ext}`
    const filePath = `inbound/${workspaceId}/${conversationId}/${Date.now()}_${safeName}`

    const supabase = createAdminClient()
    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, Buffer.from(media.buffer), {
        contentType: effectiveMime,
        upsert: false,
      })

    if (uploadError) {
      console.error('[meta-media] Media upload failed:', {
        step: 'upload',
        error: uploadError.message,
        filePath,
      })
      return null
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath)

    console.log('[meta-media] Media uploaded:', { filePath, publicUrl })

    return {
      url: publicUrl,
      mimeType: effectiveMime,
      filename: media.filename || undefined,
    }
  } catch (error) {
    console.error('[meta-media] Media step failed:', {
      step: 'download',
      error: error instanceof Error ? error.message : error,
      mediaId,
    })
    return null
  }
}
