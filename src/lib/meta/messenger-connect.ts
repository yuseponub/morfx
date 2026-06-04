// SERVER-ONLY: uses META_APP_SECRET; never import into a 'use client' module.
// ============================================================================
// Facebook Messenger connect helpers (Phase 40 — SIGNUP-04)
//
// Turns a classic FB-Login result (short-lived user token / OAuth `code`) into a
// never-expiring Page Access Token and subscribes the Page to our webhook app.
//
// This is the DIVERGENT sibling of `embedded-signup.ts`: WhatsApp Embedded Signup
// does ONE OAuth exchange → BISUAT. Facebook Page connect is classic FB Login and
// needs a 3-step chain that does NOT exist in P38:
//
//   1. exchangeForLongLivedUserToken(short) — `grant_type=fb_exchange_token`
//      → long-lived user token (~60d).  (Pitfall 3: a Page token derived from a
//        SHORT-lived user token dies in ~1h — it MUST come from the long-lived one.)
//   2. getPageToken(longLived) — `GET /me/accounts?fields=id,name,access_token`
//      → the Page Access Token (NEVER expires when derived from a long-lived user token).
//   3. subscribeMessengerPage(pageToken, pageId) — POST `/{pageId}/subscribed_apps`
//      with `?subscribed_fields=messages,messaging_postbacks` and the Page token
//      (Pitfall 4: this PER-PAGE subscribe is distinct from the WABA subscribe —
//       forgetting the fields / the Page-level call = zero inbound).
//
// Security (T-40-03-02): the token exchange carries META_APP_SECRET in the query
// string and MUST run server-side only. This module is server-only — never imported
// by a 'use client' component. The OAuth exchange uses a DEDICATED unauthenticated
// fetch (NOT metaRequest), because metaRequest always sets an Authorization Bearer
// header and the OAuth exchange must carry NO Bearer (mirror embedded-signup.ts:44).
//
// Never logs any token (T-40-03-03). A denied IG scope must NOT affect this chain —
// this module only touches the Page (D-02 graceful no-op handled upstream).
// ============================================================================

import { metaRequest } from './api'
import { META_BASE_URL } from './constants'

/** A single Page entry as returned by `GET /me/accounts`. */
interface MeAccountsPage {
  id: string
  name?: string
  access_token: string
}

interface MeAccountsResponse {
  data?: MeAccountsPage[]
}

/**
 * Exchange the single-use OAuth `code` from the FB-Login popup (response_type:'code')
 * for a SHORT-LIVED user access token. This is the step the classic FB-Login chain
 * needs BEFORE the long-lived exchange: `fb_exchange_token` expects a *token*, not a
 * code, so feeding the code straight into exchangeForLongLivedUserToken fails with an
 * "Invalid OAuth access token" error (live bug found in the 40-08 smoke).
 *
 * Structural mirror of embedded-signup.ts `exchangeCodeForBisuat` (the proven WhatsApp
 * code exchange): GET /oauth/access_token?client_id&client_secret&code, NO redirect_uri
 * (the FB JS SDK popup uses an implicit empty redirect_uri), and NO Bearer header
 * (dedicated unauthenticated OAuth exchange — never carries META_APP_SECRET in a header).
 *
 * @param code - single-use authorization code from the FB.login popup (~10 min TTL)
 * @returns the short-lived user access token (~1-2h)
 * @throws if the response is not ok or carries no access_token (detail includes Meta's
 *   error JSON — surfaced to the server log by the action's catch for fast diagnosis)
 */
export async function exchangeCodeForUserToken(code: string): Promise<string> {
  const url =
    `${META_BASE_URL}/oauth/access_token` +
    `?client_id=${process.env.META_APP_ID}` +
    `&client_secret=${process.env.META_APP_SECRET}` +
    `&code=${encodeURIComponent(code)}`

  // No auth header — dedicated unauthenticated OAuth exchange (mirror embedded-signup).
  const res = await fetch(url)
  const data = await res.json()

  if (!res.ok || !data.access_token) {
    throw new Error(`code→user-token exchange failed: ${JSON.stringify(data)}`)
  }

  return data.access_token as string // short-lived user token (~1-2h)
}

/**
 * Exchange a short-lived user token (or OAuth `code`-derived short token) for a
 * LONG-LIVED user token (~60d). The Page token derived from THIS long-lived token
 * never expires (Pitfall 3 — a Page token derived from a short-lived user token
 * dies in ~1h).
 *
 * DEDICATED unauthenticated fetch (mirror embedded-signup.ts:44): the OAuth
 * exchange must NOT carry an Authorization/Bearer header.
 *
 * @param shortLivedToken - short-lived user token from the FB-Login popup
 * @returns the long-lived user access token
 * @throws if the response is not ok or carries no access_token
 */
export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<string> {
  const url =
    `${META_BASE_URL}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${process.env.META_APP_ID}` +
    `&client_secret=${process.env.META_APP_SECRET}` +
    `&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`

  // No auth header — dedicated unauthenticated OAuth exchange (mirror embedded-signup).
  const res = await fetch(url)
  const data = await res.json()

  if (!res.ok || !data.access_token) {
    throw new Error(`long-lived exchange failed: ${JSON.stringify(data)}`)
  }

  return data.access_token as string // long-lived user token (~60d)
}

/**
 * Resolve the Page Access Token from a long-lived user token.
 * `GET /me/accounts?fields=id,name,access_token` (Bearer = long-lived user token).
 *
 * The returned `access_token` (Page token) NEVER expires because it is derived
 * from a long-lived user token. Picks the first Page returned (V1 single-Page).
 *
 * @param longLivedUserToken - the long-lived user token from exchangeForLongLivedUserToken
 * @returns { pageId, pageName, accessToken } for the connected Page
 * @throws if no Page is available on the account
 */
export async function getPageToken(
  longLivedUserToken: string
): Promise<{ pageId: string; pageName: string; accessToken: string }> {
  const res = await metaRequest<MeAccountsResponse>(
    longLivedUserToken,
    `/me/accounts?fields=id,name,access_token`
  )

  const page = res.data?.[0]
  if (!page || !page.access_token) {
    throw new Error('me/accounts returned no Page with an access_token')
  }

  return {
    pageId: page.id,
    pageName: page.name ?? page.id,
    accessToken: page.access_token, // never-expiring Page token (from long-lived user token)
  }
}

/**
 * Subscribe a Page to our webhook app so inbound Messenger events are delivered.
 * Structural clone of `subscribeWaba` BUT uses the Page token and ADDS the fields
 * (Pitfall 4 — per-Page subscribe, distinct from the WABA `subscribed_apps` call).
 *
 * POST `/{pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks`
 * (Bearer = the Page token).
 *
 * @param pageToken - the never-expiring Page Access Token
 * @param pageId - the Facebook Page id
 * @throws if the API does not return `success: true`
 */
export async function subscribeMessengerPage(pageToken: string, pageId: string): Promise<void> {
  const r = await metaRequest<{ success: boolean }>(
    pageToken,
    `/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks`,
    { method: 'POST' }
  )
  if (!r.success) {
    throw new Error('subscribed_apps did not return success:true')
  }
}
