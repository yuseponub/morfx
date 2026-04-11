/**
 * Somnio Sales Agent v3 — Constants
 *
 * Single source of truth. ZERO imports from other project files.
 * Prevents circular dependencies.
 */

// ============================================================================
// V3 Intents (22 total — only REAL client intents)
// ============================================================================

export const V3_INTENTS = [
  // Informational (13)
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
  'contraindicaciones',
  'dependencia',
  'efectividad',
  'tiempo_entrega',

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

/** Intents that the response track always answers (informational questions). 14 total. */
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo', 'precio', 'promociones', 'contenido', 'formula', 'como_se_toma',
  'pago', 'envio', 'registro_sanitario', 'ubicacion', 'contraindicaciones', 'dependencia', 'efectividad',
  'tiempo_entrega',
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
  '1x': '$79,900',
  '2x': '$129,900',
  '3x': '$169,900',
}

/**
 * Numeric pack prices (COP). Source of truth for order creation in CRM.
 * MUST stay in sync with PACK_PRICES (string format for client-facing templates).
 * When updating prices, edit BOTH constants here — no other file should hardcode these numbers.
 */
export const PACK_PRICES_NUMERIC: Record<string, number> = {
  '1x': 79900,
  '2x': 129900,
  '3x': 169900,
}

/**
 * Pack product metadata for CRM order creation (productName + quantity).
 * Single source of truth — order-creator.ts imports from here.
 */
export const PACK_PRODUCTS: Record<string, { name: string; quantity: number }> = {
  '1x': { name: 'Somnio 90 Caps',    quantity: 1 },
  '2x': { name: 'Somnio 90 Caps x2', quantity: 2 },
  '3x': { name: 'Somnio 90 Caps x3', quantity: 3 },
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

// ============================================================================
// V3 Timer Durations (Quick-028: V3 Production Timer System)
// ============================================================================

/**
 * Timer durations per preset per level (in SECONDS).
 * Values are IDENTICAL to TIMER_PRESETS in src/lib/sandbox/ingest-timer.ts.
 * Duplicated intentionally — zero imports in constants.ts (project rule).
 *
 * Levels:
 * 0 - Sin datos (600s)
 * 1 - Datos parciales (360s)
 * 2 - Datos minimos (120s)
 * 3 - Promos sin respuesta (600s)
 * 4 - Pack sin confirmar (600s)
 * 5 - Silencio (90s)
 * 6 - Datos implicitos (360s)
 * 7 - Ofi inter confirmado (120s)
 * 8 - Extras ofi inter (120s)
 */
export const V3_TIMER_DURATIONS: Record<string, Record<number, number>> = {
  real:         { 0: 600, 1: 360, 2: 120, 3: 600, 4: 600, 5: 90, 6: 360, 7: 120, 8: 120 },
  rapido:       { 0:  60, 1:  30, 2:  10, 3:  60, 4:  60, 5:   9, 6:  30, 7:  10, 8:  10 },
  instantaneo:  { 0:   2, 1:   2, 2:   1, 3:   2, 4:   2, 5:   1, 6:   2, 7:   1, 8:   1 },
}
