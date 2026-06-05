// ============================================================================
// Meta Instagram Send API (Graph v22.0)
// Send edge for the Instagram Direct channel (IG-02).
//
// IG rides the SAME Messenger Platform via the connected Page, so the endpoint,
// token, and envelope are IDENTICAL to FB Messenger (clone of messenger-api.ts):
//   - endpoint: POST /{pageId}/messages (Bearer = Page Access Token).
//   - recipient identity: IGSID (Instagram-Scoped ID) — a STRING, NEVER
//     Number-coerced (an IGSID can exceed Number.MAX_SAFE_INTEGER — Pitfall 3).
//   - response shape: { message_id, recipient_id } (NOT { messages: [{ id }] }).
//   - in-window sends use messaging_type 'RESPONSE'; out-of-window sends use
//     messaging_type 'MESSAGE_TAG' with the ONLY emittable tag 'HUMAN_AGENT'
//     (same as FB — IG supports ONLY HUMAN_AGENT).
//   - NO `messaging_product` field anywhere (that is a WhatsApp Cloud API thing —
//     IG/Messenger must never set it).
//
// The only IG divergence vs FB is the SIMPLER display-name edge:
// getInstagramUserName hits the DIRECT edge GET /{IGSID}?fields=name,username
// (vs FB's conversations-edge workaround).
//
// The access token is passed only to metaRequest as the Bearer arg — never logged
// (T-41-02-01).
// ============================================================================

import { metaRequest } from './api'

/** The only Instagram message tag MorfX ever emits (same as FB — T-41-02). */
export type InstagramTag = 'HUMAN_AGENT'

interface InstagramSendResponse {
  message_id?: string
  recipient_id?: string
}

/**
 * Send an Instagram Direct text message via the Graph Send API (IG-02).
 *
 * Inside the 24h window → messaging_type 'RESPONSE' (no tag).
 * Outside the window → pass tag 'HUMAN_AGENT' → messaging_type 'MESSAGE_TAG'.
 *
 * @param accessToken - Page Access Token (decrypted) — passed only to metaRequest, never logged.
 * @param pageId - The sending Page ID (IG rides the connected Page).
 * @param igsid - Instagram-Scoped recipient ID — a STRING, forwarded verbatim (never Number-coerced).
 * @param text - Message body.
 * @param tag - Optional HUMAN_AGENT tag for out-of-window sends.
 */
export async function sendInstagramText(
  accessToken: string,
  pageId: string,
  igsid: string,
  text: string,
  tag?: InstagramTag
) {
  const body = tag
    ? {
        messaging_type: 'MESSAGE_TAG',
        tag: 'HUMAN_AGENT',
        recipient: { id: igsid },
        message: { text },
      }
    : {
        messaging_type: 'RESPONSE',
        recipient: { id: igsid },
        message: { text },
      }

  return metaRequest<InstagramSendResponse>(accessToken, `/${pageId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Send an Instagram Direct image attachment via the Graph Send API (IG-02).
 *
 * The image payload has NO caption field — a caption is sent as a SEPARATE
 * follow-up text by the caller (image-as-followup parity with metaFacebookSender).
 *
 * @param accessToken - Page Access Token (decrypted) — passed only to metaRequest, never logged.
 * @param pageId - The sending Page ID.
 * @param igsid - Instagram-Scoped recipient ID — a STRING, forwarded verbatim (never Number-coerced).
 * @param imageUrl - Public URL of the image (is_reusable so Meta caches the attachment).
 * @param tag - Optional HUMAN_AGENT tag for out-of-window sends.
 */
export async function sendInstagramImage(
  accessToken: string,
  pageId: string,
  igsid: string,
  imageUrl: string,
  tag?: InstagramTag
) {
  const body = {
    messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE',
    ...(tag ? { tag: 'HUMAN_AGENT' } : {}),
    recipient: { id: igsid },
    message: {
      attachment: {
        type: 'image',
        payload: { url: imageUrl, is_reusable: true },
      },
    },
  }

  return metaRequest<InstagramSendResponse>(accessToken, `/${pageId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Send a non-image Instagram attachment (image / video / audio / file) via the
 * Graph Send API (IG-02). Same envelope as sendInstagramImage but with the
 * caller's attachment `type`. A caption, when present, is sent as a SEPARATE
 * follow-up text by the caller (attachments have no caption field — parity with
 * the image-as-followup path).
 *
 * @param accessToken - Page Access Token (decrypted) — passed only to metaRequest, never logged.
 * @param pageId - The sending Page ID.
 * @param igsid - Instagram-Scoped recipient ID — a STRING, forwarded verbatim (never Number-coerced).
 * @param attachmentType - 'image' | 'video' | 'audio' | 'file' (Meta Send API attachment types).
 * @param mediaUrl - Public URL of the media (is_reusable so Meta caches the attachment).
 * @param tag - Optional HUMAN_AGENT tag for out-of-window sends.
 */
export async function sendInstagramAttachment(
  accessToken: string,
  pageId: string,
  igsid: string,
  attachmentType: 'image' | 'video' | 'audio' | 'file',
  mediaUrl: string,
  tag?: InstagramTag
) {
  const body = {
    messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE',
    ...(tag ? { tag: 'HUMAN_AGENT' } : {}),
    recipient: { id: igsid },
    message: {
      attachment: {
        type: attachmentType,
        payload: { url: mediaUrl, is_reusable: true },
      },
    },
  }

  return metaRequest<InstagramSendResponse>(accessToken, `/${pageId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Resolve an Instagram user's DISPLAY NAME via the DIRECT edge (IG-03 / D-IG-05).
 *
 * GET /{IGSID}?fields=name,username with Bearer = Page token. Works with the
 * Page token + instagram_basic + instagram_manage_messages (APPROVED) — SIMPLER
 * than FB's conversations-edge workaround. Best-effort: returns the name (or
 * `@username`), null on any failure so the caller falls back to IG-${igsid}.
 *
 * @param accessToken - Page Access Token (decrypted) — passed only to metaRequest, never logged.
 * @param igsid - Instagram-Scoped ID — a STRING, used verbatim in the path.
 */
export async function getInstagramUserName(
  accessToken: string,
  igsid: string
): Promise<string | null> {
  try {
    const p = await metaRequest<{ name?: string; username?: string }>(
      accessToken,
      `/${igsid}?fields=name,username`
    )
    return p.name?.trim() || (p.username ? `@${p.username}` : null)
  } catch {
    return null
  }
}
