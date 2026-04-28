/**
 * Somnio Sales v3 — PW Confirmation Agent — Type Definitions
 *
 * Type stubs for somnio-sales-v3-pw-confirmation.
 * Expanded in Plans 04-11 with full state, intents, transitions, etc.
 *
 * For Wave 1 (Plan 03) only the minimum needed to satisfy index.ts re-exports.
 *
 * NOTE: shapes are intentionally minimal — Plan 06 (state.ts) expands V3AgentInput/Output
 * with full state machine fields; Plan 08 (sales-track.ts) expands TipoAccion union with
 * all D-10/D-11/D-12/D-13/D-14 cases.
 */

// ============================================================================
// V3 Agent Input/Output (interface with V3ProductionRunner)
// ============================================================================

/**
 * Input shape mirrors somnio-recompra/types.ts V3AgentInput (the V3
 * production runner expects this contract). Plan 06 may expand with
 * pw-confirmation-specific fields (active_order, crm_context_status,
 * etc.) — for now placeholder shape.
 */
export interface V3AgentInput {
  sessionId: string
  conversationId: string
  contactId: string
  message: string
  workspaceId: string
  history: unknown[]
  phoneNumber?: string
  messageTimestamp?: string
}

/**
 * Output shape mirrors somnio-recompra/types.ts V3AgentOutput.
 * Expanded in Plan 06 (state.ts) with state changes, decisions, timer signals.
 */
export interface V3AgentOutput {
  messages: unknown[]
  intent?: string
  newPhase?: string
  // Expanded in Plan 06 (state.ts) — placeholder shape for now.
}

// ============================================================================
// State Machine Types (placeholder — Plan 08 expands)
// ============================================================================

/**
 * TipoAccion: union de acciones que el sales-track puede emitir.
 *
 * Plan 08 (sales-track.ts) expande con todos los casos:
 * - D-10: confirmacion (mover a CONFIRMADO)
 * - D-11: cancelacion (1er "no" → agendar; 2do "no" → handoff)
 * - D-12: actualizar direccion (crm-writer.updateOrder shipping_*)
 * - D-13: editar items (handoff humano en V1, deferred a V1.1)
 * - D-14: "espera lo pienso" (mover a FALTA CONFIRMAR)
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
