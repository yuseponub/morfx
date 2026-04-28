/**
 * Load all turns of a conversation for the multi-turn auditor (Plan 05).
 *
 * Returns turns in chronological ASC order. Includes turns from ANY
 * responding_agent_id (D-19 — crm-reader turns appear automatically when
 * platform_config.somnio_recompra_crm_reader_enabled is on for the workspace).
 *
 * Window strategy (RESEARCH §1):
 *  - Step 1: try active session — narrow window from session.created_at.
 *  - Step 2 (fallback): 7-day window before audited turn anchor.
 *
 * Cap: 50 turns (Somnio sessions average 3-15 turns per RESEARCH §1).
 * Token budgeting (Task 6) applies further trimming if total exceeds 50K.
 *
 * Index: existing `idx_turns_conversation (conversation_id, started_at DESC)`
 * covers the query exactly (verified RESEARCH §1).
 */

import { createRawAdminClient } from '@/lib/supabase/admin'
import type { TurnSummary } from '@/lib/observability/repository'

const TURNS_PROJECTION =
  'id, conversation_id, workspace_id, agent_id, responding_agent_id, started_at, finished_at, duration_ms, event_count, query_count, ai_call_count, total_tokens, total_cost_usd, error, trigger_kind, current_mode, new_mode'

const MAX_TURNS = 50
const FALLBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function loadConversationTurns(
  conversationId: string,
  startedAtAnchor: string,
): Promise<TurnSummary[]> {
  const supabase = createRawAdminClient()

  // Step 1: prefer active session window (narrow + correct)
  const sessionRes = await supabase
    .from('agent_sessions')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sessionCreatedAt =
    (sessionRes.data?.created_at as string | undefined) ?? null

  const lowerBound = sessionCreatedAt
    ? sessionCreatedAt
    : new Date(
        new Date(startedAtAnchor).getTime() - FALLBACK_WINDOW_MS,
      ).toISOString()
  const upperBound = new Date(Date.now() + 60_000).toISOString()

  // Step 2: fetch turns ASC within window
  const { data, error } = await supabase
    .from('agent_observability_turns')
    .select(TURNS_PROJECTION)
    .eq('conversation_id', conversationId)
    .gte('started_at', lowerBound)
    .lte('started_at', upperBound)
    .order('started_at', { ascending: true })
    .limit(MAX_TURNS)

  if (error) throw error

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: r.id as string,
    conversationId: r.conversation_id as string,
    workspaceId: r.workspace_id as string,
    agentId: r.agent_id as string,
    respondingAgentId: (r.responding_agent_id as string | null) ?? null,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string | null) ?? null,
    durationMs: (r.duration_ms as number | null) ?? null,
    eventCount: (r.event_count as number) ?? 0,
    queryCount: (r.query_count as number) ?? 0,
    aiCallCount: (r.ai_call_count as number) ?? 0,
    totalTokens: (r.total_tokens as number) ?? 0,
    totalCostUsd: Number(r.total_cost_usd ?? 0),
    hasError: r.error !== null && r.error !== undefined,
    triggerKind: (r.trigger_kind as string | null) ?? null,
    currentMode: (r.current_mode as string | null) ?? null,
    newMode: (r.new_mode as string | null) ?? null,
  }))
}
