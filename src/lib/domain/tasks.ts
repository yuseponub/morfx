// ============================================================================
// Domain Layer — Tasks
// Single source of truth for ALL task mutations.
// Every caller (server actions, tool handlers, automations) goes through
// these functions instead of hitting DB directly.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Execute mutation
//   4. Emit trigger (fire-and-forget) — only task.completed
//   5. Return DomainResult<T>
//
// Note: No task.created trigger exists in TRIGGER_CATALOG.
// Only task.completed is emitted (when status changes to 'completed').
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { emitTaskCompleted } from '@/lib/automations/trigger-emitter'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface CreateTaskParams {
  title: string
  description?: string
  dueDate?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  status?: 'pending' | 'in_progress' | 'completed'
  contactId?: string
  orderId?: string
  conversationId?: string
  assignedTo?: string
}

export interface UpdateTaskParams {
  taskId: string
  title?: string
  description?: string | null
  dueDate?: string | null
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  status?: 'pending' | 'in_progress' | 'completed'
  assignedTo?: string | null
}

export interface CompleteTaskParams {
  taskId: string
}

export interface DeleteTaskParams {
  taskId: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface CreateTaskResult {
  taskId: string
}

export interface UpdateTaskResult {
  taskId: string
}

export interface CompleteTaskResult {
  taskId: string
}

export interface DeleteTaskResult {
  taskId: string
}

// ============================================================================
// createTask
// ============================================================================

/**
 * Create a new task in the workspace.
 *
 * Validates exclusive arc: at most one of contactId/orderId/conversationId.
 * No trigger emitted (task.created not in TRIGGER_CATALOG).
 */
export async function createTask(
  ctx: DomainContext,
  params: CreateTaskParams
): Promise<DomainResult<CreateTaskResult>> {
  const supabase = createAdminClient()

  // Validate title
  if (!params.title?.trim()) {
    return { success: false, error: 'El titulo es requerido' }
  }

  // Validate exclusive arc: at most one entity linked
  const entityCount = [params.contactId, params.orderId, params.conversationId]
    .filter(Boolean).length
  if (entityCount > 1) {
    return {
      success: false,
      error: 'Una tarea solo puede estar vinculada a un contacto, pedido o conversacion',
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: ctx.workspaceId,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      due_date: params.dueDate || null,
      priority: params.priority || 'medium',
      status: params.status || 'pending',
      contact_id: params.contactId || null,
      order_id: params.orderId || null,
      conversation_id: params.conversationId || null,
      assigned_to: params.assignedTo || null,
    })
    .select('id, title, status')
    .single()

  if (error || !data) {
    console.error('[domain/tasks] createTask failed:', error?.message)
    return { success: false, error: error?.message || 'Error al crear la tarea' }
  }

  // If created with status='completed', emit trigger
  if (data.status === 'completed') {
    emitTaskCompleted({
      workspaceId: ctx.workspaceId,
      taskId: data.id,
      taskTitle: data.title,
      contactId: params.contactId || null,
      orderId: params.orderId || null,
      cascadeDepth: ctx.cascadeDepth,
    })
  }

  return { success: true, data: { taskId: data.id } }
}

// ============================================================================
// updateTask
// ============================================================================

/**
 * Update a task's fields.
 *
 * If status changes to 'completed', sets completed_at and emits
 * task.completed trigger. If status changes away from 'completed',
 * clears completed_at.
 */
export async function updateTask(
  ctx: DomainContext,
  params: UpdateTaskParams
): Promise<DomainResult<UpdateTaskResult>> {
  const supabase = createAdminClient()

  // Read current task
  const { data: current, error: readError } = await supabase
    .from('tasks')
    .select('id, title, status, contact_id, order_id')
    .eq('id', params.taskId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (readError || !current) {
    return { success: false, error: 'Tarea no encontrada' }
  }

  // Build update object
  const updates: Record<string, unknown> = {}

  if (params.title !== undefined) {
    if (!params.title?.trim()) {
      return { success: false, error: 'El titulo es requerido' }
    }
    updates.title = params.title.trim()
  }

  if (params.description !== undefined) {
    updates.description = params.description?.trim() || null
  }

  if (params.dueDate !== undefined) {
    updates.due_date = params.dueDate
  }

  if (params.priority !== undefined) {
    updates.priority = params.priority
  }

  if (params.assignedTo !== undefined) {
    updates.assigned_to = params.assignedTo
  }

  if (params.status !== undefined) {
    updates.status = params.status
    if (params.status === 'completed') {
      // Use Colombia timezone for completed_at (CLAUDE.md Regla 2)
      updates.completed_at = new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' })
    } else if (current.status === 'completed') {
      // Reopening: clear completed_at (params.status is not 'completed' in this branch)
      updates.completed_at = null
    }
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: 'No hay cambios para guardar' }
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', params.taskId)
    .eq('workspace_id', ctx.workspaceId)

  if (updateError) {
    console.error('[domain/tasks] updateTask failed:', updateError.message)
    return { success: false, error: updateError.message || 'Error al actualizar la tarea' }
  }

  // Emit task.completed trigger if status changed to completed
  if (params.status === 'completed' && current.status !== 'completed') {
    const taskTitle = params.title?.trim() || current.title
    emitTaskCompleted({
      workspaceId: ctx.workspaceId,
      taskId: params.taskId,
      taskTitle,
      contactId: current.contact_id ?? null,
      orderId: current.order_id ?? null,
      cascadeDepth: ctx.cascadeDepth,
    })
  }

  return { success: true, data: { taskId: params.taskId } }
}

// ============================================================================
// completeTask
// ============================================================================

/**
 * Mark a task as completed.
 *
 * Sets status='completed' + completed_at with Colombia timezone.
 * Emits task.completed trigger.
 */
export async function completeTask(
  ctx: DomainContext,
  params: CompleteTaskParams
): Promise<DomainResult<CompleteTaskResult>> {
  const supabase = createAdminClient()

  // Read current task
  const { data: current, error: readError } = await supabase
    .from('tasks')
    .select('id, title, status, contact_id, order_id')
    .eq('id', params.taskId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (readError || !current) {
    return { success: false, error: 'Tarea no encontrada' }
  }

  // Already completed — no-op
  if (current.status === 'completed') {
    return { success: true, data: { taskId: params.taskId } }
  }

  // Use Colombia timezone for completed_at (CLAUDE.md Regla 2)
  const completedAt = new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' })

  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      status: 'completed',
      completed_at: completedAt,
    })
    .eq('id', params.taskId)
    .eq('workspace_id', ctx.workspaceId)

  if (updateError) {
    console.error('[domain/tasks] completeTask failed:', updateError.message)
    return { success: false, error: updateError.message || 'Error al completar la tarea' }
  }

  // Emit task.completed trigger
  emitTaskCompleted({
    workspaceId: ctx.workspaceId,
    taskId: params.taskId,
    taskTitle: current.title,
    contactId: current.contact_id ?? null,
    orderId: current.order_id ?? null,
    cascadeDepth: ctx.cascadeDepth,
  })

  return { success: true, data: { taskId: params.taskId } }
}

// ============================================================================
// deleteTask
// ============================================================================

/**
 * Delete a task. Verifies it belongs to the workspace first.
 * No trigger emitted (no task.deleted in TRIGGER_CATALOG).
 */
export async function deleteTask(
  ctx: DomainContext,
  params: DeleteTaskParams
): Promise<DomainResult<DeleteTaskResult>> {
  const supabase = createAdminClient()

  // Verify task exists and belongs to workspace
  const { data: existing, error: readError } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', params.taskId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (readError || !existing) {
    return { success: false, error: 'Tarea no encontrada' }
  }

  const { error: deleteError } = await supabase
    .from('tasks')
    .delete()
    .eq('id', params.taskId)
    .eq('workspace_id', ctx.workspaceId)

  if (deleteError) {
    console.error('[domain/tasks] deleteTask failed:', deleteError.message)
    return { success: false, error: deleteError.message || 'Error al eliminar la tarea' }
  }

  return { success: true, data: { taskId: params.taskId } }
}
