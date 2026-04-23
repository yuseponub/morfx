/**
 * Somnio Recompra — Declarative Transition Table
 *
 * Fork of somnio-v3/transitions.ts — completely rewritten for returning clients.
 * ~15 entries (vs v3's ~30+). No capturing_data phase, no ofi inter logic.
 *
 * Key differences:
 * - 3 entry scenarios: saludo, quiero_comprar (with address gate), datos espontaneos
 * - confirmar_direccion intent → straight to promos
 * - preguntar_direccion action for address confirmation gate
 * - Only L3, L4, L5 timers
 *
 * Lookup order: specific phase first, then '*' (any phase).
 * First match wins (array order matters for same phase+on with different conditions).
 */
import type { AgentState, Gates, RecompraPhase, TipoAccion, TimerSignal } from './types'
import type { StateChanges } from './state'

export interface TransitionEntry {
  phase: RecompraPhase | '*'
  on: string   // intent name OR system event type (e.g., 'timer_expired:3')
  action: TipoAccion
  condition?: (state: AgentState, gates: Gates, changes?: StateChanges) => boolean
  resolve: (state: AgentState, gates: Gates) => TransitionOutput
  description?: string
}

export interface TransitionOutput {
  timerSignal?: TimerSignal
  reason: string
}

export const TRANSITIONS: TransitionEntry[] = [
  // ======== ANY-phase transitions ========

  // R2: no_interesa
  {
    phase: '*', on: 'no_interesa', action: 'no_interesa',
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'no interesa' },
      reason: 'Cliente no interesado',
    }),
  },

  // R4: rechazar
  {
    phase: '*', on: 'rechazar', action: 'rechazar',
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'rechazo' },
      reason: 'Cliente rechazo',
    }),
  },

  // Default acknowledgment -> silence + L5
  {
    phase: '*', on: 'acknowledgment', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'ack sin contexto confirmatorio' },
      reason: 'Acknowledgment sin contexto confirmatorio',
    }),
  },

  // ======== Initial phase — 2 entry scenarios (saludo se maneja via response-track) ========

  // D-05: saludo en initial NO dispara action — cae al fallback null, response-track
  // emite los templates de saludo (texto + imagen ELIXIR) via INFORMATIONAL_INTENTS.
  // Permite esperar la respuesta del cliente sin adelantar promos.

  // Escenario 1: quiero_comprar → preguntar direccion (D-04: confirmar direccion antes de promos)
  {
    phase: 'initial', on: 'quiero_comprar', action: 'preguntar_direccion',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'quiero_comprar → preguntar direccion' },
      reason: 'Quiere comprar en initial → confirmar direccion antes de promos',
    }),
    description: 'Escenario 1: quiero_comprar → preguntar_direccion (gate de direccion)',
  },

  // Escenario 2: datos espontaneos + datos criticos → promos
  {
    phase: 'initial', on: 'datos', action: 'ofrecer_promos',
    condition: (_, gates) => gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'datos espontaneos + criticos completos → promos' },
      reason: 'Datos espontaneos con criticos completos → promos',
    }),
    description: 'Escenario 2: datos espontaneos + datosCriticos → promos',
  },

  // Escenario 2 incompleto: datos espontaneos sin criticos → preguntar direccion
  {
    phase: 'initial', on: 'datos', action: 'preguntar_direccion',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'datos incompletos, pedir lo que falta' },
      reason: 'Datos espontaneos sin criticos → preguntar lo que falta',
    }),
    description: 'Escenario 2 incompleto: datos sin criticos → preguntar',
  },

  // confirmar_direccion en initial → promos
  {
    phase: 'initial', on: 'confirmar_direccion', action: 'ofrecer_promos',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'direccion confirmada → promos' },
      reason: 'Direccion confirmada → promos',
    }),
    description: 'Cliente confirmo direccion → promos',
  },

  // precio en initial → promos (recompra: precio sends promos directly)
  {
    phase: 'initial', on: 'precio', action: 'ofrecer_promos',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'precio → promos directas' },
      reason: 'Pregunta precio → promos directas',
    }),
    description: 'Precio en initial → promos directas (recompra)',
  },

  // ======== promos_shown phase ========

  // seleccion_pack + datosCriticos → confirmacion
  {
    phase: 'promos_shown', on: 'seleccion_pack', action: 'mostrar_confirmacion',
    condition: (_, gates) => gates.datosCriticos,
    resolve: (state) => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'pack elegido, esperando confirmacion' },
      reason: `Pack=${state.pack} + datosCriticos → resumen`,
    }),
  },

  // seleccion_pack + !datosCriticos → preguntar direccion (edge case: datos cleared)
  {
    phase: 'promos_shown', on: 'seleccion_pack', action: 'preguntar_direccion',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'pack elegido pero faltan datos' },
      reason: 'Pack elegido pero faltan datos criticos → preguntar',
    }),
  },

  // Timer L3 → crear orden sin promo
  {
    phase: 'promos_shown', on: 'timer_expired:3', action: 'crear_orden_sin_promo',
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'timer L3 → orden sin promo' },
      reason: 'Timer L3 expired → crear orden sin promo',
    }),
  },

  // ======== confirming phase ========

  // confirmar + pack + datos → crear orden
  {
    phase: 'confirming', on: 'confirmar', action: 'crear_orden',
    condition: (_, gates) => gates.datosCriticos && gates.packElegido,
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'orden creada' },
      reason: 'Confirmacion con datos completos + pack',
    }),
  },

  // confirmar + !pack → ofrecer promos
  {
    phase: 'confirming', on: 'confirmar', action: 'ofrecer_promos',
    condition: (_, gates) => !gates.packElegido,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'confirmo sin pack → promos' },
      reason: 'Confirmo pero no ha elegido pack',
    }),
  },

  // datos en confirming → cambio
  {
    phase: 'confirming', on: 'datos', action: 'cambio',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'cambio de datos en confirming' },
      reason: 'Cambio de datos en fase confirming',
    }),
  },

  // Timer L4 → crear orden sin confirmar
  {
    phase: 'confirming', on: 'timer_expired:4', action: 'crear_orden_sin_confirmar',
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'timer L4 → orden sin confirmar' },
      reason: 'Timer L4 expired → crear orden sin confirmar',
    }),
  },

  // ======== ANY-phase pack selection ========

  // seleccion_pack + datosCriticos → confirmacion
  {
    phase: '*', on: 'seleccion_pack', action: 'mostrar_confirmacion',
    condition: (_, gates) => gates.datosCriticos,
    resolve: (state) => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'pack elegido, esperando confirmacion' },
      reason: `Pack=${state.pack} + datosCriticos → resumen`,
    }),
  },

  // seleccion_pack + !datosCriticos → preguntar direccion
  {
    phase: '*', on: 'seleccion_pack', action: 'preguntar_direccion',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'pack elegido pero faltan datos' },
      reason: 'Pack elegido pero faltan datos criticos → preguntar',
    }),
  },

  // ======== ANY-phase confirmar ========

  // confirmar + datos + pack → crear orden
  {
    phase: '*', on: 'confirmar', action: 'crear_orden',
    condition: (_, gates) => gates.datosCriticos && gates.packElegido,
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'orden creada' },
      reason: 'Confirmacion con datos completos + pack',
    }),
  },

  // confirmar + !pack → ofrecer promos
  {
    phase: '*', on: 'confirmar', action: 'ofrecer_promos',
    condition: (_, gates) => !gates.packElegido,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'confirmo sin pack → promos' },
      reason: 'Confirmo pero no ha elegido pack',
    }),
  },

  // ======== Timer L5 → retoma (initial only) ========
  {
    phase: 'initial', on: 'timer_expired:5', action: 'retoma',
    resolve: () => ({
      reason: 'Timer L5 expired en initial → retoma',
    }),
  },

  // ======== closed phase fallback ========
  {
    phase: 'closed', on: '*', action: 'silence',
    resolve: () => ({
      reason: 'Fase closed → fallback (no action)',
    }),
  },
]

/**
 * Resolve a transition from the table.
 *
 * @param phase - Current derived phase
 * @param on - Intent name OR system event key (e.g., 'timer_expired:3')
 * @param state - Current agent state
 * @param gates - Computed gates
 * @returns TransitionOutput or null if no match
 */
export function resolveTransition(
  phase: RecompraPhase,
  on: string,
  state: AgentState,
  gates: Gates,
  changes?: StateChanges,
): { action: TipoAccion; output: TransitionOutput } | null {
  for (const entry of TRANSITIONS) {
    // Phase match: specific phase or wildcard
    if (entry.phase !== '*' && entry.phase !== phase) continue

    // On match: specific on or wildcard
    if (entry.on !== '*' && entry.on !== on) continue

    // Condition check
    if (entry.condition && !entry.condition(state, gates, changes)) continue

    return {
      action: entry.action,
      output: entry.resolve(state, gates),
    }
  }

  return null  // No match -> caller uses fallback
}

/**
 * Convert a SystemEvent to the 'on' key used in the transition table.
 * E.g., { type: 'timer_expired', level: 3 } -> 'timer_expired:3'
 */
export function systemEventToKey(event: { type: string; [k: string]: unknown }): string {
  switch (event.type) {
    case 'timer_expired':
      return `timer_expired:${event.level}`
    default:
      return event.type
  }
}
