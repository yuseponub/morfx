/**
 * Somnio Sales Agent v3 — Configuration
 *
 * Agent registration config for the agent registry.
 * v3 uses Haiku for comprehension (structured output), no separate intent detector.
 */

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const SOMNIO_V3_AGENT_ID = 'somnio-sales-v3'

/**
 * v3 uses a single comprehension call (Haiku) instead of
 * separate intent detector + orchestrator. The registry requires
 * both fields, so we set them to the same model/prompt.
 * The actual prompt is in comprehension-prompt.ts.
 */
export const somnioV3Config: AgentConfig = {
  id: SOMNIO_V3_AGENT_ID,
  name: 'Somnio Sales Agent v3',
  description:
    'Agente de ventas Somnio v3. Pipeline de 11 capas con separacion ' +
    'estricta de intents/acciones/senales. Motor de decision determinista.',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — v3 uses comprehension.ts directly',
    maxTokens: 512,
  },

  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — v3 uses sales-track.ts + response-track.ts directly',
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
    'conversacion',
    'captura',
    'captura_inter',
    'promos',
    'confirmacion',
    'orden_creada',
    'handoff',
  ],
  initialState: 'nuevo',
  validTransitions: {
    nuevo: ['conversacion', 'captura', 'handoff'],
    conversacion: ['captura', 'captura_inter', 'handoff'],
    captura: ['captura_inter', 'promos', 'confirmacion', 'handoff'],
    captura_inter: ['captura', 'promos', 'confirmacion', 'handoff'],
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
