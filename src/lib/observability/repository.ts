/**
 * Read-only repository for the production observability module.
 *
 * EXCLUSIVELY uses `createRawAdminClient()` (un-instrumented Supabase
 * admin client) so that read queries issued by the UI do NOT pollute
 * future observability data. Using the instrumented `createAdminClient`
 * from here would be both wasteful (UI reads have no active collector,
 * so the wrapper would fast-path anyway) and semantically confusing
 * (a read of observability data looking like a new recorded query).
 *
 * See `src/lib/supabase/admin.ts` for the Pitfall 1 rationale.
 *
 * Consumers: server actions in `src/app/actions/observability.ts`.
 * NEVER call this directly from client components.
 */

import { createRawAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// Public types (exported for UI consumption)
// ---------------------------------------------------------------------------

/**
 * Flat summary row for the master pane of the debug panel.
 * Mirrors the shape of `agent_observability_turns` but with JS-friendly
 * camelCase names and the numeric cost coerced to `number`.
 */
export interface TurnSummary {
  id: string
  conversationId: string
  workspaceId: string
  agentId: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  eventCount: number
  queryCount: number
  aiCallCount: number
  totalTokens: number
  totalCostUsd: number
  hasError: boolean
  triggerKind: string | null
  currentMode: string | null
  newMode: string | null
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ListTurnsOptions {
  /** Hard cap on rows returned. Defaults to 200. */
  limit?: number
}

/**
 * List the N most recent turns for a given conversation, newest first.
 *
 * Read-only. Safe to call with the feature flag OFF: if the table is
 * empty returns `[]`. Server action wrapper decides whether to surface
 * the disabled state vs the empty state.
 */
export async function listTurnsForConversation(
  conversationId: string,
  opts: ListTurnsOptions = {},
): Promise<TurnSummary[]> {
  const supabase = createRawAdminClient()
  const { data, error } = await supabase
    .from('agent_observability_turns')
    .select(
      'id, conversation_id, workspace_id, agent_id, started_at, finished_at, duration_ms, event_count, query_count, ai_call_count, total_tokens, total_cost_usd, error, trigger_kind, current_mode, new_mode',
    )
    .eq('conversation_id', conversationId)
    .order('started_at', { ascending: false })
    .limit(opts.limit ?? 200)

  if (error) throw error

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: r.id as string,
    conversationId: r.conversation_id as string,
    workspaceId: r.workspace_id as string,
    agentId: r.agent_id as string,
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

/**
 * Fetch the full detail of a turn (events + queries + ai_calls).
 * Implemented in Plan 10. Stub kept here so the repository module is
 * the single surface imported by server actions.
 */
export async function getTurnDetail(
  _turnId: string,
  _startedAt: string,
): Promise<never> {
  throw new Error(
    '[observability/repository] getTurnDetail not implemented until Plan 10',
  )
}
