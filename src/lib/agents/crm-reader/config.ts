/**
 * CRM Reader Agent — Configuration
 * Phase 44 Plan 04.
 *
 * Agent registration config for the agent registry. Reader is read-only:
 * tool registry exposes zero write-capable symbols (compile-time invariant
 * + grep enforcement in Plan 04 Task 2 verify block).
 */

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const CRM_READER_AGENT_ID = 'crm-reader' as const

/**
 * crm-reader does NOT use the intent-detector / orchestrator split.
 * It uses AI SDK v6 `generateText` directly (see ./index.ts). The registry
 * requires both fields — we set them to placeholder strings. The actual
 * system prompt comes from ./system-prompt.ts.
 */
export const crmReaderConfig: AgentConfig = {
  id: CRM_READER_AGENT_ID,
  name: 'CRM Reader Bot',
  description:
    'Agente AI de SOLO LECTURA sobre el CRM. Expuesto como API interna para otros agentes (tool provider). ' +
    'Scope: contactos, pedidos, pipelines & stages, tags. NO muta. NO envia mensajes.',

  intentDetector: {
    model: CLAUDE_MODELS.SONNET,
    systemPrompt: 'PLACEHOLDER — crm-reader uses generateText directly with system-prompt.ts',
    maxTokens: 1024,
  },
  orchestrator: {
    model: CLAUDE_MODELS.SONNET,
    systemPrompt: 'PLACEHOLDER — crm-reader uses generateText directly with system-prompt.ts',
    maxTokens: 1024,
  },

  // Tools exposed (revision 2026-04-18: reduced to V1 surface — tagsEntities deferred).
  // Naming convention: crm-reader.{entity}.{action}.
  tools: [
    'crm-reader.contacts.search',
    'crm-reader.contacts.get',
    'crm-reader.orders.list',
    'crm-reader.orders.get',
    'crm-reader.pipelines.list',
    'crm-reader.stages.list',
    'crm-reader.tags.list',
  ],

  states: ['stateless'],
  initialState: 'stateless',
  validTransitions: { stateless: [] },

  confidenceThresholds: {
    proceed: 80,
    reanalyze: 60,
    clarify: 40,
    handoff: 0,
  },
  tokenBudget: 30_000,
}
