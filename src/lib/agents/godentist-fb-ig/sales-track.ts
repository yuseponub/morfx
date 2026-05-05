// Adapted from src/lib/agents/godentist/sales-track.ts (Standalone: agent-godentist-fb-ig, Wave 2 Plan 04 Task 2).
// Changes: (a) agent name swap in 3 getCollector events. (b) lead-capture hook (D-09)
// inserted between timer_expired early-return and "Auto-triggers by data changes" block.
// Hook calls resolveLeadCapture and short-circuits to pedir_datos_parcial when triggered.
/**
 * GoDentist Appointment Agent — Sales Track (Two-Track Decision)
 *
 * Pure state machine that determines WHAT TO DO.
 * Does NOT produce templateIntents or extraContext — only accion + timerSignal.
 * Response track handles WHAT TO SAY independently.
 *
 * Flow:
 * 1. System event (timer expired) -> transition table lookup
 * 1.5 Lead capture turn 1 (D-09 sibling-only) -> short-circuit to pedir_datos_parcial
 * 2. Auto-triggers by data changes (datosCriticosJustCompleted)
 * 3. Intent -> transition table lookup
 * 4. Fallback -> no accion (response track handles informational)
 *
 * Simpler than somnio-v3: NO ofi-inter signals, NO secondary sales actions,
 * NO captura silenciosa. Dental appointment scheduling only.
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
import { resolveLeadCapture } from './lead-capture'
import { camposFaltantes } from './state'

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
        agent: 'godentist-fb-ig',
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
    console.warn(`[gd-sales-track] No transition for timer_expired:${event.level} in phase ${phase}`)
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
  // 1.5 LEAD CAPTURE turn 1 (D-09 godentist-fb-ig sibling)
  // Antes de auto-triggers y tabla de transitions, verificar si este
  // es el primer turno post-saludo con datos parciales del cliente.
  // Solo dispara cuando turnCount === 1 + intent === 'datos' + datos
  // criticos NO completos. Otros casos pasan al sales-track normal.
  // ------------------------------------------------------------------
  const leadCaptureDecision = resolveLeadCapture({
    turnCount: state.turnCount,
    intent,
    state,
    gates,
  })
  if (leadCaptureDecision) {
    getCollector()?.recordEvent('pipeline_decision', 'lead_capture_triggered', {
      agent: 'godentist-fb-ig',
      intent,
      accion: leadCaptureDecision.accion,
      reason: leadCaptureDecision.reason,
      camposFaltantes: camposFaltantes(state),
    })
    return {
      accion: leadCaptureDecision.accion,
      timerSignal: leadCaptureDecision.timerSignal,
      reason: leadCaptureDecision.reason,
    }
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
          agent: 'godentist-fb-ig',
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
      agent: 'godentist-fb-ig',
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
