// ============================================================================
// Domain Layer — Conversations
// Single source of truth for ALL conversation mutations.
// Every caller (server actions, tool handlers, webhooks) goes through
// these functions instead of hitting DB directly.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Execute mutation
//   4. Return DomainResult<T>
//
// Note: No automation triggers currently defined for conversations.
// These functions provide domain encapsulation for consistency.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface AssignConversationParams {
  conversationId: string
  /** User ID to assign to, or null to unassign */
  assignedTo: string | null
  /** Optional team ID for team assignment */
  teamId?: string | null
}

export interface ArchiveConversationParams {
  conversationId: string
}

export interface LinkContactToConversationParams {
  conversationId: string
  contactId: string
}

export interface FindOrCreateConversationParams {
  phone: string
  contactId?: string | null
  whatsappAccountId?: string | null
  profileName?: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface AssignConversationResult {
  conversationId: string
}

export interface ArchiveConversationResult {
  conversationId: string
}

export interface LinkContactToConversationResult {
  conversationId: string
  contactId: string
}

export interface FindOrCreateConversationResult {
  conversationId: string
  created: boolean
}

// ============================================================================
// assignConversation
// ============================================================================

/**
 * Assign a conversation to an agent (or unassign if null).
 *
 * Updates assigned_to and updated_at. Optionally sets team_id.
 * No trigger emitted (no conversation triggers in TRIGGER_CATALOG).
 */
export async function assignConversation(
  ctx: DomainContext,
  params: AssignConversationParams
): Promise<DomainResult<AssignConversationResult>> {
  const supabase = createAdminClient()

  // Verify conversation exists in workspace
  const { data: existing, error: readError } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', params.conversationId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (readError || !existing) {
    return { success: false, error: 'Conversacion no encontrada' }
  }

  // Build update payload
  const updates: Record<string, unknown> = {
    assigned_to: params.assignedTo,
    updated_at: new Date().toISOString(),
  }

  if (params.teamId !== undefined) {
    updates.team_id = params.teamId || null
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', params.conversationId)
    .eq('workspace_id', ctx.workspaceId)

  if (updateError) {
    console.error('[domain/conversations] assignConversation failed:', updateError.message)
    return { success: false, error: updateError.message || 'Error al asignar conversacion' }
  }

  return { success: true, data: { conversationId: params.conversationId } }
}

// ============================================================================
// archiveConversation
// ============================================================================

/**
 * Archive (close) a conversation.
 *
 * Sets status='archived' and updated_at timestamp.
 * "close" in tool handlers maps to "archived" status (Decision [12-03]).
 */
export async function archiveConversation(
  ctx: DomainContext,
  params: ArchiveConversationParams
): Promise<DomainResult<ArchiveConversationResult>> {
  const supabase = createAdminClient()

  // Verify conversation exists in workspace
  const { data: existing, error: readError } = await supabase
    .from('conversations')
    .select('id, status')
    .eq('id', params.conversationId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (readError || !existing) {
    return { success: false, error: 'Conversacion no encontrada' }
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update({
      status: 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.conversationId)
    .eq('workspace_id', ctx.workspaceId)

  if (updateError) {
    console.error('[domain/conversations] archiveConversation failed:', updateError.message)
    return { success: false, error: updateError.message || 'Error al archivar conversacion' }
  }

  return { success: true, data: { conversationId: params.conversationId } }
}

// ============================================================================
// linkContactToConversation
// ============================================================================

/**
 * Link a contact to a conversation.
 *
 * Sets conversations.contact_id = contactId.
 * Used for manual association and webhook auto-linking.
 */
export async function linkContactToConversation(
  ctx: DomainContext,
  params: LinkContactToConversationParams
): Promise<DomainResult<LinkContactToConversationResult>> {
  const supabase = createAdminClient()

  // Verify conversation exists in workspace
  const { data: existing, error: readError } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', params.conversationId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (readError || !existing) {
    return { success: false, error: 'Conversacion no encontrada' }
  }

  // Verify contact exists in same workspace
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', params.contactId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (contactError || !contact) {
    return { success: false, error: 'Contacto no encontrado' }
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update({ contact_id: params.contactId })
    .eq('id', params.conversationId)
    .eq('workspace_id', ctx.workspaceId)

  if (updateError) {
    console.error('[domain/conversations] linkContactToConversation failed:', updateError.message)
    return { success: false, error: updateError.message || 'Error al vincular contacto' }
  }

  return {
    success: true,
    data: { conversationId: params.conversationId, contactId: params.contactId },
  }
}

// ============================================================================
// findOrCreateConversation
// ============================================================================

/**
 * Find an existing conversation by phone + workspace, or create a new one.
 *
 * Handles race conditions via unique constraint (phone + workspace_id) with
 * retry on 23505 duplicate key error.
 *
 * If conversation exists and profileName is provided, updates it if changed.
 * If contactId is provided on creation, links the contact.
 */
export async function findOrCreateConversation(
  ctx: DomainContext,
  params: FindOrCreateConversationParams
): Promise<DomainResult<FindOrCreateConversationResult>> {
  const supabase = createAdminClient()

  // Try to find existing conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, profile_name')
    .eq('workspace_id', ctx.workspaceId)
    .eq('phone', params.phone)
    .single()

  if (existing) {
    // Update profile_name if it changed or was empty
    if (params.profileName && existing.profile_name !== params.profileName) {
      await supabase
        .from('conversations')
        .update({ profile_name: params.profileName })
        .eq('id', existing.id)
    }
    return { success: true, data: { conversationId: existing.id, created: false } }
  }

  // Create new conversation
  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      workspace_id: ctx.workspaceId,
      phone: params.phone,
      phone_number_id: params.whatsappAccountId || '',
      profile_name: params.profileName || null,
      contact_id: params.contactId || null,
    })
    .select('id')
    .single()

  if (error) {
    // Handle race condition: conversation created by another request
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('conversations')
        .select('id')
        .eq('workspace_id', ctx.workspaceId)
        .eq('phone', params.phone)
        .single()

      if (retry) {
        return { success: true, data: { conversationId: retry.id, created: false } }
      }
    }

    console.error('[domain/conversations] findOrCreateConversation failed:', error.message)
    return { success: false, error: error.message || 'Error al crear conversacion' }
  }

  return { success: true, data: { conversationId: created.id, created: true } }
}
