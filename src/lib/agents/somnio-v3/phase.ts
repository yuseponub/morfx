/**
 * Somnio v3 — Phase Derivation
 *
 * Phase = last significant action. No separate mode field.
 * Works with BOTH old format (string[]) and new format (AccionRegistrada[]).
 */
import type { Phase, AccionRegistrada } from './types'
import { SIGNIFICANT_ACTIONS } from './constants'

/**
 * Derive current phase from accionesEjecutadas.
 * Handles both old string[] format and new AccionRegistrada[] format.
 */
export function derivePhase(acciones: (string | AccionRegistrada)[]): Phase {
  for (let i = acciones.length - 1; i >= 0; i--) {
    const a = acciones[i]
    const tipo = typeof a === 'string' ? a : a.tipo
    if (!SIGNIFICANT_ACTIONS.has(tipo)) continue

    switch (tipo) {
      case 'pedir_datos':          return 'capturing_data'
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
