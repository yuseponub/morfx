// ============================================================================
// Domain Layer — Meta Accounts (Phase 38 embedded-signup-wa-inbound, D-09 / Regla 3)
// Single source of truth for MUTATIONS on `workspace_meta_accounts` (Regla 3 CLAUDE.md).
//
// READ side lives in src/lib/meta/credentials.ts (resolveByPhoneNumberId, etc.).
// This file is the ONLY write path into the table: the table forbids client
// INSERT/UPDATE via RLS, so every mutation goes through createAdminClient() here.
//
// Pattern (mirrors upsertShopifyIntegration in src/lib/domain/integrations.ts):
//   1. createAdminClient() (bypasses RLS — table forbids client writes)
//   2. Read existing ACTIVE row by (workspace_id, channel) to decide INSERT vs UPDATE
//   3. INSERT or UPDATE based on existence
//   4. Return DomainResult<{ id }>
//
// Constraints:
//   - Filtra por `workspace_id` en CADA query (Regla 3 + threat T-38-10).
//   - `workspaceId` lo pasa el caller (session-derived) — NUNCA del request body (T-38-10).
//   - NUNCA throws; cualquier error se captura y se devuelve como `{ success: false, error }`.
//   - NUNCA loguea ni desencripta `access_token_encrypted` (T-38-09).
//   - El token llega ya encriptado por el caller (encryptToken en src/lib/meta/token.ts).
//   - `updated_at` lo maneja el trigger `set_updated_at` de la migración — NO se setea a mano.
//   - UNIQUE(phone_number_id) → si otro workspace ya posee ese número, se devuelve un
//     error en español claro para el toast del caller (T-38-10).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { MetaChannel } from '@/lib/meta/types'

export interface UpsertMetaAccountParams {
  workspaceId: string
  channel: MetaChannel // 'whatsapp' for this phase
  wabaId: string | null
  phoneNumberId: string | null
  accessTokenEncrypted: string // already encrypted by caller via encryptToken
  phoneNumber?: string | null
  businessId?: string | null
  isActive?: boolean // default true
}

export type DomainResult<T> = { success: true; data: T } | { success: false; error: string }

/**
 * INSERT-or-UPDATE the active `workspace_meta_accounts` row for
 * (workspaceId, channel). The sole write path into the table (Regla 3).
 *
 * Behavior:
 *   - Looks up the existing ACTIVE row for (workspace_id, channel).
 *   - On UPDATE: overwrites waba_id, phone_number_id, access_token_encrypted,
 *     phone_number, business_id, is_active. `updated_at` is handled by the DB
 *     trigger — never hand-set (Regla 2).
 *   - On INSERT: leaves `provider` to the DB default 'meta_direct'; is_active
 *     defaults to true unless `isActive` is explicitly provided.
 *   - On any Supabase error returns `{ success: false, error }` — never throws.
 *   - A UNIQUE(phone_number_id) conflict surfaces a clear Spanish error string.
 *
 * Never logs or decrypts the token. `workspaceId` must be session-derived by the
 * caller — never taken from a request body.
 */
export async function upsertMetaAccount(
  params: UpsertMetaAccountParams
): Promise<DomainResult<{ id: string }>> {
  const supabase = createAdminClient()
  const isActive = params.isActive ?? true

  try {
    // Step 1: look up the existing active row for (workspace_id, channel).
    // Filtered by workspace_id in every query (Regla 3).
    const { data: existing, error: existingErr } = await supabase
      .from('workspace_meta_accounts')
      .select('id')
      .eq('workspace_id', params.workspaceId)
      .eq('channel', params.channel)
      .eq('is_active', true)
      .maybeSingle()

    if (existingErr) {
      return { success: false, error: existingErr.message }
    }

    // Step 2: branch on existence.
    if (existing) {
      const { data: updated, error } = await supabase
        .from('workspace_meta_accounts')
        .update({
          waba_id: params.wabaId,
          phone_number_id: params.phoneNumberId,
          access_token_encrypted: params.accessTokenEncrypted,
          phone_number: params.phoneNumber ?? null,
          business_id: params.businessId ?? null,
          is_active: isActive,
          // updated_at handled by the set_updated_at trigger — do NOT hand-set.
        })
        .eq('id', existing.id)
        .eq('workspace_id', params.workspaceId)
        .select('id')
        .single()

      if (error) return { success: false, error: mapWriteError(error.message) }
      return { success: true, data: { id: updated.id } }
    }

    const { data: created, error } = await supabase
      .from('workspace_meta_accounts')
      .insert({
        workspace_id: params.workspaceId,
        channel: params.channel,
        waba_id: params.wabaId,
        phone_number_id: params.phoneNumberId,
        access_token_encrypted: params.accessTokenEncrypted,
        phone_number: params.phoneNumber ?? null,
        business_id: params.businessId ?? null,
        is_active: isActive,
        // provider left to the DB default 'meta_direct'.
      })
      .select('id')
      .single()

    if (error) return { success: false, error: mapWriteError(error.message) }
    return { success: true, data: { id: created.id } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error in upsertMetaAccount',
    }
  }
}

/**
 * Map raw Supabase write errors to caller-friendly Spanish strings.
 * A UNIQUE(phone_number_id) conflict means another workspace already owns that
 * number (one number = one WABA — Pitfall 10).
 */
function mapWriteError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('uq_meta_phone') ||
    (lower.includes('duplicate') && lower.includes('phone_number_id'))
  ) {
    return 'Este número ya está conectado en otro espacio de trabajo. Un número solo puede pertenecer a una cuenta.'
  }
  return message
}
