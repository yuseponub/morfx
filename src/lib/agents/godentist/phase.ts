/**
 * GoDentist Agent — Phase Derivation
 *
 * Phase = last significant action in accionesEjecutadas.
 * 7 phases derived from 8 significant actions.
 * Default is 'initial' when no significant action found.
 */
import type { Phase, AccionRegistrada } from './types'
import { SIGNIFICANT_ACTIONS } from './constants'

/**
 * Derive current phase from accionesEjecutadas.
 * Scans from most recent to oldest, returns phase of first significant action found.
 */
export function derivePhase(acciones: AccionRegistrada[]): Phase {
  for (let i = acciones.length - 1; i >= 0; i--) {
    const tipo = acciones[i].tipo
    if (!SIGNIFICANT_ACTIONS.has(tipo)) continue

    switch (tipo) {
      case 'pedir_datos':
      case 'pedir_datos_parcial':     return 'capturing_data'
      case 'pedir_fecha':             return 'capturing_fecha'
      case 'mostrar_disponibilidad':  return 'showing_availability'
      case 'mostrar_confirmacion':    return 'confirming'
      case 'agendar_cita':            return 'appointment_registered'
      case 'handoff':
      case 'no_interesa':             return 'closed'
    }
  }
  return 'initial'
}
