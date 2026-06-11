// ============================================================================
// Meta Graph API Client
// Typed wrapper around fetch with pinned API version.
// All endpoints are relative to META_BASE_URL.
// ============================================================================

import { META_BASE_URL } from './constants'
import { MetaGraphApiError } from './types'
import type { MetaApiError } from './types'

// ----------------------------------------------------------------------------
// Generic request
// ----------------------------------------------------------------------------

/**
 * Make a typed request to Meta Graph API.
 * Automatically sets Authorization Bearer and Content-Type headers.
 * Throws MetaGraphApiError on non-ok responses with parsed error codes.
 *
 * @param accessToken - Meta access token (decrypted)
 * @param endpoint - Path starting with `/` (e.g., `/${phoneNumberId}/messages`)
 * @param options - Standard RequestInit (method, body, headers override)
 */
export async function metaRequest<T>(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${META_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    const err = (data as MetaApiError).error
    throw new MetaGraphApiError(
      err?.message || `Meta API error: ${response.status}`,
      err?.code,
      err?.error_subcode,
      response.status,
      err?.fbtrace_id,
      err?.error_data?.details
    )
  }

  return data as T
}

// ----------------------------------------------------------------------------
// WhatsApp convenience methods
// ----------------------------------------------------------------------------

/**
 * Send a WhatsApp text message via Meta Cloud API.
 */
export async function sendWhatsAppText(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  text: string
) {
  return metaRequest<{
    messaging_product: string
    contacts: Array<{ wa_id: string }>
    messages: Array<{ id: string }>
  }>(accessToken, `/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  })
}

/**
 * Send a WhatsApp template message via Meta Cloud API.
 */
export async function sendWhatsAppTemplate(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string = 'es',
  components?: unknown[]
) {
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  }
  if (components) template.components = components

  return metaRequest(accessToken, `/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template,
    }),
  })
}

/**
 * Send a WhatsApp media message (image/video/audio/document/sticker) via Meta Cloud API.
 *
 * Mirrors the proven 360dialog `sendMediaMessage` payload gating (whatsapp/api.ts:95-127):
 *   - `caption` is only attached for image/video/document (audio/sticker NEVER carry it — Pitfall 4).
 *   - `filename` is only attached for document.
 * Media is referenced by public `link` (hosted-URL path); for uploaded media use a separate id path.
 *
 * @param accessToken - Meta access token (decrypted) — passed only to metaRequest, never logged (T-39-01).
 * @param phoneNumberId - Sending phone number ID
 * @param to - Recipient phone in E.164 format
 * @param type - Media type (image, video, audio, document, sticker)
 * @param link - Public URL of the media file
 * @param caption - Optional caption (ignored for audio/sticker)
 * @param filename - Optional filename (only used for document)
 */
export async function sendWhatsAppMedia(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker',
  link: string,
  caption?: string,
  filename?: string
) {
  const mediaObject: Record<string, unknown> = { link }

  // Caption only for types that support it (Pitfall 4 — mirror 360dialog gating).
  if (caption && ['image', 'video', 'document'].includes(type)) {
    mediaObject.caption = caption
  }

  // Filename only for documents.
  if (filename && type === 'document') {
    mediaObject.filename = filename
  }

  return metaRequest<{
    messaging_product: string
    contacts?: Array<{ wa_id: string }>
    messages?: Array<{ id: string }>
  }>(accessToken, `/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type,
      [type]: mediaObject,
    }),
  })
}

/**
 * Send a WhatsApp interactive message (buttons or list) via Meta Cloud API.
 *
 * The `interactive` object is passed through the Graph envelope verbatim — the clamp logic
 * (≤3 buttons / ≤20 title / ≤10 sections / ≤24 row title) lives in `metaWhatsappSender`
 * (src/lib/channels/meta-whatsapp-sender.ts), keeping this helper a thin envelope mirror.
 *
 * @param accessToken - Meta access token (decrypted) — passed only to metaRequest, never logged (T-39-01).
 * @param phoneNumberId - Sending phone number ID
 * @param to - Recipient phone in E.164 format
 * @param interactive - Pre-built interactive object (type 'button' or 'list')
 */
export async function sendWhatsAppInteractive(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  interactive: Record<string, unknown>
) {
  return metaRequest<{
    messaging_product: string
    contacts?: Array<{ wa_id: string }>
    messages?: Array<{ id: string }>
  }>(accessToken, `/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    }),
  })
}

/**
 * Mark an inbound WhatsApp message as read (read receipt) via Meta Cloud API.
 * Mirrors the 360dialog `markMessageAsRead` payload (whatsapp/api.ts:308-320).
 *
 * @param accessToken - Meta access token (decrypted) — passed only to metaRequest, never logged (T-39-01).
 * @param phoneNumberId - Sending phone number ID
 * @param wamid - WhatsApp message ID (wamid) of the inbound message to mark read
 */
export async function markWhatsAppRead(
  accessToken: string,
  phoneNumberId: string,
  wamid: string
) {
  return metaRequest(accessToken, `/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: wamid,
    }),
  })
}

/**
 * Verify an access token is still valid by fetching WABA info.
 * Returns true if token works, false otherwise.
 */
export async function verifyToken(
  accessToken: string,
  wabaId: string
): Promise<boolean> {
  try {
    await metaRequest(accessToken, `/${wabaId}?fields=id,name`)
    return true
  } catch {
    return false
  }
}
