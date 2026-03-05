/**
 * Somnio Sales Agent v3 — Ingest Logic (Capa 4)
 *
 * Controls silent data accumulation during captura mode.
 * Determines whether to respond, stay silent, or auto-trigger next phase.
 *
 * Rules:
 * - datos → silent (accumulate, no response)
 * - pregunta → respond (continue to decision engine)
 * - mixto → respond (data already merged in Capa 3)
 * - irrelevante → silent (no effect on timer)
 *
 * Auto-triggers:
 * - datosOk + !packElegido → OFRECER_PROMOS
 * - datosOk + packElegido → MOSTRAR_CONFIRMACION
 *
 * Route Ofi Inter:
 * - ciudad arrives without direccion → ask delivery preference
 */

import type { AgentState, Gates, IngestResult, TimerSignal } from './types'
import type { MessageAnalysis } from './comprehension-schema'
import { camposLlenos } from './state'
import { CRITICAL_FIELDS_NORMAL } from './constants'

// ============================================================================
// Main Ingest Evaluation
// ============================================================================

/**
 * Evaluate ingest logic for the current turn.
 *
 * @param analysis - Claude comprehension output
 * @param state - Current agent state (AFTER merge in Capa 3)
 * @param gates - Computed gates (datosOk, packElegido)
 * @param prevState - State BEFORE merge (to detect new data)
 * @returns IngestResult with action and optional signals
 */
export function evaluateIngest(
  analysis: MessageAnalysis,
  state: AgentState,
  gates: Gates,
  prevState: AgentState,
): IngestResult {
  const category = analysis.classification.category

  // ------------------------------------------------------------------
  // Route Ofi Inter: ciudad arrives without direccion (normal mode only)
  // ------------------------------------------------------------------
  if (!state.ofiInter && shouldAskOfiInter(state, prevState)) {
    return {
      action: 'ask_ofi_inter',
    }
  }

  // ------------------------------------------------------------------
  // Auto-triggers (regardless of captura mode)
  // ------------------------------------------------------------------
  if (gates.datosOk && gates.packElegido && !promosMostradas(state)) {
    return {
      action: 'respond',
      autoTrigger: 'mostrar_confirmacion',
      timerSignal: { type: 'cancel', reason: 'datos completos + pack → confirmacion' },
    }
  }

  if (gates.datosOk && !gates.packElegido && !promosMostradas(state)) {
    return {
      action: 'respond',
      autoTrigger: 'ofrecer_promos',
      timerSignal: { type: 'cancel', reason: 'datos completos → promos' },
    }
  }

  // ------------------------------------------------------------------
  // Not in captura mode → passthrough to decision engine
  // ------------------------------------------------------------------
  if (!state.enCapturaSilenciosa) {
    return { action: 'respond' }
  }

  // ------------------------------------------------------------------
  // In captura mode: route by classification
  // ------------------------------------------------------------------
  switch (category) {
    case 'datos': {
      // Silent accumulation — don't respond, reevaluate timer
      const timerSignal = evaluateTimerLevel(state, prevState)
      return {
        action: 'silent',
        timerSignal,
      }
    }

    case 'pregunta': {
      // Client asked a question — respond normally
      return { action: 'respond' }
    }

    case 'mixto': {
      // Data already merged in Capa 3, respond to the question part
      const timerSignal = evaluateTimerLevel(state, prevState)
      return {
        action: 'respond',
        timerSignal,
      }
    }

    case 'irrelevante': {
      // No effect — don't respond, don't touch timer
      return { action: 'silent' }
    }

    default:
      return { action: 'respond' }
  }
}

// ============================================================================
// Timer Level Evaluation
// ============================================================================

/**
 * Evaluate which timer level applies based on current data state.
 * Returns a timer signal if the level changed.
 */
function evaluateTimerLevel(
  state: AgentState,
  prevState: AgentState,
): TimerSignal | undefined {
  const filled = camposLlenos(state)
  const prevFilled = camposLlenos(prevState)

  // No change in filled count — no timer action
  if (filled === prevFilled) return undefined

  const criticalCount = CRITICAL_FIELDS_NORMAL.length // 6

  if (filled >= criticalCount) {
    // All critical fields → L2 (2 min for additional fields)
    return { type: 'reevaluate', level: 'L2', reason: `criticos completos (${filled} campos)` }
  }

  if (filled > 0 && prevFilled === 0) {
    // First data arrived → start L1 (6 min)
    return { type: 'start', level: 'L1', reason: `primer dato (${filled} campos)` }
  }

  if (filled > prevFilled) {
    // More data arrived but not all critical → reevaluate (stays L1)
    return { type: 'reevaluate', level: 'L1', reason: `mas datos (${filled} campos)` }
  }

  return undefined
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if we should ask about ofi inter.
 * Triggers when ciudad just arrived without direccion.
 */
function shouldAskOfiInter(state: AgentState, prevState: AgentState): boolean {
  const justGotCiudad = state.datos.ciudad !== null && prevState.datos.ciudad === null
  const noAddress = !state.datos.direccion || state.datos.direccion.trim() === ''
  const noBarrio = !state.datos.barrio || state.datos.barrio.trim() === ''
  return justGotCiudad && noAddress && noBarrio
}

/**
 * Check if promos have been shown in this conversation.
 */
function promosMostradas(state: AgentState): boolean {
  return state.accionesEjecutadas.includes('ofrecer_promos') ||
    state.templatesMostrados.some(t =>
      t.includes('ofrecer_promos') || t.includes('promociones')
    )
}
