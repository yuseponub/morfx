import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { WorkspaceProvider } from '@/components/providers/workspace-provider'
import { getUserWorkspaces, getActiveWorkspaceId } from '@/app/actions/workspace'
import { cn } from '@/lib/utils'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { DashboardV2Provider } from '@/components/layout/dashboard-v2-context'
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

  // Find selected workspace or use first one
  let currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || null
  if (!currentWorkspace && workspaces.length > 0) {
    currentWorkspace = workspaces[0]
  }

  return (
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
          <Sidebar
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            user={user}
            v2={isDashboardV2}
          />
          <main className="flex-1 flex flex-col overflow-hidden">
            {children}
          </main>
        </div>
      </DashboardV2Provider>
    </WorkspaceProvider>
  )
}
