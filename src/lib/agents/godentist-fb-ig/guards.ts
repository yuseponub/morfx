// Cloned verbatim from src/lib/agents/godentist/guards.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 02).
// DO NOT modify — keep in sync with godentist via clone, not divergent edits (D-04, D-08).
/**
 * GoDentist Agent — Cross-cutting Guards
 *
 * Run BEFORE phase derivation and transition table.
 * R0: Low confidence + otro -> handoff
 * R1: Escape intents (asesor, reagendamiento, queja, cancelar_cita) -> handoff
 */
import type { MessageAnalysis } from './comprehension-schema'
import type { GuardResult } from './types'
import { ESCAPE_INTENTS, LOW_CONFIDENCE_THRESHOLD } from './constants'

export function checkGuards(analysis: MessageAnalysis): GuardResult {
  const intent = analysis.intent.primary
  const confidence = analysis.intent.confidence

  // R0: Low confidence + otro -> handoff
  if (confidence < LOW_CONFIDENCE_THRESHOLD && intent === 'otro') {
    return {
      blocked: true,
      decision: {
        action: 'handoff',
        timerSignal: { type: 'cancel', reason: 'handoff por baja confianza' },
        reason: `Confidence ${confidence}% + intent=otro`,
      },
    }
  }

  // R1: Escape intents -> handoff
  if (ESCAPE_INTENTS.has(intent)) {
    return {
      blocked: true,
      decision: {
        action: 'handoff',
        timerSignal: { type: 'cancel', reason: `escape: ${intent}` },
        reason: `Escape intent: ${intent}`,
      },
    }
  }

  return { blocked: false }
}
