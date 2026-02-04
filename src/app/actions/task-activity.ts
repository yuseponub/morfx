'use server'

import { createClient } from '@/lib/supabase/server'
import type { TaskActivityWithUser } from '@/lib/tasks/types'

// ============================================================================
// Types
// ============================================================================

interface GetActivityOptions {
  /** Filter by specific action types */
  types?: string[]
  /** Maximum number of records to return (default: 50) */
  limit?: number
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get activity history for a task
 * Returns activities sorted by created_at DESC (newest first)
 * Includes user info via separate profile query
 */
export async function getTaskActivity(
  taskId: string,
  options: GetActivityOptions = {}
): Promise<TaskActivityWithUser[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { types, limit = 50 } = options

  // Build query
  let query = supabase
    .from('task_activity')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Filter by action types if specified
  if (types && types.length > 0) {
    query = query.in('action', types)
  }

  const { data: activities, error } = await query

  if (error) {
    console.error('Error fetching task activity:', error)
    return []
  }

  if (!activities || activities.length === 0) {
    return []
  }

  // Get user profiles for activity actors
  const userIds = [...new Set(activities.filter(a => a.user_id).map(a => a.user_id as string))]

  let profileMap = new Map<string, { id: string; email: string }>()

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds)

    profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
  }

  // Combine activities with user info
  return activities.map(activity => ({
    ...activity,
    user: activity.user_id ? (profileMap.get(activity.user_id) || null) : null
  }))
}

// ============================================================================
// Formatting Helpers (exported for use in UI components)
// ============================================================================

/** Field labels for displaying task activity diffs in Spanish */
const TASK_FIELD_LABELS: Record<string, string> = {
  title: 'Titulo',
  description: 'Descripcion',
  due_date: 'Fecha de vencimiento',
  priority: 'Prioridad',
  status: 'Estado',
  task_type_id: 'Tipo de tarea',
  assigned_to: 'Asignado a',
  contact_id: 'Contacto',
  order_id: 'Pedido',
  conversation_id: 'Conversacion',
  postponement_count: 'Veces postergada',
  completed_at: 'Completada el',
  created_at: 'Fecha de creacion',
  updated_at: 'Ultima actualizacion',
}

/** Get task field labels (server action wrapper) */
export async function getTaskFieldLabels(): Promise<Record<string, string>> {
  return TASK_FIELD_LABELS
}

/**
 * Format a value for display in task activity diff
 */
function formatTaskValueSync(value: unknown): string {
  if (value === null || value === undefined) {
    return '(vacio)'
  }
  if (typeof value === 'boolean') {
    return value ? 'Si' : 'No'
  }
  // Handle priority values
  if (value === 'low') return 'Baja'
  if (value === 'medium') return 'Media'
  if (value === 'high') return 'Alta'
  // Handle status values
  if (value === 'pending') return 'Pendiente'
  if (value === 'completed') return 'Completada'
  // Handle dates (ISO strings)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      const date = new Date(value)
      return date.toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return String(value)
    }
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

export async function formatTaskValue(value: unknown): Promise<string> {
  return formatTaskValueSync(value)
}

/**
 * Format task activity changes as an array of readable strings
 * @param changes JSONB diff from activity record
 * @returns Array of formatted change descriptions
 */
export async function formatTaskChanges(changes: Record<string, { old: unknown; new: unknown }> | null): Promise<string[]> {
  if (!changes) return []

  return Object.entries(changes)
    .filter(([key]) => !['updated_at', 'created_at'].includes(key))
    .map(([key, { old: oldVal, new: newVal }]) => {
      const fieldLabel = TASK_FIELD_LABELS[key] || key
      return `${fieldLabel}: ${formatTaskValueSync(oldVal)} -> ${formatTaskValueSync(newVal)}`
    })
}

/**
 * Get a human-readable description for a task activity action
 */
export async function getTaskActionDescription(action: string): Promise<string> {
  const descriptions: Record<string, string> = {
    created: 'Tarea creada',
    updated: 'Tarea actualizada',
    completed: 'Tarea completada',
    reopened: 'Tarea reabierta',
    due_date_changed: 'Fecha de vencimiento cambiada',
    deleted: 'Tarea eliminada',
    note_added: 'Nota agregada',
    note_updated: 'Nota editada',
    note_deleted: 'Nota eliminada',
  }
  return descriptions[action] || action
}
