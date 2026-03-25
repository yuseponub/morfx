/**
 * Somnio Recompra Agent — Sales Track (Two-Track Decision)
 *
 * Pure state machine that determines WHAT TO DO.
 * Does NOT produce templateIntents or extraContext — only accion + flags.
 * Response track handles WHAT TO SAY independently.
 *
 * Fork of somnio-v3/sales-track.ts — simplified for returning clients.
 * No auto:datos_completos trigger (datos come preloaded).
 * No enCapturaSilenciosa logic (no capturing_data phase).
 * No ofi inter secondary action.
 *
 * Flow:
 * 1. System event (timer expired) -> transition table lookup
 * 2. Intent -> transition table lookup
 * 3. Fallback -> no accion (response track handles informational)
 */

import type {
  AgentState,
  Gates,
  RecompraPhase,
  SalesEvent,
  SalesTrackOutput,
} from './types'
import { resolveTransition, systemEventToKey } from './transitions'

// ============================================================================
// Main Sales Track Function
// ============================================================================

export function resolveSalesTrack(input: {
  phase: RecompraPhase
  state: AgentState
  gates: Gates
  event: SalesEvent
}): SalesTrackOutput {
  const { phase, state, gates, event } = input

  // ------------------------------------------------------------------
  // 1. Timer expired event — early return, no data changes
  // ------------------------------------------------------------------
  if (event.type === 'timer_expired') {
    const key = systemEventToKey({ type: 'timer_expired', level: event.level })
    const match = resolveTransition(phase, key, state, gates)
    if (match) {
      return {
        accion: match.action,
        timerSignal: match.output.timerSignal,
        reason: match.output.reason,
      }
    }
    console.warn(`[sales-track-recompra] No transition for timer_expired:${event.level} in phase ${phase}`)
    return { reason: `No transition for timer_expired:${event.level}` }
  }

  // ------------------------------------------------------------------
  // From here, TypeScript knows event.type === 'user_message'
  // ------------------------------------------------------------------
  const { intent, changes } = event

  // ------------------------------------------------------------------
  // 2. Intent -> transition table lookup
  // ------------------------------------------------------------------
  const match = resolveTransition(phase, intent, state, gates, changes)
  if (match) {
    return {
      accion: match.action,
      timerSignal: match.output.timerSignal,
      reason: match.output.reason,
    }
  }

  // ------------------------------------------------------------------
  // 3. No match (fallback) -> no accion, response track handles informational
  // ------------------------------------------------------------------
  return {
    reason: 'No transition - response track handles informational',
  }
}
