/**
 * Somnio Sales Agent v3 — Constants
 *
 * Single source of truth. ZERO imports from other project files.
 * Prevents circular dependencies.
 */

// ============================================================================
// V3 Intents (20 total — only REAL client intents)
// ============================================================================

export const V3_INTENTS = [
  // Informational (11)
  'saludo',
  'precio',
  'promociones',
  'contenido',
  'como_se_toma',
  'pago',
  'envio',
  'registro_sanitario',
  'ubicacion',
  'efectos',
  'efectividad',

  // Client actions (5)
  'datos',
  'quiero_comprar',
  'seleccion_pack',
  'confirmar',
  'rechazar',

  // Escape (4)
  'asesor',
  'queja',
  'cancelar',
  'no_interesa',

  // Fallback (1)
  'otro',
] as const

export type V3Intent = (typeof V3_INTENTS)[number]

// ============================================================================
// Intent Categories
// ============================================================================

export const ESCAPE_INTENTS: ReadonlySet<string> = new Set([
  'asesor',
  'queja',
  'cancelar',
])

export const NEVER_SILENCE_INTENTS: ReadonlySet<string> = new Set([
  'saludo',
  'precio',
  'promociones',
  'quiero_comprar',
  'seleccion_pack',
  'confirmar',
  'contenido',
  'como_se_toma',
  'pago',
  'envio',
  'registro_sanitario',
  'ubicacion',
  'efectos',
  'efectividad',
])

// ============================================================================
// Critical Fields
// ============================================================================

/** Normal mode: 6 critical fields */
export const CRITICAL_FIELDS_NORMAL = [
  'nombre',
  'apellido',
  'telefono',
  'direccion',
  'ciudad',
  'departamento',
] as const

/** Ofi Inter mode: 5 critical fields (no direccion) */
export const CRITICAL_FIELDS_OFI_INTER = [
  'nombre',
  'apellido',
  'telefono',
  'ciudad',
  'departamento',
] as const

/** All data fields that can be extracted */
export const ALL_DATA_FIELDS = [
  'nombre',
  'apellido',
  'telefono',
  'ciudad',
  'departamento',
  'direccion',
  'barrio',
  'correo',
  'indicaciones_extra',
  'cedula_recoge',
] as const

// ============================================================================
// Thresholds
// ============================================================================

export const LOW_CONFIDENCE_THRESHOLD = 80

// ============================================================================
// Pack Prices
// ============================================================================

export const PACK_PRICES: Record<string, string> = {
  '1x': '$77,900',
  '2x': '$109,900',
  '3x': '$139,900',
}

// ============================================================================
// V3 -> V1 Template Intent Mapping
// ============================================================================

export const V3_TO_V1_INTENT_MAP: Record<string, string[]> = {
  saludo: ['hola'],
  precio: ['precio'],
  promociones: ['ofrecer_promos'],
  contenido: ['contenido_envase'],
  como_se_toma: ['como_se_toma'],
  pago: ['modopago'],
  envio: ['envio'],
  registro_sanitario: ['invima'],
  ubicacion: ['ubicacion'],
  efectos: ['contraindicaciones'],
  efectividad: ['sisirve'],

  quiero_comprar: ['ofrecer_promos'],
  pedir_datos: ['captura_datos_si_compra'],
  confirmacion_orden: ['compra_confirmada'],
  rechazar: ['no_confirmado'],
  no_interesa: ['no_interesa'],

  resumen_1x: ['resumen_1x'],
  resumen_2x: ['resumen_2x'],
  resumen_3x: ['resumen_3x'],

  ask_ofi_inter: ['ask_ofi_inter'],

  otro: ['fallback'],
}

// ============================================================================
// Acknowledgment Patterns
// ============================================================================

export const ACK_PATTERNS: RegExp[] = [
  /^o+k+\.?$/i,
  /^va+le+\.?$/i,
  /^li+sto+\.?$/i,
  /^si+\.?$/i,
  /^sí+\.?$/i,
  /^bueno\.?$/i,
  /^dale\.?$/i,
  /^genial\.?$/i,
  /^perfecto\.?$/i,
  /^bien\.?$/i,
  /^claro\.?$/i,
  /^gra+cia+s\.?$/i,
  /^grax\.?$/i,
  /^ty\.?$/i,
  /^ja+\.?$/i,
  /^je+\.?$/i,
  /^👍+$/,
  /^👌+$/,
  /^🤣+$/,
  /^😂+$/,
  /^😊+$/,
  /^🙏+$/,
  /^💪+$/,
  /^❤️*$/,
  /^🔥+$/,
]

// ============================================================================
// Ofi Inter Detection Patterns
// ============================================================================

export const OFI_INTER_PATTERNS: RegExp[] = [
  /\bofi\s*inter\b/i,
  /\boficina\s*(de\s+)?inter/i,
  /\boficina\s+interrapidisimo/i,
  /\bquiero\s+ir\s+a\s+recoger/i,
  /\bpuedo\s+pasar\s+a\s+buscar/i,
  /\brecojo?\s+en\s+(oficina|inter)/i,
  /\bno\s+necesito\s+domicilio/i,
  /\bprefiero\s+recoger/i,
]

// ============================================================================
// State Metadata Prefix
// ============================================================================

export const V3_META_PREFIX = '_v3:'
