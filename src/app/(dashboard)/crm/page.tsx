import { redirect } from 'next/navigation'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { getActiveWorkspaceId } from '@/app/actions/workspace'

/**
 * CRM hub root redirect.
 *
 * - v2=false: preserve current behavior (redirect to `/crm/pedidos`).
 * - v2=true:  redirect to `/crm/contactos` — the first tab of the
 *   editorial CRM hub (mock crm.html line 121, `<a class="on">
 *   Contactos`). This matches the mock's default landing tab.
 *
 * Regla 6 byte-identical fail-closed: any error or missing workspace
 * falls through to `/crm/pedidos`.
 */
export default async function CRMPage() {
  const activeWorkspaceId = await getActiveWorkspaceId()
  const v2 = activeWorkspaceId
    ? await getIsDashboardV2Enabled(activeWorkspaceId)
    : false

  if (v2) {
    redirect('/crm/contactos')
  }
  redirect('/crm/pedidos')
}
