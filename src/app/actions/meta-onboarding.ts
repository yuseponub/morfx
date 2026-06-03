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

import { upsertMetaAccount } from '@/lib/domain/meta-accounts'
import { exchangeCodeForBisuat, subscribeWaba } from '@/lib/meta/embedded-signup'
import { encryptToken } from '@/lib/meta/token'
import { createClient } from '@/lib/supabase/server'
import { getRequestAuth } from '@/lib/auth/request-auth'

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
}): Promise<{ success: true } | { success: false; error: string }> {
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

    return { success: true }
  } catch (e) {
    // Detail stays server-side only — never log the code or plaintext BISUAT.
    console.error('[meta-onboarding] connect failed:', e)
    return {
      success: false,
      error: 'No se pudo conectar el número de WhatsApp. Intenta de nuevo.',
    }
  }
}
