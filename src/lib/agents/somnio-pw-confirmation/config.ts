/**
 * Somnio Sales v3 — PW Confirmation Agent — Configuration
 *
 * Agent ID: somnio-sales-v3-pw-confirmation (D-01 LOCKED)
 * Workspace: Somnio (a3843b3f-c337-4836-92b5-89c58bb98490) (D-19)
 * Phase: somnio-sales-v3-pw-confirmation (standalone)
 *
 * Purpose: post-purchase confirmation agent for orders created via web
 * (NUEVO PAG WEB / FALTA INFO / FALTA CONFIRMAR stages).
 *
 * Reads CRM context BLOCKING via Inngest 2-step at session-create (D-05),
 * confirms or escalates per state machine. State-machine pure (D-25) —
 * comprehension via single Haiku call (clonado de recompra/v3 pattern).
 *
 * Plan 03 (Wave 1) ships this scaffold so the agent appears as an option
 * in the routing-editor dropdown. The actual message-processing pipeline
 * (engine-pw-confirmation, comprehension, transitions, sales/response
 * tracks, etc.) is added in Plans 04..11.
 */

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const SOMNIO_PW_CONFIRMATION_AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const

/**
 * PW Confirmation uses a single comprehension call (Haiku) instead of the
 * separate intent-detector + orchestrator pattern (clonado de recompra).
 * The registry.register() validator requires both fields, so we set them
 * to placeholder configs — the real prompts live in comprehension-prompt.ts
 * (added in Plan 04).
 */
export const somnioPwConfirmationConfig: AgentConfig = {
  id: SOMNIO_PW_CONFIRMATION_AGENT_ID,
  name: 'Somnio Sales v3 — PW Confirmation',
  description:
    'Atiende clientes Somnio con pedido activo en NUEVO PAG WEB / FALTA INFO / FALTA CONFIRMAR. ' +
    'Confirma compra, captura datos faltantes, edita direccion via crm-writer, escala handoff humano si cancelan. ' +
    'CRM reader BLOQUEANTE al crear sesion (D-05). NO crea pedidos (scope sales-v3).',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — pw-confirmation uses comprehension.ts directly (Plan 04)',
    maxTokens: 512,
  },

  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — pw-confirmation uses sales-track.ts + response-track.ts directly (Plans 07-08)',
    maxTokens: 512,
  },

  // Set de tools — D-20: SIN crear_orden y otros tools de creacion de pedidos heredados de sales-v3.
  // El agente solo MUTA pedidos existentes (update + move stage); jamas crea pedidos nuevos.
  tools: [
    'crm.contact.update',     // actualizar nombre/telefono via crm-writer
    'crm.order.update',       // actualizar shipping_address via crm-writer (D-12)
    'crm.order.move_stage',   // mover a CONFIRMADO (D-10) / FALTA CONFIRMAR (D-14)
    'whatsapp.message.send',  // enviar templates del catalogo propio (agent_id='somnio-sales-v3-pw-confirmation')
    'handoff_human',          // stub D-21 (solo registra evento, sin mutacion CRM)
  ],

  // States del state machine (Plans 06-08 implementan transitions/guards/sales-track).
  states: [
    'nuevo',
    'awaiting_confirmation',                   // D-26 estado inicial post CRM-reader
    'awaiting_confirmation_post_data_capture', // tras pedir datos faltantes
    'awaiting_data_capture',                   // mientras cliente provee datos
    'awaiting_address_confirmation',           // tras pedir confirmacion direccion
    'awaiting_schedule_decision',              // tras 1er "no" → preguntar agendar
    'confirmed',                               // pedido movido a CONFIRMADO
    'waiting_decision',                        // pedido movido a FALTA CONFIRMAR (D-14)
    'handoff',                                 // handoff stub disparado (D-21)
  ],
  initialState: 'nuevo', // pre-CRM-reader; pasa a 'awaiting_confirmation' tras preload (D-26)

  // Transiciones validas entre estados (Plan 06 expande el grafo completo).
  validTransitions: {
    nuevo: ['awaiting_confirmation', 'awaiting_data_capture', 'handoff'],
    awaiting_confirmation: [
      'confirmed',
      'waiting_decision',
      'awaiting_address_confirmation',
      'awaiting_schedule_decision',
      'awaiting_data_capture',
      'handoff',
    ],
    awaiting_confirmation_post_data_capture: [
      'confirmed',
      'waiting_decision',
      'awaiting_schedule_decision',
      'handoff',
    ],
    awaiting_data_capture: ['awaiting_confirmation_post_data_capture', 'handoff'],
    awaiting_address_confirmation: ['confirmed', 'awaiting_data_capture', 'handoff'],
    awaiting_schedule_decision: ['waiting_decision', 'handoff'],
    confirmed: [], // terminal
    waiting_decision: ['awaiting_confirmation', 'handoff'], // cliente puede volver
    handoff: [], // terminal — un humano lo maneja
  },

  confidenceThresholds: {
    proceed: 80,
    reanalyze: 60,
    clarify: 40,
    handoff: 0,
  },

  tokenBudget: 50_000,
}
