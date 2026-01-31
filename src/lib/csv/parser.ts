/**
 * CSV parsing utilities for contact import
 * Uses PapaParse for robust CSV parsing with streaming support
 */

import Papa from 'papaparse'
import { normalizePhone } from '@/lib/utils/phone'

// ============================================================================
// Types
// ============================================================================

export interface ParsedContact {
  name: string
  phone: string
  email?: string
  city?: string
  address?: string
  custom_fields: Record<string, unknown>
}

export interface InvalidRow {
  row: number
  data: Record<string, string>
  errors: string[]
}

export interface DuplicateRow {
  row: number
  data: ParsedContact
  existingPhone: string
}

export interface ParseResult {
  valid: ParsedContact[]
  invalid: InvalidRow[]
  duplicates: DuplicateRow[]
}

// ============================================================================
// Column Name Mappings
// ============================================================================

/**
 * Maps common column name variations to standard field names
 */
const COLUMN_MAPPINGS: Record<string, string> = {
  // Name variations
  nombre: 'name',
  name: 'name',
  nombre_completo: 'name',
  full_name: 'name',
  cliente: 'name',

  // Phone variations
  telefono: 'phone',
  phone: 'phone',
  celular: 'phone',
  mobile: 'phone',
  cel: 'phone',
  movil: 'phone',
  whatsapp: 'phone',

  // Email variations
  email: 'email',
  correo: 'email',
  correo_electronico: 'email',
  e_mail: 'email',

  // City variations
  ciudad: 'city',
  city: 'city',
  municipio: 'city',

  // Address variations
  direccion: 'address',
  address: 'address',
  dir: 'address',
}

/**
 * Normalizes a column header to a standard field name or keeps it for custom fields
 */
function normalizeHeader(header: string): string {
  const cleaned = header.trim().toLowerCase().replace(/\s+/g, '_')
  return COLUMN_MAPPINGS[cleaned] || cleaned
}

// ============================================================================
// Parser Function
// ============================================================================

/**
 * Parse a CSV file and validate contacts
 *
 * @param file - CSV file to parse
 * @param existingPhones - Set of phone numbers already in the workspace (for duplicate detection)
 * @param customFieldKeys - List of custom field keys defined in the workspace
 * @returns ParseResult with valid contacts, invalid rows, and duplicates
 */
export async function parseContactsCsv(
  file: File,
  existingPhones: Set<string>,
  customFieldKeys: string[]
): Promise<ParseResult> {
  return new Promise((resolve) => {
    const result: ParseResult = { valid: [], invalid: [], duplicates: [] }
    let rowNum = 0
    const seenPhones = new Set<string>() // Track phones within the file for internal duplicates

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      // Note: worker:true causes issues in Next.js, use without worker for compatibility

      step: (row) => {
        rowNum++
        const errors: string[] = []

        // Extract name (required)
        const name = row.data.name
        if (!name?.trim()) {
          errors.push('Nombre requerido')
        }

        // Extract phone (required)
        const phone = row.data.phone
        if (!phone?.trim()) {
          errors.push('Telefono requerido')
        }

        // Normalize phone
        const normalizedPhone = phone ? normalizePhone(phone) : null
        if (phone && !normalizedPhone) {
          errors.push('Telefono invalido (debe ser numero colombiano)')
        }

        // If validation errors, add to invalid list
        if (errors.length > 0) {
          result.invalid.push({ row: rowNum, data: row.data, errors })
          return
        }

        // Build contact object
        const contact: ParsedContact = {
          name: name!.trim(),
          phone: normalizedPhone!,
          email: row.data.email?.trim() || undefined,
          city: row.data.city?.trim() || undefined,
          address: row.data.address?.trim() || undefined,
          custom_fields: {}
        }

        // Extract custom fields
        for (const key of customFieldKeys) {
          const value = row.data[key]
          if (value !== undefined && value !== '') {
            contact.custom_fields[key] = value
          }
        }

        // Check for duplicates in existing database
        if (existingPhones.has(normalizedPhone!)) {
          result.duplicates.push({
            row: rowNum,
            data: contact,
            existingPhone: normalizedPhone!
          })
          return
        }

        // Check for duplicates within the file itself
        if (seenPhones.has(normalizedPhone!)) {
          result.invalid.push({
            row: rowNum,
            data: row.data,
            errors: ['Telefono duplicado en el archivo']
          })
          return
        }

        seenPhones.add(normalizedPhone!)
        result.valid.push(contact)
      },

      complete: () => resolve(result)
    })
  })
}

/**
 * Detect columns in a CSV file
 * Returns the headers normalized to standard names
 */
export async function detectCsvColumns(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      preview: 1, // Only parse first row to get headers
      transformHeader: normalizeHeader,
      complete: (results) => {
        resolve(results.meta.fields || [])
      }
    })
  })
}
