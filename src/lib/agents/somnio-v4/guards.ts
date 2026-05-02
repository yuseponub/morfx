/**
 * Somnio v4 — Cross-cutting Guards
 *
 * Run BEFORE phase derivation and transition table.
 * R0: Low confidence + otro -> handoff
 * R1: Escape intents -> handoff
 *
 * Standalone: somnio-sales-v4
 * Cloned mecánicamente desde somnio-v3/guards.ts (D-24).
 *
 * NOTE: el ESCALATION guard low-confidence sub-loop (D-02 trigger
 * `intent_confidence < threshold`) NO va aquí — es responsabilidad
 * del orquestador (`somnio-v4-agent.ts`, Plan 07). guards.ts conserva
 * solo R0/R1 (semántica idéntica a v3).
 */
import type { MessageAnalysis } from './comprehension-schema'
import type { Decision, GuardResult } from './types'
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
