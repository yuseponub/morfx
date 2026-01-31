'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

// ============================================================================
// Types
// ============================================================================

export interface Team {
  id: string
  workspace_id: string
  name: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  user_id: string
  is_online: boolean
  last_assigned_at: string | null
  created_at: string
  // Extended fields from profiles join
  user_email?: string
  user_name?: string | null
}

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all teams with member count for current workspace
 */
export async function getTeams(): Promise<(Team & { member_count: number })[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

  const { data, error } = await supabase
    .from('teams')
    .select(`
      *,
      team_members(count)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at')

  if (error) {
    console.error('Error fetching teams:', error)
    return []
  }

  return (data || []).map(t => ({
    ...t,
    member_count: t.team_members?.[0]?.count || 0
  }))
}

/**
 * Get single team with its members
 */
export async function getTeamWithMembers(teamId: string): Promise<(Team & { members: TeamMember[] }) | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return null
  }

  // Get team
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .eq('workspace_id', workspaceId)
    .single()

  if (teamError || !team) {
    console.error('Error fetching team:', teamError)
    return null
  }

  // Get members
  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)

  if (membersError) {
    console.error('Error fetching team members:', membersError)
    return { ...team, members: [] }
  }

  // Get profiles for members
  const userIds = (members || []).map(m => m.user_id)
  let profileMap = new Map<string, { email: string; full_name: string | null }>()

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds)

    profileMap = new Map(profiles?.map(p => [p.id, { email: p.email, full_name: p.full_name }]) || [])
  }

  // Combine members with profile info
  const membersWithProfile: TeamMember[] = (members || []).map(m => ({
    ...m,
    user_email: profileMap.get(m.user_id)?.email,
    user_name: profileMap.get(m.user_id)?.full_name
  }))

  return {
    ...team,
    members: membersWithProfile
  }
}

/**
 * Get workspace members not in any team (for adding to a team)
 */
export async function getUnassignedMembers(): Promise<{ id: string; email: string; name: string | null }[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

  // Get all workspace members
  const { data: wsMembers, error: wsMembersError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)

  if (wsMembersError || !wsMembers) {
    console.error('Error fetching workspace members:', wsMembersError)
    return []
  }

  // Get all teams in workspace
  const { data: teams } = await supabase
    .from('teams')
    .select('id')
    .eq('workspace_id', workspaceId)

  const teamIds = (teams || []).map(t => t.id)

  // Get all team members in workspace teams
  let assignedUserIds = new Set<string>()
  if (teamIds.length > 0) {
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .in('team_id', teamIds)

    assignedUserIds = new Set((teamMembers || []).map(m => m.user_id))
  }

  // Filter to unassigned members
  const unassignedUserIds = wsMembers
    .filter(m => !assignedUserIds.has(m.user_id))
    .map(m => m.user_id)

  if (unassignedUserIds.length === 0) {
    return []
  }

  // Get profiles for unassigned members
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', unassignedUserIds)

  return (profiles || []).map(p => ({
    id: p.id,
    email: p.email,
    name: p.full_name
  }))
}

// ============================================================================
// Create/Update Operations
// ============================================================================

/**
 * Create a new team
 */
export async function createTeam(params: {
  name: string
  is_default?: boolean
}): Promise<ActionResult<Team>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Validate input
  if (!params.name.trim()) {
    return { error: 'El nombre es requerido', field: 'name' }
  }

  // If setting as default, unset other defaults first
  if (params.is_default) {
    await supabase
      .from('teams')
      .update({ is_default: false })
      .eq('workspace_id', workspaceId)
      .eq('is_default', true)
  }

  const { data, error } = await supabase
    .from('teams')
    .insert({
      workspace_id: workspaceId,
      name: params.name.trim(),
      is_default: params.is_default || false
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating team:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe un equipo con este nombre', field: 'name' }
    }
    return { error: 'Error al crear el equipo' }
  }

  revalidatePath('/configuracion/whatsapp/equipos')
  return { success: true, data }
}

/**
 * Update an existing team
 */
export async function updateTeam(
  id: string,
  params: { name?: string; is_default?: boolean }
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Validate input
  if (params.name !== undefined && !params.name.trim()) {
    return { error: 'El nombre es requerido', field: 'name' }
  }

  // If setting as default, unset other defaults first
  if (params.is_default) {
    await supabase
      .from('teams')
      .update({ is_default: false })
      .eq('workspace_id', workspaceId)
      .eq('is_default', true)
  }

  // Build update object
  const updates: { name?: string; is_default?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString()
  }
  if (params.name !== undefined) updates.name = params.name.trim()
  if (params.is_default !== undefined) updates.is_default = params.is_default

  const { error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error updating team:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe un equipo con este nombre', field: 'name' }
    }
    return { error: 'Error al actualizar el equipo' }
  }

  revalidatePath('/configuracion/whatsapp/equipos')
  return { success: true, data: undefined }
}

/**
 * Delete a team
 * Fails if team has members - remove members first
 */
export async function deleteTeam(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Check if team has members
  const { count } = await supabase
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', id)

  if (count && count > 0) {
    return { error: 'No se puede eliminar un equipo con miembros. Elimina los miembros primero.' }
  }

  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error deleting team:', error)
    return { error: 'Error al eliminar el equipo' }
  }

  revalidatePath('/configuracion/whatsapp/equipos')
  return { success: true, data: undefined }
}

// ============================================================================
// Team Member Operations
// ============================================================================

/**
 * Add a member to a team
 */
export async function addTeamMember(
  teamId: string,
  userId: string
): Promise<ActionResult<TeamMember>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { data, error } = await supabase
    .from('team_members')
    .insert({
      team_id: teamId,
      user_id: userId,
      is_online: false
    })
    .select()
    .single()

  if (error) {
    console.error('Error adding team member:', error)
    if (error.code === '23505') {
      return { error: 'Este miembro ya esta en el equipo' }
    }
    return { error: 'Error al agregar miembro al equipo' }
  }

  revalidatePath('/configuracion/whatsapp/equipos')
  return { success: true, data }
}

/**
 * Remove a member from a team
 */
export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)

  if (error) {
    console.error('Error removing team member:', error)
    return { error: 'Error al eliminar miembro del equipo' }
  }

  revalidatePath('/configuracion/whatsapp/equipos')
  return { success: true, data: undefined }
}
