/**
 * CSV export utilities for contacts
 * Uses PapaParse for robust CSV generation with Excel compatibility
 */

import Papa from 'papaparse'
import type { Contact } from '@/lib/types/database'
import type { CustomFieldDefinition } from '@/lib/custom-fields/types'

// ============================================================================
// Types
// ============================================================================

export interface ExportOptions {
  contacts: Contact[]
  /** Standard fields to include: name, phone, email, city, address, created_at */
  standardFields: string[]
  /** Custom field definitions to include */
  customFields: CustomFieldDefinition[]
}

// ============================================================================
// Field Labels
// ============================================================================

/**
 * Human-readable labels for standard fields
 */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  phone: 'Telefono',
  email: 'Email',
  city: 'Ciudad',
  address: 'Direccion',
  created_at: 'Fecha de creacion'
}

// ============================================================================
// Value Formatters
// ============================================================================

/**
 * Format a value for CSV export based on its type
 */
function formatExportValue(value: unknown, fieldType?: string): string {
  if (value === null || value === undefined) return ''

  if (fieldType === 'date' && value) {
    try {
      return new Date(value as string).toISOString().split('T')[0]
    } catch {
      return String(value)
    }
  }

  if (fieldType === 'checkbox') {
    return value ? 'Si' : 'No'
  }

  if (fieldType === 'currency') {
    const num = Number(value)
    if (!isNaN(num)) {
      return num.toLocaleString('es-CO', { minimumFractionDigits: 0 })
    }
  }

  if (fieldType === 'percentage') {
    const num = Number(value)
    if (!isNaN(num)) {
      return `${num}%`
    }
  }

  return String(value)
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Generate a CSV string from contacts
 *
 * @param options - Export options including contacts, standard fields, and custom fields
 * @returns CSV string ready for download
 */
export function exportContactsToCsv(options: ExportOptions): string {
  const { contacts, standardFields, customFields } = options

  // Build header labels
  const headers = [
    ...standardFields.map(f => FIELD_LABELS[f] || f),
    ...customFields.map(f => f.name)
  ]

  // Transform contacts to export rows
  const data = contacts.map(contact => {
    const row: Record<string, string> = {}

    // Standard fields
    for (const field of standardFields) {
      const value = contact[field as keyof Contact]
      row[FIELD_LABELS[field] || field] = formatExportValue(value)
    }

    // Custom fields
    for (const field of customFields) {
      const value = contact.custom_fields?.[field.key]
      row[field.name] = formatExportValue(value, field.field_type)
    }

    return row
  })

  return Papa.unparse(data, {
    header: true,
    quotes: true,
    quoteChar: '"',
    escapeChar: '"',
    delimiter: ',',
    newline: '\r\n',
    columns: headers
  })
}

/**
 * Download a CSV string as a file
 * Includes BOM for Excel UTF-8 compatibility
 *
 * @param csv - CSV string content
 * @param filename - Name for the downloaded file
 */
export function downloadCsv(csv: string, filename: string) {
  // BOM (Byte Order Mark) for Excel UTF-8 compatibility
  const BOM = '\ufeff'
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename

  // Append to body, click, and cleanup
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Revoke the object URL to free memory
  URL.revokeObjectURL(url)
}

/**
 * Generate a filename for exported contacts
 * Format: contactos-YYYY-MM-DD.csv
 */
export function generateExportFilename(): string {
  const date = new Date().toISOString().split('T')[0]
  return `contactos-${date}.csv`
}
