/**
 * CRM Writer Bot — Agent Registry Configuration
 * Phase 44 Plan 05.
 *
 * Registered under id 'crm-writer'. Uses Claude Sonnet 4.5.
 * Two-step propose→confirm lifecycle: writer tools never mutate in execute;
 * they call proposeAction which inserts a row in crm_bot_actions with
 * status='proposed' and returns {action_id, preview, expires_at}. A separate
 * confirmAction endpoint dispatches the actual domain mutation.
 *
 * Registry requires intentDetector + orchestrator fields (shape inherited from
 * Phase 13 AgentConfig). CRM Writer uses AI SDK v6 generateText directly — both
 * registry fields are PLACEHOLDERS that describe the agent's shape; the real
 * system prompt lives in ./system-prompt.ts and is passed to generateText.
 *
 * Tools list is informational (the actual tool registry is built by
 * createWriterTools in tools/index.ts) — it enumerates the 13 writer tools for
 * observability and audit purposes.
 */

import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const CRM_WRITER_AGENT_ID = 'crm-writer'

export const crmWriterConfig: AgentConfig = {
  id: CRM_WRITER_AGENT_ID,
  name: 'CRM Writer Bot',
  description:
    'Agente AI de escritura sobre el CRM con flujo two-step propose→confirm. ' +
    'Expuesto como API interna para otros agentes. Scope: contactos, pedidos, ' +
    'notas, tareas (create/update/archive). NO crea recursos base (tags, ' +
    'pipelines, stages, templates, users) — retorna resource_not_found.',

  intentDetector: {
    model: CLAUDE_MODELS.SONNET,
    systemPrompt: 'PLACEHOLDER — crm-writer uses system-prompt.ts directly with AI SDK v6 generateText',
    maxTokens: 1024,
  },

  orchestrator: {
    model: CLAUDE_MODELS.SONNET,
    systemPrompt: 'PLACEHOLDER — crm-writer uses system-prompt.ts directly with AI SDK v6 generateText',
    maxTokens: 2048,
  },

  // Informational tool list (real registry in tools/index.ts via createWriterTools).
  // 13 tools: 3 contact + 4 order + 3 note (incl. archiveOrderNote = 4) + 3 task.
  // Listing 14 actual tool names: createContact, updateContact, archiveContact,
  // createOrder, updateOrder, moveOrderToStage, archiveOrder,
  // createNote, updateNote, archiveNote, archiveOrderNote,
  // createTask, updateTask, completeTask.
  tools: [
    'createContact',
    'updateContact',
    'archiveContact',
    'createOrder',
    'updateOrder',
    'moveOrderToStage',
    'archiveOrder',
    'createNote',
    'updateNote',
    'archiveNote',
    'archiveOrderNote',
    'createTask',
    'updateTask',
    'completeTask',
  ],

  // CRM Writer is stateless per-turn (no conversation memory). Required by
  // AgentConfig shape but semantically unused — every API call is a fresh turn.
  states: ['idle'],
  initialState: 'idle',
  validTransitions: {
    idle: ['idle'],
  },

  confidenceThresholds: {
    proceed: 80,
    reanalyze: 60,
    clarify: 40,
    handoff: 0,
  },

  tokenBudget: 50_000,
}
