'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import type { ContactNoteWithUser } from '@/lib/custom-fields/types'
import {
  createNote as domainCreateNote,
  updateNote as domainUpdateNote,
  deleteNote as domainDeleteNote,
} from '@/lib/domain/notes'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string }

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all notes for a contact, sorted by created_at DESC (newest first)
 * Includes user info via left join with profiles
 */
export async function getContactNotes(contactId: string): Promise<ContactNoteWithUser[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  // Get notes for the contact
  const { data: notes, error: notesError } = await supabase
    .from('contact_notes')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })

  if (notesError) {
    console.error('Error fetching notes:', notesError)
    return []
  }

  if (!notes || notes.length === 0) {
    return []
  }

  // Get user profiles for note authors
  const userIds = [...new Set(notes.map(n => n.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds)

  // Build profile lookup map
  const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

  // Combine notes with user info
  return notes.map(note => ({
    ...note,
    user: profileMap.get(note.user_id) || { id: note.user_id, email: 'Usuario desconocido' }
  }))
}

// ============================================================================
// Create Operations — delegates to domain
// ============================================================================

/**
 * Create a new note for a contact.
 * Auth + workspace validation here, mutation + activity logging in domain.
 */
export async function createNote(contactId: string, content: string): Promise<ActionResult<ContactNoteWithUser>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Validate content
  const trimmedContent = content.trim()
  if (!trimmedContent) {
    return { error: 'El contenido de la nota es requerido' }
  }

  // Get workspace_id from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Delegate to domain
  const ctx: DomainContext = { workspaceId, source: 'server-action' }
  const result = await domainCreateNote(ctx, {
    contactId,
    content: trimmedContent,
    createdBy: user.id,
  })

  if (!result.success) {
    return { error: result.error || 'Error al crear la nota' }
  }

  // Re-read the note with user profile for the response
  const { data: note } = await supabase
    .from('contact_notes')
    .select('*')
    .eq('id', result.data!.noteId)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', user.id)
    .single()

  revalidatePath(`/crm/contactos/${contactId}`)

  return {
    success: true,
    data: {
      ...note!,
      user: profile || { id: user.id, email: user.email || 'Usuario' }
    }
  }
}

// ============================================================================
// Update Operations — delegates to domain
// ============================================================================

/**
 * Update an existing note.
 * Auth + permission check here, mutation in domain.
 */
export async function updateNote(noteId: string, content: string): Promise<ActionResult<void>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Validate content
  const trimmedContent = content.trim()
  if (!trimmedContent) {
    return { error: 'El contenido de la nota es requerido' }
  }

  // Get the note first to check permissions and get contactId
  const { data: note, error: fetchError } = await supabase
    .from('contact_notes')
    .select('*')
    .eq('id', noteId)
    .single()

  if (fetchError || !note) {
    return { error: 'Nota no encontrada' }
  }

  // Check if user is author or admin/owner
  const isAuthor = note.user_id === user.id

  if (!isAuthor) {
    // Check if user is admin or owner of the workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', note.workspace_id)
      .eq('user_id', user.id)
      .single()

    const isAdminOrOwner = membership?.role === 'admin' || membership?.role === 'owner'

    if (!isAdminOrOwner) {
      return { error: 'No tienes permiso para editar esta nota' }
    }
  }

  // Delegate to domain
  const ctx: DomainContext = { workspaceId: note.workspace_id, source: 'server-action' }
  const result = await domainUpdateNote(ctx, { noteId, content: trimmedContent })

  if (!result.success) {
    return { error: result.error || 'Error al actualizar la nota' }
  }

  revalidatePath(`/crm/contactos/${note.contact_id}`)

  return { success: true, data: undefined }
}

// ============================================================================
// Delete Operations — delegates to domain
// ============================================================================

/**
 * Delete a note.
 * Auth + permission check here, deletion + activity logging in domain.
 */
export async function deleteNote(noteId: string): Promise<ActionResult<void>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Get the note first to check permissions
  const { data: note, error: fetchError } = await supabase
    .from('contact_notes')
    .select('*')
    .eq('id', noteId)
    .single()

  if (fetchError || !note) {
    return { error: 'Nota no encontrada' }
  }

  // Check if user is author or admin/owner
  const isAuthor = note.user_id === user.id

  if (!isAuthor) {
    // Check if user is admin or owner of the workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', note.workspace_id)
      .eq('user_id', user.id)
      .single()

    const isAdminOrOwner = membership?.role === 'admin' || membership?.role === 'owner'

    if (!isAdminOrOwner) {
      return { error: 'No tienes permiso para eliminar esta nota' }
    }
  }

  // Delegate to domain (handles activity logging + deletion)
  const ctx: DomainContext = { workspaceId: note.workspace_id, source: 'server-action' }
  const result = await domainDeleteNote(ctx, { noteId })

  if (!result.success) {
    return { error: result.error || 'Error al eliminar la nota' }
  }

  revalidatePath(`/crm/contactos/${note.contact_id}`)

  return { success: true, data: undefined }
}
