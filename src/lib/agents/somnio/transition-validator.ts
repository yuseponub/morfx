/**
 * Transition Validator Component
 * Phase 14: Agente Ventas Somnio - Plan 05
 *
 * Validates intent transitions based on required preconditions and
 * detects auto-trigger conditions for ofrecer_promos.
 *
 * Rules from CONTEXT.md:
 * - resumen_* requires ofrecer_promos seen first
 * - compra_confirmada requires resumen_* seen first
 * - ofrecer_promos auto-triggers when 8 fields complete
 * - ofrecer_promos via timer when 5 critical fields + 2min inactive
 */

import type { IntentRecord } from '../types'
import { CRITICAL_FIELDS, MIN_FIELDS_FOR_AUTO_PROMO } from './constants'

// ============================================================================
// Types
// ============================================================================

/**
 * Definition of a transition rule.
 */
export interface TransitionRule {
  /** Intent name this rule applies to */
  intent: string
  /** Must have seen ALL of these intents first (AND logic) */
  requiredIntents?: string[]
  /** Must have seen ANY ONE of these intents first (OR logic) */
  requiredIntentsAny?: string[]
  /** Must be in this mode */
  requiredMode?: string
  /** Must have these data fields */
  requiredFields?: string[]
  /** Minimum number of fields captured */
  minFields?: number
}

/**
 * Result of transition validation.
 */
export interface TransitionResult {
  /** Whether the transition is allowed */
  allowed: boolean
  /** Reason if blocked */
  reason?: string
  /** Suggested alternative intent if blocked */
  suggestedIntent?: string
  /** Intent that should auto-trigger (if any) */
  autoTrigger?: string
}

// ============================================================================
// Constants
// ============================================================================

// CRITICAL_FIELDS imported from './constants' (single source of truth)

/**
 * Transition rules based on CONTEXT.md decision document.
 */
export const TRANSITION_RULES: TransitionRule[] = [
  // resumen_* requires ofrecer_promos to have been seen
  {
    intent: 'resumen_1x',
    requiredIntents: ['ofrecer_promos'],
  },
  {
    intent: 'resumen_2x',
    requiredIntents: ['ofrecer_promos'],
  },
  {
    intent: 'resumen_3x',
    requiredIntents: ['ofrecer_promos'],
  },
  // compra_confirmada requires at least one resumen to have been seen
  {
    intent: 'compra_confirmada',
    requiredIntentsAny: ['resumen_1x', 'resumen_2x', 'resumen_3x'],
  },
  // ofrecer_promos auto-triggers at 8 fields
  {
    intent: 'ofrecer_promos',
    minFields: 8,
  },
]

// MIN_FIELDS_FOR_AUTO_PROMO imported from './constants' (single source of truth)
// CRITICAL_FIELDS_COUNT available from './constants' if needed for timer promo threshold

// ============================================================================
// TransitionValidator Class
// ============================================================================

/**
 * Validates intent transitions based on flow rules.
 *
 * Ensures:
 * - resumen_* can only be triggered after ofrecer_promos
 * - compra_confirmada can only be triggered after a resumen
 * - ofrecer_promos auto-triggers when data is complete
 */
export class TransitionValidator {
  /**
   * Validate if a transition to an intent is allowed.
   *
   * @param intent - Target intent to validate
   * @param intentsVistos - History of intents that have been seen
   * @param currentMode - Current agent mode
   * @param datosCapturados - Customer data captured so far
   * @returns TransitionResult indicating if transition is allowed
   */
  validateTransition(
    intent: string,
    intentsVistos: IntentRecord[],
    currentMode: string,
    datosCapturados: Record<string, string>
  ): TransitionResult {
    // Find the rule for this intent
    const rule = TRANSITION_RULES.find(r => r.intent === intent)

    // If no rule, transition is allowed
    if (!rule) {
      return { allowed: true }
    }

    // Check requiredIntents (AND - all must be seen)
    if (rule.requiredIntents && rule.requiredIntents.length > 0) {
      for (const requiredIntent of rule.requiredIntents) {
        if (!this.hasSeenIntent(requiredIntent, intentsVistos)) {
          return {
            allowed: false,
            reason: `Debe ver "${requiredIntent}" antes de "${intent}"`,
            suggestedIntent: requiredIntent,
          }
        }
      }
    }

    // Check requiredIntentsAny (OR - at least one must be seen)
    if (rule.requiredIntentsAny && rule.requiredIntentsAny.length > 0) {
      if (!this.hasSeenAnyIntent(rule.requiredIntentsAny, intentsVistos)) {
        return {
          allowed: false,
          reason: `Debe ver uno de [${rule.requiredIntentsAny.join(', ')}] antes de "${intent}"`,
          suggestedIntent: rule.requiredIntentsAny[0],
        }
      }
    }

    // Check requiredMode
    if (rule.requiredMode && currentMode !== rule.requiredMode) {
      return {
        allowed: false,
        reason: `Debe estar en modo "${rule.requiredMode}" para "${intent}"`,
      }
    }

    // Check requiredFields
    if (rule.requiredFields && rule.requiredFields.length > 0) {
      for (const field of rule.requiredFields) {
        if (!datosCapturados[field] || datosCapturados[field].trim() === '') {
          return {
            allowed: false,
            reason: `Falta el campo "${field}" para "${intent}"`,
          }
        }
      }
    }

    // Check minFields
    if (rule.minFields !== undefined) {
      const fieldCount = this.countFields(datosCapturados)
      if (fieldCount < rule.minFields) {
        return {
          allowed: false,
          reason: `Se requieren ${rule.minFields} campos, solo hay ${fieldCount}`,
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Check if an auto-trigger should fire based on current state.
   *
   * Auto-trigger conditions:
   * - ofrecer_promos: 8 fields complete AND not yet seen
   *
   * @param intentsVistos - History of intents seen
   * @param datosCapturados - Customer data captured
   * @returns Intent to auto-trigger, or null if none
   */
  checkAutoTriggers(
    intentsVistos: IntentRecord[],
    datosCapturados: Record<string, string>
  ): string | null {
    // Only auto-trigger ofrecer_promos if not already seen
    if (this.hasSeenIntent('ofrecer_promos', intentsVistos)) {
      return null
    }

    // Check if 8 fields complete
    const fieldCount = this.countFields(datosCapturados)
    if (fieldCount >= MIN_FIELDS_FOR_AUTO_PROMO) {
      return 'ofrecer_promos'
    }

    return null
  }

  /**
   * Check if timer-based proactive promo should trigger.
   * Called by Inngest timer workflow.
   *
   * Conditions:
   * - 5 critical fields complete
   * - ofrecer_promos not yet seen
   *
   * @param intentsVistos - History of intents seen
   * @param datosCapturados - Customer data captured
   * @returns True if timer-based promo should trigger
   */
  shouldTriggerTimerPromo(
    intentsVistos: IntentRecord[],
    datosCapturados: Record<string, string>
  ): boolean {
    // Already seen ofrecer_promos
    if (this.hasSeenIntent('ofrecer_promos', intentsVistos)) {
      return false
    }

    // Check critical fields
    return this.hasCriticalFields(datosCapturados)
  }

  /**
   * Check if a specific intent has been seen.
   */
  hasSeenIntent(intent: string, intentsVistos: IntentRecord[]): boolean {
    return intentsVistos.some(record => record.intent === intent)
  }

  /**
   * Check if any of the given intents has been seen.
   */
  hasSeenAnyIntent(intents: string[], intentsVistos: IntentRecord[]): boolean {
    return intents.some(intent => this.hasSeenIntent(intent, intentsVistos))
  }

  /**
   * Count non-empty, non-N/A fields.
   */
  countFields(datos: Record<string, string>): number {
    let count = 0
    for (const [key, value] of Object.entries(datos)) {
      // Skip internal keys (like __pending_messages)
      if (key.startsWith('__')) {
        continue
      }
      // Count if value exists, is not empty, and is not N/A
      if (value && value.trim() !== '' && value !== 'N/A') {
        count++
      }
    }
    return count
  }

  /**
   * Check if all critical fields are present.
   */
  hasCriticalFields(datos: Record<string, string>): boolean {
    for (const field of CRITICAL_FIELDS) {
      const value = datos[field]
      if (!value || value.trim() === '' || value === 'N/A') {
        return false
      }
    }
    return true
  }

  /**
   * Get the rule for an intent (if any).
   */
  getRuleForIntent(intent: string): TransitionRule | undefined {
    return TRANSITION_RULES.find(r => r.intent === intent)
  }
}

// ============================================================================
// Convenience Export
// ============================================================================

/**
 * Validate a single transition (convenience function).
 */
export function validateTransition(
  intent: string,
  intentsVistos: IntentRecord[],
  currentMode: string,
  datosCapturados: Record<string, string>
): TransitionResult {
  const validator = new TransitionValidator()
  return validator.validateTransition(intent, intentsVistos, currentMode, datosCapturados)
}
