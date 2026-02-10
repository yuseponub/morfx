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
