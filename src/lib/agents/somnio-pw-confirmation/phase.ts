/**
 * Somnio PW-Confirmation — Phase Derivation
 *
 * derivePhase(acciones, currentPhase) → string canonico para visualizacion /
 * observability. State-machine pure (D-25): el "phase" en un AgentState es
 * derivado de las acciones tomadas, NO un campo independiente que se actualiza
 * imperativamente.
 *
 * Phases canonicas (alineadas a `./config.ts:states[]`):
 *   - 'initial' / 'nuevo' (sin acciones aun)
 *   - 'awaiting_confirmation' (post CRM-reader, esperando "si" del cliente — D-26)
 *   - 'capturing_data' (cliente esta proveyendo datos faltantes)
 *   - 'awaiting_address' (cliente esta cambiando direccion via crm-writer)
 *   - 'awaiting_schedule_decision' (post agendar_pregunta — D-11)
 *   - 'confirmed' (pedido movido a CONFIRMADO — terminal happy)
 *   - 'waiting_decision' (pedido movido a FALTA CONFIRMAR — D-14, no terminal)
 *   - 'handoff' (handoff stub disparado — terminal)
 *   - 'closed' (cancelado definitivo, terminal)
 *
 * Fork del patron somnio-recompra/phase.ts — adaptado a TipoAccion de PW.
 */

import type { TipoAccion } from './types'

/**
 * Deriva la phase canonica del state machine a partir del array de acciones
 * tomadas (ordenadas cronologicamente, oldest first).
 *
 * Prioriza acciones terminales (handoff > closed > confirmed) sobre intermedias.
 * Si acciones esta vacio → 'initial' (sin actividad). Cuando el agente arranca
 * con createInitialState (D-26), `acciones=[]` pero `state.phase='awaiting_confirmation'`
 * — ese caso lo maneja createInitialState directamente, no derivePhase.
 *
 * @param acciones Acciones tomadas en orden cronologico (oldest first).
 * @returns Phase canonica.
 */
export function derivePhase(acciones: ReadonlyArray<TipoAccion>): string {
  if (acciones.length === 0) {
    return 'initial'
  }

  // Acciones terminales: si alguna fue tomada, esa es la phase final
  if (acciones.includes('handoff')) {
    return 'handoff'
  }
  if (acciones.includes('cancelar_definitivo')) {
    return 'closed'
  }
  if (acciones.includes('confirmar_compra')) {
    return 'confirmed'
  }

  // Phases intermedias: usa la accion mas reciente que mapea a una phase
  // (el ultimo accion no terminal "gana" — barrer en reverse).
  for (let i = acciones.length - 1; i >= 0; i--) {
    const tipo = acciones[i]
    switch (tipo) {
      case 'mover_a_falta_confirmar':
        return 'waiting_decision'
      case 'cancelar_con_agendar_pregunta':
        return 'awaiting_schedule_decision'
      case 'actualizar_direccion':
        return 'awaiting_address'
      case 'pedir_datos_envio':
        return 'capturing_data'
      case 'editar_items':
        // V1: editar_items → handoff inmediato (handled arriba), pero por
        // safety si llega aqui sin handoff acompañante, tratarlo como handoff.
        return 'handoff'
      // Acciones que no cambian phase (noop, fallback no es TipoAccion):
      case 'noop':
        continue
      // Terminales ya manejadas arriba — explicitamos para exhaustiveness
      case 'handoff':
      case 'cancelar_definitivo':
      case 'confirmar_compra':
        continue
    }
  }

  // Default: si solo hay acciones noop o no mapeables, asumimos awaiting_confirmation
  // (estado inicial post-reader segun D-26).
  return 'awaiting_confirmation'
}
