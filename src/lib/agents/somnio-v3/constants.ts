/**
 * Somnio Sales Agent v3 — Constants
 *
 * Single source of truth. ZERO imports from other project files.
 * Prevents circular dependencies.
 */

// ============================================================================
// V3 Intents (21 total — only REAL client intents)
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

  // Acknowledgment (1)
  'acknowledgment',

  // Fallback (1)
  'otro',
] as const

// ============================================================================
// Intent Categories
// ============================================================================

export const ESCAPE_INTENTS: ReadonlySet<string> = new Set([
  'asesor',
  'queja',
  'cancelar',
])

// ============================================================================
// Two-Track Decision Constants (tt-01)
// ============================================================================

/** Intents that the response track always answers (informational questions). */
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo', 'precio', 'promociones', 'contenido', 'como_se_toma',
  'pago', 'envio', 'registro_sanitario', 'ubicacion', 'efectos', 'efectividad',
])

/** Maps sales track accion to template intents. Dynamic actions (mostrar_confirmacion, cambio, crear_orden, pedir_datos) handled in response-track. */
export const ACTION_TEMPLATE_MAP: Record<string, string[]> = {
  ofrecer_promos: ['promociones'],
  no_interesa: ['no_interesa'],
  rechazar: ['rechazar'],
  ask_ofi_inter: ['ask_ofi_inter'],
  retoma: ['retoma_inicial'],
}

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

  retoma_inicial: ['retoma_inicial'],
}

// ============================================================================
// State Metadata Prefix
// ============================================================================

export const V3_META_PREFIX = '_v3:'

// ============================================================================
// State Machine Constants (sm-01)
// ============================================================================

export const SIGNIFICANT_ACTIONS: ReadonlySet<string> = new Set([
  'pedir_datos', 'ofrecer_promos', 'mostrar_confirmacion',
  'crear_orden', 'handoff', 'rechazar', 'no_interesa',
])
