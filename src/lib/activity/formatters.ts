/**
 * Activity formatting utilities
 * Pure synchronous functions for use in client components
 */

/** Field labels for displaying activity diffs in Spanish */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  phone: 'Telefono',
  email: 'Email',
  address: 'Direccion',
  city: 'Ciudad',
  custom_fields: 'Campos personalizados',
  created_at: 'Fecha de creacion',
  updated_at: 'Ultima actualizacion',
}

/**
 * Format a value for display in activity diff
 */
export function formatValue(value: unknown): string {
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

/**
 * Format activity changes as an array of readable strings
 * @param changes JSONB diff from activity record
 * @returns Array of formatted change descriptions
 */
export function formatChanges(changes: Record<string, { old: unknown; new: unknown }> | null): string[] {
  if (!changes) return []

  return Object.entries(changes)
    .filter(([key]) => !['updated_at', 'created_at'].includes(key))
    .map(([key, { old: oldVal, new: newVal }]) => {
      const fieldLabel = FIELD_LABELS[key] || key
      return `${fieldLabel}: ${formatValue(oldVal)} -> ${formatValue(newVal)}`
    })
}

/** Action descriptions in Spanish */
const ACTION_DESCRIPTIONS: Record<string, string> = {
  created: 'Contacto creado',
  updated: 'Contacto actualizado',
  deleted: 'Contacto eliminado',
  note_added: 'Nota agregada',
  note_updated: 'Nota editada',
  note_deleted: 'Nota eliminada',
  tag_added: 'Etiqueta agregada',
  tag_removed: 'Etiqueta removida',
}

/**
 * Get a human-readable description for an activity action
 */
export function getActionDescription(action: string): string {
  return ACTION_DESCRIPTIONS[action] || action
}
