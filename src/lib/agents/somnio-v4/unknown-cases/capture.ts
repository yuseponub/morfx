/**
 * captureUnknownCase — inserta una fila en `agent_unknown_cases` (D-05, D-12, D-58).
 *
 * Flow:
 *   1. PII redaction del `message` ANTES de embedding (RESEARCH Security recommendation).
 *   2. `generateEmbedding(redacted)` (1536-dim, mismo modelo que knowledge-base sync).
 *   3. INSERT en `agent_unknown_cases` con `status='pending'` + `cluster_id=null`.
 *      El cron `unknown-cases-cluster-v4` (Plan 09 Task 2) marca status='ready_for_promotion'
 *      cuando se forma un cluster ≥10 cases en ventana 30 días (D-06).
 *   4. Doble logging (D-58):
 *        - Row en `agent_unknown_cases` para review humano vía UI Plan 10.
 *        - Evento `pipeline_decision:unknown_case_captured` para observability/tuning.
 *
 * Anti-patterns:
 *   - Fire-and-forget desde el agente — un fallo NO debe romper el turn (try/catch
 *     interno + fallback observability event `unknown_case_capture_failed`).
 *   - Cero imports somnio-v3 (D-24).
 *   - Almacenamos el `message` REDACTED, no el raw — protege el embedding y la fila.
 *
 * Standalone: somnio-sales-v4 / Plan 09 Task 1.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '../knowledge-base/embed'
import { redactPii } from './redact'
import { SOMNIO_V4_AGENT_ID } from '../config'
import { getCollector } from '@/lib/observability'

export interface CaptureUnknownArgs {
  workspaceId: string
  conversationId: string
  message: string
  intent: string | null
  intentConfidence: number | null
  knowledgeQueried: string[]
  reason: string
}

/**
 * Inserta una fila en `agent_unknown_cases` con embedding + PII redaction.
 *
 * Diseñada para fire-and-forget (`void captureUnknownCase({...})`) — fallos
 * internos NO se propagan al caller, se loggean vía observability.
 */
export async function captureUnknownCase(
  args: CaptureUnknownArgs,
): Promise<void> {
  try {
    const redacted = redactPii(args.message)
    const embedding = await generateEmbedding(redacted)
    const supabase = createAdminClient()

    const { error } = await supabase.from('agent_unknown_cases').insert({
      workspace_id: args.workspaceId,
      agent_id: SOMNIO_V4_AGENT_ID,
      conversation_id: args.conversationId,
      message: redacted,
      embedding,
      intent: args.intent,
      confidence: args.intentConfidence,
      knowledge_queried: args.knowledgeQueried,
      reason: args.reason,
      status: 'pending',
      cluster_id: null,
    })

    if (error) throw error

    getCollector()?.recordEvent('pipeline_decision', 'unknown_case_captured', {
      agent: SOMNIO_V4_AGENT_ID,
      conversationId: args.conversationId,
      intent: args.intent,
      confidence: args.intentConfidence,
      reason: args.reason,
      knowledgeQueriedCount: args.knowledgeQueried.length,
    })
  } catch (err) {
    // Fire-and-forget — fail silently to not break the turn.
    // D-58: doble logging — observability captura el fallo de capture; el flujo
    // del cliente sigue intacto (handoff_humano se envía vía mapOutcomeToAgentOutput).
    getCollector()?.recordEvent(
      'pipeline_decision',
      'unknown_case_capture_failed',
      {
        agent: SOMNIO_V4_AGENT_ID,
        conversationId: args.conversationId,
        error: err instanceof Error ? err.message : String(err),
      },
    )
  }
}
