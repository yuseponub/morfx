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
    .select('id, title, description, status')
    .single()

  if (error || !data) {
    console.error('[domain/tasks] createTask failed:', error?.message)
    return { success: false, error: error?.message || 'Error al crear la tarea' }
  }

  // If created with status='completed', emit trigger
  if (data.status === 'completed') {
    // Fetch contact name if available
    let contactName: string | undefined
    if (params.contactId) {
      const supabase2 = createAdminClient()
      const { data: contact } = await supabase2
        .from('contacts')
        .select('name')
        .eq('id', params.contactId)
        .eq('workspace_id', ctx.workspaceId)
        .single()
      contactName = contact?.name ?? undefined
    }

    await emitTaskCompleted({
      workspaceId: ctx.workspaceId,
      taskId: data.id,
      taskTitle: data.title,
      taskDescription: data.description,
      contactId: params.contactId || null,
      contactName,
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
    .select('id, title, description, status, contact_id, order_id')
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
      updates.completed_at = new Date().toISOString()
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
    const taskDescription = params.description !== undefined ? params.description : current.description

    // Fetch contact name if available
    let contactName: string | undefined
    if (current.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name')
        .eq('id', current.contact_id)
        .eq('workspace_id', ctx.workspaceId)
        .single()
      contactName = contact?.name ?? undefined
    }

    await emitTaskCompleted({
      workspaceId: ctx.workspaceId,
      taskId: params.taskId,
      taskTitle,
      taskDescription: taskDescription ?? undefined,
      contactId: current.contact_id ?? null,
      contactName,
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
    .select('id, title, description, status, contact_id, order_id')
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

  const completedAt = new Date().toISOString()

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

  // Fetch contact name if available
  let contactName: string | undefined
  if (current.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('name')
      .eq('id', current.contact_id)
      .eq('workspace_id', ctx.workspaceId)
      .single()
    contactName = contact?.name ?? undefined
  }

  // Emit task.completed trigger
  await emitTaskCompleted({
    workspaceId: ctx.workspaceId,
    taskId: params.taskId,
    taskTitle: current.title,
    taskDescription: current.description,
    contactId: current.contact_id ?? null,
    contactName,
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

// ============================================================================
// getTaskById (Standalone crm-mutation-tools — Wave 0)
// Rehydrate prerequisite for Plan 04 (D-09). A11 gap closure: previously
// tasks domain did not expose a by-id reader, forcing tools to fabricate
// snapshots from input (Pitfall 6). Filtra por workspace_id (Regla 3) y
// retorna null si no existe en este workspace (caller mapea a
// resource_not_found).
// Nota: schema real (migración 20260203000004_tasks_foundation.sql) NO tiene
// columna archived_at — soft-delete en tasks usa completed_at. El interface
// TaskDetail no expone archivedAt por eso (A11 ajuste).
// Columna real es `due_date` (no due_at).
// ============================================================================

export interface TaskDetail {
  taskId: string
  workspaceId: string
  title: string
  description: string | null
  status: string
  priority: string
  contactId: string | null
  orderId: string | null
  conversationId: string | null
  assignedTo: string | null
  /** Mapeado desde columna DB `due_date`. */
  dueDate: string | null
  completedAt: string | null
  createdAt: string
}

/**
 * Lookup a task by id. Filtered by workspace_id (Regla 3).
 * Returns DomainResult<TaskDetail | null> — null = not found en este workspace.
 *
 * Standalone crm-mutation-tools Wave 0 (A11 gap closure for Plan 04 rehydrate, D-09).
 */
export async function getTaskById(
  ctx: DomainContext,
  params: { taskId: string },
): Promise<DomainResult<TaskDetail | null>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, workspace_id, title, description, status, priority, contact_id, order_id, conversation_id, assigned_to, due_date, completed_at, created_at',
    )
    .eq('id', params.taskId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: true, data: null }
  return {
    success: true,
    data: {
      taskId: data.id as string,
      workspaceId: data.workspace_id as string,
      title: data.title as string,
      description: (data.description as string | null) ?? null,
      status: data.status as string,
      priority: data.priority as string,
      contactId: (data.contact_id as string | null) ?? null,
      orderId: (data.order_id as string | null) ?? null,
      conversationId: (data.conversation_id as string | null) ?? null,
      assignedTo: (data.assigned_to as string | null) ?? null,
      dueDate: (data.due_date as string | null) ?? null,
      completedAt: (data.completed_at as string | null) ?? null,
      createdAt: data.created_at as string,
    },
  }
}
