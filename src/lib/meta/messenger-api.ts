// ============================================================================
// Meta Messenger Send API (Graph v22.0)
// Send edge for the Facebook Messenger Direct channel (FB-02).
//
// Mirrors the WhatsApp send helpers in src/lib/meta/api.ts but adapted for the
// Messenger Send API:
//   - endpoint: POST /{pageId}/messages (Bearer = Page Access Token)
//   - recipient identity: PSID (Page-Scoped ID) — a STRING, NEVER Number-coerced
//     (a PSID can exceed Number.MAX_SAFE_INTEGER — Pitfall 5).
//   - response shape: { message_id, recipient_id } (NOT { messages: [{ id }] }).
//   - in-window sends use messaging_type 'RESPONSE'; out-of-window sends use
//     messaging_type 'MESSAGE_TAG' with the ONLY emittable tag 'HUMAN_AGENT'.
//     The message tags removed by Meta on 2026-04-27 (→ error 100) are NEVER
//     referenced — HUMAN_AGENT is the single tag this module can emit.
//
// The access token is passed only to metaRequest as the Bearer arg — never logged
// (T-40-IL / T-40-02-01).
// ============================================================================

import { metaRequest } from './api'

/** The only Messenger message tag MorfX ever emits (T-40-02-03). */
export type MessengerTag = 'HUMAN_AGENT'

interface MessengerSendResponse {
  message_id: string
  recipient_id: string
}

/**
 * User profile fields fetched best-effort via the Graph user-profile edge (D-04).
 * `profile_pic` may be absent (Assumption A2) — every field is optional.
 */
export interface MessengerUserProfile {
  first_name?: string
  last_name?: string
  profile_pic?: string
}

/**
 * Send a Messenger text message via the Graph Send API (FB-02).
 *
 * Inside the 24h window → messaging_type 'RESPONSE' (no tag).
 * Outside the window → pass tag 'HUMAN_AGENT' → messaging_type 'MESSAGE_TAG'.
 *
 * @param accessToken - Page Access Token (decrypted) — passed only to metaRequest, never logged.
 * @param pageId - The sending Page ID.
 * @param psid - Page-Scoped recipient ID — a STRING, forwarded verbatim (never Number-coerced).
 * @param text - Message body.
 * @param tag - Optional HUMAN_AGENT tag for out-of-window sends.
 */
export async function sendMessengerText(
  accessToken: string,
  pageId: string,
  psid: string,
  text: string,
  tag?: MessengerTag
) {
  const body = tag
    ? {
        messaging_type: 'MESSAGE_TAG',
        tag: 'HUMAN_AGENT',
        recipient: { id: psid },
        message: { text },
      }
    : {
        messaging_type: 'RESPONSE',
        recipient: { id: psid },
        message: { text },
      }

  return metaRequest<MessengerSendResponse>(accessToken, `/${pageId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Send a Messenger image attachment via the Graph Send API (FB-02).
 *
 * The image payload has NO caption field — a caption is sent as a SEPARATE
 * follow-up text by the caller (image-as-followup parity: caption sent as a
 * separate follow-up text).
 *
 * @param accessToken - Page Access Token (decrypted) — passed only to metaRequest, never logged.
 * @param pageId - The sending Page ID.
 * @param psid - Page-Scoped recipient ID — a STRING, forwarded verbatim (never Number-coerced).
 * @param imageUrl - Public URL of the image (is_reusable so Meta caches the attachment).
 * @param tag - Optional HUMAN_AGENT tag for out-of-window sends.
 */
export async function sendMessengerImage(
  accessToken: string,
  pageId: string,
  psid: string,
  imageUrl: string,
  tag?: MessengerTag
) {
  const body = {
    messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE',
    ...(tag ? { tag: 'HUMAN_AGENT' } : {}),
    recipient: { id: psid },
    message: {
      attachment: {
        type: 'image',
        payload: { url: imageUrl, is_reusable: true },
      },
    },
  }

  return metaRequest<MessengerSendResponse>(accessToken, `/${pageId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Send a non-image Messenger attachment (audio / video / file) via the Graph Send
 * API (40-08 follow-up). Same envelope as sendMessengerImage but with the caller's
 * attachment `type` — Meta's Send API accepts `image|audio|video|file`. A caption,
 * when present, is sent as a SEPARATE follow-up text by the caller (attachments have
 * no caption field — parity with the image-as-followup path).
 *
 * @param accessToken - Page Access Token (decrypted) — passed only to metaRequest, never logged.
 * @param pageId - The sending Page ID.
 * @param psid - Page-Scoped recipient ID — a STRING, forwarded verbatim (never Number-coerced).
 * @param attachmentType - 'audio' | 'video' | 'file' (Meta Send API attachment types).
 * @param url - Public URL of the media (is_reusable so Meta caches the attachment).
 * @param tag - Optional HUMAN_AGENT tag for out-of-window sends.
 */
export async function sendMessengerAttachment(
  accessToken: string,
  pageId: string,
  psid: string,
  attachmentType: 'audio' | 'video' | 'file',
  url: string,
  tag?: MessengerTag
) {
  const body = {
    messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE',
    ...(tag ? { tag: 'HUMAN_AGENT' } : {}),
    recipient: { id: psid },
    message: {
      attachment: {
        type: attachmentType,
        payload: { url, is_reusable: true },
      },
    },
  }

  return metaRequest<MessengerSendResponse>(accessToken, `/${pageId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Best-effort fetch of a Messenger user profile (FB-02 / D-04).
 *
 * GET /{psid}?fields=first_name,last_name,profile_pic with Bearer.
 * NEVER throws — degrades gracefully to {} on any failure (Assumption A2:
 * profile may be unavailable / profile_pic absent).
 *
 * NOTE (40-08 live): the direct user-profile edge `GET /{psid}` returns error
 * 100/subcode 33 for Page tokens that lack `pages_read_engagement` (even when the
 * app has it approved — the grant must be in the TOKEN). Prefer
 * `getMessengerUserName` (the conversations edge) which resolves the display name
 * with only `pages_messaging`. Kept for completeness / future use.
 *
 * @param accessToken - Page Access Token (decrypted) — passed only to metaRequest, never logged.
 * @param psid - Page-Scoped ID — a STRING, used verbatim in the path.
 */
export async function getMessengerUserProfile(
  accessToken: string,
  psid: string
): Promise<MessengerUserProfile> {
  try {
    return await metaRequest<MessengerUserProfile>(
      accessToken,
      `/${psid}?fields=first_name,last_name,profile_pic`
    )
  } catch {
    return {}
  }
}

/**
 * Resolve a Messenger user's DISPLAY NAME via the page conversations edge (40-08 fix).
 *
 * The direct user-profile API (`GET /{psid}`) fails with error 100/subcode 33 for
 * Page tokens without `pages_read_engagement`. But
 * `GET /{pageId}/conversations?platform=messenger&user_id={psid}&fields=participants`
 * returns the participant `name` with only `pages_messaging` (verified live —
 * returned "Jose Romero" for the real test thread). Best-effort: returns null on
 * any failure or when no participant matches the PSID.
 *
 * @param accessToken - Page Access Token (decrypted) — passed only to metaRequest, never logged.
 * @param pageId - The receiving Page ID.
 * @param psid - Page-Scoped recipient ID — a STRING, matched against participant.id.
 */
export async function getMessengerUserName(
  accessToken: string,
  pageId: string,
  psid: string
): Promise<string | null> {
  try {
    const res = await metaRequest<{
      data?: Array<{ participants?: { data?: Array<{ id?: string; name?: string }> } }>
    }>(
      accessToken,
      `/${pageId}/conversations?platform=messenger&user_id=${psid}&fields=participants`
    )
    for (const conv of res.data ?? []) {
      const p = conv.participants?.data?.find((x) => x.id === psid)
      if (p?.name) return p.name
    }
    return null
  } catch {
    return null
  }
}
