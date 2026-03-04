/**
 * Somnio Sales Agent v2 — Constants
 *
 * Single source of truth for v2 intents, field definitions, thresholds,
 * and v2→v1 template intent mapping.
 *
 * ZERO imports from other project files to avoid circular dependencies.
 */

// ============================================================================
// V2 Intents (only REAL client intents)
// ============================================================================

export const V2_INTENTS = [
  // Informational
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

  // Client actions
  'quiero_comprar',
  'seleccion_pack',
  'confirmar',
  'rechazar',

  // Escape
  'asesor',
  'queja',
  'cancelar',
  'no_interesa',

  // Fallback
  'otro',
] as const

export type V2Intent = (typeof V2_INTENTS)[number]

// ============================================================================
// Intent Categories
// ============================================================================

/** Intents that trigger immediate handoff to human */
export const ESCAPE_INTENTS_V2: ReadonlySet<V2Intent> = new Set([
  'asesor',
  'queja',
  'cancelar',
])

/** All intents that route to HANDOFF (escape + confidence failures) */
export const HANDOFF_INTENTS_V2: ReadonlySet<V2Intent> = new Set([
  'asesor',
  'queja',
  'cancelar',
  'otro',
])

/**
 * Intents that should NEVER be silenced even if is_acknowledgment=true.
 * Greetings and substantive intents always deserve a response.
 */
export const NEVER_SILENCE_INTENTS: ReadonlySet<V2Intent> = new Set([
  'saludo',
  'precio',
  'promociones',
  'quiero_comprar',
  'seleccion_pack',
  'confirmar',
  'como_se_toma',
  'pago',
  'envio',
  'contenido',
  'registro_sanitario',
  'ubicacion',
  'efectos',
  'efectividad',
])

/** Intents that indicate product interest (used for fase computation) */
export const INTEREST_INTENTS_V2: ReadonlySet<V2Intent> = new Set([
  'precio',
  'promociones',
  'contenido',
  'como_se_toma',
  'pago',
  'envio',
  'registro_sanitario',
  'efectos',
  'efectividad',
  'quiero_comprar',
])

// ============================================================================
// Critical Fields (Order Creation)
// ============================================================================

export const CRITICAL_FIELDS_V2 = [
  'nombre',
  'telefono',
  'direccion',
  'ciudad',
  'departamento',
] as const

export const CRITICAL_FIELDS_INTER_V2 = [
  'nombre',
  'telefono',
  'ciudad',
  'departamento',
] as const

// ============================================================================
// Thresholds
// ============================================================================

export const LOW_CONFIDENCE_THRESHOLD = 80

// ============================================================================
// Pack Prices
// ============================================================================

export const PACK_PRICES = {
  '1x': '$77,900',
  '2x': '$109,900',
  '3x': '$139,900',
} as const

// ============================================================================
// V2 → V1 Template Intent Mapping
// ============================================================================

/**
 * Maps v2 template intents (from Decision layer) to v1 DB intent names.
 * Used by response.ts to reuse v1 templates in sandbox.
 *
 * Note: 'resumen' is handled specially in response.ts — maps to
 * resumen_1x / resumen_2x / resumen_3x based on pack.
 */
export const V2_TO_V1_INTENT_MAP: Record<string, string[]> = {
  // Direct v2 → v1
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

  // Client action intents
  quiero_comprar: ['ofrecer_promos'],
  pedir_datos: ['captura_datos_si_compra'],
  confirmacion_orden: ['compra_confirmada'],
  rechazar: ['no_confirmado'],
  no_interesa: ['no_interesa'],

  // Resumen variants (decision.ts outputs the specific one)
  resumen_1x: ['resumen_1x'],
  resumen_2x: ['resumen_2x'],
  resumen_3x: ['resumen_3x'],

  // Fallback
  otro: ['fallback'],
}

// ============================================================================
// V2 State Metadata Prefix (for datosCapturados serialization)
// ============================================================================

export const V2_META_PREFIX = '_v2:'
