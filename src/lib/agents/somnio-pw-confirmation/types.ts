/**
 * Somnio Sales v3 — PW Confirmation Agent — Type Definitions
 *
 * Plan 11 (Wave 5): expanded V3AgentInput / V3AgentOutput to v3-compatible
 * shapes so V3ProductionRunner can call `processMessage(v3Input as any)` and
 * receive back a `V3AgentOutput` shape that the runner already knows how to
 * route through its messaging / state-save / debug adapters.
 *
 * Plan 03 (Wave 1) shipped placeholder shapes (sessionId/conversationId/...).
 * Those shapes do NOT match what V3ProductionRunner actually passes (it builds
 * v3Input from EngineInput at v3-production-runner.ts:105-118 with field names
 * `message, history, currentMode, intentsVistos, templatesEnviados,
 * datosCapturados, packSeleccionado, accionesEjecutadas, turnNumber,
 * workspaceId, sessionId, systemEvent`). To make integration work end-to-end,
 * Plan 11 expands these types verbatim from `somnio-recompra/types.ts:133-211`
 * (the v3-style contract). Same import shape, same return shape — the
 * differences live entirely inside `processMessage` (the body uses
 * PW-specific state machine + sales/response tracks + crm-writer adapter).
 *
 * Side note: TipoAccion is locked at Plan 04; this file just re-exports it.
 */

// ============================================================================
// Action types
// ============================================================================

/**
 * TipoAccion: union de acciones que el sales-track puede emitir.
 *
 *   - D-10: confirmacion (mover a CONFIRMADO)
 *   - D-11: cancelacion (1er "no" → agendar; 2do "no" → handoff)
 *   - D-12: actualizar direccion (crm-writer.updateOrder shipping_*)
 *   - D-13: editar items (handoff humano en V1, deferred a V1.1)
 *   - D-14: "espera lo pienso" (mover a FALTA CONFIRMAR)
 *   - D-21: handoff stub (pedir_humano / fallback critico)
 */
export type TipoAccion =
  | 'confirmar_compra'              // → mover a CONFIRMADO (D-10)
  | 'pedir_datos_envio'             // → pedir campos faltantes
  | 'actualizar_direccion'          // → invocar crm-writer.updateOrder shipping (D-12)
  | 'editar_items'                  // → handoff humano en V1 (D-13 deferred)
  | 'cancelar_con_agendar_pregunta' // → 1er "no": preguntar agendar (D-11)
  | 'cancelar_definitivo'           // → 2do "no": handoff (D-11)
  | 'mover_a_falta_confirmar'       // → "espera lo pienso" (D-14)
  | 'handoff'                       // → escalada humana (D-21)
  | 'noop'                          // → ignorar turn (e.g. ya procesado)

// ============================================================================
// Accion registrada (audit shape used in V3ProductionRunner persistence)
// ============================================================================

/**
 * Mirror of somnio-recompra/types.ts AccionRegistrada — kept identical so the
 * runner can serialize/deserialize the same shape across the 3 v3-style agents
 * (somnio-v3, somnio-recompra, somnio-pw-confirmation).
 */
export interface AccionRegistrada {
  tipo: TipoAccion
  turno: number
  origen: 'bot' | 'timer' | 'system'
  /** Set when this accion mutated the CRM (e.g. confirmar_compra, actualizar_direccion). */
  crmAction?: boolean
}

// ============================================================================
// Timer signals (V1: PW does NOT emit timer signals — kept for shape compat)
// ============================================================================

export interface TimerSignal {
  type: 'start' | 'cancel' | 'reevaluate'
  level?: 'L3' | 'L4' | 'L5'
  reason?: string
}

// ============================================================================
// Processed messages (Plan 07 response-track output)
// ============================================================================

export interface ProcessedMessage {
  templateId: string
  content: string
  contentType: 'texto' | 'imagen'
  delayMs: number
  priority: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'
}

// ============================================================================
// V3 Agent Input/Output (interface with V3ProductionRunner)
// ============================================================================

/**
 * Mirror of somnio-recompra/types.ts V3AgentInput (the v3-style shape that
 * V3ProductionRunner builds at v3-production-runner.ts:105-118 and passes to
 * `processMessage(v3Input as any)`).
 *
 * Differences from recompra: PW-confirmation does NOT use `packSeleccionado`
 * or timer events in V1 — kept in the interface for shape compat with the
 * runner (the runner ignores them when agentModule='somnio-pw-confirmation'
 * because PW returns no orderData / packSeleccionado / timerSignals).
 */
export interface V3AgentInput {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  /** Serialized state from session_state */
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  accionesEjecutadas?: AccionRegistrada[]
  turnNumber: number
  workspaceId: string
  /**
   * Session id (agent_sessions row id). Required for the agent to persist
   * its serialized AgentState back to session_state.datos_capturados via
   * SessionManager.updateCapturedData. Optional only for backward compat
   * with sandbox/tests that build V3AgentInput by hand.
   */
  sessionId?: string
  /** PW V1 does NOT consume systemEvent — kept for shape compat with recompra/v3. */
  systemEvent?: { type: 'timer_expired'; level: 3 | 4 | 5 }
}

/**
 * Mirror of somnio-recompra/types.ts V3AgentOutput. The runner reads:
 *   - success                    → toggles error path
 *   - messages[]                 → fallback when templates is empty (v3-production-runner.ts:366)
 *   - templates[]                → primary send path (v3-production-runner.ts:260)
 *   - intentsVistos / templatesEnviados / datosCapturados / packSeleccionado /
 *     accionesEjecutadas         → state save (v3-production-runner.ts:387, 406)
 *   - newMode                    → mode update (v3-production-runner.ts:431)
 *   - intentInfo                 → debug + addTurn (v3-production-runner.ts:441-448)
 *   - timerSignals               → emitSignals (v3-production-runner.ts:436)
 *   - shouldCreateOrder/orderData → createOrder (v3-production-runner.ts:465)
 *   - totalTokens / decisionInfo / classificationInfo → debug only
 *
 * PW always returns `shouldCreateOrder=false` (D-18 — agent does NOT create
 * pedidos, only mutates existing ones via crm-writer-adapter).
 */
export interface V3AgentOutput {
  success: boolean
  messages: string[]
  templates?: ProcessedMessage[]
  newMode?: string

  /** State persistence */
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  accionesEjecutadas: AccionRegistrada[]

  intentInfo?: {
    intent: string
    confidence: number
    secondary?: string
    reasoning?: string
    timestamp: string
  }

  totalTokens: number
  shouldCreateOrder: boolean
  orderData?: {
    datosCapturados: Record<string, string>
    packSeleccionado: string | null
    valorOverride?: number
  }

  /** PW V1 returns []; field present for runner shape compat. */
  timerSignals: TimerSignal[]

  decisionInfo?: {
    action: string
    reason: string
    templateIntents?: string[]
  }
  salesTrackInfo?: {
    accion?: TipoAccion
    reason: string
    enterCaptura?: boolean
  }
  responseTrackInfo?: {
    salesTemplateIntents: string[]
    infoTemplateIntents: string[]
    totalMessages: number
  }
  classificationInfo?: {
    category: string
    sentiment: string
  }
}
