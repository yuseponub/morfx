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
import { INFORMATIONAL_INTENTS } from './constants'
import { hasAction } from './state'
import type { StateChanges } from './state'
import { resolveTransition, systemEventToKey } from './transitions'
import { getCollector } from '@/lib/observability'

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
      // Phase 42.1: a retake-flavored action is the canonical signal of
      // the retake mechanism firing in production.
      if (typeof match.action === 'string' && match.action.startsWith('retoma')) {
        getCollector()?.recordEvent('retake', 'decision', {
          willRetake: true,
          action: match.action,
          phase,
          timerLevel: event.level,
          reason: match.output.reason ?? null,
        })
      }
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
      if (state.ofiInter) {
        // Ofi inter: criticos completos, faltan extras (cedula/correo)
        // Solo activar L8 si retoma_ofi_inter ya se ejecuto (L7 ya expiro)
        // Si L7 sigue corriendo, dejarlo — retoma iniciara L8 al expirar
        if (hasAction(state.accionesEjecutadas, 'retoma_ofi_inter')) {
          dataTimerSignal = { type: 'start', level: 'L8', reason: 'criticos ofi inter completos post-retoma, esperando extras' }
        }
        // else: L7 still running, don't override
      } else {
        // Normal: L2 (2 min gracia para extras)
        dataTimerSignal = { type: 'start', level: 'L2', reason: 'criticos completos, esperando extras' }
      }
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
    // Guard: skip auto-trigger if intent is informational (let response track answer first)
    const isInformational = event.type === 'user_message' &&
      event.intent && INFORMATIONAL_INTENTS.has(event.intent)

    if (!isInformational) {
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
    // If informational: datosCompletosJustCompleted is consumed this turn,
    // auto-trigger deferred to next non-informational message
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

    // Phase 42.1: ofi_inter routing decision. Three observable routes:
    //   - Route 1 (initial): main action ask_ofi_inter (primary)
    //   - Route 2 (secondary append): main is something else but
    //     mencionaInter triggers ask_ofi_inter as secondarySalesAction
    //   - Route 3 (late change): main action is confirmar_cambio_ofi_inter
    if (match.action === 'ask_ofi_inter') {
      getCollector()?.recordEvent('ofi_inter', 'route_selected', {
        route: 1,
        kind: 'primary',
        intent,
        phase,
      })
    } else if (secondarySalesAction === 'ask_ofi_inter') {
      getCollector()?.recordEvent('ofi_inter', 'route_selected', {
        route: 2,
        kind: 'secondary',
        primaryAction: match.action,
        intent,
        phase,
      })
    } else if (match.action === 'confirmar_cambio_ofi_inter') {
      getCollector()?.recordEvent('ofi_inter', 'route_selected', {
        route: 3,
        kind: 'late_change',
        intent,
        phase,
      })
    }

    if (typeof match.action === 'string' && match.action.startsWith('retoma')) {
      getCollector()?.recordEvent('retake', 'decision', {
        willRetake: true,
        action: match.action,
        phase,
        intent,
      })
    }

    return {
      accion: match.action,
      secondarySalesAction,
      enterCaptura: match.output.enterCaptura,
      timerSignal: match.output.timerSignal ?? dataTimerSignal,
      reason: match.output.reason,
    }
  }

  // No main match, but check if mencionaInter triggers fallback secondary ofi_inter
  if (changes.mencionaInter) {
    getCollector()?.recordEvent('ofi_inter', 'route_selected', {
      route: 2,
      kind: 'fallback_secondary',
      intent,
      phase,
    })
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
