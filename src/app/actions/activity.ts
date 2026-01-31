'use server'

import { createClient } from '@/lib/supabase/server'
import type { ContactActivityWithUser } from '@/lib/custom-fields/types'

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
 * Get activity history for a contact
 * Returns activities sorted by created_at DESC (newest first)
 * Includes user info via left join with profiles
 */
export async function getContactActivity(
  contactId: string,
  options: GetActivityOptions = {}
): Promise<ContactActivityWithUser[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { types, limit = 50 } = options

  // Build query
  let query = supabase
    .from('contact_activity')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Filter by action types if specified
  if (types && types.length > 0) {
    query = query.in('action', types)
  }

  const { data: activities, error } = await query

  if (error) {
    console.error('Error fetching activity:', error)
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

/** Field labels for displaying activity diffs in Spanish */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  phone: 'Telefono',
  email: 'Email',
  address: 'Direccion',
  city: 'Ciudad',
  custom_fields: 'Campos personalizados',
  created_at: 'Fecha de creacion',
  updated_at: 'Ultima actualizacion',
}

/** Get field labels (server action wrapper) */
export async function getFieldLabels(): Promise<Record<string, string>> {
  return FIELD_LABELS
}

/**
 * Format a value for display in activity diff
 */
function formatValueSync(value: unknown): string {
  if (value === null || value === undefined) {
    return '(vacio)'
  }
  if (typeof value === 'boolean') {
    return value ? 'Si' : 'No'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

export async function formatValue(value: unknown): Promise<string> {
  return formatValueSync(value)
}

/**
 * Format activity changes as an array of readable strings
 * @param changes JSONB diff from activity record
 * @returns Array of formatted change descriptions
 */
export async function formatChanges(changes: Record<string, { old: unknown; new: unknown }> | null): Promise<string[]> {
  if (!changes) return []

  return Object.entries(changes)
    .filter(([key]) => !['updated_at', 'created_at'].includes(key))
    .map(([key, { old: oldVal, new: newVal }]) => {
      const fieldLabel = FIELD_LABELS[key] || key
      return `${fieldLabel}: ${formatValueSync(oldVal)} -> ${formatValueSync(newVal)}`
    })
}

/**
 * Get a human-readable description for an activity action
 */
export async function getActionDescription(action: string): Promise<string> {
  const descriptions: Record<string, string> = {
    created: 'Contacto creado',
    updated: 'Contacto actualizado',
    deleted: 'Contacto eliminado',
    note_added: 'Nota agregada',
    note_updated: 'Nota editada',
    note_deleted: 'Nota eliminada',
    tag_added: 'Etiqueta agregada',
    tag_removed: 'Etiqueta removida',
  }
  return descriptions[action] || action
}
