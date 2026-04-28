/**
 * Somnio PW-Confirmation Agent — Sales Track Orchestrator
 *
 * State-machine PURE wrapper (D-25): orquesta `transitions.ts` aplicando
 * pre-processing del state (mergeAnalysis con datos del comprehension) y
 * post-processing (counters + flags) ANTES y DESPUES de invocar
 * `resolveTransition`.
 *
 * Por que pre-process: D-09→D-26 + D-12. El cliente puede decir
 *   "si, mi direccion es Calle 100 Bogota Cundinamarca"
 * en un mismo mensaje. La maquina DEBE confirmar (entry #1 de TRANSITIONS)
 * SOLO si shippingComplete==true tras incorporar los datos extraidos. Sin el
 * merge previo, evaluaria el state stale y caeria a entry #2 (pedir_datos_envio)
 * cuando deberia confirmar directo.
 *
 * Por que post-process:
 *   - D-11: el flujo de cancelacion necesita un counter para distinguir el
 *     1er "no" (cancelar_con_agendar_pregunta, count=0→1) del 2do
 *     (cancelar_definitivo, count=1, ya cubierto por la transition entry #6).
 *   - D-21: el flag requires_human marca handoff stub para observability;
 *     no materializa cambios CRM (eso queda para standalone futuro).
 *   - enterCaptura: marker para el engine (Plan 11) — cuando emitimos
 *     `pedir_datos_envio`, el engine debe transicionar phase a
 *     `'capturing_data'` para el proximo turn, asi entry #12 de TRANSITIONS
 *     auto-promueve a confirmar_compra cuando el cliente complete los datos.
 *
 * Ningun I/O — solo data transformations sobre AgentState/MessageAnalysis.
 * Las mutaciones CRM (crm-writer.moveOrderToStage, updateOrder) viven en
 * el adapter de Plan 10 y se invocan desde el engine de Plan 11.
 *
 * Fork del patron somnio-recompra/sales-track.ts (~95 lineas) — version mas
 * cercana a PW que la de v3 (que tiene timer events + auto-triggers + ofi inter
 * — todo lo que PW NO necesita en V1).
 *
 * Diferencias vs recompra:
 *   - Mutate counters/flags en `state` recibido (recompra es immutable porque
 *     su engine maneja counters fuera). Aqui sales-track los muta in-place
 *     porque el engine Plan 11 pasa el state mutable y lee post-call.
 *   - Pre-process mergeAnalysis (recompra lo hace en su engine antes de invocar).
 *   - enterCaptura marker (recompra no tiene capturing_data phase).
 *   - secondarySalesAction siempre undefined en V1 (campo queda por compat con
 *     engine signature; sales-v3 lo usa para ofi inter, recompra no lo usa).
 */

import { getCollector } from '@/lib/observability'
import type { MessageAnalysis } from './comprehension-schema'
import { mergeAnalysis, type AgentState, type StateChanges } from './state'
import { resolveTransition } from './transitions'
import type { TipoAccion } from './types'

// ============================================================================
// Types
// ============================================================================

export interface ResolveSalesTrackInput {
  /** Phase actual del state machine. Mismo valor que `state.phase`, pasado por explicitness. */
  phase: string
  /** Intent clasificado por comprehension (Plan 05). */
  intent: string
  /**
   * AgentState mutable — sales-track actualiza counters/flags in-place
   * (cancelacion_intent_count, requires_human). El caller (engine Plan 11)
   * lee el state post-call para serializar.
   */
  state: AgentState
  /** Analisis del comprehension (intent + datos_extraidos + confidence + notas). */
  analysis: MessageAnalysis
  /**
   * Last template intent emitido en el turn previo (informativo, NO usado como
   * guard — D-26: la fuente de verdad es state.phase, no messages.template_name).
   * Aceptado por compat con engine signature; reservado para futurabilidad.
   */
  lastTemplate?: string | null
}

export interface ResolveSalesTrackOutput {
  /** Accion canonica a ejecutar (engine Plan 11 invoca crm-writer-adapter para mutations). */
  accion: TipoAccion
  /**
   * Accion secundaria opcional (e.g. en sales-v3 se usa para ofi inter como
   * "ask_ofi_inter" cuando la principal es otra). En PW V1 SIEMPRE undefined
   * — campo queda por compat con engine signature.
   */
  secondarySalesAction?: TipoAccion
  /** Razon canonica de la decision (para observability). */
  reason: string
  /**
   * Marker: si true, el engine debe transicionar phase a 'capturing_data' para
   * el proximo turn. Disparado cuando accion='pedir_datos_envio' — asi cuando
   * el cliente provea los datos faltantes, entry #12 de TRANSITIONS los
   * auto-promueve a confirmar_compra.
   */
  enterCaptura?: boolean
  /**
   * Cambios derivados del mergeAnalysis (campos nuevos, count filled, etc.).
   * Util para observability + tests. Vacio si analysis.datos_extraidos era
   * null/undefined (no hubo merge).
   */
  changes?: StateChanges
}

// ============================================================================
// Main Sales Track Orchestrator
// ============================================================================

/**
 * Resuelve la decision de sales-track para un turn del cliente.
 *
 * Pipeline:
 *   1. Pre-process: si analysis.datos_extraidos esta presente, merge en state
 *      (mutando una copia immutable retornada por mergeAnalysis) — el state
 *      original del caller queda intacto hasta el step 3.
 *   2. Delega: resolveTransition({phase, intent, state: mergedState}) — usa
 *      el state mergeado para evaluar shippingComplete + cancelacion counter.
 *   3. Post-process en `state` original (mutate in-place):
 *      - Copia los datos mergeados de mergedState.datos a state.datos
 *        (para que el caller los vea sin tener que llamar mergeAnalysis dos veces).
 *      - Copia intent_history mergeado (capped a 6).
 *      - Si accion='cancelar_con_agendar_pregunta': cancelacion_intent_count = 1.
 *      - Si accion='handoff' OR 'cancelar_definitivo': requires_human = true.
 *      - enterCaptura = (accion==='pedir_datos_envio').
 *   4. Emit observability event `pipeline_decision:sales_track_result`.
 *
 * @param input.phase Fase actual (mismo que state.phase).
 * @param input.intent Intent del comprehension.
 * @param input.state State machine mutable (counters/flags se actualizan in-place).
 * @param input.analysis Analisis comprehension (intent + datos_extraidos + confidence).
 * @param input.lastTemplate Informativo, NO usado como guard (D-26).
 * @returns Decision canonica con accion + reason + enterCaptura + changes.
 */
export function resolveSalesTrack(input: ResolveSalesTrackInput): ResolveSalesTrackOutput {
  const { phase, intent, state, analysis } = input

  // ------------------------------------------------------------------
  // 1. Pre-process: mergeAnalysis ANTES de evaluar transitions.
  //    Critico para D-09→D-26 + D-12: si el cliente provee datos en el
  //    mismo mensaje que confirma ("si, mi direccion es..."), shippingComplete
  //    debe evaluarse sobre el state POST-merge.
  // ------------------------------------------------------------------
  let mergedState = state
  let changes: StateChanges | undefined
  if (analysis.datos_extraidos) {
    const result = mergeAnalysis(state, analysis)
    mergedState = result.state
    changes = result.changes
  } else {
    // Aun sin datos_extraidos, queremos pushear el intent al history
    // (mergeAnalysis siempre lo hace). Pasamos analysis con datos_extraidos
    // null explicito para reusar la logica.
    const result = mergeAnalysis(state, analysis)
    mergedState = result.state
    changes = result.changes
  }

  // ------------------------------------------------------------------
  // 2. Delega al transition table (state.ts mergedState).
  // ------------------------------------------------------------------
  const transition = resolveTransition({
    phase,
    intent,
    state: mergedState,
    lastTemplate: input.lastTemplate ?? null,
  })

  // ------------------------------------------------------------------
  // 3. Post-process: mutate `state` in-place para que el caller observe
  //    los cambios (datos mergeados + intent_history + counters + flags).
  // ------------------------------------------------------------------

  // 3a. Propagar datos mergeados al state original (asi el caller no necesita
  //     re-llamar mergeAnalysis ni leer mergedState — todo queda en `state`).
  state.datos = mergedState.datos
  state.intent_history = mergedState.intent_history

  // 3b. D-11 cancellation counter: 1er "no" emite cancelar_con_agendar_pregunta;
  //     incrementamos a 1 para que el siguiente "no" en awaiting_schedule_decision
  //     caiga a entry #6 (cancelar_definitivo).
  if (transition.accion === 'cancelar_con_agendar_pregunta') {
    state.cancelacion_intent_count = 1
  }

  // 3c. D-21 handoff stub flag (sin materializacion CRM — solo telemetria).
  //     Triggers: accion='handoff' (entry #10/11/guard R1) o 'cancelar_definitivo'
  //     (entry #6 — 2do "no" tras agendar_pregunta).
  if (transition.accion === 'handoff' || transition.accion === 'cancelar_definitivo') {
    state.requires_human = true
  }

  // 3d. enterCaptura marker: cuando emitimos pedir_datos_envio, el engine
  //     Plan 11 debe transicionar phase a 'capturing_data' para el proximo
  //     turn. Asi entry #12 (capturing_data + fallback + shippingComplete)
  //     puede auto-promover a confirmar_compra cuando el cliente complete.
  const enterCaptura = transition.accion === 'pedir_datos_envio'

  // ------------------------------------------------------------------
  // 4. Observability event (clonado del patron recompra sales-track).
  // ------------------------------------------------------------------
  getCollector()?.recordEvent('pipeline_decision', 'sales_track_result', {
    agent: 'somnio-sales-v3-pw-confirmation',
    phase,
    intent,
    accion: transition.accion,
    reason: transition.reason,
    enterCaptura,
    cancelacion_intent_count: state.cancelacion_intent_count,
    requires_human: state.requires_human,
    hasDataChanges: changes?.hasNewData ?? false,
    shippingJustCompleted: changes?.shippingJustCompleted ?? false,
  })

  return {
    accion: transition.accion,
    secondarySalesAction: undefined, // PW V1 NO usa secondarySalesAction
    reason: transition.reason,
    enterCaptura,
    changes,
  }
}
