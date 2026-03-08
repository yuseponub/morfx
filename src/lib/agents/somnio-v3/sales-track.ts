/**
 * Somnio Sales Agent v3 — Sales Track (Two-Track Decision)
 *
 * Pure state machine that determines WHAT TO DO.
 * Does NOT produce templateIntents or extraContext — only accion + flags.
 * Response track handles WHAT TO SAY independently.
 *
 * Flow:
 * 1. System event (timer expired) -> transition table lookup
 * 2. Ingest system event (datos_completos, ciudad_sin_direccion) -> transition table lookup
 * 3. Acknowledgment routing -> sub-type transitions
 * 4. Intent -> transition table lookup
 * 5. Fallback -> no accion (response track handles informational)
 */

import type {
  AgentState,
  Gates,
  Phase,
  SalesTrackOutput,
  SystemEvent,
} from './types'
import { resolveTransition, systemEventToKey } from './transitions'

// ============================================================================
// Main Sales Track Function
// ============================================================================

export function resolveSalesTrack(input: {
  phase: Phase
  intent: string
  isAcknowledgment: boolean
  sentiment: string
  state: AgentState
  gates: Gates
  systemEvent?: SystemEvent
  ingestSystemEvent?: SystemEvent
}): SalesTrackOutput {
  const { phase, intent, isAcknowledgment, sentiment, state, gates, systemEvent, ingestSystemEvent } = input

  // ------------------------------------------------------------------
  // 1. System event from input (timer expired) takes priority
  // ------------------------------------------------------------------
  if (systemEvent) {
    const key = systemEventToKey(systemEvent)
    const match = resolveTransition(phase, key, state, gates)
    if (match) {
      return {
        accion: match.action,
        enterCaptura: match.output.enterCaptura,
        timerSignal: match.output.timerSignal,
        reason: match.output.reason,
      }
    }
    console.warn(`[sales-track] No transition for system event: ${key} in phase ${phase}`)
  }

  // ------------------------------------------------------------------
  // 2. System event from ingest (datos_completos, ciudad_sin_direccion)
  // ------------------------------------------------------------------
  if (ingestSystemEvent) {
    const key = systemEventToKey(ingestSystemEvent)
    const match = resolveTransition(phase, key, state, gates)
    if (match) {
      return {
        accion: match.action,
        enterCaptura: match.output.enterCaptura,
        timerSignal: match.output.timerSignal,
        reason: match.output.reason,
      }
    }
    console.warn(`[sales-track] No transition for ingest event: ${key} in phase ${phase}`)
  }

  // ------------------------------------------------------------------
  // 3. Acknowledgment routing
  // ------------------------------------------------------------------
  if (isAcknowledgment) {
    // Positive ack in confirming -> treat as confirmation
    if (phase === 'confirming' && isPositiveAck(sentiment, intent)) {
      const match = resolveTransition(phase, 'acknowledgment_positive', state, gates)
      if (match) {
        return {
          accion: match.action,
          enterCaptura: match.output.enterCaptura,
          timerSignal: match.output.timerSignal,
          reason: match.output.reason,
        }
      }
    }

    // Ack in promos_shown without pack -> fall through (no accion)
    if (phase === 'promos_shown' && !gates.packElegido) {
      return { reason: 'Ack en promos sin pack - fall through' }
    }

    // Default ack -> no accion (natural silence if intent is not informational)
    return { reason: 'Ack sin contexto confirmatorio' }
  }

  // ------------------------------------------------------------------
  // 4. Intent -> transition table lookup
  // ------------------------------------------------------------------
  const match = resolveTransition(phase, intent, state, gates)
  if (match) {
    return {
      accion: match.action,
      enterCaptura: match.output.enterCaptura,
      timerSignal: match.output.timerSignal,
      reason: match.output.reason,
    }
  }

  // ------------------------------------------------------------------
  // 5. No match (fallback) -> no accion, response track handles informational
  // ------------------------------------------------------------------
  return { reason: 'No transition - response track handles informational' }
}

// ============================================================================
// Helpers
// ============================================================================

function isPositiveAck(sentiment: string, intent: string): boolean {
  return sentiment === 'positivo' || intent === 'confirmar'
}
