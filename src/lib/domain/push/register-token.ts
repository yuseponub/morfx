// ============================================================================
// Domain Layer — Push Tokens: Register
// Phase 43 Plan 13: Push Notifications
//
// Upserts a push token for (user_id, workspace_id, platform, token). When a
// device re-registers after being revoked, we clear `revoked_at` so the token
// becomes active again. The UNIQUE constraint on the table guarantees we
// never store the same token twice for the same user+workspace+platform.
//
// Pattern:
//   1. createAdminClient() — bypasses RLS, domain is trusted
//   2. Filter by workspace_id on every query
//   3. Upsert via onConflict so retries are idempotent
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'

export interface RegisterPushTokenParams {
  userId: string
  workspaceId: string
  platform: 'android' | 'ios'
  token: string
  deviceName?: string | null
}

export interface RegisterPushTokenResult {
  id: string
}

/**
 * Register (or refresh) a push token for a user + workspace + platform.
 *
 * Idempotent: calling this multiple times with the same token is safe and
 * will revive a previously-revoked token by clearing `revoked_at`.
 */
export async function registerPushToken(
  params: RegisterPushTokenParams
): Promise<RegisterPushTokenResult> {
  const supabase = createAdminClient()

  const row = {
    user_id: params.userId,
    workspace_id: params.workspaceId,
    platform: params.platform,
    token: params.token,
    device_name: params.deviceName ?? null,
    // Bogota TZ per CLAUDE.md — DB uses timezone('America/Bogota', NOW())
    // but since we're going through Node, we let the DB default handle it
    // for new rows and explicitly reset `updated_at` + `revoked_at` on
    // re-register.
    updated_at: new Date().toISOString(),
    revoked_at: null,
  }

  const { data, error } = await supabase
    .from('push_tokens')
    .upsert(row, {
      onConflict: 'user_id,workspace_id,platform,token',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[domain/push/register-token] upsert failed', error)
    throw error
  }

  return { id: (data as { id: string }).id }
}
