import { z } from 'zod'
import type { CustomFieldDefinition } from './types'

// ============================================================================
// Dynamic Zod Schema Builder
// ============================================================================

/**
 * Build a Zod schema dynamically from custom field definitions.
 * Used to validate custom field values before saving to contacts.
 */
export function buildCustomFieldSchema(definitions: CustomFieldDefinition[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const def of definitions) {
    let fieldSchema: z.ZodTypeAny

    switch (def.field_type) {
      case 'text':
        fieldSchema = z.string()
        break

      case 'number':
        fieldSchema = z.coerce.number()
        break

      case 'currency':
        fieldSchema = z.coerce.number().min(0, 'El valor no puede ser negativo')
        break

      case 'percentage':
        fieldSchema = z.coerce.number().min(0).max(100, 'El porcentaje debe estar entre 0 y 100')
        break

      case 'date':
        // Accept string dates in ISO format
        fieldSchema = z.string().refine(
          (val) => !val || !isNaN(Date.parse(val)),
          { message: 'Fecha invalida' }
        )
        break

      case 'checkbox':
        fieldSchema = z.coerce.boolean()
        break

      case 'select':
        if (def.options && def.options.length > 0) {
          fieldSchema = z.enum(def.options as [string, ...string[]])
        } else {
          fieldSchema = z.string()
        }
        break

      case 'email':
        fieldSchema = z.string().email('Email invalido')
        break

      case 'url':
        fieldSchema = z.string().url('URL invalida')
        break

      case 'phone':
        fieldSchema = z.string().min(10, 'Telefono invalido')
        break

      case 'file':
        // File stored as URL
        fieldSchema = z.string().url('URL de archivo invalida')
        break

      case 'contact_relation':
        fieldSchema = z.string().uuid('ID de contacto invalido')
        break

      default:
        fieldSchema = z.unknown()
    }

    // Make optional if not required
    if (!def.is_required) {
      // Allow null, undefined, or empty string for optional fields
      fieldSchema = fieldSchema
        .optional()
        .nullable()
        .or(z.literal(''))
        .transform((val) => (val === '' ? null : val))
    }

    shape[def.key] = fieldSchema
  }

  return z.object(shape).passthrough()
}

// ============================================================================
// Validation Helper
// ============================================================================

/**
 * Validate custom field values against their definitions.
 * Returns sanitized values or validation errors.
 */
export function validateCustomFields(
  definitions: CustomFieldDefinition[],
  values: Record<string, unknown>
): { success: true; data: Record<string, unknown> } | { success: false; errors: Record<string, string> } {
  const schema = buildCustomFieldSchema(definitions)
  const result = schema.safeParse(values)

  if (result.success) {
    // Filter to only include defined fields
    const definedKeys = new Set(definitions.map(d => d.key))
    const filteredData: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(result.data)) {
      if (definedKeys.has(key)) {
        filteredData[key] = value
      }
    }

    return { success: true, data: filteredData }
  }

  // Map Zod errors to field keys
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const fieldKey = issue.path[0]?.toString() || 'unknown'
    errors[fieldKey] = issue.message
  }

  return { success: false, errors }
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a valid field key from a display name.
 * Converts "Fecha de Cumpleanos" -> "fecha_de_cumpleanos"
 */
export function generateFieldKey(name: string): string {
  return name
    .toLowerCase()
    // Remove accents (normalize NFD, then remove diacritical marks)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace any non-alphanumeric characters with underscore
    .replace(/[^a-z0-9]+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_|_$/g, '')
    // Ensure it starts with a letter (prefix with 'f_' if starts with number)
    .replace(/^(\d)/, 'f_$1')
    // Limit length
    .substring(0, 50)
}

// ============================================================================
// Field Type Labels (for UI)
// ============================================================================

export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  number: 'Numero',
  date: 'Fecha',
  select: 'Seleccion',
  checkbox: 'Casilla',
  url: 'URL',
  email: 'Email',
  phone: 'Telefono',
  currency: 'Moneda',
  percentage: 'Porcentaje',
  file: 'Archivo',
  contact_relation: 'Relacion con contacto',
}

/**
 * Get human-readable label for a field type
 */
export function getFieldTypeLabel(fieldType: string): string {
  return FIELD_TYPE_LABELS[fieldType] || fieldType
}
