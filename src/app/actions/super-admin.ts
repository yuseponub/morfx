'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { WorkspaceLimits } from '@/lib/whatsapp/types'
import { revalidatePath } from 'next/cache'

// Verify super admin access
async function verifySuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const MORFX_OWNER_ID = process.env.MORFX_OWNER_USER_ID
  if (!user || user.id !== MORFX_OWNER_ID) {
    throw new Error('Unauthorized')
  }

  return user
}

// Get all workspaces for super admin
export async function getAllWorkspaces() {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('workspaces')
    .select(`
      id,
      name,
      created_at,
      workspace_members(count)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(ws => ({
    ...ws,
    member_count: ws.workspace_members?.[0]?.count || 0
  }))
}

// Get workspace limits
export async function getWorkspaceLimits(workspaceId: string): Promise<WorkspaceLimits | null> {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { data } = await adminClient
    .from('workspace_limits')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single()

  return data
}

// Update workspace limits
export async function updateWorkspaceLimits(
  workspaceId: string,
  limits: Partial<Omit<WorkspaceLimits, 'workspace_id' | 'updated_at' | 'updated_by'>>
): Promise<void> {
  const user = await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('workspace_limits')
    .upsert({
      workspace_id: workspaceId,
      ...limits,
      updated_at: new Date().toISOString(),
      updated_by: user.id
    }, {
      onConflict: 'workspace_id'
    })

  if (error) throw error
  revalidatePath(`/super-admin/workspaces/${workspaceId}`)
}

// Get workspace details
export async function getWorkspaceDetails(workspaceId: string) {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const { data: workspace } = await adminClient
    .from('workspaces')
    .select(`
      *,
      workspace_members(
        user_id,
        role,
        profiles!user_id(email)
      )
    `)
    .eq('id', workspaceId)
    .single()

  const { data: limits } = await adminClient
    .from('workspace_limits')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single()

  return { workspace, limits }
}
