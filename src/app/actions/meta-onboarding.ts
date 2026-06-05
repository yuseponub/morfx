'use server'

// ============================================================================
// Server Action: Connect a WhatsApp number via Embedded Signup
// (Phase 38 — embedded-signup-wa-inbound, Plan 04 / Wave 3)
//
// Turns a popup result `{ code, wabaId, phoneNumberId }` into a stored,
// encrypted, webhook-subscribed `workspace_meta_accounts` row.
//
// Auth gate (V4 — copy of shopify-oauth.ts:70-93):
//   1. getRequestAuth() (local JWT verify; identity + workspaceId from cookie)
//   2. workspaceId is session-derived (NEVER from request body — T-38-13)
//   3. workspace_members.role === 'owner'
//
// Security:
//   - exchangeCodeForBisuat runs server-side; META_APP_SECRET never reaches the
//     client (T-38-12). embedded-signup.ts is SERVER-ONLY.
//   - The BISUAT is AES-256-GCM encrypted via encryptToken BEFORE persisting (T-38-14).
//   - Never logs the code or the plaintext BISUAT (only a generic failure).
//   - The code is single-use (~10 min); exchanged immediately on receipt (T-38-15).
//
// Regla 3: the DB write is delegated to upsertMetaAccount (domain layer). This
// action never writes to the table inline (no admin client here). The only
// direct DB read is the workspace_members role check (auth gate).
//
// D-04 / D-06: connecting a number does NOT flip the active WhatsApp provider.
// The row is inserted is_active, but traffic stays on 360dialog until the
// operator runs the manual SQL flip. This action MUST NOT touch the provider
// column.
// ============================================================================

import crypto from 'crypto'
import {
  upsertMetaAccount,
  updateMetaAccountRegistration,
  type MetaRegistrationStatus,
} from '@/lib/domain/meta-accounts'
import {
  exchangeCodeForBisuat,
  subscribeWaba,
  registerPhoneNumber,
} from '@/lib/meta/embedded-signup'
import {
  exchangeForLongLivedUserToken,
  getPageToken,
  getPageTokenForPage,
  subscribeMessengerPage,
} from '@/lib/meta/messenger-connect'
import { resolveInstagramAccount } from '@/lib/meta/instagram-connect'
import { resolveByWorkspace } from '@/lib/meta/credentials'
import { metaRequest } from '@/lib/meta/api'
import { mapRegisterError } from '@/lib/meta/register-errors'
import { encryptToken } from '@/lib/meta/token'
import { createClient } from '@/lib/supabase/server'
import { getRequestAuth } from '@/lib/auth/request-auth'

/**
 * Result of the connect flow. The connection ROW always exists once subscribe
 * succeeds; activation (Cloud API /register) is reported via `status` + an
 * actionable `message` rather than a hard failure (Plan 06). `success:false` is
 * reserved for connect-level failures (auth, exchange, subscribe, DB).
 */
export type ConnectWhatsAppResult =
  | { success: true; status: MetaRegistrationStatus; message?: string }
  | { success: false; error: string }

/**
 * Connect a WhatsApp number obtained from the Embedded Signup popup.
 *
 * Envelope `{ success } | { success, error }` with Spanish toast strings.
 * Detailed failure stays server-side; the client message is generic so a
 * failure cannot leak which credential / step broke.
 */
export async function connectWhatsAppNumber(input: {
  code: string
  wabaId: string
  phoneNumberId: string
}): Promise<ConnectWhatsAppResult> {
  // === Auth gate (copy of shopify-oauth.ts:70-93) =========================
  const auth = await getRequestAuth()
  if (!auth) {
    return { success: false, error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', auth.userId)
    .single()

  if (!member || member.role !== 'owner') {
    return { success: false, error: 'Solo el Owner puede conectar WhatsApp' }
  }

  // === Input validation (V5) ==============================================
  if (!input.code || !input.wabaId || !input.phoneNumberId) {
    return { success: false, error: 'Datos de conexión incompletos' }
  }

  try {
    // Server-side exchange — META_APP_SECRET stays server (SIGNUP-02 / T-38-12).
    const bisuat = await exchangeCodeForBisuat(input.code)

    // Encrypt before persisting (AES-256-GCM — T-38-14).
    const accessTokenEncrypted = encryptToken(bisuat)

    // Regla 3 — sole write path. workspaceId is session-derived, NOT from input.
    const result = await upsertMetaAccount({
      workspaceId,
      channel: 'whatsapp',
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      accessTokenEncrypted,
      isActive: true,
    })
    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Auto-subscribe the WABA to our webhook app (SIGNUP-03).
    await subscribeWaba(bisuat, input.wabaId)

    // Activate on Cloud API (Plan 06 — register after subscribe). Register issues
    // (leftover 2SV, missing payment) are surfaced as status + message, NOT failures.
    return await activateNumber(bisuat, workspaceId, input.phoneNumberId)
  } catch (e) {
    // Detail stays server-side only — never log the code or plaintext BISUAT.
    console.error('[meta-onboarding] connect failed:', e)
    return {
      success: false,
      error: 'No se pudo conectar el número de WhatsApp. Intenta de nuevo.',
    }
  }
}

// ============================================================================
// Server Action: Connect a Facebook Page (Phase 40 — SIGNUP-04)
//
// Auth gate copies connectWhatsAppNumber VERBATIM. The body DIVERGES: instead of
// the WhatsApp Embedded Signup BISUAT exchange, it runs the classic FB-Login chain
// (short-lived/code → long-lived user token → /me/accounts Page token → per-Page
// subscribe). See src/lib/meta/messenger-connect.ts.
//
// Regla 6 (CRITICAL): connecting a Page must NOT flip the Messenger provider. The
// row is inserted is_active, but Messenger traffic stays on manychat until the
// operator runs the manual SQL flip (Plan 08). This action MUST NOT touch that column.
//
// Security: META_APP_SECRET stays server-side (messenger-connect is SERVER-ONLY); the
// Page token is AES-256-GCM encrypted before persist; the plaintext token is NEVER
// returned in the result envelope and NEVER logged (T-40-03-02 / T-40-03-03).
// ============================================================================

export type ConnectFacebookResult =
  | { success: true; pageName: string }
  | { success: false; error: string }

/**
 * Connect a Facebook Page obtained from the FB-Login popup.
 *
 * Owner-only; `workspaceId` is session-derived (NEVER from input — T-38-13 analog).
 * Returns `{ success, pageName }` on success — never the plaintext Page token.
 * Failure detail stays server-side; the client message is generic so a failure
 * cannot leak which step broke.
 */
export async function connectFacebookPage(input: {
  accessToken: string
}): Promise<ConnectFacebookResult> {
  // === Auth gate (copy of connectWhatsAppNumber) ==========================
  const auth = await getRequestAuth()
  if (!auth) {
    return { success: false, error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', auth.userId)
    .single()

  if (!member || member.role !== 'owner') {
    return { success: false, error: 'Solo el Owner puede conectar Facebook' }
  }

  // === Input validation (V5) ==============================================
  if (!input.accessToken) {
    return { success: false, error: 'Datos de conexión incompletos' }
  }

  try {
    // 1. short-lived USER ACCESS TOKEN (from FB.login token-flow) → long-lived user
    //    token (Pitfall 3 — Page token must derive from the long-lived token, else
    //    it dies in ~1h). Token-flow avoids the classic-code redirect_uri exchange
    //    that broke the connect in the 40-08 smoke.
    const longLivedUserToken = await exchangeForLongLivedUserToken(input.accessToken)

    // 2. long-lived user token → never-expiring Page Access Token.
    const { pageId, pageName, accessToken: pageToken } = await getPageToken(longLivedUserToken)

    // 3. Encrypt before persisting (AES-256-GCM — T-40-03-03).
    const accessTokenEncrypted = encryptToken(pageToken)

    // 4. Regla 3 — sole write path. workspaceId is session-derived, NOT from input.
    //    channel:'facebook' leaves waba_id/phone_number_id null. NO provider flip (Regla 6).
    const result = await upsertMetaAccount({
      workspaceId,
      channel: 'facebook',
      wabaId: null,
      phoneNumberId: null,
      pageId,
      accessTokenEncrypted,
      isActive: true,
    })
    if (!result.success) {
      return { success: false, error: result.error }
    }

    // 5. Per-Page subscribe so inbound Messenger events are delivered (Pitfall 4).
    await subscribeMessengerPage(pageToken, pageId)

    return { success: true, pageName }
  } catch (e) {
    // Detail stays server-side only (never the code or plaintext Page token).
    // The full Meta error (incl. the getPageToken `probe=[...]` breakdown) is in the
    // server log (console.error) for diagnosis — the toast stays generic in prod.
    console.error('[meta-onboarding] connect Facebook page failed:', e)
    return {
      success: false,
      error: 'No se pudo conectar la página de Facebook. Intenta de nuevo.',
    }
  }
}

// ============================================================================
// Connect Instagram (Phase 41 — IG-03 / IG-04, Plan 41-08 dedicated IG login,
//                     Plan 41-09 GAP-41-01 fix: target the workspace's bound page)
//
// Instagram has NO independent OAuth — it rides on the connected Facebook Page.
// Plan 41-08 (D-IG-10/11/12) replaced the old no-popup / stored-token path: the
// "Conectar Instagram" button runs its OWN FB.login requesting the IG superset scope
// (the 5 FB scopes + instagram_basic + instagram_manage_messages) and captures a
// short-lived USER token. This action takes that token and runs the Phase 40 chain.
//
// Plan 41-09 (GAP-41-01) fixes a live multi-page bug: 41-08 used getPageToken's data[0]
// heuristic (the FIRST page in /me/accounts), which retargeted multi-page operators'
// facebook row to the WRONG page_id → uq_meta_page UNIQUE(page_id) collision (Varixcenter
// live repro). The flow now reads the workspace's ALREADY-bound facebook page FIRST
// (resolveByWorkspace) and fetches the Page token FOR THAT page (getPageTokenForPage),
// never data[0]. If the workspace has no facebook row → clear Spanish precheck error
// (restores what 41-08 dropped). All of 41-08's dedicated-login + token-refresh intent
// is preserved: exchangeForLongLivedUserToken still runs (the refreshed Page token carries
// the IG scopes — D-IG-12), only WHICH page the token is fetched for changes.
//
// The refreshed facebook-row token is additive (the new grant UNIONS the IG scopes onto
// the prior Messenger scopes → strict superset → Messenger keeps working — Regla 6). THEN
// resolveInstagramAccount + IG-row upsert + per-Page subscribe with the FRESH token.
//
// Owner-only; `workspaceId` is session-derived (NEVER from input). The action NEVER
// flips the per-workspace Instagram provider column (Regla 6) — the workspace stays on
// the legacy provider until the manual SQL cutover (41-07). Returns only
// `{ success, igUsername }` — never the plaintext Page token.
// ============================================================================

export type ConnectInstagramResult =
  | { success: true; igUsername?: string }
  | { success: false; error: string }

/**
 * Connect the Instagram Professional account linked to the connected Facebook Page.
 * Owner-gated; takes the short-lived USER token from the dedicated IG FB.login
 * (token-flow), refreshes the canonical Page token with the IG-scoped superset, then
 * resolves + persists ig_account_id via the domain sole write path. NEVER flips the
 * provider. Returns `{ success, igUsername }` — never the plaintext Page token.
 */
export async function connectInstagramAccount(input: {
  accessToken: string
}): Promise<ConnectInstagramResult> {
  // === Auth gate (copy of connectFacebookPage) ============================
  const auth = await getRequestAuth()
  if (!auth) {
    return { success: false, error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId // session-derived, NEVER from input (Regla 3 / V4)

  const supabase = await createClient()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', auth.userId)
    .single()

  if (!member || member.role !== 'owner') {
    return { success: false, error: 'Solo el Owner puede conectar Instagram' }
  }

  // === Input validation (V5) ==============================================
  if (!input.accessToken) {
    return { success: false, error: 'Datos de conexión incompletos' }
  }

  // === Precheck (GAP-41-01 — restores what 41-08 dropped) =================
  // IG rides on an EXISTING connected Facebook page. Read the workspace's already-bound
  // facebook page FIRST; if none, fail clearly (do NOT proceed). This is ALSO the page we
  // target below — so a multi-page operator never retargets the FB row to data[0]. The
  // precheck short-circuits BEFORE any token call (no exchange / upsert / resolve / subscribe).
  const fbCreds = await resolveByWorkspace(workspaceId, 'facebook')
  if (!fbCreds || !fbCreds.pageId) {
    return { success: false, error: 'Primero conecta tu página de Facebook' }
  }
  const boundPageId = fbCreds.pageId

  try {
    // 1. short-lived USER ACCESS TOKEN (from the dedicated IG FB.login token-flow) →
    //    long-lived user token. Token-flow (Q6 Pitfall 1) — NOT a code exchange. (D-IG-12)
    const longLivedUserToken = await exchangeForLongLivedUserToken(input.accessToken)

    // 2. GAP-41-01 FIX: fetch the never-expiring Page Access Token FOR THE WORKSPACE'S
    //    bound page (not getPageToken's data[0] heuristic). `pageId` === boundPageId verbatim;
    //    if the login did not grant access to this page, getPageTokenForPage THROWS a clear
    //    Spanish error (caught below) and NEVER falls back to another page. The token carries
    //    the IG scopes the user just granted in the dedicated login.
    const { pageId, accessToken: pageToken } = await getPageTokenForPage(
      longLivedUserToken,
      boundPageId
    )

    // 3. Encrypt before persisting (AES-256-GCM).
    const accessTokenEncrypted = encryptToken(pageToken)

    // 4. Refresh the CANONICAL facebook-row token with the fresh superset (D-IG-12 step 3).
    //    The new grant unions the IG scopes onto the Messenger scopes → strict superset →
    //    Messenger keeps working (Regla 6). channel:'facebook' targets the existing FB row
    //    via the (workspace_id, channel) upsert key. NEVER touches the provider column.
    const fbRefresh = await upsertMetaAccount({
      workspaceId,
      channel: 'facebook',
      wabaId: null,
      phoneNumberId: null,
      pageId,
      accessTokenEncrypted,
      isActive: true,
    })
    if (!fbRefresh.success) {
      return { success: false, error: fbRefresh.error }
    }

    // 5. Resolve the IG account with the FRESH page token (was the broken step — the old
    //    stored token lacked the IG scopes). Throws the clear Spanish error if no IG linked.
    const ig = await resolveInstagramAccount(pageToken, pageId)

    // 6. Regla 3 — sole write path. channel:'instagram' isolates this row from the FB row.
    //    NEVER touches the provider column.
    const igUpsert = await upsertMetaAccount({
      workspaceId,
      channel: 'instagram',
      wabaId: null,
      phoneNumberId: null,
      pageId,
      igAccountId: ig.id,
      igUsername: ig.username ?? null,
      accessTokenEncrypted,
      isActive: true,
    })
    if (!igUpsert.success) {
      return { success: false, error: igUpsert.error }
    }

    // 7. IG events ride the same Page subscription (per-Page subscribe — `messages` field
    //    = IG delivery, Q5). Runs with the fresh pages_manage_metadata-bearing token.
    await subscribeMessengerPage(pageToken, pageId)

    return { success: true, igUsername: ig.username }
  } catch (e) {
    // The IG-not-linked error message is operator-actionable → surface it; any other
    // failure detail stays server-side (never the token) with a generic Spanish message.
    const message = e instanceof Error ? e.message : ''
    console.error('[meta-onboarding] connect Instagram account failed:', e)
    if (message.includes('vincula una cuenta de Instagram Profesional')) {
      return { success: false, error: message }
    }
    return {
      success: false,
      error: 'No se pudo conectar la cuenta de Instagram. Intenta de nuevo.',
    }
  }
}

// ============================================================================
// Activation: call Cloud API /register after subscribe (Plan 06 gap-closure)
// ============================================================================

/**
 * Register the number on Cloud API so it actually receives messages. Idempotent:
 * if Meta already reports the number CONNECTED, skip register. On a known chain
 * block (leftover 2SV / missing payment method) persists the status + returns an
 * actionable Spanish message instead of leaving a silent dead number.
 * Never logs the plaintext BISUAT or the PIN.
 */
async function activateNumber(
  bisuat: string,
  workspaceId: string,
  phoneNumberId: string
): Promise<ConnectWhatsAppResult> {
  // 1. Idempotency — never re-register an already-active number.
  try {
    const cur = await metaRequest<{ status?: string }>(
      bisuat,
      `/${phoneNumberId}?fields=status`
    )
    if (cur.status === 'CONNECTED') {
      await updateMetaAccountRegistration({ workspaceId, phoneNumberId, status: 'connected' })
      return { success: true, status: 'connected' }
    }
  } catch {
    // Non-fatal — fall through and attempt register.
  }

  // 2. Register with a fresh 6-digit PIN (becomes the number's new 2SV PIN).
  const pin = String(crypto.randomInt(100000, 1000000))
  try {
    await registerPhoneNumber(bisuat, phoneNumberId, pin)
    await updateMetaAccountRegistration({
      workspaceId,
      phoneNumberId,
      status: 'connected',
      twoStepPinEncrypted: encryptToken(pin),
    })
    return { success: true, status: 'connected' }
  } catch (e) {
    const mapped = mapRegisterError(e)
    await updateMetaAccountRegistration({
      workspaceId,
      phoneNumberId,
      status: mapped.status,
      error: mapped.detail,
    })
    return { success: true, status: mapped.status, message: mapped.message }
  }
}
