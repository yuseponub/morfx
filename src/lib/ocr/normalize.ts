/**
 * Phase 27: Robot OCR de Guias — Normalization Utilities
 *
 * Phone and address normalization for Colombian shipping guides.
 * Used by the matching algorithm to compare OCR-extracted data against CRM order data.
 */

/**
 * Normalize a Colombian phone number for comparison.
 * Strips country code (+57/57), spaces, dashes, dots, parentheses.
 * Returns last 10 digits (Colombian mobile numbers are 10 digits).
 * Returns null if input is falsy or result has fewer than 7 digits.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null

  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '')

  // Strip leading country code (57)
  if (digits.startsWith('57') && digits.length > 10) {
    digits = digits.slice(2)
  }

  // Must have at least 7 digits to be a valid phone fragment
  if (digits.length < 7) return null

  // Return last 10 digits (standard Colombian mobile length)
  return digits.slice(-10)
}

/**
 * Colombian address abbreviation mapping.
 * Expands common abbreviations to their full forms for comparison.
 */
const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  'CL': 'CALLE',
  'CLL': 'CALLE',
  'CR': 'CARRERA',
  'KR': 'CARRERA',
  'KRA': 'CARRERA',
  'CRA': 'CARRERA',
  'AV': 'AVENIDA',
  'AVE': 'AVENIDA',
  'DG': 'DIAGONAL',
  'DIAG': 'DIAGONAL',
  'TV': 'TRANSVERSAL',
  'TRANS': 'TRANSVERSAL',
  'MZ': 'MANZANA',
  'MZN': 'MANZANA',
  'BRR': 'BARRIO',
  'BR': 'BARRIO',
  'URB': 'URBANIZACION',
  'APTO': 'APARTAMENTO',
  'APT': 'APARTAMENTO',
  'ED': 'EDIFICIO',
  'EDIF': 'EDIFICIO',
  'INT': 'INTERIOR',
  'PISO': 'PISO',
  'CS': 'CASA',
  'LC': 'LOCAL',
  'BG': 'BODEGA',
}

/**
 * Normalize a Colombian address for fuzzy comparison.
 * - Uppercases
 * - Expands abbreviations (CL->CALLE, CR/KR->CARRERA, etc.)
 * - Removes #, No., N degrees, special characters
 * - Collapses whitespace
 *
 * Returns null if input is falsy or empty after normalization.
 */
export function normalizeAddress(address: string | null | undefined): string | null {
  if (!address) return null

  let normalized = address.toUpperCase().trim()

  // Remove common punctuation/noise
  normalized = normalized
    .replace(/[#\u00B0]/g, ' ')
    .replace(/\bNO\.\s*/gi, ' ')
    .replace(/\bN\u00B0\s*/gi, ' ')
    .replace(/\bNO\b/gi, ' ')
    .replace(/[.,;:()]/g, ' ')
    .replace(/-/g, ' ')

  // Expand abbreviations (word-boundary matching)
  for (const [abbr, full] of Object.entries(ADDRESS_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi')
    normalized = normalized.replace(regex, full)
  }

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim()

  return normalized.length > 0 ? normalized : null
}

/**
 * Normalize a name for fuzzy comparison.
 * - Uppercases
 * - Removes accents/diacritics
 * - Removes non-alphanumeric characters except spaces
 * - Collapses whitespace
 *
 * Returns null if input is falsy or empty after normalization.
 */
export function normalizeNameForComparison(name: string | null | undefined): string | null {
  if (!name) return null

  let normalized = name.toUpperCase().trim()

  // Remove accents/diacritics
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Remove non-alphanumeric except spaces
  normalized = normalized.replace(/[^A-Z0-9\s]/g, '')

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim()

  return normalized.length > 0 ? normalized : null
}
