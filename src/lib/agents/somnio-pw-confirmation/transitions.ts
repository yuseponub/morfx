/**
 * Somnio PW-Confirmation — Declarative Transition Table
 *
 * State machine PURE (D-25): tabla declarativa de transiciones que mapea
 * (phase + intent + state condition) → TipoAccion + reason.
 *
 * Implementa las decisiones lockeadas del CONTEXT.md:
 *   - D-09 → D-26 (reinterpretado): el guard del "si" es el state, NO messages.template_name.
 *   - D-10: confirmacion → confirmar_compra (mover a CONFIRMADO).
 *   - D-11: 1er "no" → cancelar_con_agendar_pregunta; 2do "no" → cancelar_definitivo (handoff).
 *   - D-12: cambiar_direccion → actualizar_direccion (NO template, crm-writer en Plan 10).
 *   - D-13 V1: editar_items → handoff (escala humano, deferred a V1.1 per agent-scope.md).
 *   - D-14: esperar → mover_a_falta_confirmar.
 *
 * Resolver: itera TRANSITIONS, primer match (phase + intent + condicion opcional) gana.
 * Si nada matchea, retorna noop con reason='no_matching_transition' (safety fallback).
 *
 * Las informacionales (saludo, precio, etc.) NO emiten action — retornan noop;
 * response-track Plan 07 maneja el reply directamente desde INFORMATIONAL_INTENTS.
 *
 * Fork del patron somnio-recompra/transitions.ts (~15 entries, simpler que sales-v3).
 */

import { INITIAL_AWAITING_STATES, INFORMATIONAL_INTENTS } from './constants'
import type { TipoAccion } from './types'
import { shippingComplete, type AgentState } from './state'

// ============================================================================
// Types
// ============================================================================

export interface TransitionWhen {
  /** Phase actual del state. '*' o omitido = cualquiera. */
  phase?: string | readonly string[] | '*'
  /** Intent del cliente. */
  intent: string
  /** Condicion adicional sobre el state (e.g. shippingComplete, cancelacion_intent_count). */
  condition?: (state: AgentState) => boolean
}

export interface TransitionThen {
  accion: TipoAccion
  reason: string
}

export interface TransitionEntry {
  when: TransitionWhen
  then: TransitionThen
}

export interface ResolveTransitionInput {
  phase: string
  intent: string
  state: AgentState
  /** Last template intent emitido (informativo, NO usado como guard — D-26). */
  lastTemplate?: string | null
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * ¿Phase actual esta en INITIAL_AWAITING_STATES (D-26 guard del "si")?
 */
export function isInitialAwaiting(phase: string): boolean {
  return (INITIAL_AWAITING_STATES as readonly string[]).includes(phase)
}

/**
 * ¿Phase matchea el `when.phase` constraint?
 */
function phaseMatches(when: TransitionWhen, phase: string): boolean {
  const p = when.phase
  if (p === undefined || p === '*') return true
  if (Array.isArray(p)) return p.includes(phase)
  return p === phase
}

// ============================================================================
// Declarative Transition Table (~15 entries)
// ============================================================================

export const TRANSITIONS: TransitionEntry[] = [
  // ==========================================================================
  // D-09→D-26 + D-10: confirmacion del cliente (el "si")
  // Entry #1: phase IN INITIAL_AWAITING_STATES + intent=confirmar_pedido
  //   - Si shipping completo → confirmar_compra (mover a CONFIRMADO).
  //   - Si shipping incompleto → pedir_datos_envio (D-12 captura).
  // ==========================================================================
  {
    when: {
      phase: INITIAL_AWAITING_STATES,
      intent: 'confirmar_pedido',
      condition: (state) => shippingComplete(state).complete,
    },
    then: {
      accion: 'confirmar_compra',
      reason: 'confirmation_with_complete_shipping', // D-09→D-26 + D-10
    },
  },
  {
    when: {
      phase: INITIAL_AWAITING_STATES,
      intent: 'confirmar_pedido',
      condition: (state) => !shippingComplete(state).complete,
    },
    then: {
      accion: 'pedir_datos_envio',
      reason: 'confirmation_blocked_missing_shipping', // D-12 + D-26
    },
  },

  // ==========================================================================
  // D-12 alt path: tras pedir confirmacion direccion, el cliente confirma
  // ==========================================================================
  {
    when: {
      phase: 'awaiting_address_confirmation',
      intent: 'confirmar_pedido',
    },
    then: {
      accion: 'confirmar_compra',
      reason: 'address_confirmed', // D-12 alt path
    },
  },

  // ==========================================================================
  // D-12: cambiar direccion (en cualquier phase) → actualizar via crm-writer
  // NO template lookup aqui — Plan 11 engine llama crm-writer.updateOrderShipping.
  // Plan 07 response-track decide si emite direccion_entrega post-update o silencio.
  // ==========================================================================
  {
    when: {
      phase: 'awaiting_address_confirmation',
      intent: 'cambiar_direccion',
    },
    then: {
      accion: 'actualizar_direccion',
      reason: 'address_re_change_requested', // D-12 loop
    },
  },
  {
    when: {
      phase: '*',
      intent: 'cambiar_direccion',
    },
    then: {
      accion: 'actualizar_direccion',
      reason: 'address_change_requested', // D-12
    },
  },

  // ==========================================================================
  // D-11: cancellation flow
  // 1er "no" (cancelacion_intent_count === 0) → cancelar_con_agendar_pregunta.
  // 2do "no" (post awaiting_schedule_decision) → cancelar_definitivo (handoff silencioso).
  // ==========================================================================
  {
    when: {
      phase: 'awaiting_schedule_decision',
      intent: 'cancelar_pedido',
    },
    then: {
      accion: 'cancelar_definitivo',
      reason: 'second_no_handoff', // D-11 paso 2
    },
  },
  {
    when: {
      phase: [...INITIAL_AWAITING_STATES, 'awaiting_address_confirmation'],
      intent: 'cancelar_pedido',
      condition: (state) => state.cancelacion_intent_count === 0,
    },
    then: {
      accion: 'cancelar_con_agendar_pregunta',
      reason: 'first_no_offer_schedule', // D-11 paso 1
    },
  },

  // D-11 alt path: post agendar_pregunta el cliente acepta agendar
  // → mover a FALTA CONFIRMAR (parking, mismo que D-14 acuse de "espera").
  {
    when: {
      phase: 'awaiting_schedule_decision',
      intent: 'agendar',
    },
    then: {
      accion: 'mover_a_falta_confirmar',
      reason: 'schedule_accepted', // D-11 alt path
    },
  },

  // ==========================================================================
  // D-14: esperar / "lo pienso" → mover a FALTA CONFIRMAR (acuse + parking)
  // ==========================================================================
  {
    when: {
      phase: '*',
      intent: 'esperar',
    },
    then: {
      accion: 'mover_a_falta_confirmar',
      reason: 'wait_acknowledged', // D-14
    },
  },

  // ==========================================================================
  // D-13 V1: editar_items → handoff (escala humano, deferred per agent-scope.md)
  // ==========================================================================
  {
    when: {
      phase: '*',
      intent: 'editar_items',
    },
    then: {
      accion: 'handoff',
      reason: 'edit_items_v1_handoff', // D-13 V1
    },
  },

  // ==========================================================================
  // D-21: pedir_humano → handoff (tambien capturado por guards.ts R1, doble safety)
  // ==========================================================================
  {
    when: {
      phase: '*',
      intent: 'pedir_humano',
    },
    then: {
      accion: 'handoff',
      reason: 'human_requested', // D-21 trigger d
    },
  },

  // ==========================================================================
  // Datos espontaneos: cliente provee datos faltantes en captura → si completa
  // shipping, auto-promote a confirmar_compra; si no, sigue capturando (noop).
  // El campo merge ya ocurrio en Plan 11 engine (mergeAnalysis antes de
  // resolveTransition); aqui el `state` recibido ya tiene los datos nuevos.
  //
  // Trigger: phase=capturing_data + cualquier intent que no sea confirmar/cancelar
  //   - Si shippingComplete → auto confirmar.
  //   - Si no → noop (response-track sigue pidiendo datos faltantes).
  // ==========================================================================
  {
    when: {
      phase: 'capturing_data',
      intent: 'fallback', // cliente respondio con datos sin intent claro
      condition: (state) => shippingComplete(state).complete,
    },
    then: {
      accion: 'confirmar_compra',
      reason: 'data_captured_now_complete', // derived
    },
  },

  // ==========================================================================
  // Fallback / informational catch-all → noop (response-track maneja templates)
  // ==========================================================================
  // Las informacionales (saludo, precio, ...) caen al noop default abajo;
  // response-track Plan 07 emite los templates de INFORMATIONAL_INTENTS.
  // No las listamos explicitamente para mantener la tabla simple — el resolver
  // retorna noop por default si nada matchea.
]

// ============================================================================
// resolveTransition — first-match wins
// ============================================================================

/**
 * Resuelve la transicion para un (phase + intent + state) dado.
 *
 * Algoritmo: itera TRANSITIONS en orden, retorna el primer entry cuyo
 * `when` matchea (phase + intent + condition opcional). Si nada matchea,
 * retorna `{accion: 'noop', reason: 'no_matching_transition'}` (safety
 * fallback — response-track Plan 07 aun puede emitir template informativo
 * si el intent esta en INFORMATIONAL_INTENTS).
 *
 * @param input.phase Phase actual del state.
 * @param input.intent Intent clasificado por comprehension.
 * @param input.state AgentState (para conditions tipo shippingComplete o counters).
 * @param input.lastTemplate (opcional) Last template intent emitido — informativo, NO usado como guard (D-26).
 * @returns TransitionThen con accion + reason.
 */
export function resolveTransition(input: ResolveTransitionInput): TransitionThen {
  const { phase, intent, state } = input

  for (const entry of TRANSITIONS) {
    if (entry.when.intent !== intent) continue
    if (!phaseMatches(entry.when, phase)) continue
    if (entry.when.condition && !entry.when.condition(state)) continue
    return entry.then
  }

  // Default: si el intent es informacional, response-track lo maneja (noop here).
  if (INFORMATIONAL_INTENTS.has(intent)) {
    return {
      accion: 'noop',
      reason: 'informational_query_response_track_handles',
    }
  }

  // Fallback explicito: el comprehension retorno 'fallback' o intent no mapeado.
  return {
    accion: 'noop',
    reason: 'no_matching_transition',
  }
}
