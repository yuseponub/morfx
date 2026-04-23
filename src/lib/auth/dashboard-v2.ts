/**
 * UI Dashboard v2 flag resolver.
 *
 * Decision D-DASH-01 in
 * .planning/standalone/ui-redesign-dashboard/CONTEXT.md:
 * the editorial re-skin of the dashboard chrome + 7 modules
 * (CRM, Pedidos, Tareas, Agentes, Automatizaciones, Analytics+Métricas,
 * Configuración) is gated per-workspace via
 * `workspaces.settings.ui_dashboard_v2.enabled: boolean`, default false.
 *
 * Pattern mirrors:
 * - src/lib/auth/inbox-v2.ts (getIsInboxV2Enabled — shipped
 *   ui-redesign-conversaciones Plan 01)
 * - src/lib/auth/super-user.ts (getIsSuperUser — original analog)
 *
 * Namespace: 'ui_dashboard_v2' (NOT 'ui_dashboard_v2_enabled' — leaves
 * room for future sub-keys). Key: 'enabled'. Full JSONB path:
 * workspaces.settings.ui_dashboard_v2.enabled.
 *
 * Scope (D-DASH-04): when true, the className `.theme-editorial` is
 * applied at the (dashboard)/layout.tsx wrapper, cascading to ALL
 * subroutes — including out-of-scope ones (super-admin, sandbox,
 * onboarding, etc.). Those routes can be visually broken under flag ON
 * — documented as known deuda in D-DASH-04 mitigation.
 *
 * INDEPENDENT FROM `ui_inbox_v2.enabled` (D-DASH-03): a workspace can
 * have one without the other. Somnio today: ui_inbox_v2=true,
 * ui_dashboard_v2=false. Post-QA of this fase: prend ambos.
 *
 * Usage: call from Server Components only (e.g., (dashboard)/layout.tsx).
 * Caller must already have the active workspaceId
 * (via getActiveWorkspaceId()).
 *
 * Fails closed: any error, null settings, or missing key returns false.
 */

import { createClient } from '@/lib/supabase/server'

export async function getIsDashboardV2Enabled(workspaceId: string): Promise<boolean> {
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
    const ns = settings.ui_dashboard_v2 as Record<string, unknown> | undefined
    return ns?.enabled === true
  } catch {
    return false
  }
}
