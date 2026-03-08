import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { WorkspaceProvider } from '@/components/providers/workspace-provider'
import { getUserWorkspaces, getActiveWorkspaceId } from '@/app/actions/workspace'

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

  // Find selected workspace or use first one
  let currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || null
  if (!currentWorkspace && workspaces.length > 0) {
    currentWorkspace = workspaces[0]
  }

  return (
    <WorkspaceProvider workspace={currentWorkspace} workspaces={workspaces}>
      <div className="flex h-screen">
        <Sidebar workspaces={workspaces} currentWorkspace={currentWorkspace} user={user} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </WorkspaceProvider>
  )
}
