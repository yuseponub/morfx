/**
 * UI Inbox v2 flag resolver.
 *
 * Decision D-01 / D-02 in
 * .planning/standalone/ui-redesign-conversaciones/CONTEXT.md:
 * the editorial re-skin of /whatsapp is gated per-workspace via
 * `workspaces.settings.ui_inbox_v2.enabled: boolean`, default false.
 *
 * Pattern mirrors:
 * - src/lib/auth/super-user.ts (getIsSuperUser for /super-admin gating)
 * - src/components/layout/sidebar.tsx settingsKey convention
 *   (e.g., 'conversation_metrics.enabled')
 *
 * Namespace: 'ui_inbox_v2' (NOT 'ui_inbox_v2_enabled' — the latter
 * leaves no room for future sub-keys like retention_days). Key: 'enabled'.
 * Full JSONB path: workspaces.settings.ui_inbox_v2.enabled.
 *
 * Usage: call from Server Components only. Caller must already have the
 * active workspaceId (via getActiveWorkspaceId()).
 *
 * Fails closed: any error, null settings, or missing key returns false.
 * Guarantees Regla 6 — if the flag check itself breaks, the user sees
 * the current (slate) inbox, never a half-rendered editorial one.
 */

import { createClient } from '@/lib/supabase/server'

export async function getIsInboxV2Enabled(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single()
    if (error || !data) return false
    const settings = (data.settings as Record<string, unknown> | null) ?? {}
    const ns = settings.ui_inbox_v2 as Record<string, unknown> | undefined
    return ns?.enabled === true
  } catch {
    return false
  }
}
