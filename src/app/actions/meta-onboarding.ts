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
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  getPageToken,
  subscribeMessengerPage,
} from '@/lib/meta/messenger-connect'
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
  code: string
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
  if (!input.code) {
    return { success: false, error: 'Datos de conexión incompletos' }
  }

  try {
    // 1a. OAuth code → short-lived user token. `fb_exchange_token` expects a TOKEN,
    //     not a code — skipping this step was the live 40-08 bug ("Invalid OAuth
    //     access token"). The FB.login popup returns a `code` (response_type:'code').
    const shortLivedUserToken = await exchangeCodeForUserToken(input.code)

    // 1b. short-lived → long-lived user token (Pitfall 3 — Page token must derive
    //     from the long-lived token, otherwise it dies in ~1h).
    const longLivedUserToken = await exchangeForLongLivedUserToken(shortLivedUserToken)

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
    // Detail stays server-side only — never log the code or plaintext Page token.
    console.error('[meta-onboarding] connect Facebook page failed:', e)
    return {
      success: false,
      error: 'No se pudo conectar la página de Facebook. Intenta de nuevo.',
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
