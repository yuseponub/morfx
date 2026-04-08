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

// ---------------------------------------------------------------------------
// TurnDetail: full content of a single turn for the detail pane
// ---------------------------------------------------------------------------

/**
 * Error payload persisted as JSONB in `agent_observability_turns.error`.
 * Null when the turn completed successfully.
 */
export interface TurnDetailError {
  name: string
  message: string
  stack?: string
}

export interface TurnDetailEvent {
  id: string
  sequence: number
  recordedAt: string
  category: string
  label: string | null
  payload: unknown
  durationMs: number | null
}

export interface TurnDetailQuery {
  id: string
  sequence: number
  recordedAt: string
  tableName: string
  operation: string
  filters: Record<string, string> | null
  columns: string | null
  requestBody: unknown
  durationMs: number
  statusCode: number
  rowCount: number | null
  error: string | null
}

export interface TurnDetailAiCall {
  id: string
  sequence: number
  recordedAt: string
  promptVersionId: string
  purpose: string
  model: string
  messages: unknown
  responseContent: unknown
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  totalTokens: number
  costUsd: number
  durationMs: number
  statusCode: number
  error: string | null
}

export interface TurnDetailPromptVersion {
  id: string
  promptHash: string
  systemPrompt: string
  model: string
  temperature: number | null
  maxTokens: number | null
  provider: string
  firstSeenAt: string
}

/**
 * Full detail shape consumed by the debug panel detail pane.
 *
 * The `turn` field extends `TurnSummary` with the structured error payload
 * (only the summary row exposes `hasError: boolean`; the detail exposes the
 * name/message/stack). Children are ordered ascending by `sequence` to
 * enable a single timeline merge in the UI.
 *
 * `promptVersionsById` is a pre-joined map so the ai-call view can render
 * the full system prompt text + metadata via a single lookup keyed by
 * `aiCalls[n].promptVersionId`.
 */
export interface TurnDetail {
  turn: TurnSummary & { error: TurnDetailError | null }
  events: TurnDetailEvent[]
  queries: TurnDetailQuery[]
  aiCalls: TurnDetailAiCall[]
  promptVersionsById: Record<string, TurnDetailPromptVersion>
}

/**
 * Fetch the full detail of a turn (events + queries + ai_calls + prompt
 * versions dereferenced).
 *
 * Partition pruning strategy:
 * ---------------------------
 * `agent_observability_turns` is partitioned by RANGE (started_at) and its
 * PK is composite (started_at, id). Filtering by `id` alone forces Postgres
 * to scan every partition. The caller (UI) already has the `startedAt`
 * value from the master pane row, so we pass it in and apply a +/- 60s
 * window on `started_at` which prunes to exactly one monthly partition
 * (typically the most recent one).
 *
 * Child tables (events / queries / ai_calls) are currently filtered by
 * `turn_id` only. A post-MVP optimization is documented inline below: use
 * the turn row's actual `finished_at` as the upper bound of a `recorded_at`
 * range to prune child partitions as well. We intentionally do NOT hardcode
 * a 10-minute window here because legitimately long turns would silently
 * drop events.
 *
 * Read-only, un-instrumented admin client (Pitfall 1 safe — see file header).
 */
export async function getTurnDetail(
  turnId: string,
  startedAt: string,
): Promise<TurnDetail> {
  const supabase = createRawAdminClient()

  const turnStart = new Date(startedAt)
  const turnRangeStart = new Date(turnStart.getTime() - 60_000).toISOString()
  const turnRangeEnd = new Date(turnStart.getTime() + 60_000).toISOString()

  const [turnRes, eventsRes, queriesRes, aiCallsRes] = await Promise.all([
    supabase
      .from('agent_observability_turns')
      .select('*')
      .eq('id', turnId)
      .gte('started_at', turnRangeStart)
      .lte('started_at', turnRangeEnd)
      .single(),
    supabase
      .from('agent_observability_events')
      .select('*')
      .eq('turn_id', turnId)
      .order('sequence', { ascending: true }),
    supabase
      .from('agent_observability_queries')
      .select('*')
      .eq('turn_id', turnId)
      .order('sequence', { ascending: true }),
    supabase
      .from('agent_observability_ai_calls')
      .select('*')
      .eq('turn_id', turnId)
      .order('sequence', { ascending: true }),
  ])

  // POST-MVP OPTIMIZATION: partition pruning on child tables.
  // Once perf on events/queries/ai_calls becomes a concern, use the turn row's
  // `finished_at` (or `started_at + duration_ms`) as the upper bound of a
  // `recorded_at` window and add `.gte('recorded_at', turnRangeStart).lte(
  // 'recorded_at', finishedAt)` to each child query. This narrows the scan to
  // the actual turn lifetime (typically <30s) instead of the full month.
  // We keep it unfiltered today because turn_id alone is selective enough
  // during development and we avoid the risk of dropping long-turn data.

  if (turnRes.error) throw turnRes.error
  if (eventsRes.error) throw eventsRes.error
  if (queriesRes.error) throw queriesRes.error
  if (aiCallsRes.error) throw aiCallsRes.error

  const aiCallRows = (aiCallsRes.data ?? []) as unknown as Array<
    Record<string, unknown>
  >
  const eventRows = (eventsRes.data ?? []) as unknown as Array<
    Record<string, unknown>
  >
  const queryRows = (queriesRes.data ?? []) as unknown as Array<
    Record<string, unknown>
  >

  // Fetch referenced prompt versions (deduped set from the ai calls)
  const promptVersionIds = Array.from(
    new Set(aiCallRows.map((a) => a.prompt_version_id as string)),
  )
  const promptsRes =
    promptVersionIds.length > 0
      ? await supabase
          .from('agent_prompt_versions')
          .select('*')
          .in('id', promptVersionIds)
      : { data: [] as Array<Record<string, unknown>>, error: null as null }
  if (promptsRes.error) throw promptsRes.error

  const promptVersionsById: Record<string, TurnDetailPromptVersion> = {}
  for (const p of (promptsRes.data ?? []) as unknown as Array<
    Record<string, unknown>
  >) {
    const id = p.id as string
    promptVersionsById[id] = {
      id,
      promptHash: p.prompt_hash as string,
      systemPrompt: p.system_prompt as string,
      model: p.model as string,
      temperature: (p.temperature as number | null) ?? null,
      maxTokens: (p.max_tokens as number | null) ?? null,
      provider: (p.provider as string) ?? 'anthropic',
      firstSeenAt: p.first_seen_at as string,
    }
  }

  const t = turnRes.data as unknown as Record<string, unknown>
  const errorPayload = (t.error as TurnDetailError | null) ?? null

  return {
    turn: {
      id: t.id as string,
      conversationId: t.conversation_id as string,
      workspaceId: t.workspace_id as string,
      agentId: t.agent_id as string,
      startedAt: t.started_at as string,
      finishedAt: (t.finished_at as string | null) ?? null,
      durationMs: (t.duration_ms as number | null) ?? null,
      eventCount: (t.event_count as number) ?? 0,
      queryCount: (t.query_count as number) ?? 0,
      aiCallCount: (t.ai_call_count as number) ?? 0,
      totalTokens: (t.total_tokens as number) ?? 0,
      totalCostUsd: Number(t.total_cost_usd ?? 0),
      hasError: errorPayload !== null,
      triggerKind: (t.trigger_kind as string | null) ?? null,
      currentMode: (t.current_mode as string | null) ?? null,
      newMode: (t.new_mode as string | null) ?? null,
      error: errorPayload,
    },
    events: eventRows.map((e) => ({
      id: e.id as string,
      sequence: e.sequence as number,
      recordedAt: e.recorded_at as string,
      category: e.category as string,
      label: (e.label as string | null) ?? null,
      payload: e.payload,
      durationMs: (e.duration_ms as number | null) ?? null,
    })),
    queries: queryRows.map((q) => ({
      id: q.id as string,
      sequence: q.sequence as number,
      recordedAt: q.recorded_at as string,
      tableName: q.table_name as string,
      operation: q.operation as string,
      filters: (q.filters as Record<string, string> | null) ?? null,
      columns: (q.columns as string | null) ?? null,
      requestBody: q.request_body,
      durationMs: (q.duration_ms as number) ?? 0,
      statusCode: (q.status_code as number) ?? 0,
      rowCount: (q.row_count as number | null) ?? null,
      error: (q.error as string | null) ?? null,
    })),
    aiCalls: aiCallRows.map((a) => ({
      id: a.id as string,
      sequence: a.sequence as number,
      recordedAt: a.recorded_at as string,
      promptVersionId: a.prompt_version_id as string,
      purpose: a.purpose as string,
      model: a.model as string,
      messages: a.messages,
      responseContent: a.response_content,
      inputTokens: (a.input_tokens as number) ?? 0,
      outputTokens: (a.output_tokens as number) ?? 0,
      cacheCreationInputTokens: (a.cache_creation_input_tokens as number) ?? 0,
      cacheReadInputTokens: (a.cache_read_input_tokens as number) ?? 0,
      totalTokens: (a.total_tokens as number) ?? 0,
      costUsd: Number(a.cost_usd ?? 0),
      durationMs: (a.duration_ms as number) ?? 0,
      statusCode: (a.status_code as number) ?? 0,
      error: (a.error as string | null) ?? null,
    })),
    promptVersionsById,
  }
}
