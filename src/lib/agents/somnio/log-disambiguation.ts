/**
 * Phase 33: Confidence Routing + Disambiguation Log
 *
 * Fire-and-forget async helper for writing disambiguation log records.
 * When a low-confidence HANDOFF occurs, this captures full context so
 * human reviewers can understand what happened and provide training data.
 *
 * NOT using domain layer: disambiguation_log is an audit/diagnostic table
 * written exclusively by the agent pipeline (same pattern as
 * production/storage.ts and production/handoff-handler.ts).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('disambiguation')

export interface DisambiguationLogInput {
  workspaceId: string
  sessionId: string
  conversationId: string
  contactId: string
  customerMessage: string
  detectedIntent: string
  confidence: number
  alternatives: Array<{ intent: string; confidence: number }>
  reasoning: string
  agentState: string
  templatesEnviados: string[]
  pendingTemplates: unknown[]
  conversationHistory: Array<{ role: string; content: string }>
}

/**
 * Write a disambiguation log record to Supabase.
 *
 * Caller is expected to invoke this fire-and-forget with .catch()
 * so that handoff proceeds regardless of log success.
 */
export async function logDisambiguation(input: DisambiguationLogInput): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase.from('disambiguation_log').insert({
    workspace_id: input.workspaceId,
    session_id: input.sessionId,
    conversation_id: input.conversationId,
    contact_id: input.contactId,
    customer_message: input.customerMessage,
    detected_intent: input.detectedIntent,
    confidence: input.confidence,
    alternatives: input.alternatives,
    reasoning: input.reasoning,
    agent_state: input.agentState,
    templates_enviados: input.templatesEnviados,
    pending_templates: input.pendingTemplates,
    conversation_history: input.conversationHistory,
  })

  if (error) {
    logger.warn({ event: 'disambiguation_log_failed', sessionId: input.sessionId, error: error.message })
    throw error
  }

  logger.info({
    event: 'disambiguation_log_written',
    sessionId: input.sessionId,
    intent: input.detectedIntent,
    confidence: input.confidence,
  })
}
