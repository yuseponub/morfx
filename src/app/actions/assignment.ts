'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

// ============================================================================
// Types
// ============================================================================

export interface AssignmentResult {
  agentId: string
  agentName: string
  teamId: string
}

export interface AvailableAgent {
  id: string
  name: string
  team: string
  teamId: string
  is_online: boolean
}

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string }

// ============================================================================
// Conversation Assignment
// ============================================================================

/**
 * Assign conversation to specific agent (or unassign if null)
 * Optionally set team association
 */
export async function assignConversation(
  conversationId: string,
  agentId: string | null,
  teamId?: string
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

  const updates: {
    assigned_to: string | null
    team_id?: string | null
    updated_at: string
  } = {
    assigned_to: agentId,
    updated_at: new Date().toISOString()
  }

  if (teamId !== undefined) {
    updates.team_id = teamId || null
  }

  const { error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error assigning conversation:', error)
    return { error: 'Error al asignar la conversacion' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

/**
 * Auto-assign to next available agent in team (round-robin)
 * Returns null if no agents are online
 */
export async function assignToNextAvailable(
  conversationId: string,
  teamId: string
): Promise<ActionResult<AssignmentResult | null>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Get online agents in team, ordered by last assignment (oldest first for round-robin)
  const { data: agents, error: agentsError } = await supabase
    .from('team_members')
    .select('user_id, last_assigned_at')
    .eq('team_id', teamId)
    .eq('is_online', true)
    .order('last_assigned_at', { ascending: true, nullsFirst: true })

  if (agentsError) {
    console.error('Error fetching team agents:', agentsError)
    return { error: 'Error al obtener agentes del equipo' }
  }

  if (!agents || agents.length === 0) {
    return { success: true, data: null }
  }

  // Round-robin: pick agent with oldest last_assigned_at (or null = never assigned)
  const nextAgent = agents[0]

  // Get agent profile for name
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', nextAgent.user_id)
    .single()

  // Update last_assigned_at for this agent
  const { error: updateError } = await supabase
    .from('team_members')
    .update({ last_assigned_at: new Date().toISOString() })
    .eq('team_id', teamId)
    .eq('user_id', nextAgent.user_id)

  if (updateError) {
    console.error('Error updating last_assigned_at:', updateError)
  }

  // Assign conversation
  const assignResult = await assignConversation(conversationId, nextAgent.user_id, teamId)
  if ('error' in assignResult) {
    return assignResult
  }

  return {
    success: true,
    data: {
      agentId: nextAgent.user_id,
      agentName: profile?.email?.split('@')[0] || 'Agente',
      teamId
    }
  }
}

// ============================================================================
// Agent Availability
// ============================================================================

/**
 * Set agent availability (online/offline)
 * Affects all teams the agent belongs to
 */
export async function setAgentAvailability(
  userId: string,
  isOnline: boolean
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Security: only allow setting own availability unless admin
  // For now, allow setting own availability
  if (userId !== user.id) {
    // TODO: Check if current user is admin/owner
    // For MVP, only allow self
    return { error: 'Solo puedes cambiar tu propia disponibilidad' }
  }

  const { error } = await supabase
    .from('team_members')
    .update({ is_online: isOnline })
    .eq('user_id', userId)

  if (error) {
    console.error('Error setting availability:', error)
    return { error: 'Error al actualizar disponibilidad' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

/**
 * Get current user's availability status
 * Returns true if online in any team
 */
export async function getMyAvailability(): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return false
  }

  const { data } = await supabase
    .from('team_members')
    .select('is_online')
    .eq('user_id', user.id)
    .eq('is_online', true)
    .limit(1)

  return (data?.length || 0) > 0
}

/**
 * Toggle current user's availability
 */
export async function toggleMyAvailability(): Promise<ActionResult<boolean>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const currentStatus = await getMyAvailability()
  const newStatus = !currentStatus

  const result = await setAgentAvailability(user.id, newStatus)
  if ('error' in result) {
    return result
  }

  return { success: true, data: newStatus }
}

// ============================================================================
// Available Agents List
// ============================================================================

/**
 * Get all agents available for manual assignment (grouped by team)
 */
export async function getAvailableAgents(): Promise<AvailableAgent[]> {
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

  // Get all teams in workspace
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name')
    .eq('workspace_id', workspaceId)

  if (teamsError || !teams || teams.length === 0) {
    return []
  }

  const teamIds = teams.map(t => t.id)
  const teamNameMap = new Map(teams.map(t => [t.id, t.name]))

  // Get all members in these teams
  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('user_id, team_id, is_online')
    .in('team_id', teamIds)

  if (membersError || !members) {
    return []
  }

  // Get profiles for all members
  const userIds = [...new Set(members.map(m => m.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds)

  const profileMap = new Map(
    profiles?.map(p => [p.id, { name: p.email.split('@')[0], email: p.email }]) || []
  )

  return members.map(m => ({
    id: m.user_id,
    name: profileMap.get(m.user_id)?.name || 'Agente',
    team: teamNameMap.get(m.team_id) || '',
    teamId: m.team_id,
    is_online: m.is_online
  }))
}

/**
 * Get online agents only (for quick selection)
 */
export async function getOnlineAgents(): Promise<AvailableAgent[]> {
  const all = await getAvailableAgents()
  return all.filter(a => a.is_online)
}

// ============================================================================
// Default Team
// ============================================================================

/**
 * Get the default team for new conversations
 */
export async function getDefaultTeam(): Promise<{ id: string; name: string } | null> {
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

  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .single()

  if (error || !data) {
    // If no default, return first team
    const { data: firstTeam } = await supabase
      .from('teams')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .order('created_at')
      .limit(1)
      .single()

    return firstTeam || null
  }

  return data
}
