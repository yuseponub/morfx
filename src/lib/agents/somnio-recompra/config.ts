/**
 * Somnio Recompra Agent — Configuration
 *
 * Agent registration config for the agent registry.
 * Uses Haiku for comprehension (structured output), no separate intent detector.
 * Fork of godentist/config.ts pattern.
 */

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const SOMNIO_RECOMPRA_AGENT_ID = 'somnio-recompra-v1'

/**
 * Somnio Recompra uses a single comprehension call (Haiku) instead of
 * separate intent detector + orchestrator. The registry requires
 * both fields, so we set them to the same model/prompt.
 * The actual prompt is in comprehension-prompt.ts.
 */
export const somnioRecompraConfig: AgentConfig = {
  id: SOMNIO_RECOMPRA_AGENT_ID,
  name: 'Somnio Recompra Agent',
  description:
    'Agente de recompra para clientes existentes. Pipeline v3 simplificado con datos precargados ' +
    'del ultimo pedido entregado. Sin captura silenciosa, sin ofi inter.',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — recompra uses comprehension.ts directly',
    maxTokens: 512,
  },

  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — recompra uses sales-track.ts + response-track.ts directly',
    maxTokens: 512,
  },

  tools: [
    'crm.contact.create',
    'crm.contact.update',
    'crm.contact.get',
    'crm.order.create',
    'whatsapp.message.send',
  ],

  states: [
    'nuevo',
    'promos',
    'confirmacion',
    'orden_creada',
    'handoff',
  ],
  initialState: 'nuevo',
  validTransitions: {
    nuevo: ['promos', 'handoff'],
    promos: ['confirmacion', 'orden_creada', 'handoff'],
    confirmacion: ['orden_creada', 'promos', 'handoff'],
    orden_creada: ['handoff'],
    handoff: [],
  },

  confidenceThresholds: {
    proceed: 80,
    reanalyze: 60,
    clarify: 40,
    handoff: 0,
  },

  tokenBudget: 50_000,
}
