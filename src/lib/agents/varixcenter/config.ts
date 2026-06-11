// Varixcenter — clonado de godentist-fb-ig (Standalone agent-varixcenter Wave 1).
// Cambios: agent ID constant renamed to VARIXCENTER_AGENT_ID, name + description,
// 7 fases del diseño §3, validTransitions del diseño §3/§7. Varixcenter no maneja sucursales.

/**
 * Varixcenter Appointment Agent — Configuration
 *
 * Agent registration config for the agent registry.
 * Uses Haiku for comprehension (structured output), no separate intent detector.
 *
 * Agente NUEVO de agendamiento de valoraciones flebológicas (D-04, Regla 6).
 * Slots reales vs varix-clinic. Canales WA + FB + IG.
 * Activacion 100% via routing rule sobre el workspace target
 * (sin feature flag, routing rule manual — ver Wave 6 / Plan 11).
 */

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const VARIXCENTER_AGENT_ID = 'varixcenter' as const

/**
 * Varixcenter uses a single comprehension call (Haiku) instead of
 * separate intent detector + orchestrator. The registry requires
 * both fields, so we set them to the same model/prompt.
 * The actual prompt is in comprehension.ts (Wave 2).
 */
export const varixcenterConfig: AgentConfig = {
  id: VARIXCENTER_AGENT_ID,
  name: 'Varixcenter Valoraciones',
  description:
    'Agente de agendamiento de valoraciones flebológicas. Slots reales vs varix-clinic. WA + FB + IG.',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — varixcenter uses comprehension.ts directly',
    maxTokens: 512,
  },

  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — varixcenter uses sales-track.ts + response-track.ts directly',
    maxTokens: 512,
  },

  tools: [
    'crm.contact.create',
    'crm.contact.update',
    'crm.contact.get',
    'whatsapp.message.send',
  ],

  states: [
    'initial',
    'capturing_data',
    'capturing_fecha',
    'showing_availability',
    'confirming',
    'appointment_registered',
    'closed',
  ],
  initialState: 'initial',
  validTransitions: {
    initial: ['capturing_data', 'capturing_fecha', 'showing_availability', 'closed'],
    capturing_data: ['capturing_fecha', 'showing_availability', 'closed'],
    capturing_fecha: ['showing_availability', 'closed'],
    showing_availability: ['confirming', 'showing_availability', 'closed'],
    confirming: ['appointment_registered', 'showing_availability', 'closed'],
    appointment_registered: ['closed'],
    closed: [],
  },

  confidenceThresholds: {
    proceed: 80,
    reanalyze: 60,
    clarify: 40,
    handoff: 0,
  },

  tokenBudget: 50_000,
}
