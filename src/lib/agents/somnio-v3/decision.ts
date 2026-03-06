/**
 * Somnio Sales Agent v3 — Decision Engine (Capa 6)
 *
 * Pure rules engine. No AI, no network calls.
 * Uses state machine: guards -> phase derivation -> transition table -> fallback.
 *
 * Flow:
 * 1. System event from ingest? -> transition table lookup
 * 2. Guards (R0: low confidence, R1: escape) -> block if matched
 * 3. Derive phase from accionesEjecutadas
 * 4. Acknowledgment? -> sub-type routing via transition table
 * 5. Intent -> transition table lookup
 * 6. Fallback (R9) -> respond with intent templates
 */

import type { MessageAnalysis } from './comprehension-schema'
import type {
  AgentState,
  Decision,
  DecisionAction,
  Gates,
  IngestResult,
  TipoAccion,
} from './types'
import { NEVER_SILENCE_INTENTS } from './constants'
import { checkGuards } from './guards'
import { derivePhase } from './phase'
import { resolveTransition, systemEventToKey, type TransitionOutput } from './transitions'

// ============================================================================
// Main Decision Function
// ============================================================================

export function decide(
  analysis: MessageAnalysis,
  state: AgentState,
  gates: Gates,
  ingestResult: IngestResult,
): Decision {
  const intent = analysis.intent.primary

  // ------------------------------------------------------------------
  // 1. System event from ingest takes priority
  // ------------------------------------------------------------------
  if (ingestResult.systemEvent) {
    const key = systemEventToKey(ingestResult.systemEvent)
    const phase = derivePhase(state.accionesEjecutadas)
    const match = resolveTransition(phase, key, state, gates)
    if (match) {
      return transitionToDecision(match.action, match.output)
    }
    // No match for system event — log warning and fall through
    console.warn(`[decision] No transition for system event: ${key} in phase ${phase}`)
  }

  // ------------------------------------------------------------------
  // 2. Guards (R0: low confidence + otro, R1: escape intents)
  // ------------------------------------------------------------------
  const guardResult = checkGuards(analysis)
  if (guardResult.blocked) {
    return guardResult.decision
  }

  // ------------------------------------------------------------------
  // 3. Derive phase from accionesEjecutadas
  // ------------------------------------------------------------------
  const phase = derivePhase(state.accionesEjecutadas)

  // ------------------------------------------------------------------
  // 4. Acknowledgment special case
  // ------------------------------------------------------------------
  if (analysis.classification.is_acknowledgment && !NEVER_SILENCE_INTENTS.has(intent)) {
    // Determine ack sub-type
    if (phase === 'confirming' && isPositiveAck(analysis)) {
      // Positive ack in confirming -> treat as confirmation
      const match = resolveTransition(phase, 'acknowledgment_positive', state, gates)
      if (match) {
        return transitionToDecision(match.action, match.output)
      }
    }

    if (phase === 'promos_shown' && !gates.packElegido) {
      // Ack in promos_shown without pack -> fall through to R9
      // (keep conversation going)
    } else {
      // Default acknowledgment -> silence
      const match = resolveTransition(phase, 'acknowledgment', state, gates)
      if (match) {
        // If match returns empty templateIntents, it's the promos_shown exception -> fall through to R9
        if (match.output.templateIntents.length === 0 && match.action === 'silence') {
          // Fall through to R9
        } else {
          return transitionToDecision(match.action, match.output)
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // 5. Intent -> transition table lookup
  // ------------------------------------------------------------------
  const match = resolveTransition(phase, intent, state, gates)
  if (match) {
    return transitionToDecision(match.action, match.output)
  }

  // ------------------------------------------------------------------
  // 6. Fallback (R9) -> respond with intent templates
  // ------------------------------------------------------------------
  const intentsAResponder: string[] = [intent]
  if (analysis.intent.secondary !== 'ninguno') {
    intentsAResponder.push(analysis.intent.secondary)
  }

  return {
    action: 'respond',
    templateIntents: intentsAResponder,
    reason: `Responder a intent: ${intentsAResponder.join(' + ')}`,
  }
}

// ============================================================================
// Transition -> Decision Converter
// ============================================================================

/**
 * Convert a TransitionOutput (from the transition table) to a Decision.
 * Maps TipoAccion to DecisionAction (only 4 values: respond, silence, handoff, create_order).
 * Exported for use in Plan 03 (system event second-pass in agent orchestrator).
 */
export function transitionToDecision(action: TipoAccion, output: TransitionOutput): Decision {
  const decisionAction: DecisionAction =
    action === 'crear_orden' ? 'create_order'
    : action === 'handoff' ? 'handoff'
    : action === 'silence' ? 'silence'
    : 'respond'

  return {
    action: decisionAction,
    templateIntents: output.templateIntents.length > 0 ? output.templateIntents : undefined,
    extraContext: output.extraContext,
    timerSignal: output.timerSignal,
    enterCaptura: output.enterCaptura,
    reason: output.reason,
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isPositiveAck(analysis: MessageAnalysis): boolean {
  return (
    analysis.classification.sentiment === 'positivo' ||
    analysis.intent.primary === 'confirmar'
  )
}
