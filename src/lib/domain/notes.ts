// ============================================================================
// Domain Layer — Notes (Contact Notes + Task Notes)
// Single source of truth for ALL note mutations.
// Every caller (server actions, tool handlers) goes through
// these functions instead of hitting DB directly.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Execute mutation
//   4. Log activity (contact_activity / task_activity)
//   5. Return DomainResult<T>
//
// Note: No triggers for notes in TRIGGER_CATALOG. Activity logging
// is the domain concern moved from server actions.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface CreateNoteParams {
  contactId: string
  content: string
  /** Display name for activity log (e.g. user email or 'bot') */
  createdBy: string
}

export interface UpdateNoteParams {
  noteId: string
  content: string
}

export interface DeleteNoteParams {
  noteId: string
}

export interface CreateTaskNoteParams {
  taskId: string
  content: string
  /** Display name for activity log (e.g. user email or 'bot') */
  createdBy: string
}

export interface UpdateTaskNoteParams {
  noteId: string
  content: string
}

export interface DeleteTaskNoteParams {
  noteId: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface CreateNoteResult {
  noteId: string
}

export interface UpdateNoteResult {
  noteId: string
}

export interface DeleteNoteResult {
  noteId: string
}

export interface CreateTaskNoteResult {
  noteId: string
}

export interface UpdateTaskNoteResult {
  noteId: string
}

export interface DeleteTaskNoteResult {
  noteId: string
}

// ============================================================================
// createNote — Contact note
// ============================================================================

/**
 * Create a note for a contact.
 * Inserts into contact_notes and logs activity to contact_activity.
 */
export async function createNote(
  ctx: DomainContext,
  params: CreateNoteParams
): Promise<DomainResult<CreateNoteResult>> {
  try {
    const supabase = createAdminClient()

    const trimmed = params.content.trim()
    if (!trimmed) {
      return { success: false, error: 'El contenido de la nota es requerido' }
    }

    // Insert note
    const { data: note, error: noteError } = await supabase
      .from('contact_notes')
      .insert({
        contact_id: params.contactId,
        workspace_id: ctx.workspaceId,
        user_id: params.createdBy,
        content: trimmed,
      })
      .select('id')
      .single()

    if (noteError) {
      console.error('[domain/notes] createNote error:', noteError)
      return { success: false, error: 'Error al crear la nota' }
    }

    // Log activity (fire-and-forget — don't block on failure)
    supabase
      .from('contact_activity')
      .insert({
        contact_id: params.contactId,
        workspace_id: ctx.workspaceId,
        user_id: params.createdBy,
        action: 'note_added',
        metadata: { preview: trimmed.substring(0, 100) },
      })
      .then(({ error: activityError }) => {
        if (activityError) {
          console.error('[domain/notes] Activity log error (createNote):', activityError)
        }
      })

    return { success: true, data: { noteId: note.id } }
  } catch (err) {
    console.error('[domain/notes] createNote unexpected error:', err)
    return { success: false, error: 'Error inesperado al crear la nota' }
  }
}

// ============================================================================
// updateNote — Contact note
// ============================================================================

/**
 * Update a contact note's content.
 */
export async function updateNote(
  ctx: DomainContext,
  params: UpdateNoteParams
): Promise<DomainResult<UpdateNoteResult>> {
  try {
    const supabase = createAdminClient()

    const trimmed = params.content.trim()
    if (!trimmed) {
      return { success: false, error: 'El contenido de la nota es requerido' }
    }

    // Verify note exists and belongs to workspace
    const { data: existing, error: fetchError } = await supabase
      .from('contact_notes')
      .select('id, contact_id, workspace_id')
      .eq('id', params.noteId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Nota no encontrada' }
    }

    // Update
    const { error: updateError } = await supabase
      .from('contact_notes')
      .update({ content: trimmed })
      .eq('id', params.noteId)
      .eq('workspace_id', ctx.workspaceId)

    if (updateError) {
      console.error('[domain/notes] updateNote error:', updateError)
      return { success: false, error: 'Error al actualizar la nota' }
    }

    return { success: true, data: { noteId: params.noteId } }
  } catch (err) {
    console.error('[domain/notes] updateNote unexpected error:', err)
    return { success: false, error: 'Error inesperado al actualizar la nota' }
  }
}

// ============================================================================
// deleteNote — Contact note
// ============================================================================

/**
 * Delete a contact note.
 * Logs deletion activity before removing the note.
 */
export async function deleteNote(
  ctx: DomainContext,
  params: DeleteNoteParams
): Promise<DomainResult<DeleteNoteResult>> {
  try {
    const supabase = createAdminClient()

    // Fetch note to verify ownership and get content for activity log
    const { data: existing, error: fetchError } = await supabase
      .from('contact_notes')
      .select('id, contact_id, workspace_id, user_id, content')
      .eq('id', params.noteId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Nota no encontrada' }
    }

    // Log activity BEFORE deletion (so we have the content preview)
    await supabase
      .from('contact_activity')
      .insert({
        contact_id: existing.contact_id,
        workspace_id: ctx.workspaceId,
        user_id: existing.user_id,
        action: 'note_deleted',
        metadata: { preview: existing.content.substring(0, 100) },
      })

    // Delete
    const { error: deleteError } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', params.noteId)

    if (deleteError) {
      console.error('[domain/notes] deleteNote error:', deleteError)
      return { success: false, error: 'Error al eliminar la nota' }
    }

    return { success: true, data: { noteId: params.noteId } }
  } catch (err) {
    console.error('[domain/notes] deleteNote unexpected error:', err)
    return { success: false, error: 'Error inesperado al eliminar la nota' }
  }
}

// ============================================================================
// createTaskNote — Task note
// ============================================================================

/**
 * Create a note for a task.
 * Inserts into task_notes and logs activity to task_activity.
 */
export async function createTaskNote(
  ctx: DomainContext,
  params: CreateTaskNoteParams
): Promise<DomainResult<CreateTaskNoteResult>> {
  try {
    const supabase = createAdminClient()

    const trimmed = params.content.trim()
    if (!trimmed) {
      return { success: false, error: 'El contenido de la nota es requerido' }
    }

    // Insert note
    const { data: note, error: noteError } = await supabase
      .from('task_notes')
      .insert({
        task_id: params.taskId,
        workspace_id: ctx.workspaceId,
        user_id: params.createdBy,
        content: trimmed,
      })
      .select('id')
      .single()

    if (noteError) {
      console.error('[domain/notes] createTaskNote error:', noteError)
      return { success: false, error: 'Error al crear la nota de tarea' }
    }

    // Log activity (fire-and-forget — don't block on failure)
    supabase
      .from('task_activity')
      .insert({
        task_id: params.taskId,
        workspace_id: ctx.workspaceId,
        user_id: params.createdBy,
        action: 'note_added',
        metadata: { preview: trimmed.substring(0, 100) },
      })
      .then(({ error: activityError }) => {
        if (activityError) {
          console.error('[domain/notes] Activity log error (createTaskNote):', activityError)
        }
      })

    return { success: true, data: { noteId: note.id } }
  } catch (err) {
    console.error('[domain/notes] createTaskNote unexpected error:', err)
    return { success: false, error: 'Error inesperado al crear la nota de tarea' }
  }
}

// ============================================================================
// updateTaskNote — Task note
// ============================================================================

/**
 * Update a task note's content.
 */
export async function updateTaskNote(
  ctx: DomainContext,
  params: UpdateTaskNoteParams
): Promise<DomainResult<UpdateTaskNoteResult>> {
  try {
    const supabase = createAdminClient()

    const trimmed = params.content.trim()
    if (!trimmed) {
      return { success: false, error: 'El contenido de la nota es requerido' }
    }

    // Verify note exists and belongs to workspace
    const { data: existing, error: fetchError } = await supabase
      .from('task_notes')
      .select('id, task_id, workspace_id')
      .eq('id', params.noteId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Nota no encontrada' }
    }

    // Update
    const { error: updateError } = await supabase
      .from('task_notes')
      .update({ content: trimmed })
      .eq('id', params.noteId)
      .eq('workspace_id', ctx.workspaceId)

    if (updateError) {
      console.error('[domain/notes] updateTaskNote error:', updateError)
      return { success: false, error: 'Error al actualizar la nota de tarea' }
    }

    return { success: true, data: { noteId: params.noteId } }
  } catch (err) {
    console.error('[domain/notes] updateTaskNote unexpected error:', err)
    return { success: false, error: 'Error inesperado al actualizar la nota de tarea' }
  }
}

// ============================================================================
// deleteTaskNote — Task note
// ============================================================================

/**
 * Delete a task note.
 * Logs deletion activity before removing the note.
 */
export async function deleteTaskNote(
  ctx: DomainContext,
  params: DeleteTaskNoteParams
): Promise<DomainResult<DeleteTaskNoteResult>> {
  try {
    const supabase = createAdminClient()

    // Fetch note to verify ownership and get content for activity log
    const { data: existing, error: fetchError } = await supabase
      .from('task_notes')
      .select('id, task_id, workspace_id, user_id, content')
      .eq('id', params.noteId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Nota no encontrada' }
    }

    // Log activity BEFORE deletion (so we have the content preview)
    await supabase
      .from('task_activity')
      .insert({
        task_id: existing.task_id,
        workspace_id: ctx.workspaceId,
        user_id: existing.user_id,
        action: 'note_deleted',
        metadata: { preview: existing.content.substring(0, 100) },
      })

    // Delete
    const { error: deleteError } = await supabase
      .from('task_notes')
      .delete()
      .eq('id', params.noteId)

    if (deleteError) {
      console.error('[domain/notes] deleteTaskNote error:', deleteError)
      return { success: false, error: 'Error al eliminar la nota de tarea' }
    }

    return { success: true, data: { noteId: params.noteId } }
  } catch (err) {
    console.error('[domain/notes] deleteTaskNote unexpected error:', err)
    return { success: false, error: 'Error inesperado al eliminar la nota de tarea' }
  }
}
