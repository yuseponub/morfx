// Adapted from src/lib/agents/godentist/config.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 03).
// Changes: agent ID constant renamed to GODENTIST_FB_IG_AGENT_ID, name + description for sibling.
// All other fields clonados verbatim (D-12 Haiku, D-13 state machine sin cambios).

/**
 * GoDentist FB/IG Sibling Agent — Configuration
 *
 * Agent registration config for the agent registry.
 * Uses Haiku for comprehension (structured output), no separate intent detector.
 *
 * Sibling de GoDentist (D-04). Coexiste con el agente godentist original.
 * Activacion 100% via routing rule sobre fact `channel in ['facebook', 'instagram']`
 * (D-14 sin feature flag, D-15 routing rule manual).
 */

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig' as const

/**
 * GoDentist FB/IG uses a single comprehension call (Haiku) instead of
 * separate intent detector + orchestrator. The registry requires
 * both fields, so we set them to the same model/prompt.
 * The actual prompt is in comprehension-prompt.ts.
 */
export const godentistFbIgConfig: AgentConfig = {
  id: GODENTIST_FB_IG_AGENT_ID,
  name: 'GoDentist Valoraciones — FB/IG (Lead Capture)',
  description:
    'Sibling de GoDentist para conversaciones FB Messenger / Instagram Direct. ' +
    'Saludo lead-capture (pide nombre+celular upfront + Habeas Data inline). ' +
    'Resto del pipeline idéntico a godentist (4 sedes + 23 servicios + Dentos availability).',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — godentist-fb-ig uses comprehension.ts directly',
    maxTokens: 512,
  },

  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — godentist-fb-ig uses sales-track.ts + response-track.ts directly',
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
