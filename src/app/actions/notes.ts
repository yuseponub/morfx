'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import type { ContactNoteWithUser } from '@/lib/custom-fields/types'

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
// Create Operations
// ============================================================================

/**
 * Create a new note for a contact
 * Also creates an activity record for the note
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

  // Insert note
  const { data: note, error: noteError } = await supabase
    .from('contact_notes')
    .insert({
      contact_id: contactId,
      workspace_id: workspaceId,
      user_id: user.id,
      content: trimmedContent,
    })
    .select()
    .single()

  if (noteError) {
    console.error('Error creating note:', noteError)
    return { error: 'Error al crear la nota' }
  }

  // Insert activity record for note creation
  const { error: activityError } = await supabase
    .from('contact_activity')
    .insert({
      contact_id: contactId,
      workspace_id: workspaceId,
      user_id: user.id,
      action: 'note_added',
      metadata: { preview: trimmedContent.substring(0, 100) }
    })

  if (activityError) {
    console.error('Error logging note activity:', activityError)
    // Don't fail the operation, just log the error
  }

  // Get user profile for the response
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', user.id)
    .single()

  revalidatePath(`/crm/contactos/${contactId}`)

  return {
    success: true,
    data: {
      ...note,
      user: profile || { id: user.id, email: user.email || 'Usuario' }
    }
  }
}

// ============================================================================
// Update Operations
// ============================================================================

/**
 * Update an existing note
 * Only the author or admin/owner can update notes
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

  // Update the note
  const { error: updateError } = await supabase
    .from('contact_notes')
    .update({ content: trimmedContent })
    .eq('id', noteId)

  if (updateError) {
    console.error('Error updating note:', updateError)
    return { error: 'Error al actualizar la nota' }
  }

  // Insert activity record for note update
  const { error: activityError } = await supabase
    .from('contact_activity')
    .insert({
      contact_id: note.contact_id,
      workspace_id: note.workspace_id,
      user_id: user.id,
      action: 'note_updated',
      metadata: { note_id: noteId, preview: trimmedContent.substring(0, 100) }
    })

  if (activityError) {
    console.error('Error logging note update activity:', activityError)
  }

  revalidatePath(`/crm/contactos/${note.contact_id}`)

  return { success: true, data: undefined }
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete a note
 * Only the author or admin/owner can delete notes
 */
export async function deleteNote(noteId: string): Promise<ActionResult<void>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Get the note first to check permissions and get content for activity log
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

  // Insert activity record before deleting (so we have the content preview)
  const { error: activityError } = await supabase
    .from('contact_activity')
    .insert({
      contact_id: note.contact_id,
      workspace_id: note.workspace_id,
      user_id: user.id,
      action: 'note_deleted',
      metadata: { preview: note.content.substring(0, 100) }
    })

  if (activityError) {
    console.error('Error logging note deletion activity:', activityError)
  }

  // Delete the note
  const { error: deleteError } = await supabase
    .from('contact_notes')
    .delete()
    .eq('id', noteId)

  if (deleteError) {
    console.error('Error deleting note:', deleteError)
    return { error: 'Error al eliminar la nota' }
  }

  revalidatePath(`/crm/contactos/${note.contact_id}`)

  return { success: true, data: undefined }
}
