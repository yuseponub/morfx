// ============================================================================
// Logistics Constants & Utilities
// Department abbreviation mapping, text normalization, and shared types
// for Coordinadora carrier integration.
//
// ZERO project imports (prevents circular dependencies).
// Same pattern as domain/types.ts.
// ============================================================================

/**
 * Normalize text for city/department matching.
 * Mirrors the robot's normalization: uppercase + remove diacritics + trim.
 */
export function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Mapping from normalized department names to Coordinadora abbreviations.
 * Includes all entries from the robot's MAPEO_DEPARTAMENTOS plus common variants.
 *
 * Keys are normalized (uppercase, no accents) since they are compared
 * against normalizeText() output.
 */
export const DEPARTMENT_ABBREVIATIONS: Record<string, string> = {
  // ---- Colombian Departments (33 + variants) ----
  'AMAZONAS': 'AMAZ',
  'ANTIOQUIA': 'ANT',
  'ARAUCA': 'ARAU',
  'ATLANTICO': 'ATL',

  // Bogota variants -- all map to Cundinamarca in Coordinadora
  'BOGOTA': 'C/MARCA',
  'BOGOTA D.C.': 'C/MARCA',
  'BOGOTA, D.C.': 'C/MARCA',
  'BOGOTA DC': 'C/MARCA',
  'DISTRITO CAPITAL': 'C/MARCA',
  'SANTAFE DE BOGOTA': 'C/MARCA',

  'BOLIVAR': 'BOL',
  'BOYACA': 'BOY',
  'CALDAS': 'CDAS',
  'CAQUETA': 'CAQ',
  'CASANARE': 'C/NARE',
  'CAUCA': 'CAU',
  'CESAR': 'CES',
  'CHOCO': 'CHOCO',
  'CORDOBA': 'CORD',
  'CUNDINAMARCA': 'C/MARCA',
  'GUAINIA': 'GUAI',
  'GUAVIARE': 'G/VIARE',
  'GUAJIRA': 'GUAJ',
  'LA GUAJIRA': 'GUAJ',
  'HUILA': 'HLA',
  'MAGDALENA': 'MG/LENA',
  'META': 'META',
  'NARINO': 'NAR',
  'NARIÑO': 'NAR', // accented variant (won't match after normalizeText but kept for direct lookups)
  'NORTE DE SANTANDER': 'N/STDER',
  'PUTUMAYO': 'P/MAYO',
  'QUINDIO': 'QDIO',
  'RISARALDA': 'RS',
  'SAN ANDRES': 'S/ANDRES',
  'SAN ANDRES Y PROVIDENCIA': 'S/ANDRES',
  'SAN ANDRES, PROVIDENCIA Y SANTA CATALINA': 'S/ANDRES',
  'SANTANDER': 'STDER',
  'SUCRE': 'SUCRE',
  'TOLIMA': 'TOL',
  'VALLE DEL CAUCA': 'VALLE',
  'VALLE': 'VALLE',
  'VAUPES': 'V/PES',
  'VICHADA': 'VICH',

  // ---- Mexican cross-border (for future use) ----
  'CIUDAD DE MEXICO': 'CMX',
  'ESTADO DE MEXICO': 'MEX',
} as const

/**
 * Map a department name (raw user input) to a Coordinadora abbreviation.
 * Returns null if the department is not recognized.
 */
export function mapDepartmentToAbbrev(department: string): string | null {
  const normalized = normalizeText(department)
  return DEPARTMENT_ABBREVIATIONS[normalized] || null
}

// ============================================================================
// Shared Types
// ============================================================================

/**
 * PedidoInput -- TypeScript version of the robot's PedidoInput.
 * Represents the data needed to create a Coordinadora shipment.
 */
export interface PedidoInput {
  identificacion: string
  nombres: string
  apellidos: string
  direccion: string
  /** Coordinadora city format: "CITY (DEPT)" */
  ciudad: string
  /** Department abbreviation */
  departamento: string
  celular: string
  email: string
  /** Order reference / name */
  referencia: string
  unidades: number
  totalConIva: number
  valorDeclarado: number
  esRecaudoContraentrega: boolean
  peso: number
  alto: number
  largo: number
  ancho: number
}
