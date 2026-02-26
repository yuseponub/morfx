/**
 * Message Category Classifier
 * Phase 30: Message Classification + Silence Timer
 * Phase 33: Confidence Routing (Rule 1.5)
 *
 * Pure TypeScript classifier that maps (intent, confidence, mode, message) to one
 * of three categories: RESPONDIBLE, SILENCIOSO, or HANDOFF.
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
  LOW_CONFIDENCE_THRESHOLD,
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
 * - SILENCIOSO: Message is an acknowledgment (ok, jaja, thumbs-up) in a non-confirmatory
 *   mode (conversacion, bienvenida). Bot stays silent, silence timer starts.
 *   Evaluated FIRST because IntentDetector may classify acknowledgments as "fallback"
 *   which would incorrectly trigger HANDOFF if checked later.
 *   NOTE: Checks raw message text, NOT the intent name. Patterns are anchored (^...$)
 *   so they only match single-word/emoji messages — never phrases like "quiero un asesor".
 *
 * - HANDOFF: Intent is in HANDOFF_INTENTS (asesor, queja, cancelar, no_interesa, fallback).
 *   Agent stops processing and transfers to human.
 *
 * - RESPONDIBLE: Everything else. Bot proceeds to orchestrator for normal response.
 *
 * @param intent - Detected intent name from IntentDetector
 * @param confidence - Detection confidence 0-100 (used by Rule 1.5 for low-confidence handoff)
 * @param currentMode - Current session state mode
 * @param message - Raw customer message text
 */
export function classifyMessage(
  intent: string,
  confidence: number,
  currentMode: string,
  message: string
): ClassificationResult {
  // Rule 0 — SILENCIOSO: acknowledgment in non-confirmatory mode
  // Must run BEFORE handoff check: IntentDetector classifies "jaja"/"ok" as fallback,
  // which is in HANDOFF_INTENTS. Acknowledgment patterns are anchored (^...$) so they
  // never intercept real handoff phrases.
  // In confirmatory modes (resumen, collecting_data, confirmado), "ok" and "si" are
  // meaningful confirmations that must reach the orchestrator.
  if (!CONFIRMATORY_MODES.has(currentMode)) {
    const trimmed = message.trim()
    const isAcknowledgment = ACKNOWLEDGMENT_PATTERNS.some(pattern => pattern.test(trimmed))
    if (isAcknowledgment) {
      return { category: 'SILENCIOSO', reason: 'acknowledgment_non_confirmatory' }
    }
  }

  // Rule 1 — HANDOFF: intent is a handoff trigger
  if (HANDOFF_INTENTS.has(intent)) {
    return { category: 'HANDOFF', reason: `handoff_intent:${intent}` }
  }

  // Rule 1.5 — HANDOFF: low confidence (< 80%)
  // When the IntentDetector is not confident about the detected intent,
  // route to human instead of guessing. Timer-forced calls (confidence=100)
  // and auto-triggered intents naturally bypass this since they always have
  // confidence=100.
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { category: 'HANDOFF', reason: `low_confidence:${confidence}` }
  }

  // Rule 2 — RESPONDIBLE: default
  return { category: 'RESPONDIBLE', reason: 'default_respondible' }
}
