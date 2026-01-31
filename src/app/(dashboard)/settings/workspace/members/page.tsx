import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserWorkspaces } from '@/app/actions/workspace'
import { getWorkspaceMembers, getWorkspaceInvitations } from '@/app/actions/invitations'
import { MembersPageContent } from './members-content'

export default async function MembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const workspaces = await getUserWorkspaces()

  if (workspaces.length === 0) {
    redirect('/create-workspace')
  }

  // Get selected workspace from cookie
  const cookieStore = await cookies()
  const selectedWorkspaceId = cookieStore.get('morfx_workspace')?.value

  // Find selected workspace or use first one
  const currentWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0]

  const members = await getWorkspaceMembers(currentWorkspace.id)
  const invitations = await getWorkspaceInvitations(currentWorkspace.id)

  const isAdmin = ['owner', 'admin'].includes(currentWorkspace.role)

  return (
    <MembersPageContent
      workspace={currentWorkspace}
      members={members}
      invitations={invitations}
      isAdmin={isAdmin}
      currentUserId={user.id}
    />
  )
}
