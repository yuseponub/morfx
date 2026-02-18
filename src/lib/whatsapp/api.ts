// ============================================================================
// Phase 7: 360dialog API Client
// Send messages and manage media via 360dialog Cloud API
// ============================================================================

import type {
  Send360Response,
  Send360Error,
  MediaUrlResponse,
} from './types'

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_URL = 'https://waba-v2.360dialog.io'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Make a request to 360dialog API.
 */
async function request<T>(
  apiKey: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'D360-API-KEY': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    const error = data as Send360Error
    throw new Error(
      error.error?.message || `360dialog API error: ${response.status}`
    )
  }

  return data as T
}

// ============================================================================
// SEND MESSAGE FUNCTIONS
// ============================================================================

/**
 * Send a text message via 360dialog.
 *
 * @param apiKey - 360dialog API key
 * @param to - Recipient phone in E.164 format (e.g., +573001234567)
 * @param text - Message text body
 * @returns Send response with message ID
 */
export async function sendTextMessage(
  apiKey: string,
  to: string,
  text: string
): Promise<Send360Response> {
  return request<Send360Response>(apiKey, '/messages', {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: text,
      },
    }),
  })
}

/**
 * Send a media message via 360dialog.
 *
 * @param apiKey - 360dialog API key
 * @param to - Recipient phone in E.164 format
 * @param type - Media type (image, video, audio, document, sticker)
 * @param mediaUrl - Public URL of the media file
 * @param caption - Optional caption (not for audio/sticker)
 * @param filename - Optional filename (for documents)
 * @returns Send response with message ID
 */
export async function sendMediaMessage(
  apiKey: string,
  to: string,
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker',
  mediaUrl: string,
  caption?: string,
  filename?: string
): Promise<Send360Response> {
  const mediaObject: Record<string, unknown> = {
    link: mediaUrl,
  }

  // Add caption for types that support it
  if (caption && ['image', 'video', 'document'].includes(type)) {
    mediaObject.caption = caption
  }

  // Add filename for documents
  if (filename && type === 'document') {
    mediaObject.filename = filename
  }

  return request<Send360Response>(apiKey, '/messages', {
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
 * Send a template message via 360dialog.
 * Required when the 24h window is closed.
 *
 * @param apiKey - 360dialog API key
 * @param to - Recipient phone in E.164 format
 * @param templateName - Template name
 * @param languageCode - Language code (e.g., 'es')
 * @param components - Optional template components
 * @returns Send response with message ID
 */
export async function sendTemplateMessage(
  apiKey: string,
  to: string,
  templateName: string,
  languageCode: string = 'es',
  components?: Array<{
    type: 'header' | 'body' | 'button'
    parameters?: Array<{
      type: 'text' | 'image' | 'document' | 'video'
      text?: string
      image?: { link: string }
      document?: { link: string }
      video?: { link: string }
    }>
  }>
): Promise<Send360Response> {
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
    },
  }

  if (components) {
    (payload.template as Record<string, unknown>).components = components
  }

  return request<Send360Response>(apiKey, '/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Send an interactive message with buttons.
 *
 * @param apiKey - 360dialog API key
 * @param to - Recipient phone in E.164 format
 * @param body - Message body text
 * @param buttons - Array of button options (max 3)
 * @param header - Optional header text
 * @param footer - Optional footer text
 * @returns Send response with message ID
 */
export async function sendButtonMessage(
  apiKey: string,
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  header?: string,
  footer?: string
): Promise<Send360Response> {
  const interactive: Record<string, unknown> = {
    type: 'button',
    body: { text: body },
    action: {
      buttons: buttons.slice(0, 3).map((btn) => ({
        type: 'reply',
        reply: {
          id: btn.id,
          title: btn.title.slice(0, 20), // Max 20 chars
        },
      })),
    },
  }

  if (header) {
    interactive.header = { type: 'text', text: header }
  }

  if (footer) {
    interactive.footer = { text: footer }
  }

  return request<Send360Response>(apiKey, '/messages', {
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

// ============================================================================
// MEDIA FUNCTIONS
// ============================================================================

/**
 * Get the download URL for a media file.
 * 360dialog media URLs expire after 5 minutes.
 *
 * @param apiKey - 360dialog API key
 * @param mediaId - Media ID from incoming message
 * @returns Media URL and metadata
 */
export async function getMediaUrl(
  apiKey: string,
  mediaId: string
): Promise<MediaUrlResponse> {
  return request<MediaUrlResponse>(apiKey, `/${mediaId}`, {
    method: 'GET',
  })
}

/**
 * Download media file content.
 * Use this to store media permanently before the URL expires.
 *
 * @param apiKey - 360dialog API key
 * @param mediaId - Media ID from incoming message
 * @returns Media file as ArrayBuffer and metadata
 */
export async function downloadMedia(
  apiKey: string,
  mediaId: string
): Promise<{ buffer: ArrayBuffer; mimeType: string; filename?: string }> {
  // First get the URL
  const mediaInfo = await getMediaUrl(apiKey, mediaId)

  // 360dialog requires replacing Facebook CDN hostname with their proxy
  const downloadUrl = mediaInfo.url.replace(
    'https://lookaside.fbsbx.com',
    BASE_URL
  )

  // Then download the actual file through 360dialog proxy
  const response = await fetch(downloadUrl, {
    headers: {
      'D360-API-KEY': apiKey,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const contentDisposition = response.headers.get('content-disposition')
  const filename = contentDisposition?.match(/filename="(.+)"/)?.[1]

  return {
    buffer,
    mimeType: mediaInfo.mime_type,
    filename,
  }
}

// ============================================================================
// MESSAGE STATUS FUNCTIONS
// ============================================================================

/**
 * Mark a message as read (sends read receipt).
 *
 * @param apiKey - 360dialog API key
 * @param messageId - WhatsApp message ID (wamid)
 */
export async function markMessageAsRead(
  apiKey: string,
  messageId: string
): Promise<void> {
  await request(apiKey, '/messages', {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  })
}
