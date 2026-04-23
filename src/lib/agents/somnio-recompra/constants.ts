/**
 * Somnio Recompra Agent — Constants
 *
 * Single source of truth. ZERO imports from other project files.
 * Prevents circular dependencies.
 *
 * Fork of somnio-v3/constants.ts — simplified for returning clients.
 * Removed: contenido, formula, como_se_toma, efectividad intents
 * Removed: ofi inter fields and logic
 * Added: confirmar_direccion intent
 * Simplified timers: only L3, L4, L5
 */

// ============================================================================
// Recompra Intents (19 total)
// ============================================================================

export const RECOMPRA_INTENTS = [
  // Informational (10) — removed contenido, formula, como_se_toma, efectividad
  'saludo',
  'precio',
  'promociones',
  'pago',
  'envio',
  'registro_sanitario',
  'ubicacion',
  'contraindicaciones',
  'dependencia',
  'tiempo_entrega',

  // Client actions (6) — added confirmar_direccion
  'datos',
  'quiero_comprar',
  'seleccion_pack',
  'confirmar',
  'confirmar_direccion',
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
// Two-Track Decision Constants
// ============================================================================

/** Intents that the response track always answers (informational questions). 10 total. */
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo', 'precio', 'promociones',
  'pago', 'envio', 'ubicacion', 'contraindicaciones', 'dependencia',
  'tiempo_entrega', 'registro_sanitario',
])

/** Maps sales track accion to template intents. Simplified — no ofi inter, no retoma_datos variants. */
export const ACTION_TEMPLATE_MAP: Record<string, string[]> = {
  ofrecer_promos: ['promociones'],
  no_interesa: ['no_interesa'],
  rechazar: ['rechazar'],
  retoma: ['retoma_inicial'],
}

// ============================================================================
// Critical Fields
// ============================================================================

/** 6 critical fields (same as v3 normal mode) */
export const CRITICAL_FIELDS_NORMAL = [
  'nombre',
  'apellido',
  'telefono',
  'direccion',
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
// State Metadata Prefix
// ============================================================================

export const V3_META_PREFIX = '_v3:'

// ============================================================================
// State Machine Constants
// ============================================================================

export const SIGNIFICANT_ACTIONS: ReadonlySet<string> = new Set([
  'ofrecer_promos', 'mostrar_confirmacion',
  'crear_orden', 'crear_orden_sin_promo', 'crear_orden_sin_confirmar',
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
// Recompra Timer Durations (only L3, L4, L5)
// ============================================================================

/**
 * Timer durations per preset per level (in SECONDS).
 * Only 3 levels for recompra:
 * 3 - Promos sin respuesta (600s)
 * 4 - Pack sin confirmar (600s)
 * 5 - Silencio (90s)
 */
export const RECOMPRA_TIMER_DURATIONS: Record<string, Record<number, number>> = {
  real:         { 3: 600, 4: 600, 5: 90 },
  rapido:       { 3:  60, 4:  60, 5:   9 },
  instantaneo:  { 3:   2, 4:   2, 5:   1 },
}
