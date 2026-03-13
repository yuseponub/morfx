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
 * 3. Intent -> transition table lookup
 * 4. Fallback -> no accion (response track handles informational)
 */

import type {
  AgentState,
  Gates,
  Phase,
  SalesEvent,
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
        enterCaptura: match.output.enterCaptura,
        timerSignal: match.output.timerSignal,
        reason: match.output.reason,
      }
    }
    console.warn(`[sales-track] No transition for timer_expired:${event.level} in phase ${phase}`)
    return { reason: `No transition for timer_expired:${event.level}` }
  }

  // ------------------------------------------------------------------
  // From here, TypeScript knows event.type === 'user_message'
  // ------------------------------------------------------------------
  const { intent, category, changes } = event

  // Timer signal from data changes (computed early, used as fallback)
  let dataTimerSignal: TimerSignal | undefined
  if (state.enCapturaSilenciosa && changes.hasNewData) {
    if (changes.datosCriticosJustCompleted && !changes.datosCompletosJustCompleted) {
      // Criticos completos, faltan extras -> L2 (2 min gracia para extras)
      dataTimerSignal = { type: 'start', level: 'L2', reason: 'criticos completos, esperando extras' }
    } else if (changes.filled > 0 && !changes.datosCriticosJustCompleted && !gates.datosCriticos) {
      // Datos parciales (criticos aun incompletos) -> L1
      dataTimerSignal = { type: 'start', level: 'L1', reason: `datos parciales (${changes.filled} campos)` }
    }
  }

  // ------------------------------------------------------------------
  // 2. Auto-triggers por cambios de datos
  // ------------------------------------------------------------------

  // NOTE: ciudad_sin_direccion auto-trigger removed (ofi-inter-01).
  // Plan 02 replaces with ofiInterJustSet/mencionaInter signal-based triggers.

  // Datos completos auto-trigger: completos just completed -> ofrecer_promos de una
  if (changes.datosCompletosJustCompleted && !promosMostradas(state)) {
    const ev: SystemEvent = { type: 'auto', result: 'datos_completos' }
    const key = systemEventToKey(ev)
    const match = resolveTransition(phase, key, state, gates, changes)
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
  // 3. Intent -> transition table lookup (pass changes for ofi inter signals)
  // ------------------------------------------------------------------
  const match = resolveTransition(phase, intent, state, gates, changes)
  if (match) {
    // T9: mencionaInter + main action is NOT ask_ofi_inter → add as secondary
    const secondarySalesAction = (changes.mencionaInter && match.action !== 'ask_ofi_inter')
      ? 'ask_ofi_inter' as const
      : undefined

    return {
      accion: match.action,
      secondarySalesAction,
      enterCaptura: match.output.enterCaptura,
      timerSignal: match.output.timerSignal ?? dataTimerSignal,
      reason: match.output.reason,
    }
  }

  // ------------------------------------------------------------------
  // 4. No match (fallback) -> no accion, response track handles informational
  // ------------------------------------------------------------------
  // Even without a main match, mencionaInter can trigger ask_ofi_inter as secondary
  const fallbackSecondary = changes.mencionaInter ? 'ask_ofi_inter' as const : undefined

  return {
    secondarySalesAction: fallbackSecondary,
    reason: 'No transition - response track handles informational',
    timerSignal: dataTimerSignal,
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if promos have been shown in this conversation.
 */
function promosMostradas(state: AgentState): boolean {
  return hasAction(state.accionesEjecutadas, 'ofrecer_promos') ||
    state.templatesMostrados.some(t =>
      t.includes('ofrecer_promos') || t.includes('promociones')
    )
}
