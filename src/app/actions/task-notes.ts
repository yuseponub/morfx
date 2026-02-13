'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import type { TaskNoteWithUser } from '@/lib/tasks/types'
import {
  createTaskNote as domainCreateTaskNote,
  updateTaskNote as domainUpdateTaskNote,
  deleteTaskNote as domainDeleteTaskNote,
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
 * Get all notes for a task, sorted by created_at DESC (newest first)
 * Includes user info via separate profile query
 */
export async function getTaskNotes(taskId: string): Promise<TaskNoteWithUser[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  // Get notes for the task
  const { data: notes, error: notesError } = await supabase
    .from('task_notes')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (notesError) {
    console.error('Error fetching task notes:', notesError)
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
 * Create a new note for a task.
 * Auth + workspace validation here, mutation + activity logging in domain.
 */
export async function createTaskNote(taskId: string, content: string): Promise<ActionResult<TaskNoteWithUser>> {
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
  const result = await domainCreateTaskNote(ctx, {
    taskId,
    content: trimmedContent,
    createdBy: user.id,
  })

  if (!result.success) {
    return { error: result.error || 'Error al crear la nota' }
  }

  // Re-read the note with user profile for the response
  const { data: note } = await supabase
    .from('task_notes')
    .select('*')
    .eq('id', result.data!.noteId)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', user.id)
    .single()

  revalidatePath('/tareas')

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
 * Update an existing task note.
 * Auth + permission check here, mutation in domain.
 */
export async function updateTaskNote(noteId: string, content: string): Promise<ActionResult<void>> {
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

  // Get the note first to check permissions and get taskId
  const { data: note, error: fetchError } = await supabase
    .from('task_notes')
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
  const result = await domainUpdateTaskNote(ctx, { noteId, content: trimmedContent })

  if (!result.success) {
    return { error: result.error || 'Error al actualizar la nota' }
  }

  revalidatePath('/tareas')

  return { success: true, data: undefined }
}

// ============================================================================
// Delete Operations — delegates to domain
// ============================================================================

/**
 * Delete a task note.
 * Auth + permission check here, deletion + activity logging in domain.
 */
export async function deleteTaskNote(noteId: string): Promise<ActionResult<void>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Get the note first to check permissions
  const { data: note, error: fetchError } = await supabase
    .from('task_notes')
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
  const result = await domainDeleteTaskNote(ctx, { noteId })

  if (!result.success) {
    return { error: result.error || 'Error al eliminar la nota' }
  }

  revalidatePath('/tareas')

  return { success: true, data: undefined }
}
