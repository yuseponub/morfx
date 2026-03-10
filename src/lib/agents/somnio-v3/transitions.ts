/**
 * Somnio v3 — Declarative Transition Table
 *
 * Replaces R2-R9 waterfall. Each entry: (phase, on) -> action + response metadata.
 * Guards (R0, R1) run before this table in guards.ts.
 *
 * Lookup order: specific phase first, then '*' (any phase).
 * First match wins (array order matters for same phase+on with different conditions).
 */
import type { AgentState, Gates, Phase, TipoAccion, TimerSignal } from './types'
import { camposFaltantes, buildResumenContext } from './state'

export interface TransitionEntry {
  phase: Phase | '*'
  on: string   // intent name OR system event type (e.g., 'timer_expired:2')
  action: TipoAccion
  condition?: (state: AgentState, gates: Gates) => boolean
  resolve: (state: AgentState, gates: Gates) => TransitionOutput
}

export interface TransitionOutput {
  templateIntents: string[]
  extraContext?: Record<string, string>
  timerSignal?: TimerSignal
  enterCaptura?: boolean
  reason: string
}

// Helper to build resumen intent from pack
function getResumenIntent(pack: '1x' | '2x' | '3x'): string {
  return `resumen_${pack}`
}

export const TRANSITIONS: TransitionEntry[] = [
  // ======== ANY-phase transitions ========

  // R2: no_interesa
  {
    phase: '*', on: 'no_interesa', action: 'no_interesa',
    resolve: () => ({
      templateIntents: ['no_interesa'],
      timerSignal: { type: 'cancel', reason: 'no interesa' },
      reason: 'Cliente no interesado',
    }),
  },

  // R4: rechazar
  {
    phase: '*', on: 'rechazar', action: 'rechazar',
    resolve: () => ({
      templateIntents: ['rechazar'],
      timerSignal: { type: 'cancel', reason: 'rechazo' },
      reason: 'Cliente rechazo',
    }),
  },

  // R3: acknowledgment — handled via transition table (comprehension sends confirmar for positive acks in confirming)
  // Ack in promos_shown without pack -> fallback (R3 exception 1: keep conversation going)
  {
    phase: 'promos_shown', on: 'acknowledgment', action: 'silence',
    condition: (_, gates) => !gates.packElegido,
    resolve: () => ({
      templateIntents: [],  // fallback to R9-style response handled by caller
      reason: 'Ack en promos_shown sin pack -> fall through to default',
    }),
  },

  // Default acknowledgment -> silence
  {
    phase: '*', on: 'acknowledgment', action: 'silence',
    resolve: () => ({
      templateIntents: [],
      timerSignal: { type: 'start', level: 'L5', reason: 'ack sin contexto confirmatorio' },
      reason: 'Acknowledgment sin contexto confirmatorio',
    }),
  },

  // ======== Phase-specific transitions ========

  // initial + quiero_comprar -> pedir_datos (datos will be needed)
  {
    phase: 'initial', on: 'quiero_comprar', action: 'pedir_datos',
    condition: (_, gates) => !gates.datosOk,
    resolve: (state) => ({
      templateIntents: ['pedir_datos'],
      extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
      enterCaptura: true,
      timerSignal: { type: 'start', level: 'L0', reason: 'captura iniciada por quiero_comprar' },
      reason: 'Quiere comprar, faltan datos',
    }),
  },

  // initial + quiero_comprar + datosOk -> ofrecer_promos
  {
    phase: 'initial', on: 'quiero_comprar', action: 'ofrecer_promos',
    condition: (_, gates) => gates.datosOk,
    resolve: () => ({
      templateIntents: ['promociones'],
      timerSignal: { type: 'start', level: 'L3', reason: 'promos mostradas' },
      reason: 'Quiere comprar + datosOk -> promos',
    }),
  },

  // capturing_data + quiero_comprar + datosOk -> ofrecer_promos
  {
    phase: 'capturing_data', on: 'quiero_comprar', action: 'ofrecer_promos',
    condition: (_, gates) => gates.datosOk,
    resolve: () => ({
      templateIntents: ['promociones'],
      timerSignal: { type: 'start', level: 'L3', reason: 'promos mostradas' },
      reason: 'Quiere comprar + datosOk -> promos',
    }),
  },

  // capturing_data + quiero_comprar + !datosOk -> pedir_datos
  {
    phase: 'capturing_data', on: 'quiero_comprar', action: 'pedir_datos',
    condition: (_, gates) => !gates.datosOk,
    resolve: (state) => ({
      templateIntents: ['pedir_datos'],
      extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
      enterCaptura: true,
      timerSignal: { type: 'start', level: 'L0', reason: 'captura re-iniciada' },
      reason: 'Quiere comprar, aun faltan datos',
    }),
  },

  // seleccion_pack + datosOk -> mostrar_confirmacion
  {
    phase: '*', on: 'seleccion_pack', action: 'mostrar_confirmacion',
    condition: (_, gates) => gates.datosOk,
    resolve: (state) => ({
      templateIntents: [getResumenIntent(state.pack!)],
      extraContext: buildResumenContext(state),
      timerSignal: { type: 'start', level: 'L4', reason: 'pack elegido, esperando confirmacion' },
      reason: `Pack=${state.pack} + datosOk -> resumen`,
    }),
  },

  // seleccion_pack + !datosOk -> pedir_datos
  {
    phase: '*', on: 'seleccion_pack', action: 'pedir_datos',
    condition: (_, gates) => !gates.datosOk,
    resolve: (state) => ({
      templateIntents: ['pedir_datos'],
      extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
      enterCaptura: true,
      timerSignal: { type: 'start', level: 'L0', reason: 'captura iniciada (tiene pack, faltan datos)' },
      reason: `Pack=${state.pack} pero faltan: ${camposFaltantes(state).join(', ')}`,
    }),
  },

  // confirmar + datosOk + packElegido -> crear_orden (R5)
  {
    phase: '*', on: 'confirmar', action: 'crear_orden',
    condition: (_, gates) => gates.datosOk && gates.packElegido,
    resolve: (state) => ({
      templateIntents: ['confirmacion_orden'],
      extraContext: buildResumenContext(state),
      timerSignal: { type: 'cancel', reason: 'orden creada' },
      reason: 'Confirmacion con datos completos + pack',
    }),
  },

  // confirmar + !packElegido -> ofrecer_promos
  {
    phase: '*', on: 'confirmar', action: 'ofrecer_promos',
    condition: (_, gates) => !gates.packElegido,
    resolve: () => ({
      templateIntents: ['promociones'],
      timerSignal: { type: 'start', level: 'L3', reason: 'confirmo sin pack -> promos' },
      reason: 'Confirmo pero no ha elegido pack',
    }),
  },

  // confirmar + !datosOk -> pedir_datos
  {
    phase: '*', on: 'confirmar', action: 'pedir_datos',
    condition: (_, gates) => !gates.datosOk,
    resolve: (state) => ({
      templateIntents: ['pedir_datos'],
      extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
      enterCaptura: true,
      reason: 'Confirmo pero faltan datos',
    }),
  },

  // ======== System Event transitions ========

  // Auto-trigger: datos completos, no pack -> ofrecer_promos
  {
    phase: 'capturing_data', on: 'auto:datos_completos', action: 'ofrecer_promos',
    condition: (_, gates) => !gates.packElegido,
    resolve: () => ({
      templateIntents: ['promociones'],
      timerSignal: { type: 'start', level: 'L3', reason: 'promos mostradas, esperando pack' },
      reason: 'Auto-trigger: datosOk -> ofrecer promos',
    }),
  },

  // Auto-trigger: datos completos + pack -> mostrar_confirmacion
  {
    phase: 'capturing_data', on: 'auto:datos_completos', action: 'mostrar_confirmacion',
    condition: (_, gates) => gates.packElegido,
    resolve: (state) => ({
      templateIntents: [getResumenIntent(state.pack!)],
      extraContext: buildResumenContext(state),
      timerSignal: { type: 'start', level: 'L4', reason: 'datos completos + pack -> confirmacion' },
      reason: 'Auto-trigger: datosOk + pack -> confirmacion',
    }),
  },

  // Auto-trigger: ciudad sin direccion -> ask_ofi_inter
  {
    phase: '*', on: 'auto:ciudad_sin_direccion', action: 'ask_ofi_inter',
    resolve: () => ({
      templateIntents: ['ask_ofi_inter'],
      reason: 'Ciudad sin direccion -> preguntar ofi inter',
    }),
  },

  // Timer expired L0 -> pedir_datos (retoma sin datos)
  {
    phase: 'capturing_data', on: 'timer_expired:0', action: 'pedir_datos',
    resolve: () => ({
      templateIntents: ['retoma_datos'],
      reason: 'Timer L0 expired -> retoma sin datos (proximo dato reactiva timer)',
    }),
  },
  // Timer expired L1 -> pedir_datos (retoma datos parciales)
  {
    phase: 'capturing_data', on: 'timer_expired:1', action: 'pedir_datos',
    resolve: (state) => {
      const missing = camposFaltantes(state)
      return {
        templateIntents: ['retoma_datos_parciales'],
        extraContext: { campos_faltantes: missing.join(', ') },
        reason: 'Timer L1 expired -> retoma datos parciales (proximo dato reactiva timer)',
      }
    },
  },
  // Timer expired L2 -> ofrecer_promos
  {
    phase: 'capturing_data', on: 'timer_expired:2', action: 'ofrecer_promos',
    resolve: () => ({
      templateIntents: ['promociones'],
      timerSignal: { type: 'start', level: 'L3', reason: 'timer L2 -> promos' },
      enterCaptura: false,
      reason: 'Timer L2 expired -> ofrecer promos',
    }),
  },

  // Timer expired L3 -> crear_orden
  {
    phase: 'promos_shown', on: 'timer_expired:3', action: 'crear_orden',
    resolve: (state) => ({
      templateIntents: ['confirmacion_orden'],
      extraContext: buildResumenContext(state),
      timerSignal: { type: 'cancel', reason: 'timer L3 -> orden' },
      reason: 'Timer L3 expired -> crear orden',
    }),
  },

  // Timer expired L4 -> crear_orden
  {
    phase: 'confirming', on: 'timer_expired:4', action: 'crear_orden',
    resolve: (state) => ({
      templateIntents: ['confirmacion_orden'],
      extraContext: buildResumenContext(state),
      timerSignal: { type: 'cancel', reason: 'timer L4 -> orden' },
      reason: 'Timer L4 expired -> crear orden',
    }),
  },

  // Timer expired L5 -> retoma inicial (silence in initial phase)
  {
    phase: 'initial', on: 'timer_expired:5', action: 'pedir_datos',
    resolve: () => ({
      templateIntents: ['retoma_inicial'],
      reason: 'Timer L5 expired en initial -> retoma inicial',
    }),
  },

  // ======== Retroceso (D7: cambio) ========
  {
    phase: 'confirming', on: 'seleccion_pack', action: 'cambio',
    resolve: (state) => ({
      templateIntents: [getResumenIntent(state.pack!)],
      extraContext: buildResumenContext(state),
      timerSignal: { type: 'start', level: 'L4', reason: 'cambio de pack en confirming' },
      reason: 'Cambio de pack en fase confirming',
    }),
  },

  {
    phase: 'confirming', on: 'datos', action: 'cambio',
    resolve: (state) => ({
      templateIntents: [getResumenIntent(state.pack!)],
      extraContext: buildResumenContext(state),
      timerSignal: { type: 'start', level: 'L4', reason: 'cambio de datos en confirming' },
      reason: 'Cambio de datos en fase confirming',
    }),
  },

  // ======== closed phase fallback (D8) ========
  {
    phase: 'closed', on: '*', action: 'silence',
    resolve: () => ({
      templateIntents: [],
      reason: 'Fase closed -> fallback (no action)',
    }),
  },
]

/**
 * Resolve a transition from the table.
 *
 * @param phase - Current derived phase
 * @param on - Intent name OR system event key (e.g., 'timer_expired:2')
 * @param state - Current agent state
 * @param gates - Computed gates
 * @returns TransitionOutput or null if no match (caller falls back to R9-style default)
 */
export function resolveTransition(
  phase: Phase,
  on: string,
  state: AgentState,
  gates: Gates,
): { action: TipoAccion; output: TransitionOutput } | null {
  for (const entry of TRANSITIONS) {
    // Phase match: specific phase or wildcard
    if (entry.phase !== '*' && entry.phase !== phase) continue

    // On match: specific on or wildcard
    if (entry.on !== '*' && entry.on !== on) continue

    // Condition check
    if (entry.condition && !entry.condition(state, gates)) continue

    return {
      action: entry.action,
      output: entry.resolve(state, gates),
    }
  }

  return null  // No match -> caller uses fallback (R9 equivalent)
}

/**
 * Convert a SystemEvent to the 'on' key used in the transition table.
 * E.g., { type: 'timer_expired', level: 2 } -> 'timer_expired:2'
 */
export function systemEventToKey(event: { type: string; [k: string]: unknown }): string {
  switch (event.type) {
    case 'timer_expired':
      return `timer_expired:${event.level}`
    case 'auto':
      return `auto:${event.result}`
    default:
      return event.type
  }
}
