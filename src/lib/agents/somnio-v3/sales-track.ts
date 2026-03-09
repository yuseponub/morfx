/**
 * Somnio Sales Agent v3 — Sales Track (Two-Track Decision)
 *
 * Pure state machine that determines WHAT TO DO.
 * Does NOT produce templateIntents or extraContext — only accion + flags.
 * Response track handles WHAT TO SAY independently.
 *
 * Flow:
 * 1. System event (timer expired) -> transition table lookup
 * 2. Auto-triggers por cambios de datos
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
  TimerSignal,
} from './types'
import { hasAction } from './state'
import type { StateChanges } from './state'
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
  changes: StateChanges
  category: string
  systemEvent?: SystemEvent
}): SalesTrackOutput {
  const { phase, intent, isAcknowledgment, sentiment, state, gates, changes, systemEvent } = input

  // Timer signal from data changes (computed early, used as fallback)
  let dataTimerSignal: TimerSignal | undefined
  if (state.enCapturaSilenciosa && changes.hasNewData) {
    if (changes.criticalComplete) {
      dataTimerSignal = { type: 'reevaluate', level: 'L2', reason: `criticos completos (${changes.filled} campos)` }
    } else if (changes.filled > 0) {
      dataTimerSignal = { type: 'start', level: 'L1', reason: `datos parciales (${changes.filled} campos)` }
    }
  }

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
  // 2. Auto-triggers por cambios de datos
  // ------------------------------------------------------------------

  // Ofi inter detection: ciudad llego sin direccion (solo modo normal)
  if (!state.ofiInter && changes.ciudadJustArrived && !state.datos.direccion && !state.datos.barrio) {
    const key = systemEventToKey({ type: 'auto', result: 'ciudad_sin_direccion' })
    const match = resolveTransition(phase, key, state, gates)
    if (match) {
      return {
        accion: match.action,
        enterCaptura: match.output.enterCaptura,
        timerSignal: match.output.timerSignal,
        reason: match.output.reason,
      }
    }
  }

  // Datos completos auto-trigger (criticos + extras ok, promos no mostradas)
  if (changes.criticalComplete && !promosMostradas(state)) {
    const ev: SystemEvent = { type: 'auto', result: 'datos_completos' }
    const key = systemEventToKey(ev)
    const match = resolveTransition(phase, key, state, gates)
    if (match) {
      return {
        accion: match.action,
        enterCaptura: match.output.enterCaptura,
        timerSignal: match.output.timerSignal,
        reason: match.output.reason,
      }
    }
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
      return { reason: 'Ack en promos sin pack - fall through', timerSignal: dataTimerSignal }
    }

    // Default ack -> no accion (natural silence if intent is not informational)
    return { reason: 'Ack sin contexto confirmatorio', timerSignal: dataTimerSignal }
  }

  // ------------------------------------------------------------------
  // 4. Intent -> transition table lookup
  // ------------------------------------------------------------------
  const match = resolveTransition(phase, intent, state, gates)
  if (match) {
    return {
      accion: match.action,
      enterCaptura: match.output.enterCaptura,
      timerSignal: match.output.timerSignal ?? dataTimerSignal,
      reason: match.output.reason,
    }
  }

  // ------------------------------------------------------------------
  // 5. No match (fallback) -> no accion, response track handles informational
  // ------------------------------------------------------------------
  return {
    reason: 'No transition - response track handles informational',
    timerSignal: dataTimerSignal,
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isPositiveAck(sentiment: string, intent: string): boolean {
  return sentiment === 'positivo' || intent === 'confirmar'
}

/**
 * Check if promos have been shown in this conversation.
 */
function promosMostradas(state: AgentState): boolean {
  return hasAction(state.accionesEjecutadas, 'ofrecer_promos') ||
    state.templatesMostrados.some(t =>
      t.includes('ofrecer_promos') || t.includes('promociones')
    )
}
