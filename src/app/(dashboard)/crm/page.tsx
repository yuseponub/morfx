import { redirect } from 'next/navigation'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { getActiveWorkspaceId } from '@/app/actions/workspace'

/**
 * CRM hub root redirect.
 *
 * - v2=false: preserve current behavior (redirect to `/crm/pedidos`).
 * - v2=true:  redirect to `/crm/pedidos` — kanban is the primary CRM
 *   surface in the editorial v2 design (Standalone
 *   ui-pipeline-persistence-and-crm-routing D-07). Contactos remains
 *   accessible via the <CrmTabs/> strip rendered by crm/layout.tsx.
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
    redirect('/crm/pedidos')
  }
  redirect('/crm/pedidos')
}
