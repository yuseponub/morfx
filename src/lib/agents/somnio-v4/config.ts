// Standalone: somnio-sales-v4
// D-13: agent_id literal locked
// D-23: scope = workspace Somnio exclusivo
// D-24: cero imports desde @/lib/agents/somnio-v3/*

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const SOMNIO_V4_AGENT_ID = 'somnio-sales-v4' as const

// Workspace Somnio (D-23). Hardcoded porque v4 SOLO opera aquí.
export const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490' as const

/**
 * v4 AgentConfig — registrado en agentRegistry vía index.ts (Plan 06 Task 7).
 *
 * Estructura clonada conceptualmente de somnio-v3/config.ts:
 *   - intentDetector / orchestrator usan placeholders (v4, igual que v3, usa
 *     comprehension.ts directo + sales-track.ts + response-track.ts; los campos
 *     son metadata para el registry, no se ejecutan).
 *   - tools[] declarativo (no es la fuente real de tools del sub-loop — esa vive
 *     en sub-loop/tools.ts, Plan 05).
 *   - states/initialState/validTransitions: mismo set conceptual que v3 (heredado
 *     vía clone mecánico de transitions.ts).
 *   - confidenceThresholds: legacy v3 0-100 (intent.confidence). El threshold
 *     de v4 (0..1 sobre intent_confidence) vive en platform_config.somnio_v4_low_confidence_threshold (D-11).
 *   - tokenBudget: heredado.
 *
 * D-13: id es el literal locked.
 */
export const somnioV4Config: AgentConfig = {
  id: SOMNIO_V4_AGENT_ID,
  name: 'Somnio Sales v4 (híbrido + sub-loop)',
  description:
    'State machine determinista + Haiku sub-loop bajo triggers (low_confidence, ' +
    'crm_mutation, cas_reject, razonamiento_libre). Mutations vía crm-mutation-tools. ' +
    'KB curado + observation loop unknown_cases. Standalone somnio-sales-v4.',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — v4 uses comprehension.ts directly (Haiku structured + intent_confidence)',
    maxTokens: 1024,
  },

  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — v4 uses sales-track.ts + response-track.ts directly + sub-loop on triggers',
    maxTokens: 512,
  },

  tools: [
    'crm.contact.create',
    'crm.contact.update',
    'crm.order.create',
    'crm.order.update',
    'crm.order.move_stage',
    'crm.note.add',
    'crm.task.create',
    'kb.search',
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
