/**
 * Somnio Recompra — Phase Derivation
 *
 * Phase = last significant action. No separate mode field.
 * 5 phases: initial -> promos_shown -> confirming -> order_created -> closed
 * NO capturing_data phase (datos come preloaded from last order).
 *
 * Fork of somnio-v3/phase.ts — simplified.
 */
import type { RecompraPhase, AccionRegistrada } from './types'
import { SIGNIFICANT_ACTIONS } from './constants'

/**
 * Derive current phase from accionesEjecutadas.
 * Iterates from end to start, returning the phase of the last significant action.
 */
export function derivePhase(acciones: AccionRegistrada[]): RecompraPhase {
  for (let i = acciones.length - 1; i >= 0; i--) {
    const tipo = acciones[i].tipo
    if (!SIGNIFICANT_ACTIONS.has(tipo)) continue

    switch (tipo) {
      case 'ofrecer_promos':       return 'promos_shown'
      case 'mostrar_confirmacion': return 'confirming'
      case 'crear_orden':
      case 'crear_orden_sin_promo':
      case 'crear_orden_sin_confirmar':
                                   return 'order_created'
      case 'handoff':
      case 'rechazar':
      case 'no_interesa':          return 'closed'
    }
  }
  return 'initial'
}
