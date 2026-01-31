'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { CreateWorkspaceInput, Workspace, WorkspaceWithRole } from '@/lib/types/database'

export async function createWorkspace(input: CreateWorkspaceInput) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Validate slug format
  const slugRegex = /^[a-z0-9-]+$/
  if (!slugRegex.test(input.slug)) {
    return { error: 'El slug solo puede contener letras minusculas, numeros y guiones' }
  }

  // Check if slug is available
  const { data: existing } = await supabase
    .from('workspaces')
    .select('id')
    .eq('slug', input.slug)
    .single()

  if (existing) {
    return { error: 'Este slug ya esta en uso' }
  }

  // Create workspace using the database function
  const { data, error } = await supabase
    .rpc('create_workspace_with_owner', {
      workspace_name: input.name,
      workspace_slug: input.slug,
      workspace_business_type: input.business_type || null
    })

  if (error) {
    console.error('Error creating workspace:', error)
    return { error: 'Error al crear el workspace' }
  }

  revalidatePath('/')
  return { success: true, workspaceId: data }
}

export async function getUserWorkspaces(): Promise<WorkspaceWithRole[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      role,
      workspace:workspaces (
        id,
        name,
        slug,
        business_type,
        owner_id,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error fetching workspaces:', error)
    return []
  }

  return (data || []).map((item) => ({
    ...(item.workspace as unknown as Workspace),
    role: item.role as WorkspaceWithRole['role']
  }))
}

export async function getWorkspaceBySlug(slug: string): Promise<WorkspaceWithRole | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select(`
      *,
      workspace_members!inner (
        role
      )
    `)
    .eq('slug', slug)
    .eq('workspace_members.user_id', user.id)
    .single()

  if (error || !data) {
    return null
  }

  const { workspace_members, ...workspace } = data
  return {
    ...workspace,
    role: (workspace_members as { role: string }[])[0]?.role as WorkspaceWithRole['role']
  }
}

export async function updateWorkspace(workspaceId: string, updates: Partial<Pick<Workspace, 'name' | 'business_type'>>) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .eq('owner_id', user.id)

  if (error) {
    console.error('Error updating workspace:', error)
    return { error: 'Error al actualizar el workspace' }
  }

  revalidatePath('/')
  return { success: true }
}

export async function deleteWorkspace(workspaceId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('owner_id', user.id)

  if (error) {
    console.error('Error deleting workspace:', error)
    return { error: 'Error al eliminar el workspace' }
  }

  revalidatePath('/')
  redirect('/create-workspace')
}

export async function switchWorkspace(slug: string) {
  // This just validates the workspace exists and user has access
  const workspace = await getWorkspaceBySlug(slug)
  if (!workspace) {
    return { error: 'Workspace no encontrado' }
  }

  // In a more complete implementation, you might store the active workspace
  // in a cookie or user metadata. For now, we just validate access.
  return { success: true, workspace }
}
