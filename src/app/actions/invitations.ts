'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { InviteMemberInput, WorkspaceInvitation, MemberWithUser } from '@/lib/types/database'

export async function inviteMember(workspaceId: string, input: InviteMemberInput) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Check if user is admin/owner in workspace
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'No tienes permisos para invitar miembros' }
  }

  // Check if user is already a member
  const { data: existingMember } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', (
      await supabase
        .from('auth.users')
        .select('id')
        .eq('email', input.email)
        .single()
    ).data?.id)
    .single()

  if (existingMember) {
    return { error: 'Este usuario ya es miembro del workspace' }
  }

  // Check if there's already a pending invitation
  const { data: existingInvitation } = await supabase
    .from('workspace_invitations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', input.email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (existingInvitation) {
    return { error: 'Ya existe una invitacion pendiente para este correo' }
  }

  // Generate invitation token
  const { data: token } = await supabase.rpc('generate_invitation_token')

  // Create invitation
  const { error } = await supabase
    .from('workspace_invitations')
    .insert({
      workspace_id: workspaceId,
      email: input.email,
      role: input.role,
      token,
      invited_by: user.id,
    })

  if (error) {
    console.error('Error creating invitation:', error)
    return { error: 'Error al crear la invitacion' }
  }

  revalidatePath('/settings/workspace/members')
  return { success: true, token }
}

export async function getWorkspaceInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workspace_invitations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching invitations:', error)
    return []
  }

  return data || []
}

export async function cancelInvitation(invitationId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Security #3: Fetch invitation to get workspace_id, then verify membership
  const { data: invitation } = await supabase
    .from('workspace_invitations')
    .select('workspace_id')
    .eq('id', invitationId)
    .single()

  if (!invitation) {
    return { error: 'Invitacion no encontrada' }
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', invitation.workspace_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'No tienes permisos para esta accion' }
  }

  const { error } = await supabase
    .from('workspace_invitations')
    .delete()
    .eq('id', invitationId)

  if (error) {
    console.error('Error cancelling invitation:', error)
    return { error: 'Error al cancelar la invitacion' }
  }

  revalidatePath('/settings/workspace/members')
  return { success: true }
}

export async function acceptInvitation(token: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado', requiresAuth: true }
  }

  // Use the database function to accept invitation
  const { data, error } = await supabase.rpc('accept_workspace_invitation', {
    invitation_token: token
  })

  if (error) {
    console.error('Error accepting invitation:', error)
    if (error.message.includes('Invalid or expired')) {
      return { error: 'La invitacion es invalida o ha expirado' }
    }
    if (error.message.includes('different email')) {
      return { error: 'Esta invitacion es para otro correo electronico' }
    }
    if (error.message.includes('Already a member')) {
      return { error: 'Ya eres miembro de este workspace' }
    }
    return { error: 'Error al aceptar la invitacion' }
  }

  revalidatePath('/')
  return { success: true, workspaceId: data }
}

export async function getInvitationByToken(token: string) {
  const supabase = await createClient()

  // Use RPC function to bypass RLS for public invitation viewing
  const { data, error } = await supabase.rpc('get_invitation_by_token', {
    invitation_token: token
  })

  if (error || !data) {
    return null
  }

  return data
}

export async function getWorkspaceMembers(workspaceId: string): Promise<MemberWithUser[]> {
  const supabase = await createClient()

  // Get members
  const { data: members, error: membersError } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (membersError) {
    console.error('Error fetching members:', membersError)
    return []
  }

  if (!members || members.length === 0) {
    return []
  }

  // Get profiles for these users
  const userIds = members.map(m => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds)

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

  // Combine data
  return members.map(member => ({
    ...member,
    user: {
      id: member.user_id,
      email: profileMap.get(member.user_id)?.email || 'Usuario'
    }
  }))
}

export async function removeMember(workspaceId: string, memberId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Security #3: Verify user is admin/owner of this workspace
  const { data: callerMembership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
    return { error: 'No tienes permisos para esta accion' }
  }

  // Check member to remove isn't the owner
  const { data: memberToRemove } = await supabase
    .from('workspace_members')
    .select('role, user_id')
    .eq('id', memberId)
    .single()

  if (!memberToRemove) {
    return { error: 'Miembro no encontrado' }
  }

  if (memberToRemove.role === 'owner') {
    return { error: 'No puedes eliminar al propietario del workspace' }
  }

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('id', memberId)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error removing member:', error)
    return { error: 'Error al eliminar el miembro' }
  }

  revalidatePath('/settings/workspace/members')
  return { success: true }
}

export async function updateMemberRole(
  workspaceId: string,
  memberId: string,
  newRole: 'admin' | 'agent'
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Security #3: Verify user is admin/owner of this workspace
  const { data: callerMembership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
    return { error: 'No tienes permisos para esta accion' }
  }

  // Can't change owner role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('id', memberId)
    .single()

  if (member?.role === 'owner') {
    return { error: 'No puedes cambiar el rol del propietario' }
  }

  const { error } = await supabase
    .from('workspace_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error updating member role:', error)
    return { error: 'Error al actualizar el rol' }
  }

  revalidatePath('/settings/workspace/members')
  return { success: true }
}
