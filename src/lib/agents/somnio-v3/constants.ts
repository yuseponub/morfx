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
  // Informational (12)
  'saludo',
  'precio',
  'promociones',
  'contenido',
  'formula',
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
  'saludo', 'precio', 'promociones', 'contenido', 'formula', 'como_se_toma',
  'pago', 'envio', 'registro_sanitario', 'ubicacion', 'efectos', 'efectividad',
])

/** Maps sales track accion to template intents. Dynamic actions (mostrar_confirmacion, cambio, crear_orden, pedir_datos) handled in response-track. */
export const ACTION_TEMPLATE_MAP: Record<string, string[]> = {
  ofrecer_promos: ['promociones'],
  no_interesa: ['no_interesa'],
  rechazar: ['rechazar'],
  ask_ofi_inter: ['ask_ofi_inter'],
  confirmar_cambio_ofi_inter: ['confirmar_cambio_ofi_inter'],
  retoma_ofi_inter: ['confirmar_ofi_inter'],
  retoma: ['retoma_inicial'],
  retoma_datos: ['retoma_datos'],
  retoma_datos_parciales: ['retoma_datos_parciales'],
  pedir_datos_quiero_comprar_implicito: ['pedir_datos_quiero_comprar_implicito'],
  retoma_datos_implicito: ['retoma_datos_implicito'],
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
// Extra Fields (per mode — checked after critical fields)
// ============================================================================

/** Normal mode extras: barrio + correo (can be negated) */
export const EXTRAS_NORMAL = ['barrio', 'correo'] as const

/** Ofi Inter mode extras: cedula_recoge (required) + correo (can be negated) */
export const EXTRAS_OFI_INTER = ['cedula_recoge', 'correo'] as const

// ============================================================================
// Capital Cities (for L1 conditional logic in ofi-inter)
// ============================================================================

/** Capitales departamentales — normalized sin acentos, lowercase para matching */
export const CAPITAL_CITIES = [
  'medellin', 'barranquilla', 'cartagena', 'tunja', 'manizales', 'popayan',
  'valledupar', 'monteria', 'bogota', 'neiva', 'santa marta', 'villavicencio',
  'pasto', 'cucuta', 'armenia', 'pereira', 'bucaramanga', 'sincelejo', 'ibague', 'cali',
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
// State Metadata Prefix
// ============================================================================

export const V3_META_PREFIX = '_v3:'

// ============================================================================
// State Machine Constants (sm-01)
// ============================================================================

export const SIGNIFICANT_ACTIONS: ReadonlySet<string> = new Set([
  'pedir_datos', 'pedir_datos_quiero_comprar_implicito', 'ofrecer_promos', 'mostrar_confirmacion',
  'crear_orden', 'crear_orden_sin_promo', 'crear_orden_sin_confirmar',
  'confirmar_cambio_ofi_inter',
  'handoff', 'rechazar', 'no_interesa',
])

/** Actions that touch CRM (create/modify orders, contacts, etc.) */
export const CRM_ACTIONS: ReadonlySet<string> = new Set([
  'crear_orden', 'crear_orden_sin_promo', 'crear_orden_sin_confirmar',
])

/** Any action that creates an order (for shouldCreateOrder checks) */
export const CREATE_ORDER_ACTIONS: ReadonlySet<string> = new Set([
  'crear_orden', 'crear_orden_sin_promo', 'crear_orden_sin_confirmar',
])
