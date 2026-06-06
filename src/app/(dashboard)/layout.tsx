import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'
import { WorkspaceProvider } from '@/components/providers/workspace-provider'
import { getUserWorkspaces, getActiveWorkspaceId } from '@/app/actions/workspace'
import { cn } from '@/lib/utils'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { getIsEditorialV3Enabled } from '@/lib/auth/editorial-v3'
import { DashboardV2Provider } from '@/components/layout/dashboard-v2-context'
import { QueryProvider } from '@/components/providers/query-provider'
import { RealtimeAuthProvider } from '@/components/providers/realtime-auth-provider'
import { ebGaramond, inter, jetbrainsMono } from './fonts'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user's workspaces and resolve active workspace in parallel
  const [workspaces, activeWorkspaceId] = await Promise.all([
    getUserWorkspaces(),
    getActiveWorkspaceId(),
  ])

  // Resolve UI Dashboard v2 flag using the active workspace (if any).
  // Fails closed to false (Regla 6, D-DASH-01).
  const isDashboardV2 = activeWorkspaceId
    ? await getIsDashboardV2Enabled(activeWorkspaceId)
    : false

  // Resolve UI Editorial v3 flag using the active workspace (if any).
  // Fails closed to false (Regla 6, D-04). Applied on the <main> wrapper
  // (NOT the shell root) so the deferred sidebar is structurally excluded
  // (Pitfall 6 / D-06). Independent from isDashboardV2 — the two systems
  // coexist by distinct class name (D-05).
  const isEditorialV3 = activeWorkspaceId
    ? await getIsEditorialV3Enabled(activeWorkspaceId)
    : false

  // Find selected workspace or use first one
  let currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || null
  if (!currentWorkspace && workspaces.length > 0) {
    currentWorkspace = workspaces[0]
  }

  return (
    <QueryProvider>
      <RealtimeAuthProvider>
      <WorkspaceProvider workspace={currentWorkspace} workspaces={workspaces}>
        <DashboardV2Provider v2={isDashboardV2}>
        <div
          className={cn(
            ebGaramond.variable,
            inter.variable,
            jetbrainsMono.variable,
            'flex h-screen',
            isDashboardV2 && 'theme-editorial',
          )}
        >
          {/* Mobile-nav v3-only (D-05b). Gated por isEditorialV3: para usuarios
              no-v3 el dashboard NO monta ningún mobile-nav (igual que hoy — Regla 6).
              `md:hidden` lo limita a mobile (el <Sidebar> es hidden md:flex = desktop).
              El Sheet del MobileNav provee su propio trigger (botón Menu); el wrapper
              fixed top-left lo hace alcanzable sobre el contenido sin consumir ancho
              del flex row. */}
          {isEditorialV3 && (
            <div className="md:hidden fixed top-3 left-3 z-50">
              <MobileNav v3 />
            </div>
          )}
          <Sidebar
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            user={user}
            v2={isDashboardV2}
            v3={isEditorialV3}
          />
          <main
            className={cn(
              'flex-1 flex flex-col overflow-hidden',
              isEditorialV3 && 'theme-editorial-v3',
            )}
          >
            {children}
          </main>
        </div>
        </DashboardV2Provider>
      </WorkspaceProvider>
      </RealtimeAuthProvider>
    </QueryProvider>
  )
}
