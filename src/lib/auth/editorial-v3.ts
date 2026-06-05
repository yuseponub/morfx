/**
 * UI Editorial v3 flag resolver.
 *
 * Decision D-04 in
 * .planning/standalone/ui-redesign-editorial-core/CONTEXT.md:
 * the editorial v3 re-skin of the 3 content areas (Conversaciones,
 * CRM Contactos, CRM Pedidos) is gated per-workspace via
 * `workspaces.settings.ui_editorial_v3.enabled: boolean`, default false.
 *
 * Pattern mirrors (byte-for-byte structural clone):
 * - src/lib/auth/inbox-v2.ts (getIsInboxV2Enabled)
 * - src/lib/auth/dashboard-v2.ts (getIsDashboardV2Enabled)
 *
 * Regla 5 (no migration): the flag is a NEW sub-key on the EXISTING
 * `workspaces.settings` JSONB column that already holds `ui_inbox_v2`
 * and `ui_dashboard_v2` — zero schema change. Activation is a manual,
 * post-QA SQL UPDATE:
 *
 *   UPDATE workspaces
 *   SET settings = jsonb_set(coalesce(settings, '{}'::jsonb),
 *                            '{ui_editorial_v3,enabled}', 'true'::jsonb, true)
 *   WHERE id = '<workspace-uuid>';
 *   -- rollback: same with 'false'
 *
 * Namespace: 'ui_editorial_v3' (NOT 'ui_editorial_v3_enabled' — leaves
 * room for future sub-keys). Key: 'enabled'. Full JSONB path:
 * workspaces.settings.ui_editorial_v3.enabled.
 *
 * Usage: call from Server Components only (e.g., (dashboard)/layout.tsx).
 * Caller must already have the active workspaceId
 * (via getActiveWorkspaceId()).
 *
 * Fails closed (Regla 6 / D-04): any error, null settings, missing key,
 * or non-strict-true value returns false — the user sees the current
 * (legacy) UI, never a half-rendered editorial-v3 one.
 */

import { createClient } from '@/lib/supabase/server'

export async function getIsEditorialV3Enabled(workspaceId: string): Promise<boolean> {
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
    const ns = settings.ui_editorial_v3 as Record<string, unknown> | undefined
    return ns?.enabled === true
  } catch {
    return false
  }
}
