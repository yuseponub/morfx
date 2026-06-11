// Clonado de src/lib/agents/godentist-fb-ig/sales-track.ts (Standalone agent-varixcenter Wave 2 Plan 04 Task 3).
// Cambios vs godentist-fb-ig:
//   - SIN el hook lead-capture (D-09 era especifico del sibling FB/IG; varixcenter no lo usa —
//     el caso "datos solo-triage post-saludo" lo maneja la propia tabla de transiciones, §7*).
//   - agent name en getCollector events: godentist-fb-ig -> varixcenter.
//   - log prefix [gd-sales-track] -> [varixcenter].
// El cuerpo de la logica (motor generico de transiciones + auto-triggers) NO cambia.
/**
 * Varixcenter Appointment Agent — Sales Track (Two-Track Decision)
 *
 * Pure state machine that determines WHAT TO DO.
 * Does NOT produce templateIntents or extraContext — only accion + timerSignal.
 * Response track handles WHAT TO SAY independently.
 *
 * Flow:
 * 1. System event (timer expired) -> transition table lookup
 * 2. Auto-triggers by data changes (datosCriticosJustCompleted)
 * 3. Intent -> transition table lookup
 * 4. Fallback -> no accion (response track handles informational)
 */

import type {
  AgentState,
  Gates,
  Phase,
  SalesEvent,
  SalesTrackOutput,
  TimerSignal,
} from './types'
import { getCollector } from '@/lib/observability'
import { INFORMATIONAL_INTENTS } from './constants'
import { resolveTransition, systemEventToKey } from './transitions'
import type { StateChanges } from './transitions'

// ============================================================================
// Main Sales Track Function
// ============================================================================

export function resolveSalesTrack(input: {
  phase: Phase
  state: AgentState
  gates: Gates
  event: SalesEvent
  changes?: StateChanges
}): SalesTrackOutput {
  const { phase, state, gates, event, changes } = input

  // ------------------------------------------------------------------
  // 1. Timer expired event — early return, no data changes
  // ------------------------------------------------------------------
  if (event.type === 'timer_expired') {
    const key = systemEventToKey({ type: 'timer_expired', level: event.level })
    const match = resolveTransition(phase, key, state, gates)
    if (match) {
      getCollector()?.recordEvent('pipeline_decision', 'timer_transition', {
        agent: 'varixcenter',
        level: event.level,
        action: match.action,
        reason: match.output.reason,
      })
      return {
        accion: match.action,
        timerSignal: match.output.timerSignal,
        reason: match.output.reason,
      }
    }
    console.warn(`[varixcenter] No transition for timer_expired:${event.level} in phase ${phase}`)
    return { reason: `No transition for timer_expired:${event.level}` }
  }

  // ------------------------------------------------------------------
  // From here, TypeScript knows event.type === 'user_message'
  // ------------------------------------------------------------------
  const { intent } = event

  // Timer signal from data changes (used as fallback if main transition doesn't produce one)
  let dataTimerSignal: TimerSignal | undefined
  if (changes?.hasNewData && changes.filled > 0 && !changes.datosCriticosJustCompleted && !gates.datosCriticos) {
    // Partial data received, critical fields still incomplete -> L1
    dataTimerSignal = { type: 'start', level: 'L1', reason: `datos parciales (${changes.filled} campos)` }
  }

  // ------------------------------------------------------------------
  // 2. Auto-triggers by data changes
  // ------------------------------------------------------------------
  if (changes?.datosCriticosJustCompleted) {
    // Guard: skip auto-trigger if intent is informational (let response track answer first)
    const isInformational = INFORMATIONAL_INTENTS.has(intent)

    if (!isInformational) {
      const key = systemEventToKey({ type: 'auto', result: 'datos_criticos' })
      const match = resolveTransition(phase, key, state, gates, changes)
      if (match) {
        getCollector()?.recordEvent('pipeline_decision', 'auto_trigger', {
          agent: 'varixcenter',
          trigger: 'datos_criticos',
          action: match.action,
          reason: match.output.reason,
        })
        return {
          accion: match.action,
          timerSignal: match.output.timerSignal,
          reason: match.output.reason,
        }
      }
    }
    // If informational: auto-trigger deferred, response track answers first
  }

  // ------------------------------------------------------------------
  // 3. Intent -> transition table lookup
  // ------------------------------------------------------------------
  const match = resolveTransition(phase, intent, state, gates, changes)
  if (match) {
    getCollector()?.recordEvent('pipeline_decision', 'intent_transition', {
      agent: 'varixcenter',
      intent,
      action: match.action,
      reason: match.output.reason,
      hasTimerSignal: !!match.output.timerSignal,
    })
    return {
      accion: match.action,
      timerSignal: match.output.timerSignal ?? dataTimerSignal,
      reason: match.output.reason,
    }
  }

  // ------------------------------------------------------------------
  // 4. No match (fallback) -> no accion, response track handles informational
  // ------------------------------------------------------------------
  return {
    reason: 'No transition - response track handles informational',
    timerSignal: dataTimerSignal,
  }
}
