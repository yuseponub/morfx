/**
 * Somnio Agent Constants
 * Phase 15.8: Codebase Cleanup - Plan 03
 *
 * Single source of truth for field definitions and thresholds used across
 * the Somnio agent system. ZERO imports from other project files to avoid
 * circular dependencies.
 */

// ============================================================================
// Critical Fields (Order Creation)
// ============================================================================

/**
 * Critical fields required for minimum viable customer data / order creation.
 * Used by DataExtractor validation, TransitionValidator, and hasRequiredContactData.
 */
export const CRITICAL_FIELDS = [
  'nombre',
  'telefono',
  'direccion',
  'ciudad',
  'departamento',
] as const

// ============================================================================
// Timer Minimum Fields
// ============================================================================

/**
 * Minimum fields required for timer to consider data collection sufficient.
 * Includes 'apellido' in addition to CRITICAL_FIELDS.
 * Used by IngestTimerSimulator level evaluation (Level 2: datos minimos).
 */
export const TIMER_MINIMUM_FIELDS = [
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

/** Number of total fields needed to auto-trigger ofrecer_promos (5 critical + 3 additional) */
export const MIN_FIELDS_FOR_AUTO_PROMO = 8

/** Number of critical fields for timer promo threshold */
export const CRITICAL_FIELDS_COUNT = CRITICAL_FIELDS.length // 5

// ============================================================================
// Message Classification Constants (Phase 30)
// ============================================================================

/** The 5 intents that trigger HANDOFF classification */
export const HANDOFF_INTENTS = new Set([
  'asesor', 'queja', 'cancelar', 'no_interesa', 'fallback'
])

/** Modes where "ok", "si", "jaja" are confirmations (RESPONDIBLE, not SILENCIOSO) */
export const CONFIRMATORY_MODES = new Set([
  'resumen', 'collecting_data', 'collecting_data_inter', 'confirmado'
])

/**
 * Patterns that are acknowledgments in non-confirmatory modes.
 * Matched against message.trim() (case-insensitive).
 */
export const ACKNOWLEDGMENT_PATTERNS = [
  /^(ok|okey|okay|va|vale|listo|jaja|jeje|ja|je|si|sí|bueno|dale|genial|perfecto|excelente)$/i,
  /^(gracias|grax|ty|thx|thanks)$/i,
  /^[👍👌🤣😂😊🙏]+$/,
]

// ============================================================================
// Confidence Routing Constants (Phase 33)
// ============================================================================

/** Minimum confidence percentage for the bot to respond. Below this, handoff to human. */
export const LOW_CONFIDENCE_THRESHOLD = 80

// ============================================================================
// Silence Retake Constants (Phase 30)
// ============================================================================

/** Retake message sent after 90s of silence. Warm redirect to sale. */
export const SILENCE_RETAKE_MESSAGE = 'Por cierto, te cuento que tenemos promociones especiales hoy! Te gustaria conocerlas? 😊'

/** Duration of the silence retake timer in milliseconds */
export const SILENCE_RETAKE_DURATION_MS = 90_000

// ============================================================================
// Block Composition Constants (Phase 31)
// ============================================================================

/** Maximum number of templates that can be sent in a single block */
export const BLOCK_MAX_TEMPLATES = 3

/** Maximum number of intents that can be addressed in a single block */
export const BLOCK_MAX_INTENTS = 3

// ============================================================================
// Ofi Inter Constants (Phase 35)
// ============================================================================

/**
 * Critical fields for ofi inter mode (4 fields -- no direccion/barrio).
 * Minimum viable data for an office pickup order.
 */
export const OFI_INTER_CRITICAL_FIELDS = [
  'nombre',
  'telefono',
  'ciudad',
  'departamento',
] as const

/**
 * Additional fields for ofi inter mode.
 * cedula_recoge is OPTIONAL -- customer can decline.
 */
export const OFI_INTER_ADDITIONAL_FIELDS = [
  'apellido',
  'cedula_recoge',
  'correo',
] as const

/** Number of total fields needed to auto-trigger ofrecer_promos in ofi inter mode (4 critical + 2 additional) */
export const MIN_FIELDS_FOR_AUTO_PROMO_INTER = 6

/**
 * Patterns that detect ofi inter (office pickup) mentions in customer messages.
 * Route 1: Direct mention detection -- highest priority, triggers immediately.
 */
export const OFI_INTER_PATTERNS: RegExp[] = [
  // Direct mentions
  /\bofi\s*inter\b/i,
  /\boficina\s*(de\s+)?inter(rapidisimo)?\b/i,
  /\breco[gj]o?\s*en\s*inter\b/i,
  /\brecoger?\s*en\s*inter\b/i,
  // Variations (from CONTEXT.md)
  /\bquiero\s+ir\s+a\s+recoger\b/i,
  /\bpuedo\s+pasar\s+a\s+buscar\b/i,
  /\bno\s+necesito\s+domicilio\b/i,
  /\benvi[ae]\s+a\s+la\s+oficina\b/i,
  /\brecoger\s+en\s+(la\s+)?oficina\b/i,
  /\brecojo\s+en\s+(la\s+)?oficina\b/i,
  /\brecoger\s+en\s+(la\s+)?transportadora\b/i,
]

/**
 * Detect if a message mentions ofi inter (office pickup at Interrapidisimo).
 * Tests the message against all OFI_INTER_PATTERNS.
 *
 * @param message - Raw customer message
 * @returns True if ofi inter mention detected
 */
export function detectOfiInterMention(message: string): boolean {
  if (!message || typeof message !== 'string') return false
  const normalized = message.toLowerCase().trim()
  return OFI_INTER_PATTERNS.some(pattern => pattern.test(normalized))
}

/**
 * Check if a session mode is a data-collection mode.
 * Used by timer system, ingest logic, and anywhere that needs to check
 * if the agent is currently collecting customer data (regardless of delivery type).
 *
 * @param mode - Current session mode/state
 * @returns True if mode is collecting_data or collecting_data_inter
 */
export function isCollectingDataMode(mode: string): boolean {
  return mode === 'collecting_data' || mode === 'collecting_data_inter'
}
