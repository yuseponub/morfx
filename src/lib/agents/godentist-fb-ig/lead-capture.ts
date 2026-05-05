// Standalone: agent-godentist-fb-ig (Wave 2 Plan 04, Task 1).
// Pure helper for D-09 lead-capture decision logic.
// No I/O, no side effects, fully testable.

import type { AgentState, Gates, TipoAccion, TimerSignal } from './types'
import { camposFaltantes } from './state'

/**
 * Lead capture decision for first-turn FB/IG conversations.
 *
 * D-09: when the customer's first response (turn 1) contains personal data
 * (intent='datos' classified by Haiku), bypass the normal transition table
 * and route directly to `pedir_datos_parcial` with `{{campos_faltantes}}`
 * computed from the current state.
 *
 * Returns null when lead-capture should NOT trigger (subsequent turns,
 * non-data intents, or when datos criticos already complete).
 *
 * Pure function — no I/O, no side effects, fully testable.
 *
 * IMPORTANT — Pitfall 5 (off-by-one):
 * turnCount comes from state AFTER mergeAnalysis incremented it. The first
 * message from the customer enters with turnCount=0, exits mergeAnalysis with
 * turnCount=1, lands in resolveSalesTrack with turnCount=1.
 * That is why we check `=== 1`, NOT `=== 0` or `>= 1`.
 */
export interface LeadCaptureDecision {
  accion: TipoAccion
  timerSignal?: TimerSignal
  reason: string
}

export function resolveLeadCapture(input: {
  turnCount: number
  intent: string
  state: AgentState
  gates: Gates
}): LeadCaptureDecision | null {
  const { turnCount, intent, state, gates } = input

  // Lead capture solo dispara en turn 1 (primer mensaje del cliente post-saludo).
  if (turnCount !== 1) return null

  // Solo si Haiku clasifica como 'datos' (cliente envio info personal)
  if (intent !== 'datos') return null

  // Si datos criticos completos + fecha falta -> dejar que sales-track normal
  // dispare pedir_fecha (no pedir_datos_parcial con [] vacio).
  if (gates.datosCriticos && !gates.fechaElegida) return null

  // Si datos criticos completos + fecha -> mostrar_disponibilidad (sales-track normal)
  if (gates.datosCriticos && gates.fechaElegida) return null

  // Si datos criticos NO completos -> pedir_datos_parcial con campos faltantes.
  const faltantes = camposFaltantes(state)
  if (faltantes.length === 0) return null  // edge case: nada que pedir

  return {
    accion: 'pedir_datos_parcial' as TipoAccion,
    timerSignal: { type: 'start', level: 'L1', reason: `lead capture turn 1: ${faltantes.length} campos faltantes` },
    reason: `Lead capture FB/IG: cliente envio datos parciales en turn 1, faltan ${faltantes.join(', ')}`,
  }
}
