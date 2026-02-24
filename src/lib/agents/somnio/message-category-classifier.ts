/**
 * Message Category Classifier
 * Phase 30: Message Classification + Silence Timer
 *
 * Pure TypeScript classifier that maps (intent, mode, message) to one of three
 * categories: RESPONDIBLE, SILENCIOSO, or HANDOFF.
 *
 * Called AFTER IntentDetector.detect() returns intent+confidence (step 5),
 * BEFORE orchestrator (step 9). SILENCIOSO and HANDOFF return early from
 * SomnioAgent without calling the orchestrator.
 *
 * Classification is 100% deterministic — no Claude calls needed.
 */

import {
  HANDOFF_INTENTS,
  CONFIRMATORY_MODES,
  ACKNOWLEDGMENT_PATTERNS,
} from './constants'

// ============================================================================
// Types
// ============================================================================

export type MessageCategory = 'RESPONDIBLE' | 'SILENCIOSO' | 'HANDOFF'

export interface ClassificationResult {
  category: MessageCategory
  reason: string
}

// ============================================================================
// Classifier
// ============================================================================

/**
 * Classify a customer message into one of three categories:
 *
 * - HANDOFF: Intent is in HANDOFF_INTENTS (asesor, queja, cancelar, no_interesa, fallback).
 *   Agent stops processing and transfers to human.
 *
 * - SILENCIOSO: Message is an acknowledgment (ok, jaja, thumbs-up) in a non-confirmatory
 *   mode (conversacion, bienvenida). Bot stays silent, silence timer starts.
 *   NOTE: Rule 2 checks the raw message text, NOT the intent name. IntentDetector
 *   classifies "ok" as various intents depending on context (could be compra_confirmada,
 *   could be fallback). The acknowledgment check uses actual text to catch bare
 *   acknowledgments regardless of intent classification. Rule 2 does NOT check confidence.
 *
 * - RESPONDIBLE: Everything else. Bot proceeds to orchestrator for normal response.
 *
 * @param intent - Detected intent name from IntentDetector
 * @param _confidence - Detection confidence 0-100 (reserved for future use)
 * @param currentMode - Current session state mode
 * @param message - Raw customer message text
 */
export function classifyMessage(
  intent: string,
  _confidence: number,
  currentMode: string,
  message: string
): ClassificationResult {
  // Rule 1 — HANDOFF: intent is a handoff trigger
  if (HANDOFF_INTENTS.has(intent)) {
    return { category: 'HANDOFF', reason: `handoff_intent:${intent}` }
  }

  // Rule 2 — SILENCIOSO: acknowledgment in non-confirmatory mode
  // Only applies when mode is NOT confirmatory (resumen, collecting_data, confirmado).
  // In confirmatory modes, "ok" and "si" are meaningful confirmations that must reach
  // the orchestrator.
  if (!CONFIRMATORY_MODES.has(currentMode)) {
    const trimmed = message.trim()
    const isAcknowledgment = ACKNOWLEDGMENT_PATTERNS.some(pattern => pattern.test(trimmed))
    if (isAcknowledgment) {
      return { category: 'SILENCIOSO', reason: 'acknowledgment_non_confirmatory' }
    }
  }

  // Rule 3 — RESPONDIBLE: default
  return { category: 'RESPONDIBLE', reason: 'default_respondible' }
}
