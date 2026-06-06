/**
 * CRM hub layout — Standalone `ui-redesign-dashboard-retrofit` Plan 01.
 *
 * Server Component async. When `ui_dashboard_v2.enabled=true` for the
 * active workspace, renders a <CrmTabs/> strip (client component) above
 * the children. When flag is false, the layout is a transparent
 * pass-through (`{children}`) — the pre-plan render is byte-identical.
 *
 * Per 01-PLAN Task 3 approach (a):
 * - Layout does NOT render a shared topbar. Each page inside /crm/**
 *   emits its OWN `<header class="topbar">` because topbar content
 *   (eyebrow + h1 + actions) is contextual per page. Layout only
 *   provides the tabs strip.
 * - Layout stays Server Component. `<CrmTabs/>` is the client child
 *   (needs `usePathname()` for active state).
 *
 * Regla 6: when v2=false, layout emits `{children}` unchanged.
 * Regla 3: no domain / hooks / actions / inngest / agents touched.
 */

import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { getIsEditorialV3Enabled } from '@/lib/auth/editorial-v3'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { CrmTabs } from './components/crm-tabs'

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const activeWorkspaceId = await getActiveWorkspaceId()
  const v2 = activeWorkspaceId
    ? await getIsDashboardV2Enabled(activeWorkspaceId)
    : false
  // Editorial v3 — cuando está ON, las páginas que renderizan su propio sub-nav
  // inline (SELF_RENDERED_V3_ROUTES en crm-tabs.tsx) hacen que esta copia del
  // layout se autosuprima, dejando el título arriba del todo (como WhatsApp).
  // Para workspaces v2-only (v3=false) el sub-nav del layout queda intacto (Regla 6).
  const v3 = activeWorkspaceId
    ? await getIsEditorialV3Enabled(activeWorkspaceId)
    : false

  if (!v2) {
    // Flag OFF → pass-through. Byte-identical to no layout at all
    // (which is the state prior to this plan — /crm/** had no layout.tsx
    // before, so React tree is equivalent).
    return <>{children}</>
  }

  // Flag ON → render the editorial tabs strip above children. The
  // per-page `<header class="topbar">` (emitted by each page.tsx) sits
  // above this, giving the visual stack: topbar → tabs → page content
  // (matching mock crm.html lines 108-125).
  return (
    <>
      <CrmTabs suppressV3Inline={v3} />
      {children}
    </>
  )
}
