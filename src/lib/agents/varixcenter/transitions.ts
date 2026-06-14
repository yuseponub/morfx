// Clonado en ESTRUCTURA de src/lib/agents/godentist-fb-ig/transitions.ts (Standalone agent-varixcenter Wave 2 Plan 04 Task 3).
// Los CONTENIDOS son las 42 transiciones del diseño §7 (fuente de verdad).
// Diferencias clave vs godentist-fb-ig:
//   - SIN intents/acciones de sucursal ni timer_expired:0 / retoma_inicial (no hay sucursales).
//   - datos + !datosCriticos -> pedir_datos_parcial (no silence) — transiciones 5 y 12.
//   - Info intents = las 12 INFORMATIONAL_INTENTS de flebología (sin urgencia/materiales/menores/garantia).
//   - sintomas_descripcion en initial -> silence + L2 (response track manda template no_diagnostico).
//   - Timers: initial datos -> L1 (no L0). Escape intents (37-41) los maneja guards.ts.
/**
 * Varixcenter Appointment Agent — Declarative Transition Table (diseño §7)
 *
 * Replaces waterfall logic. Each entry: (phase, on) -> action + timer signal.
 * Guards (escapes: asesor, reagendamiento, queja, cancelar_cita, paciente_antiguo + low conf)
 * run BEFORE this table (guards.ts).
 *
 * Lookup order: specific phase first, then '*' (any phase).
 * First match wins (array order matters for same phase+on with different conditions).
 */
import type { AgentState, Gates, Phase, TipoAccion, TimerSignal } from './types'

// ============================================================================
// State Changes
// ============================================================================

export interface StateChanges {
  newFields: string[]
  filled: number
  hasNewData: boolean
  datosCriticosJustCompleted: boolean
  /** fecha_preferida was just set this turn */
  fechaJustSet: boolean
}

// ============================================================================
// Transition Interfaces
// ============================================================================

export interface TransitionEntry {
  phase: Phase | '*'
  on: string   // intent name OR system event type (e.g., 'timer_expired:2')
  action: TipoAccion
  condition?: (state: AgentState, gates: Gates, changes?: StateChanges) => boolean
  resolve: (state: AgentState, gates: Gates) => TransitionOutput
  description?: string
}

export interface TransitionOutput {
  timerSignal?: TimerSignal
  reason: string
}

// Las 12 intents informacionales que en cada fase de captura responden con silence
// (el response track manda el template). saludo se maneja aparte; sintomas_descripcion
// tiene fila propia en initial.
const INFO_INTENTS_FBL = [
  'precio_tratamiento',
  'precio_valoracion',
  'info_tratamiento',
  'info_laser',
  'info_examen_doppler',
  'info_medias',
  'ubicacion',
  'horarios',
  'financiacion',
  'seguros_eps',
  'sintomas_descripcion',
] as const

/** Helper: genera filas info-intent -> silence con un timer dado para una fase. */
function infoSilenceRows(phase: Phase, level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | undefined, reasonCtx: string): TransitionEntry[] {
  return INFO_INTENTS_FBL.map((intent) => ({
    phase,
    on: intent,
    action: 'silence' as TipoAccion,
    resolve: () => ({
      timerSignal: level ? { type: 'start' as const, level, reason: `info ${reasonCtx}` } : undefined,
      reason: `Info pregunta (${intent}) ${reasonCtx}`,
    }),
  }))
}

// ============================================================================
// Transition Table (diseño §7 — 42 transiciones)
// ============================================================================

export const TRANSITIONS: TransitionEntry[] = [

  // ========================================================================
  // Desde `initial` (transiciones 1-11)
  // ========================================================================

  // 1: saludo -> silence (response track manda saludo+triage), sin timer
  {
    phase: 'initial', on: 'saludo', action: 'silence',
    resolve: () => ({ reason: 'Saludo en initial (response track manda saludo+triage)' }),
    description: '1: saludo -> silence',
  },

  // 2: quiero_agendar + !datosCriticos -> pedir_datos (L1)
  {
    phase: 'initial', on: 'quiero_agendar', action: 'pedir_datos',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L1', reason: 'captura iniciada por quiero_agendar' },
      reason: 'Quiere agendar, faltan datos criticos',
    }),
    description: '2: quiero_agendar + !datosCriticos -> pedir_datos',
  },

  // 3: quiero_agendar + datosCriticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'initial', on: 'quiero_agendar', action: 'pedir_fecha',
    condition: (_, gates) => gates.datosCriticos && !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'datos OK, pidiendo fecha' },
      reason: 'Quiere agendar + datos criticos, falta fecha',
    }),
    description: '3: quiero_agendar + datosCriticos + !fechaElegida -> pedir_fecha',
  },

  // 4: quiero_agendar + datosCriticos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'initial', on: 'quiero_agendar', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.datosCriticos && gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'datos + fecha OK, mostrando disponibilidad' },
      reason: 'Quiere agendar + datos + fecha -> mostrar horarios',
    }),
    description: '4: quiero_agendar + datosCriticos + fechaElegida -> mostrar_disponibilidad',
  },

  // 5: datos + !datosCriticos -> pedir_datos_parcial (L1)
  // Matiz §7*: si el cliente solo respondio el triage (ciudad+tipo_venas) y NO envio datos
  // personales nuevos, esto NO es pedir_datos_parcial — el response track manda el info
  // template y L2 invita a agendar. Se detecta cuando los newFields son solo triage.
  {
    phase: 'initial', on: 'datos', action: 'silence',
    condition: (_state, gates, changes) => {
      if (gates.datosCriticos) return false
      // Solo-triage: los unicos campos nuevos son ciudad/tipo_venas (sin datos personales).
      const nf = changes?.newFields ?? []
      const onlyTriage = nf.length > 0 && nf.every(f => f === 'ciudad' || f === 'tipo_venas')
      return onlyTriage
    },
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'solo triage tras saludo — invitar a agendar' },
      reason: 'Datos = solo triage (ciudad/tipo_venas) en initial -> info template + L2 invita (matiz §7*)',
    }),
    description: '5a: initial + datos solo-triage -> silence + L2 (matiz §7*)',
  },
  {
    phase: 'initial', on: 'datos', action: 'pedir_datos_parcial',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L1', reason: 'datos parciales en initial' },
      reason: 'Datos personales en initial, faltan criticos -> pedir lo faltante',
    }),
    description: '5: initial + datos + !datosCriticos -> pedir_datos_parcial + L1',
  },

  // 6: datos + datosCriticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'initial', on: 'datos', action: 'pedir_fecha',
    condition: (_, gates) => gates.datosCriticos && !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'datos criticos completos, pidiendo fecha' },
      reason: 'Datos en initial + criticos completos, falta fecha',
    }),
    description: '6: initial + datos + datosCriticos + !fechaElegida -> pedir_fecha',
  },

  // 7: datos + datosCriticos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'initial', on: 'datos', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.datosCriticos && gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'datos + fecha en initial, mostrando horarios' },
      reason: 'Datos en initial + criticos + fecha -> mostrar horarios',
    }),
    description: '7: initial + datos + datosCriticos + fechaElegida -> mostrar_disponibilidad',
  },

  // 8a: precio_tratamiento / info_tratamiento en initial -> silence, L2 CONDICIONAL.
  //     Con tipo_venas CONOCIDO el response-track envía info_<tipo> + COMP "¿Deseas agendar
  //     tu cita de valoración?" (CTA inline) → NO se arma L2 (evita el invitar_agendar
  //     redundante — petición usuario 2026-06-13 "si esta se envia ya no enviamos la L").
  //     Sin tipo → se envía precio_valoracion (pregunta "¿grandes o vasitos?") y SÍ se arma
  //     L2 para invitar luego. Va ANTES del infoSilenceRows genérico (first-match wins).
  ...(['precio_tratamiento', 'info_tratamiento'] as const).map((intent): TransitionEntry => ({
    phase: 'initial',
    on: intent,
    action: 'silence' as TipoAccion,
    resolve: (state): TransitionOutput => state.datos.tipo_venas
      ? { reason: `${intent} con tipo_venas conocido -> info_<tipo> + CTA inline, sin L2` }
      : {
          timerSignal: { type: 'start', level: 'L2', reason: `${intent} sin tipo -> precio_valoracion, invitar despues` },
          reason: `${intent} sin tipo_venas -> precio_valoracion + L2`,
        },
  })),

  // 8: info intents en initial -> silence + L2 (response track responde)
  ...infoSilenceRows('initial', 'L2', 'en initial, invitar despues'),

  // 9: sintomas_descripcion en initial: cubierto por infoSilenceRows (incluye sintomas_descripcion).
  //    El response track manda el template no_diagnostico.

  // 11: timer_expired:2 -> invitar_agendar (sin timer)
  {
    phase: 'initial', on: 'timer_expired:2', action: 'invitar_agendar',
    resolve: () => ({ reason: 'Timer L2 expired en initial -> invitar a agendar' }),
    description: '11: timer_expired:2 -> invitar_agendar',
  },

  // ========================================================================
  // Desde `capturing_data` (transiciones 12-19)
  // ========================================================================

  // 12: datos + !datosCriticos -> pedir_datos_parcial (L1)
  {
    phase: 'capturing_data', on: 'datos', action: 'pedir_datos_parcial',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L1', reason: 'datos parciales, faltan criticos' },
      reason: 'Datos en capturing_data, faltan criticos -> pedir lo faltante',
    }),
    description: '12: capturing_data + datos + !datosCriticos -> pedir_datos_parcial + L1',
  },

  // 13: datos + datosCriticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'capturing_data', on: 'datos', action: 'pedir_fecha',
    condition: (_, gates) => gates.datosCriticos && !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'criticos completos, pidiendo fecha' },
      reason: 'Datos en capturing_data + criticos, falta fecha',
    }),
    description: '13: capturing_data + datos + datosCriticos + !fechaElegida -> pedir_fecha',
  },

  // 14: datos + datosCriticos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'capturing_data', on: 'datos', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.datosCriticos && gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'datos + fecha completos, mostrando horarios' },
      reason: 'Datos en capturing_data + criticos + fecha -> mostrar horarios',
    }),
    description: '14: capturing_data + datos + datosCriticos + fechaElegida -> mostrar_disponibilidad',
  },

  // 15: auto:datos_criticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'capturing_data', on: 'auto:datos_criticos', action: 'pedir_fecha',
    condition: (_, gates) => !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'auto-trigger datos criticos, pidiendo fecha' },
      reason: 'Auto-trigger: datos criticos completos, falta fecha',
    }),
    description: '15: auto:datos_criticos + !fechaElegida -> pedir_fecha',
  },

  // 16: auto:datos_criticos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'capturing_data', on: 'auto:datos_criticos', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'auto-trigger datos + fecha, mostrando horarios' },
      reason: 'Auto-trigger: datos criticos + fecha -> mostrar horarios',
    }),
    description: '16: auto:datos_criticos + fechaElegida -> mostrar_disponibilidad',
  },

  // 17: info intents en capturing_data -> silence (reevaluate, restart L1)
  ...infoSilenceRows('capturing_data', 'L1', 'durante captura — restart L1'),
  {
    phase: 'capturing_data', on: 'saludo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L1', reason: 'info during capture — restart L1' },
      reason: 'Saludo durante captura',
    }),
  },

  // 18: acknowledgment en capturing_data -> silence (L6)
  {
    phase: 'capturing_data', on: 'acknowledgment', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L6', reason: 'ack en captura' },
      reason: 'Acknowledgment en capturing_data',
    }),
    description: '18: acknowledgment en capturing_data -> silence + L6',
  },

  // 19: timer_expired:1 -> retoma_datos (sin timer)
  {
    phase: 'capturing_data', on: 'timer_expired:1', action: 'retoma_datos',
    resolve: () => ({ reason: 'Timer L1 expired -> retoma datos' }),
    description: '19: timer_expired:1 -> retoma_datos',
  },

  // ========================================================================
  // Desde `capturing_fecha` (transiciones 20-24)
  // ========================================================================

  // 20: datos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'capturing_fecha', on: 'datos', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'fecha recibida, mostrando horarios' },
      reason: 'Datos con fecha en capturing_fecha -> mostrar horarios',
    }),
    description: '20: capturing_fecha + datos + fechaElegida -> mostrar_disponibilidad',
  },

  // 21: datos + !fechaElegida -> silence (reevaluate, restart L3)
  {
    phase: 'capturing_fecha', on: 'datos', action: 'silence',
    condition: (_, gates) => !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'datos sin fecha — restart L3' },
      reason: 'Datos en capturing_fecha pero sin fecha',
    }),
    description: '21: capturing_fecha + datos + !fechaElegida -> silence + reevaluate',
  },

  // 22: info intents en capturing_fecha -> silence (reevaluate, restart L3)
  ...infoSilenceRows('capturing_fecha', 'L3', 'durante captura fecha — restart L3'),
  {
    phase: 'capturing_fecha', on: 'saludo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'info during fecha capture — restart L3' },
      reason: 'Saludo durante captura fecha',
    }),
  },

  // 23: acknowledgment en capturing_fecha -> silence (L6)
  {
    phase: 'capturing_fecha', on: 'acknowledgment', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L6', reason: 'ack en captura fecha' },
      reason: 'Acknowledgment en capturing_fecha',
    }),
    description: '23: acknowledgment en capturing_fecha -> silence + L6',
  },

  // 24: timer_expired:3 -> retoma_fecha (sin timer)
  {
    phase: 'capturing_fecha', on: 'timer_expired:3', action: 'retoma_fecha',
    resolve: () => ({ reason: 'Timer L3 expired -> retoma fecha' }),
    description: '24: timer_expired:3 -> retoma_fecha',
  },

  // ========================================================================
  // Desde `showing_availability` (transiciones 25-28)
  // ========================================================================

  // 25: seleccion_horario -> mostrar_confirmacion (L5)
  {
    phase: 'showing_availability', on: 'seleccion_horario', action: 'mostrar_confirmacion',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'horario elegido, esperando confirmacion' },
      reason: 'Horario seleccionado -> mostrar confirmacion',
    }),
    description: '25: seleccion_horario -> mostrar_confirmacion + L5',
  },

  // 26: datos (nueva fecha) -> mostrar_disponibilidad (L4) — condition fechaJustSet
  {
    phase: 'showing_availability', on: 'datos', action: 'mostrar_disponibilidad',
    condition: (_state, _gates, changes) => !!changes?.fechaJustSet,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'nueva fecha, re-mostrando horarios' },
      reason: 'Nueva fecha en showing_availability -> re-mostrar horarios',
    }),
    description: '26: showing_availability + datos + fechaJustSet -> mostrar_disponibilidad',
  },

  // 27: info intents en showing_availability -> silence (reevaluate, restart L4)
  ...infoSilenceRows('showing_availability', 'L4', 'durante disponibilidad — restart L4'),
  {
    phase: 'showing_availability', on: 'saludo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'info during availability — restart L4' },
      reason: 'Saludo durante disponibilidad',
    }),
  },

  // 28: timer_expired:4 -> retoma_horario (sin timer)
  {
    phase: 'showing_availability', on: 'timer_expired:4', action: 'retoma_horario',
    resolve: () => ({ reason: 'Timer L4 expired -> retoma horario' }),
    description: '28: timer_expired:4 -> retoma_horario',
  },

  // ========================================================================
  // Desde `confirming` (transiciones 29-33)
  // ========================================================================

  // 29: confirmar + datosCompletos -> agendar_cita (cancel timer)
  {
    phase: 'confirming', on: 'confirmar', action: 'agendar_cita',
    condition: (_, gates) => gates.datosCompletos,
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'cita agendada' },
      reason: 'Confirmacion con datos completos -> agendar cita',
    }),
    description: '29: confirming + confirmar + datosCompletos -> agendar_cita',
  },

  // 30: rechazar -> no_interesa (cancel timer)
  // CRITICO: aparece ANTES del wildcard * + rechazar (42). En confirming, rechazar = no interesa
  // (diseño §7 transicion 30; difiere de godentist donde rechazar=corregir datos).
  {
    phase: 'confirming', on: 'rechazar', action: 'no_interesa',
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'rechazo en confirming -> no interesa' },
      reason: 'Rechazar en confirming -> no interesa (diseño §7 #30)',
    }),
    description: '30: confirming + rechazar -> no_interesa',
  },

  // 31: datos (correccion) -> mostrar_confirmacion (L5)
  {
    phase: 'confirming', on: 'datos', action: 'mostrar_confirmacion',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'datos actualizados en confirming' },
      reason: 'Datos en confirming -> re-mostrar confirmacion',
    }),
    description: '31: confirming + datos -> mostrar_confirmacion + L5',
  },

  // 32: info intents en confirming -> silence (reevaluate, restart L5)
  ...infoSilenceRows('confirming', 'L5', 'durante confirmacion — restart L5'),
  {
    phase: 'confirming', on: 'saludo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'info during confirming — restart L5' },
      reason: 'Saludo durante confirmacion',
    }),
  },

  // 33: timer_expired:5 -> retoma_confirmacion (sin timer)
  {
    phase: 'confirming', on: 'timer_expired:5', action: 'retoma_confirmacion',
    resolve: () => ({ reason: 'Timer L5 expired -> retoma confirmacion' }),
    description: '33: timer_expired:5 -> retoma_confirmacion',
  },

  // ========================================================================
  // Desde `appointment_registered` (transiciones 34-36)
  // 34 (reagendamiento/cancelar_cita -> handoff) lo maneja guards.ts (escape).
  // ========================================================================

  // 35: info intents post-cita -> silence (sin timer, responde normal)
  ...infoSilenceRows('appointment_registered', undefined, 'post-cita'),
  {
    phase: 'appointment_registered', on: 'saludo', action: 'silence',
    resolve: () => ({ reason: 'Saludo post-cita' }),
  },

  // 36: * post-cita -> silence (catch-all)
  {
    phase: 'appointment_registered', on: '*', action: 'silence',
    resolve: () => ({ reason: 'Catch-all en appointment_registered -> silence' }),
    description: '36: appointment_registered + * -> silence',
  },

  // ========================================================================
  // Escape cualquier fase (transiciones 37-42)
  // 37-41 (asesor/queja/reagendamiento/cancelar_cita/paciente_antiguo -> handoff) los maneja guards.ts.
  // ========================================================================

  // 42: * + rechazar -> no_interesa (cancel timer)
  // IMPORTANTE: viene DESPUES del confirming-specific rechazar (30).
  {
    phase: '*', on: 'rechazar', action: 'no_interesa',
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'rechazo -> no interesa' },
      reason: 'Rechazar fuera de confirming -> no interesa (diseño §7 #42)',
    }),
    description: '42: * + rechazar -> no_interesa (wildcard, despues del confirming-specific)',
  },

  // ========================================================================
  // Fallback de intent `otro` (WR-02 — patrón godentist) — handoff
  // ========================================================================
  // Transición 10 del diseño §7 (`initial + otro conf<80 -> handoff`) la maneja
  // guards.ts R0. PERO `otro` con conf>=80 (mensaje claramente no reconocido) NO
  // lo intercepta el guard y ninguna fila específica matchea -> resolveTransition
  // retornaba null -> sales-track sin acción -> response-track sin template
  // (`otro` no está en INFORMATIONAL_INTENTS) -> natural_silence (cliente sin
  // respuesta). Esta fila catch-all garantiza que `otro` SIEMPRE produzca una
  // acción visible: handoff a humano. Va DESPUÉS del catch-all phase-específico
  // de `appointment_registered` (* -> silence), que gana para esa fase.
  {
    phase: '*', on: 'otro', action: 'handoff',
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'intent otro sin match' },
      reason: 'Intent otro sin transicion especifica -> handoff (WR-02)',
    }),
    description: '10-fallback: * + otro -> handoff (cualquier confianza sin match de guard)',
  },

  // ========================================================================
  // Desde `closed` — catch-all
  // ========================================================================
  {
    phase: 'closed', on: '*', action: 'silence',
    resolve: () => ({ reason: 'Fase closed -> silence (no action)' }),
    description: 'closed + * -> silence',
  },
]

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Resolve a transition from the table.
 *
 * @param phase - Current derived phase
 * @param on - Intent name OR system event key (e.g., 'timer_expired:2')
 * @param state - Current agent state
 * @param gates - Computed gates
 * @param changes - State changes from current turn
 * @returns TransitionOutput or null if no match (caller falls back to default)
 */
export function resolveTransition(
  phase: Phase,
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
