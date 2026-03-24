/**
 * GoDentist Appointment Agent — Declarative Transition Table
 *
 * Replaces waterfall logic. Each entry: (phase, on) -> action + timer signal.
 * Guards (escapes: asesor, reagendamiento, queja, cancelar_cita) run BEFORE this table.
 *
 * Lookup order: specific phase first, then '*' (any phase).
 * First match wins (array order matters for same phase+on with different conditions).
 *
 * 51 rules from design doc section 7:
 * - Rules 20, 46, 47, 50-53 handled by guards.ts (escape intents + low confidence)
 * - Remaining ~44 entries encoded here
 * - Rule 42 (confirming + rechazar) MUST appear BEFORE wildcard (* + rechazar)
 */
import type { AgentState, Gates, Phase, TipoAccion, TimerSignal } from './types'

// ============================================================================
// State Changes (minimal — GoDentist has no ofi-inter complexity)
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

// ============================================================================
// Transition Table (design doc section 7)
// ============================================================================

export const TRANSITIONS: TransitionEntry[] = [

  // ========================================================================
  // From `initial` (rules 1-19, 21)
  // ========================================================================

  // Rule 1: saludo -> silence (no timer)
  {
    phase: 'initial', on: 'saludo', action: 'silence',
    resolve: () => ({
      reason: 'Saludo en initial',
    }),
    description: 'Rule 1: saludo -> silence',
  },

  // Rule 2: quiero_agendar + !datosCriticos -> pedir_datos (L0 = 8min, no data yet)
  {
    phase: 'initial', on: 'quiero_agendar', action: 'pedir_datos',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L0', reason: 'captura iniciada por quiero_agendar' },
      reason: 'Quiere agendar, faltan datos criticos',
    }),
    description: 'Rule 2: quiero_agendar + !datosCriticos -> pedir_datos',
  },

  // Rule 3: quiero_agendar + datosCriticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'initial', on: 'quiero_agendar', action: 'pedir_fecha',
    condition: (_, gates) => gates.datosCriticos && !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'datos OK, pidiendo fecha' },
      reason: 'Quiere agendar + datos criticos, falta fecha',
    }),
    description: 'Rule 3: quiero_agendar + datosCriticos + !fechaElegida -> pedir_fecha',
  },

  // Rule 4: quiero_agendar + datosCriticos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'initial', on: 'quiero_agendar', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.datosCriticos && gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'datos + fecha OK, mostrando disponibilidad' },
      reason: 'Quiere agendar + datos + fecha -> mostrar horarios',
    }),
    description: 'Rule 4: quiero_agendar + datosCriticos + fechaElegida -> mostrar_disponibilidad',
  },

  // Rule 5: datos + !datosCriticos -> pedir_datos_parcial (L1)
  {
    phase: 'initial', on: 'datos', action: 'pedir_datos_parcial',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L1', reason: 'datos parciales en initial' },
      reason: 'Datos espontaneos en initial, faltan criticos',
    }),
    description: 'Rule 5: initial + datos + !datosCriticos -> pedir_datos_parcial',
  },

  // Rule 6: datos + datosCriticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'initial', on: 'datos', action: 'pedir_fecha',
    condition: (_, gates) => gates.datosCriticos && !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'datos criticos completos, pidiendo fecha' },
      reason: 'Datos en initial + criticos completos, falta fecha',
    }),
    description: 'Rule 6: initial + datos + datosCriticos + !fechaElegida -> pedir_fecha',
  },

  // Rule 7: datos + datosCriticos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'initial', on: 'datos', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.datosCriticos && gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'datos + fecha en initial, mostrando horarios' },
      reason: 'Datos en initial + criticos + fecha -> mostrar horarios',
    }),
    description: 'Rule 7: initial + datos + datosCriticos + fechaElegida -> mostrar_disponibilidad',
  },

  // Rule 8: seleccion_sede + !datosCriticos -> pedir_datos_parcial (L1)
  {
    phase: 'initial', on: 'seleccion_sede', action: 'pedir_datos_parcial',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L1', reason: 'sede elegida, faltan datos' },
      reason: 'Sede elegida en initial, faltan datos criticos',
    }),
    description: 'Rule 8: initial + seleccion_sede + !datosCriticos -> pedir_datos_parcial',
  },

  // Rule 9: seleccion_sede + datosCriticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'initial', on: 'seleccion_sede', action: 'pedir_fecha',
    condition: (_, gates) => gates.datosCriticos && !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'sede + datos OK, pidiendo fecha' },
      reason: 'Sede en initial + datos criticos, falta fecha',
    }),
    description: 'Rule 9: initial + seleccion_sede + datosCriticos + !fechaElegida -> pedir_fecha',
  },

  // Rules 10-19: Info intents in initial -> silence (L2, except urgencia no timer)
  {
    phase: 'initial', on: 'precio_servicio', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'info pregunta, invitar despues' },
      reason: 'Pregunta precio en initial',
    }),
    description: 'Rule 10: precio_servicio -> silence + L2',
  },
  {
    phase: 'initial', on: 'valoracion_costo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'info pregunta, invitar despues' },
      reason: 'Pregunta valoracion costo en initial',
    }),
    description: 'Rule 11: valoracion_costo -> silence + L2',
  },
  {
    phase: 'initial', on: 'financiacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'info pregunta, invitar despues' },
      reason: 'Pregunta financiacion en initial',
    }),
    description: 'Rule 12: financiacion -> silence + L2',
  },
  {
    phase: 'initial', on: 'ubicacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'info pregunta, invitar despues' },
      reason: 'Pregunta ubicacion en initial',
    }),
    description: 'Rule 13: ubicacion -> silence + L2',
  },
  {
    phase: 'initial', on: 'horarios', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'info pregunta, invitar despues' },
      reason: 'Pregunta horarios en initial',
    }),
    description: 'Rule 14: horarios -> silence + L2',
  },
  {
    phase: 'initial', on: 'urgencia', action: 'silence',
    resolve: () => ({
      reason: 'Urgencia en initial (no timer)',
    }),
    description: 'Rule 15: urgencia -> silence (no timer)',
  },
  {
    phase: 'initial', on: 'materiales', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'info pregunta, invitar despues' },
      reason: 'Pregunta materiales en initial',
    }),
    description: 'Rule 16: materiales -> silence + L2',
  },
  {
    phase: 'initial', on: 'menores', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'info pregunta, invitar despues' },
      reason: 'Pregunta menores en initial',
    }),
    description: 'Rule 17: menores -> silence + L2',
  },
  {
    phase: 'initial', on: 'seguros_eps', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'info pregunta, invitar despues' },
      reason: 'Pregunta seguros/EPS en initial',
    }),
    description: 'Rule 18: seguros_eps -> silence + L2',
  },
  {
    phase: 'initial', on: 'garantia', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L2', reason: 'info pregunta, invitar despues' },
      reason: 'Pregunta garantia en initial',
    }),
    description: 'Rule 19: garantia -> silence + L2',
  },

  // Rule 21: timer_expired:2 -> invitar_agendar (no further timer)
  {
    phase: 'initial', on: 'timer_expired:2', action: 'invitar_agendar',
    resolve: () => ({
      reason: 'Timer L2 expired en initial -> invitar a agendar',
    }),
    description: 'Rule 21: timer_expired:2 -> invitar_agendar',
  },

  // ========================================================================
  // From `capturing_data` (rules 22-31)
  // ========================================================================

  // Rule 22: datos + !datosCriticos -> pedir_datos_parcial (L1)
  {
    phase: 'capturing_data', on: 'datos', action: 'pedir_datos_parcial',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L1', reason: 'datos parciales, faltan criticos' },
      reason: 'Datos en capturing_data, faltan criticos',
    }),
    description: 'Rule 22: capturing_data + datos + !datosCriticos -> pedir_datos_parcial',
  },

  // Rule 23: datos + datosCriticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'capturing_data', on: 'datos', action: 'pedir_fecha',
    condition: (_, gates) => gates.datosCriticos && !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'criticos completos, pidiendo fecha' },
      reason: 'Datos en capturing_data + criticos, falta fecha',
    }),
    description: 'Rule 23: capturing_data + datos + datosCriticos + !fechaElegida -> pedir_fecha',
  },

  // Rule 24: datos + datosCriticos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'capturing_data', on: 'datos', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.datosCriticos && gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'datos + fecha completos, mostrando horarios' },
      reason: 'Datos en capturing_data + criticos + fecha -> mostrar horarios',
    }),
    description: 'Rule 24: capturing_data + datos + datosCriticos + fechaElegida -> mostrar_disponibilidad',
  },

  // Rule 25: seleccion_sede + !datosCriticos -> pedir_datos_parcial (L1)
  {
    phase: 'capturing_data', on: 'seleccion_sede', action: 'pedir_datos_parcial',
    condition: (_, gates) => !gates.datosCriticos,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L1', reason: 'sede elegida, faltan datos' },
      reason: 'Sede en capturing_data, faltan criticos',
    }),
    description: 'Rule 25: capturing_data + seleccion_sede + !datosCriticos -> pedir_datos_parcial',
  },

  // Rule 26: seleccion_sede + datosCriticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'capturing_data', on: 'seleccion_sede', action: 'pedir_fecha',
    condition: (_, gates) => gates.datosCriticos && !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'sede + datos OK, pidiendo fecha' },
      reason: 'Sede en capturing_data + criticos, falta fecha',
    }),
    description: 'Rule 26: capturing_data + seleccion_sede + datosCriticos + !fechaElegida -> pedir_fecha',
  },

  // Rule 27: auto:datos_criticos + !fechaElegida -> pedir_fecha (L3)
  {
    phase: 'capturing_data', on: 'auto:datos_criticos', action: 'pedir_fecha',
    condition: (_, gates) => !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L3', reason: 'auto-trigger datos criticos, pidiendo fecha' },
      reason: 'Auto-trigger: datos criticos completos, falta fecha',
    }),
    description: 'Rule 27: auto:datos_criticos + !fechaElegida -> pedir_fecha',
  },

  // Rule 28: auto:datos_criticos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'capturing_data', on: 'auto:datos_criticos', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'auto-trigger datos + fecha, mostrando horarios' },
      reason: 'Auto-trigger: datos criticos + fecha -> mostrar horarios',
    }),
    description: 'Rule 28: auto:datos_criticos + fechaElegida -> mostrar_disponibilidad',
  },

  // Rule 29: info intents in capturing_data -> silence (reevaluate timer)
  {
    phase: 'capturing_data', on: 'precio_servicio', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Info pregunta durante captura',
    }),
    description: 'Rule 29: info intent in capturing_data -> silence + reevaluate',
  },
  {
    phase: 'capturing_data', on: 'valoracion_costo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Info pregunta durante captura',
    }),
  },
  {
    phase: 'capturing_data', on: 'financiacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Info pregunta durante captura',
    }),
  },
  {
    phase: 'capturing_data', on: 'ubicacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Info pregunta durante captura',
    }),
  },
  {
    phase: 'capturing_data', on: 'horarios', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Info pregunta durante captura',
    }),
  },
  {
    phase: 'capturing_data', on: 'urgencia', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Urgencia durante captura',
    }),
  },
  {
    phase: 'capturing_data', on: 'materiales', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Info pregunta durante captura',
    }),
  },
  {
    phase: 'capturing_data', on: 'menores', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Info pregunta durante captura',
    }),
  },
  {
    phase: 'capturing_data', on: 'seguros_eps', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Info pregunta durante captura',
    }),
  },
  {
    phase: 'capturing_data', on: 'garantia', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Info pregunta durante captura',
    }),
  },
  {
    phase: 'capturing_data', on: 'saludo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during capture' },
      reason: 'Saludo durante captura',
    }),
  },

  // Rule 30: acknowledgment in capturing_data -> silence (L6)
  {
    phase: 'capturing_data', on: 'acknowledgment', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L6', reason: 'ack en captura' },
      reason: 'Acknowledgment en capturing_data',
    }),
    description: 'Rule 30: acknowledgment in capturing_data -> silence + L6',
  },

  // Rule 31a: timer_expired:0 -> retoma_inicial (L0 = 8min, no data received yet)
  {
    phase: 'capturing_data', on: 'timer_expired:0', action: 'retoma_inicial',
    resolve: () => ({
      reason: 'Timer L0 expired -> retoma inicial (sin datos recibidos)',
    }),
    description: 'Rule 31a: timer_expired:0 -> retoma_inicial',
  },

  // Rule 31b: timer_expired:1 -> retoma_datos (L1 = 3min, partial data)
  {
    phase: 'capturing_data', on: 'timer_expired:1', action: 'retoma_datos',
    resolve: () => ({
      reason: 'Timer L1 expired -> retoma datos (datos parciales)',
    }),
    description: 'Rule 31b: timer_expired:1 -> retoma_datos',
  },

  // ========================================================================
  // From `capturing_fecha` (rules 32-36)
  // ========================================================================

  // Rule 32: datos + fechaElegida -> mostrar_disponibilidad (L4)
  {
    phase: 'capturing_fecha', on: 'datos', action: 'mostrar_disponibilidad',
    condition: (_, gates) => gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'fecha recibida, mostrando horarios' },
      reason: 'Datos con fecha en capturing_fecha -> mostrar horarios',
    }),
    description: 'Rule 32: capturing_fecha + datos + fechaElegida -> mostrar_disponibilidad',
  },

  // Rule 33: datos + !fechaElegida -> silence (reevaluate)
  {
    phase: 'capturing_fecha', on: 'datos', action: 'silence',
    condition: (_, gates) => !gates.fechaElegida,
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'datos sin fecha en capturing_fecha' },
      reason: 'Datos en capturing_fecha pero sin fecha',
    }),
    description: 'Rule 33: capturing_fecha + datos + !fechaElegida -> silence + reevaluate',
  },

  // Rule 34: info intents in capturing_fecha -> silence (reevaluate)
  {
    phase: 'capturing_fecha', on: 'precio_servicio', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Info pregunta durante captura fecha',
    }),
    description: 'Rule 34: info intent in capturing_fecha -> silence + reevaluate',
  },
  {
    phase: 'capturing_fecha', on: 'valoracion_costo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Info pregunta durante captura fecha',
    }),
  },
  {
    phase: 'capturing_fecha', on: 'financiacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Info pregunta durante captura fecha',
    }),
  },
  {
    phase: 'capturing_fecha', on: 'ubicacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Info pregunta durante captura fecha',
    }),
  },
  {
    phase: 'capturing_fecha', on: 'horarios', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Info pregunta durante captura fecha',
    }),
  },
  {
    phase: 'capturing_fecha', on: 'urgencia', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Urgencia durante captura fecha',
    }),
  },
  {
    phase: 'capturing_fecha', on: 'materiales', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Info pregunta durante captura fecha',
    }),
  },
  {
    phase: 'capturing_fecha', on: 'menores', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Info pregunta durante captura fecha',
    }),
  },
  {
    phase: 'capturing_fecha', on: 'seguros_eps', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Info pregunta durante captura fecha',
    }),
  },
  {
    phase: 'capturing_fecha', on: 'garantia', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Info pregunta durante captura fecha',
    }),
  },
  {
    phase: 'capturing_fecha', on: 'saludo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during fecha capture' },
      reason: 'Saludo durante captura fecha',
    }),
  },

  // Rule 35: acknowledgment in capturing_fecha -> silence (L6)
  {
    phase: 'capturing_fecha', on: 'acknowledgment', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L6', reason: 'ack en captura fecha' },
      reason: 'Acknowledgment en capturing_fecha',
    }),
    description: 'Rule 35: acknowledgment in capturing_fecha -> silence + L6',
  },

  // Rule 36: timer_expired:3 -> retoma_fecha (no further timer)
  {
    phase: 'capturing_fecha', on: 'timer_expired:3', action: 'retoma_fecha',
    resolve: () => ({
      reason: 'Timer L3 expired -> retoma fecha',
    }),
    description: 'Rule 36: timer_expired:3 -> retoma_fecha',
  },

  // ========================================================================
  // From `showing_availability` (rules 37-40)
  // ========================================================================

  // Rule 37: seleccion_horario -> mostrar_confirmacion (L5)
  {
    phase: 'showing_availability', on: 'seleccion_horario', action: 'mostrar_confirmacion',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'horario elegido, esperando confirmacion' },
      reason: 'Horario seleccionado -> mostrar confirmacion',
    }),
    description: 'Rule 37: seleccion_horario -> mostrar_confirmacion + L5',
  },

  // Rule 38: datos (nueva fecha) -> mostrar_disponibilidad (L4) — condition: fechaJustSet
  {
    phase: 'showing_availability', on: 'datos', action: 'mostrar_disponibilidad',
    condition: (_state, _gates, changes) => !!changes?.fechaJustSet,
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L4', reason: 'nueva fecha, re-mostrando horarios' },
      reason: 'Nueva fecha en showing_availability -> re-mostrar horarios',
    }),
    description: 'Rule 38: showing_availability + datos + fechaJustSet -> mostrar_disponibilidad',
  },

  // Rule 39: info intents in showing_availability -> silence (reevaluate)
  {
    phase: 'showing_availability', on: 'precio_servicio', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Info pregunta durante disponibilidad',
    }),
    description: 'Rule 39: info intent in showing_availability -> silence + reevaluate',
  },
  {
    phase: 'showing_availability', on: 'valoracion_costo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Info pregunta durante disponibilidad',
    }),
  },
  {
    phase: 'showing_availability', on: 'financiacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Info pregunta durante disponibilidad',
    }),
  },
  {
    phase: 'showing_availability', on: 'ubicacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Info pregunta durante disponibilidad',
    }),
  },
  {
    phase: 'showing_availability', on: 'horarios', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Info pregunta durante disponibilidad',
    }),
  },
  {
    phase: 'showing_availability', on: 'urgencia', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Urgencia durante disponibilidad',
    }),
  },
  {
    phase: 'showing_availability', on: 'materiales', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Info pregunta durante disponibilidad',
    }),
  },
  {
    phase: 'showing_availability', on: 'menores', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Info pregunta durante disponibilidad',
    }),
  },
  {
    phase: 'showing_availability', on: 'seguros_eps', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Info pregunta durante disponibilidad',
    }),
  },
  {
    phase: 'showing_availability', on: 'garantia', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Info pregunta durante disponibilidad',
    }),
  },
  {
    phase: 'showing_availability', on: 'saludo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during availability' },
      reason: 'Saludo durante disponibilidad',
    }),
  },

  // Rule 40: timer_expired:4 -> retoma_horario (no further timer)
  {
    phase: 'showing_availability', on: 'timer_expired:4', action: 'retoma_horario',
    resolve: () => ({
      reason: 'Timer L4 expired -> retoma horario',
    }),
    description: 'Rule 40: timer_expired:4 -> retoma_horario',
  },

  // ========================================================================
  // From `confirming` (rules 41-45)
  // ========================================================================

  // Rule 41: confirmar + datosCompletos -> agendar_cita (cancel timer)
  {
    phase: 'confirming', on: 'confirmar', action: 'agendar_cita',
    condition: (_, gates) => gates.datosCompletos,
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'cita agendada' },
      reason: 'Confirmacion con datos completos -> agendar cita',
    }),
    description: 'Rule 41: confirming + confirmar + datosCompletos -> agendar_cita',
  },

  // Rule 42: confirming + rechazar -> pedir_datos (L1)
  // CRITICAL: This MUST appear BEFORE the wildcard * + rechazar (rule 54).
  // In confirming, rechazar means "wants to correct data", not "cancel scheduling".
  {
    phase: 'confirming', on: 'rechazar', action: 'pedir_datos',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L1', reason: 'rechazar en confirming -> corregir datos' },
      reason: 'Rechazar en confirming -> quiere corregir datos, volver a captura',
    }),
    description: 'Rule 42: confirming + rechazar -> pedir_datos (dual semantics: correct data)',
  },

  // Rule 43: datos in confirming -> mostrar_confirmacion (L5)
  {
    phase: 'confirming', on: 'datos', action: 'mostrar_confirmacion',
    resolve: () => ({
      timerSignal: { type: 'start', level: 'L5', reason: 'datos actualizados en confirming' },
      reason: 'Datos en confirming -> re-mostrar confirmacion',
    }),
    description: 'Rule 43: confirming + datos -> mostrar_confirmacion + L5',
  },

  // Rule 44: info intents in confirming -> silence (reevaluate)
  {
    phase: 'confirming', on: 'precio_servicio', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Info pregunta durante confirmacion',
    }),
    description: 'Rule 44: info intent in confirming -> silence + reevaluate',
  },
  {
    phase: 'confirming', on: 'valoracion_costo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Info pregunta durante confirmacion',
    }),
  },
  {
    phase: 'confirming', on: 'financiacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Info pregunta durante confirmacion',
    }),
  },
  {
    phase: 'confirming', on: 'ubicacion', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Info pregunta durante confirmacion',
    }),
  },
  {
    phase: 'confirming', on: 'horarios', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Info pregunta durante confirmacion',
    }),
  },
  {
    phase: 'confirming', on: 'urgencia', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Urgencia durante confirmacion',
    }),
  },
  {
    phase: 'confirming', on: 'materiales', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Info pregunta durante confirmacion',
    }),
  },
  {
    phase: 'confirming', on: 'menores', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Info pregunta durante confirmacion',
    }),
  },
  {
    phase: 'confirming', on: 'seguros_eps', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Info pregunta durante confirmacion',
    }),
  },
  {
    phase: 'confirming', on: 'garantia', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Info pregunta durante confirmacion',
    }),
  },
  {
    phase: 'confirming', on: 'saludo', action: 'silence',
    resolve: () => ({
      timerSignal: { type: 'reevaluate', reason: 'info during confirming' },
      reason: 'Saludo durante confirmacion',
    }),
  },

  // Rule 45: timer_expired:5 -> retoma_confirmacion (no further timer)
  {
    phase: 'confirming', on: 'timer_expired:5', action: 'retoma_confirmacion',
    resolve: () => ({
      reason: 'Timer L5 expired -> retoma confirmacion',
    }),
    description: 'Rule 45: timer_expired:5 -> retoma_confirmacion',
  },

  // ========================================================================
  // From `appointment_registered` (rules 48-49)
  // Rules 46-47 (reagendamiento, cancelar_cita) handled by guards
  // ========================================================================

  // Rule 48: info intents in appointment_registered -> silence (no timer)
  {
    phase: 'appointment_registered', on: 'precio_servicio', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'valoracion_costo', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'financiacion', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'ubicacion', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'horarios', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'urgencia', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'materiales', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'menores', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'seguros_eps', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'garantia', action: 'silence',
    resolve: () => ({
      reason: 'Info pregunta post-cita',
    }),
  },
  {
    phase: 'appointment_registered', on: 'saludo', action: 'silence',
    resolve: () => ({
      reason: 'Saludo post-cita',
    }),
  },

  // Rule 49: * -> silence in appointment_registered (catch-all)
  {
    phase: 'appointment_registered', on: '*', action: 'silence',
    resolve: () => ({
      reason: 'Catch-all en appointment_registered -> silence',
    }),
    description: 'Rule 49: appointment_registered + * -> silence',
  },

  // ========================================================================
  // ANY-phase transitions (rules 54 — rechazar wildcard + no_interesa)
  // Rules 50-53 (asesor, queja, reagendamiento, cancelar_cita) handled by guards
  // ========================================================================

  // Rule 54: * + rechazar -> no_interesa (cancel timer)
  // IMPORTANT: This MUST come AFTER the confirming-specific rechazar (rule 42).
  // In any phase other than confirming, rechazar means "cancel scheduling".
  {
    phase: '*', on: 'rechazar', action: 'no_interesa',
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'rechazo -> no interesa' },
      reason: 'Rechazar fuera de confirming -> no interesa',
    }),
    description: 'Rule 54: * + rechazar -> no_interesa (wildcard, after confirming-specific)',
  },

  // no_interesa intent -> no_interesa action (cancel timer)
  {
    phase: '*', on: 'no_interesa', action: 'no_interesa',
    resolve: () => ({
      timerSignal: { type: 'cancel', reason: 'no interesa' },
      reason: 'Cliente no interesado',
    }),
    description: 'no_interesa -> no_interesa + cancel',
  },

  // ========================================================================
  // From `closed` — catch-all
  // ========================================================================

  {
    phase: 'closed', on: '*', action: 'silence',
    resolve: () => ({
      reason: 'Fase closed -> silence (no action)',
    }),
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
