/**
 * GoDentist Appointment Agent — Configuration
 *
 * Agent registration config for the agent registry.
 * Uses Haiku for comprehension (structured output), no separate intent detector.
 */

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const GODENTIST_AGENT_ID = 'godentist'

/**
 * GoDentist uses a single comprehension call (Haiku) instead of
 * separate intent detector + orchestrator. The registry requires
 * both fields, so we set them to the same model/prompt.
 * The actual prompt is in comprehension-prompt.ts.
 */
export const godentistConfig: AgentConfig = {
  id: GODENTIST_AGENT_ID,
  name: 'GoDentist Appointment Agent',
  description:
    'Agente de agendamiento de citas para GoDentist. Pipeline v3 con comprehension ' +
    'Haiku + state machine determinista. Agenda valoraciones GRATIS en 4 sedes.',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — godentist uses comprehension.ts directly',
    maxTokens: 512,
  },

  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — godentist uses sales-track.ts + response-track.ts directly',
    maxTokens: 512,
  },

  tools: [
    'crm.contact.create',
    'crm.contact.update',
    'crm.contact.get',
    'whatsapp.message.send',
  ],

  states: [
    'nuevo',
    'conversacion',
    'captura',
    'captura_fecha',
    'mostrando_disponibilidad',
    'confirmacion',
    'cita_agendada',
    'handoff',
  ],
  initialState: 'nuevo',
  validTransitions: {
    nuevo: ['conversacion', 'captura', 'handoff'],
    conversacion: ['captura', 'handoff'],
    captura: ['captura_fecha', 'handoff'],
    captura_fecha: ['mostrando_disponibilidad', 'handoff'],
    mostrando_disponibilidad: ['confirmacion', 'handoff'],
    confirmacion: ['cita_agendada', 'captura', 'handoff'],
    cita_agendada: ['handoff'],
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
