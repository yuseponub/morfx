/**
 * Normalization Utilities for Customer Data
 * Phase 14: Agente Ventas Somnio - Plan 02
 *
 * Functions to normalize and validate Colombian customer data:
 * - Phone numbers (to 57XXXXXXXXXX format)
 * - City names (proper case, spelling fixes)
 * - Addresses (abbreviation expansion)
 * - Department inference from city
 * - Negation detection
 */

// ============================================================================
// City to Departamento Mapping
// ============================================================================

/**
 * Map of Colombian cities to their departments.
 * Covers top 20+ cities by population.
 */
export const CITY_TO_DEPARTAMENTO: Record<string, string> = {
  // Major cities
  bogota: 'Cundinamarca',
  bogotá: 'Cundinamarca',
  medellin: 'Antioquia',
  medellín: 'Antioquia',
  cali: 'Valle del Cauca',
  barranquilla: 'Atlantico',
  cartagena: 'Bolivar',
  bucaramanga: 'Santander',
  cucuta: 'Norte de Santander',
  cúcuta: 'Norte de Santander',
  pereira: 'Risaralda',
  manizales: 'Caldas',
  ibague: 'Tolima',
  ibagué: 'Tolima',
  'santa marta': 'Magdalena',
  villavicencio: 'Meta',
  pasto: 'Narino',
  monteria: 'Cordoba',
  montería: 'Cordoba',
  neiva: 'Huila',
  armenia: 'Quindio',
  popayan: 'Cauca',
  popayán: 'Cauca',
  valledupar: 'Cesar',
  sincelejo: 'Sucre',
  tunja: 'Boyaca',
  riohacha: 'La Guajira',
  florencia: 'Caqueta',
  quibdo: 'Choco',
  quibdó: 'Choco',
  yopal: 'Casanare',
  leticia: 'Amazonas',
  mocoa: 'Putumayo',
  arauca: 'Arauca',
  inirida: 'Guainia',
  inírida: 'Guainia',
  'san jose del guaviare': 'Guaviare',
  'san josé del guaviare': 'Guaviare',
  mitu: 'Vaupes',
  mitú: 'Vaupes',
  'puerto carreño': 'Vichada',
  'puerto carreno': 'Vichada',

  // Additional popular cities
  soacha: 'Cundinamarca',
  bello: 'Antioquia',
  soledad: 'Atlantico',
  itagui: 'Antioquia',
  itagüi: 'Antioquia',
  envigado: 'Antioquia',
  floridablanca: 'Santander',
  piedecuesta: 'Santander',
  giron: 'Santander',
  girón: 'Santander',
  palmira: 'Valle del Cauca',
  buenaventura: 'Valle del Cauca',
  tulua: 'Valle del Cauca',
  tuluá: 'Valle del Cauca',
  dosquebradas: 'Risaralda',
  zipaquira: 'Cundinamarca',
  zipaquirá: 'Cundinamarca',
  facatativa: 'Cundinamarca',
  facatativá: 'Cundinamarca',
  chia: 'Cundinamarca',
  chía: 'Cundinamarca',
  cajica: 'Cundinamarca',
  cajicá: 'Cundinamarca',
}

// ============================================================================
// City Spelling Variations
// ============================================================================

/**
 * Common misspellings and variations mapped to correct city names.
 */
const CITY_CORRECTIONS: Record<string, string> = {
  // Bogota variations
  bogota: 'Bogota',
  bogotá: 'Bogota',
  btá: 'Bogota',
  bta: 'Bogota',
  bogta: 'Bogota',

  // Medellin variations
  medellin: 'Medellin',
  medellín: 'Medellin',
  mede: 'Medellin',
  mdlln: 'Medellin',

  // Barranquilla variations
  barranquilla: 'Barranquilla',
  bquilla: 'Barranquilla',
  'b/quilla': 'Barranquilla',

  // Cartagena variations
  cartagena: 'Cartagena',
  ctg: 'Cartagena',

  // Bucaramanga variations
  bucaramanga: 'Bucaramanga',
  bga: 'Bucaramanga',
  bmanga: 'Bucaramanga',

  // Cali variations
  cali: 'Cali',
  calí: 'Cali',

  // Cucuta variations
  cucuta: 'Cucuta',
  cúcuta: 'Cucuta',

  // Other common ones
  manizales: 'Manizales',
  pereira: 'Pereira',
  ibague: 'Ibague',
  ibagué: 'Ibague',
  villavicencio: 'Villavicencio',
  villavo: 'Villavicencio',
  pasto: 'Pasto',
  monteria: 'Monteria',
  montería: 'Monteria',
  neiva: 'Neiva',
  armenia: 'Armenia',
  popayan: 'Popayan',
  popayán: 'Popayan',
  valledupar: 'Valledupar',
  tunja: 'Tunja',
  soacha: 'Soacha',
  chia: 'Chia',
  chía: 'Chia',
}

// ============================================================================
// Address Abbreviation Expansions
// ============================================================================

/**
 * Address abbreviations mapped to full words.
 */
const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  // Street types
  cll: 'Calle',
  cl: 'Calle',
  clle: 'Calle',
  cra: 'Carrera',
  cr: 'Carrera',
  crra: 'Carrera',
  kra: 'Carrera',
  kr: 'Carrera',
  av: 'Avenida',
  avda: 'Avenida',
  ave: 'Avenida',
  dg: 'Diagonal',
  diag: 'Diagonal',
  tv: 'Transversal',
  trans: 'Transversal',
  trv: 'Transversal',

  // Building types
  apto: 'Apartamento',
  apt: 'Apartamento',
  ap: 'Apartamento',
  ed: 'Edificio',
  edif: 'Edificio',
  edf: 'Edificio',
  cs: 'Casa',
  loc: 'Local',
  ofc: 'Oficina',
  of: 'Oficina',

  // Directions
  no: 'Norte',
  sur: 'Sur',
  este: 'Este',
  oeste: 'Oeste',
  nro: 'Numero',
  num: 'Numero',
  '#': 'Numero',
}

// ============================================================================
// Negation Patterns
// ============================================================================

/**
 * Patterns that indicate negation for specific fields.
 */
const NEGATION_PATTERNS = [
  /no\s+tengo/i,
  /no\s+lo\s+se/i,
  /no\s+se/i,
  /no\s+recuerdo/i,
  /no\s+uso/i,
  /no\s+cuento\s+con/i,
  /prefiero\s+no/i,
  /no\s+tengo\s+(?:un|uno|una)?/i,
]

/**
 * Field-specific negation patterns.
 */
const FIELD_NEGATION_PATTERNS: Record<string, RegExp[]> = {
  correo: [
    /no\s+tengo\s+correo/i,
    /no\s+tengo\s+email/i,
    /no\s+uso\s+correo/i,
    /no\s+uso\s+email/i,
    /sin\s+correo/i,
    /sin\s+email/i,
  ],
  telefono: [
    /no\s+tengo\s+celular/i,
    /no\s+tengo\s+tel[eé]fono/i,
  ],
  barrio: [
    /no\s+se\s+el\s+barrio/i,
    /no\s+tengo\s+barrio/i,
    /no\s+recuerdo\s+el\s+barrio/i,
  ],
}

// ============================================================================
// Phone Normalization (consolidated to src/lib/utils/phone.ts)
// ============================================================================

/**
 * Re-exported from canonical source for backward compatibility.
 * Returns phone in 57XXXXXXXXXX format (without +) for datos_capturados.
 */
export { normalizePhoneRaw as normalizePhone } from '@/lib/utils/phone'

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize a Colombian city name with proper capitalization.
 *
 * @param input - Raw city name
 * @returns Normalized city name
 *
 * @example
 * normalizeCity("bogota") // "Bogota"
 * normalizeCity("MEDELLIN") // "Medellin"
 * normalizeCity("bquilla") // "Barranquilla"
 */
export function normalizeCity(input: string): string {
  if (!input || typeof input !== 'string') {
    return input
  }

  // Trim and lowercase for lookup
  const trimmed = input.trim()
  const lowered = trimmed.toLowerCase()

  // Check for known corrections/variations
  if (CITY_CORRECTIONS[lowered]) {
    return CITY_CORRECTIONS[lowered]
  }

  // Proper case: first letter uppercase, rest lowercase
  const words = trimmed.split(/\s+/)
  const properCased = words
    .map((word) => {
      if (word.length === 0) return word
      // Handle common lowercase words
      const lowerWord = word.toLowerCase()
      if (['de', 'del', 'la', 'el', 'los', 'las'].includes(lowerWord) && words.length > 1) {
        return lowerWord
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')

  return properCased
}

/**
 * Normalize a Colombian address with expanded abbreviations.
 *
 * @param input - Raw address
 * @returns Normalized address with expanded abbreviations
 *
 * @example
 * normalizeAddress("cll 123 # 45-67") // "Calle 123 Numero 45-67"
 * normalizeAddress("cra 15 # 20-30 apto 201") // "Carrera 15 Numero 20-30 Apartamento 201"
 */
export function normalizeAddress(input: string): string {
  if (!input || typeof input !== 'string') {
    return input
  }

  let address = input.trim()

  // Replace abbreviations with full words (case insensitive)
  // Sort by length descending to replace longer abbreviations first
  const sortedAbbreviations = Object.entries(ADDRESS_ABBREVIATIONS).sort(
    ([a], [b]) => b.length - a.length
  )

  for (const [abbr, full] of sortedAbbreviations) {
    // Match abbreviation at word boundary (with optional period)
    const regex = new RegExp(`\\b${abbr}\\.?\\s*`, 'gi')
    address = address.replace(regex, `${full} `)
  }

  // Clean up multiple spaces
  address = address.replace(/\s+/g, ' ').trim()

  // Proper case each word except numbers
  address = address
    .split(' ')
    .map((word) => {
      // Keep numbers as-is
      if (/^\d+(-\d+)?$/.test(word)) {
        return word
      }
      // Proper case words
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      }
      return word
    })
    .join(' ')

  return address
}

/**
 * Infer the departamento from a city name.
 *
 * @param city - City name (normalized or raw)
 * @returns Departamento name or null if not found
 *
 * @example
 * inferDepartamento("Bogota") // "Cundinamarca"
 * inferDepartamento("medellin") // "Antioquia"
 * inferDepartamento("Unknown City") // null
 */
export function inferDepartamento(city: string): string | null {
  if (!city || typeof city !== 'string') {
    return null
  }

  const lowered = city.trim().toLowerCase()

  // Direct lookup
  if (CITY_TO_DEPARTAMENTO[lowered]) {
    return CITY_TO_DEPARTAMENTO[lowered]
  }

  // Try without accents
  const normalized = lowered
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (CITY_TO_DEPARTAMENTO[normalized]) {
    return CITY_TO_DEPARTAMENTO[normalized]
  }

  return null
}

/**
 * Detect if the input contains a negation for a specific field.
 *
 * @param input - User message
 * @param field - Field name to check (e.g., 'correo', 'telefono')
 * @returns True if negation detected for the field
 *
 * @example
 * detectNegation("no tengo correo", "correo") // true
 * detectNegation("mi correo es test@example.com", "correo") // false
 * detectNegation("no lo se", "barrio") // true
 */
export function detectNegation(input: string, field: string): boolean {
  if (!input || typeof input !== 'string') {
    return false
  }

  const lowered = input.toLowerCase()

  // Check field-specific patterns first
  const fieldPatterns = FIELD_NEGATION_PATTERNS[field]
  if (fieldPatterns) {
    for (const pattern of fieldPatterns) {
      if (pattern.test(lowered)) {
        return true
      }
    }
  }

  // Check generic negation patterns + field mention
  const fieldLower = field.toLowerCase()
  for (const pattern of NEGATION_PATTERNS) {
    if (pattern.test(lowered)) {
      // Check if the field is mentioned near the negation
      if (lowered.includes(fieldLower)) {
        return true
      }
    }
  }

  return false
}
