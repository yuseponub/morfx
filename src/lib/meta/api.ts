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
      err?.fbtrace_id
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
