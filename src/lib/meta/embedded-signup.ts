// SERVER-ONLY: uses META_APP_SECRET; never import into a 'use client' module.
// ============================================================================
// Embedded Signup helpers (Phase 38 — SIGNUP-02 / SIGNUP-03)
//
// Turns a popup `{ code }` into a Business Integration System User Access Token
// (BISUAT) and auto-subscribes the workspace's WhatsApp Business Account (WABA)
// to our webhook app.
//
// Security (T-38-12): the code→token exchange carries META_APP_SECRET in the
// query string and MUST run server-side only. This module is server-only — it
// is never imported by a 'use client' component. The exchange uses a DEDICATED
// unauthenticated fetch (NOT metaRequest), because metaRequest always sets an
// Authorization Bearer header and the OAuth exchange must carry NO Bearer
// (Pitfall 6 / T-38-03).
//
// BISUAT note (Pitfall 9): the authorization code is single-use (~10 min TTL),
// so the caller must exchange it immediately on receipt. The returned BISUAT
// has no expiry but can be invalidated by the user.
// ============================================================================

import { metaRequest } from './api'
import { META_BASE_URL } from './constants'
import { verifyToken } from './api'

/**
 * Exchange a single-use Embedded Signup authorization code for a long-lived
 * Business Integration System User Access Token (BISUAT).
 *
 * DEDICATED unauthenticated fetch (Pitfall 6): the OAuth exchange must NOT
 * carry an Authorization/Bearer header. No `redirect_uri` is sent for the
 * Embedded Signup flow (RESEARCH A1).
 *
 * @param code - single-use authorization code from the popup result
 * @returns the BISUAT (access_token)
 * @throws if the response is not ok or carries no access_token
 */
export async function exchangeCodeForBisuat(code: string): Promise<string> {
  const url =
    `${META_BASE_URL}/oauth/access_token` +
    `?client_id=${process.env.META_APP_ID}` +
    `&client_secret=${process.env.META_APP_SECRET}` +
    `&code=${encodeURIComponent(code)}`

  // No auth header (Pitfall 6 / T-38-03) — dedicated unauthenticated fetch.
  const res = await fetch(url)
  const data = await res.json()

  if (!res.ok || !data.access_token) {
    throw new Error(`exchange failed: ${JSON.stringify(data)}`)
  }

  return data.access_token as string // BISUAT — no expiry, can be invalidated
}

/**
 * Subscribe a WABA to our webhook app so inbound messages are delivered.
 * REUSES metaRequest (Bearer = BISUAT) — auth IS required here.
 *
 * @param bisuat - the BISUAT obtained from exchangeCodeForBisuat
 * @param wabaId - the WhatsApp Business Account id
 * @throws if the API does not return `success: true`
 */
export async function subscribeWaba(bisuat: string, wabaId: string): Promise<void> {
  const r = await metaRequest<{ success: boolean }>(
    bisuat,
    `/${wabaId}/subscribed_apps`,
    { method: 'POST' }
  )
  if (!r.success) {
    throw new Error('subscribed_apps did not return success:true')
  }
}

/**
 * Register a phone number on Cloud API (RESEARCH Pattern 6 / A5).
 * Only needed if the number is not yet registered after subscribing
 * (try-subscribe-first per RESEARCH Open Q4). The caller wraps this in
 * try/catch so a register failure surfaces a clear error.
 *
 * @param bisuat - the BISUAT
 * @param phoneNumberId - the phone number id to register
 * @param pin - the 6-digit two-step verification PIN
 */
export async function registerPhoneNumber(
  bisuat: string,
  phoneNumberId: string,
  pin: string
): Promise<void> {
  const r = await metaRequest<{ success: boolean }>(
    bisuat,
    `/${phoneNumberId}/register`,
    {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    }
  )
  if (!r.success) {
    throw new Error('register did not return success:true')
  }
}

/**
 * Validate a BISUAT against a WABA after exchange. Delegates to verifyToken
 * (api.ts) — returns true if the token can read the WABA, false otherwise.
 */
export async function healthCheck(bisuat: string, wabaId: string): Promise<boolean> {
  return verifyToken(bisuat, wabaId)
}
