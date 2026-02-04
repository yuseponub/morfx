'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import type {
  Task,
  TaskWithDetails,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilters,
  TaskSummary,
  TaskType,
  CreateTaskTypeInput,
  UpdateTaskTypeInput,
} from '@/lib/tasks/types'

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string }

// ============================================================================
// Helper: Get Workspace ID
// ============================================================================

async function getWorkspaceId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('morfx_workspace')?.value ?? null
}

// ============================================================================
// Task CRUD Operations
// ============================================================================

/**
 * Get tasks with optional filters.
 * Returns tasks with related entities: contact, order, conversation, assigned user, task type.
 * Ordered by: overdue first, then by due_date ASC, then by created_at DESC.
 */
export async function getTasks(filters?: TaskFilters): Promise<TaskWithDetails[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) {
    return []
  }

  let query = supabase
    .from('tasks')
    .select(`
      *,
      task_type:task_types(*),
      contact:contacts(id, name, phone),
      order:orders(id, total_value, contact:contacts(name)),
      conversation:conversations(id, phone, contact:contacts(name)),
      assigned_user:profiles!tasks_assigned_to_fkey(id, email),
      created_user:profiles!tasks_created_by_fkey(id, email)
    `)
    .eq('workspace_id', workspaceId)

  // Apply filters
  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters?.priority) {
    query = query.eq('priority', filters.priority)
  }

  if (filters?.assigned_to) {
    if (filters.assigned_to === 'me') {
      query = query.eq('assigned_to', user.id)
    } else if (filters.assigned_to === 'unassigned') {
      query = query.is('assigned_to', null)
    } else {
      query = query.eq('assigned_to', filters.assigned_to)
    }
  }

  if (filters?.entity_type) {
    if (filters.entity_type === 'contact') {
      query = query.not('contact_id', 'is', null)
    } else if (filters.entity_type === 'order') {
      query = query.not('order_id', 'is', null)
    } else if (filters.entity_type === 'conversation') {
      query = query.not('conversation_id', 'is', null)
    }

    if (filters.entity_id) {
      if (filters.entity_type === 'contact') {
        query = query.eq('contact_id', filters.entity_id)
      } else if (filters.entity_type === 'order') {
        query = query.eq('order_id', filters.entity_id)
      } else if (filters.entity_type === 'conversation') {
        query = query.eq('conversation_id', filters.entity_id)
      }
    }
  }

  if (filters?.task_type_id) {
    query = query.eq('task_type_id', filters.task_type_id)
  }

  if (filters?.due_before) {
    query = query.lte('due_date', filters.due_before)
  }

  if (filters?.due_after) {
    query = query.gte('due_date', filters.due_after)
  }

  if (filters?.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
  }

  // Order: overdue first (pending + past due), then by due_date ASC, then created_at DESC
  // We'll handle the overdue-first ordering in post-processing for simplicity
  query = query.order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('Error fetching tasks:', error)
    return []
  }

  // Post-process: sort overdue tasks first
  const now = new Date()
  const tasks = (data || []) as any[]

  tasks.sort((a, b) => {
    const aIsOverdue = a.status === 'pending' && a.due_date && new Date(a.due_date) < now
    const bIsOverdue = b.status === 'pending' && b.due_date && new Date(b.due_date) < now

    // Overdue tasks first
    if (aIsOverdue && !bIsOverdue) return -1
    if (!aIsOverdue && bIsOverdue) return 1

    // Then by due_date (nulls last)
    if (a.due_date && !b.due_date) return -1
    if (!a.due_date && b.due_date) return 1
    if (a.due_date && b.due_date) {
      const dateCompare = new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      if (dateCompare !== 0) return dateCompare
    }

    // Then by created_at DESC
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return tasks as TaskWithDetails[]
}

/**
 * Get a single task by ID with all relations.
 */
export async function getTask(id: string): Promise<TaskWithDetails | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      task_type:task_types(*),
      contact:contacts(id, name, phone),
      order:orders(id, total_value, contact:contacts(name)),
      conversation:conversations(id, phone, contact:contacts(name)),
      assigned_user:profiles!tasks_assigned_to_fkey(id, email),
      created_user:profiles!tasks_created_by_fkey(id, email)
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('Error fetching task:', error)
    return null
  }

  return data as TaskWithDetails
}

/**
 * Create a new task.
 * Validates that at most one entity_id is provided (exclusive arc).
 */
export async function createTask(input: CreateTaskInput): Promise<ActionResult<Task>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Validate exclusive arc: at most one entity can be linked
  const entityCount = [input.contact_id, input.order_id, input.conversation_id]
    .filter(Boolean).length
  if (entityCount > 1) {
    return { error: 'Una tarea solo puede estar vinculada a un contacto, pedido o conversacion' }
  }

  // Validate title
  if (!input.title?.trim()) {
    return { error: 'El titulo es requerido' }
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: workspaceId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.due_date || null,
      priority: input.priority || 'medium',
      status: 'pending',
      task_type_id: input.task_type_id || null,
      assigned_to: input.assigned_to || null,
      contact_id: input.contact_id || null,
      order_id: input.order_id || null,
      conversation_id: input.conversation_id || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('Error creating task:', error)
    return { error: 'Error al crear la tarea' }
  }

  revalidatePath('/tareas')
  return { success: true, data: data as Task }
}

/**
 * Update an existing task.
 * Handles status changes for completed_at timestamp.
 */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<ActionResult<Task>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Build update object
  const updates: Record<string, unknown> = {}

  if (input.title !== undefined) {
    if (!input.title?.trim()) {
      return { error: 'El titulo es requerido' }
    }
    updates.title = input.title.trim()
  }

  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null
  }

  if (input.due_date !== undefined) {
    updates.due_date = input.due_date
  }

  if (input.priority !== undefined) {
    updates.priority = input.priority
  }

  if (input.task_type_id !== undefined) {
    updates.task_type_id = input.task_type_id
  }

  if (input.assigned_to !== undefined) {
    updates.assigned_to = input.assigned_to
  }

  // Handle status changes
  if (input.status !== undefined) {
    updates.status = input.status
    if (input.status === 'completed') {
      updates.completed_at = new Date().toISOString()
    } else if (input.status === 'pending') {
      updates.completed_at = null
    }
  }

  if (Object.keys(updates).length === 0) {
    return { error: 'No hay cambios para guardar' }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    console.error('Error updating task:', error)
    return { error: 'Error al actualizar la tarea' }
  }

  revalidatePath('/tareas')
  return { success: true, data: data as Task }
}

/**
 * Delete a task by ID.
 */
export async function deleteTask(id: string): Promise<ActionResult<void>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting task:', error)
    return { error: 'Error al eliminar la tarea' }
  }

  revalidatePath('/tareas')
  return { success: true, data: undefined }
}

/**
 * Mark a task as completed.
 */
export async function completeTask(id: string): Promise<ActionResult<Task>> {
  return updateTask(id, { status: 'completed' })
}

/**
 * Reopen a completed task (set status back to pending).
 */
export async function reopenTask(id: string): Promise<ActionResult<Task>> {
  return updateTask(id, { status: 'pending' })
}

/**
 * Get task summary counts for dashboard/badges.
 * Uses efficient COUNT with CASE WHEN aggregations.
 */
export async function getTaskSummary(): Promise<TaskSummary> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { pending: 0, overdue: 0, dueSoon: 0 }
  }

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) {
    return { pending: 0, overdue: 0, dueSoon: 0 }
  }

  // Get current time in Colombia timezone for proper comparison
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Fetch all pending tasks and calculate counts client-side
  // (Supabase doesn't support CASE WHEN in select)
  const { data, error } = await supabase
    .from('tasks')
    .select('id, due_date, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')

  if (error) {
    console.error('Error fetching task summary:', error)
    return { pending: 0, overdue: 0, dueSoon: 0 }
  }

  const tasks = data || []
  const pending = tasks.length

  let overdue = 0
  let dueSoon = 0

  for (const task of tasks) {
    if (task.due_date) {
      const dueDate = new Date(task.due_date)
      if (dueDate < now) {
        overdue++
      } else if (dueDate <= tomorrow) {
        dueSoon++
      }
    }
  }

  return { pending, overdue, dueSoon }
}

// ============================================================================
// Helper: Get Workspace Members for Task Assignment
// ============================================================================

/**
 * Get workspace members for task assignment dropdowns.
 * Uses current workspace from cookie - designed for client components.
 */
export async function getWorkspaceMembersForTasks(): Promise<Array<{ user_id: string; email: string | null }>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) {
    return []
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      user_id,
      profiles!workspace_members_user_id_fkey(email)
    `)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error fetching workspace members:', error)
    return []
  }

  return (data || []).map((member: any) => ({
    user_id: member.user_id,
    email: member.profiles?.email || null,
  }))
}

// ============================================================================
// Task Type Operations
// ============================================================================

/**
 * Get all task types for the workspace, ordered by position.
 */
export async function getTaskTypes(): Promise<TaskType[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) {
    return []
  }

  const { data, error } = await supabase
    .from('task_types')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })

  if (error) {
    console.error('Error fetching task types:', error)
    return []
  }

  return (data || []) as TaskType[]
}

/**
 * Create a new task type.
 */
export async function createTaskType(input: CreateTaskTypeInput): Promise<ActionResult<TaskType>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  if (!input.name?.trim()) {
    return { error: 'El nombre es requerido' }
  }

  // Get max position
  const { data: existing } = await supabase
    .from('task_types')
    .select('position')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: false })
    .limit(1)

  const maxPosition = existing?.[0]?.position ?? -1

  const { data, error } = await supabase
    .from('task_types')
    .insert({
      workspace_id: workspaceId,
      name: input.name.trim(),
      color: input.color || '#6366f1',
      position: maxPosition + 1,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('Error creating task type:', error)
    return { error: 'Error al crear el tipo de tarea' }
  }

  revalidatePath('/tareas')
  return { success: true, data: data as TaskType }
}

/**
 * Update a task type.
 */
export async function updateTaskType(id: string, input: UpdateTaskTypeInput): Promise<ActionResult<TaskType>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const updates: Record<string, unknown> = {}

  if (input.name !== undefined) {
    if (!input.name?.trim()) {
      return { error: 'El nombre es requerido' }
    }
    updates.name = input.name.trim()
  }

  if (input.color !== undefined) {
    updates.color = input.color
  }

  if (input.position !== undefined) {
    updates.position = input.position
  }

  if (Object.keys(updates).length === 0) {
    return { error: 'No hay cambios para guardar' }
  }

  const { data, error } = await supabase
    .from('task_types')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    console.error('Error updating task type:', error)
    return { error: 'Error al actualizar el tipo de tarea' }
  }

  revalidatePath('/tareas')
  return { success: true, data: data as TaskType }
}

/**
 * Delete a task type.
 */
export async function deleteTaskType(id: string): Promise<ActionResult<void>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('task_types')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting task type:', error)
    return { error: 'Error al eliminar el tipo de tarea' }
  }

  revalidatePath('/tareas')
  return { success: true, data: undefined }
}

/**
 * Reorder task types by updating positions based on array order.
 */
export async function reorderTaskTypes(ids: string[]): Promise<ActionResult<void>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Update each task type's position
  const updates = ids.map((id, index) =>
    supabase
      .from('task_types')
      .update({ position: index })
      .eq('id', id)
  )

  const results = await Promise.all(updates)

  const hasError = results.some(r => r.error)
  if (hasError) {
    console.error('Error reordering task types')
    return { error: 'Error al reordenar los tipos de tarea' }
  }

  revalidatePath('/tareas')
  return { success: true, data: undefined }
}
