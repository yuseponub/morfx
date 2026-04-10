/**
 * ObservabilityCollector flush — single batch persistence per turn.
 *
 * Phase 42.1 Plan 07. Implements the persistence half of the
 * ObservabilityCollector. Lives in its own file (instead of inside
 * collector.ts) for two reasons:
 *
 *   1. Anti-recursion (Pitfall 1 of 42.1-RESEARCH.md): the flush MUST
 *      use `createRawAdminClient()` so the writes it issues against the
 *      observability tables do NOT recurse through the instrumented
 *      Supabase fetch wrapper. Keeping the import local to this file
 *      makes the boundary explicit -- the rest of the observability
 *      module never imports `createRawAdminClient`.
 *
 *   2. Cycle break: `collector.ts` is imported transitively by
 *      `prompt-version.ts` and the supabase admin module. Wiring flush
 *      via a dynamic `import('./flush')` from `collector.flush()`
 *      breaks any potential cycle while keeping the call site
 *      ergonomic (`await collector.flush()`).
 *
 * Persistence shape:
 *
 *   1. Dedup `aiCalls` by `promptHash` and upsert via
 *      `resolvePromptVersions()` -> Map<hash, prompt_version_id>.
 *   2. Insert exactly 1 row into `agent_observability_turns`.
 *   3. Three parallel chunked inserts (chunk size 100, Pitfall 6) into
 *      `agent_observability_events`, `agent_observability_queries`,
 *      `agent_observability_ai_calls`.
 *
 * Failure mode (REGLA 6):
 *
 *   The flush NEVER throws back to the Inngest step. If any insert
 *   fails the error is logged via pino and the function returns
 *   normally. Failing observability MUST NOT break a production turn,
 *   which is the entire point of the wave-3 / wave-4 plumbing being
 *   feature-flagged and side-effect-free with the flag OFF.
 */

import { randomUUID } from 'node:crypto'

import { createModuleLogger } from '@/lib/audit/logger'
import { createRawAdminClient } from '@/lib/supabase/admin'

import type { ObservabilityCollector } from './collector'
import { resolvePromptVersions, type PromptVersionInput } from './prompt-version'

const logger = createModuleLogger('observability-flush')

/** Postgrest-friendly chunk size for batch inserts (Pitfall 6). */
const CHUNK_SIZE = 100

/** Soft-cap latency budget for the flush, used only as a warning trigger. */
const FLUSH_DURATION_WARN_MS = 200

/**
 * Persist the in-memory contents of an ObservabilityCollector to the
 * 5 observability tables. Safe to call from inside `step.run` (Inngest):
 * never throws, always returns.
 */
export async function flushCollector(collector: ObservabilityCollector): Promise<void> {
  const startedAt = performance.now()

  // Empty turn fast-path. Wave-2 instruments every entry point so an
  // empty bag means the turn was a no-op (e.g. ignored sticker, gate
  // dropped before any record call). We still emit a debug log so the
  // monitoring dashboard can count "skipped" turns.
  if (
    collector.events.length === 0 &&
    collector.queries.length === 0 &&
    collector.aiCalls.length === 0
  ) {
    logger.debug(
      { conversationId: collector.conversationId, agentId: collector.agentId },
      'observability flush skipped — empty turn',
    )
    return
  }

  // CRITICAL: non-instrumented client. Using `createAdminClient()` here
  // would re-enter the fetch wrapper, which would re-enter the active
  // collector via ALS, which would push more queries onto the bag mid-
  // flush -> infinite recursion / stack overflow. See Pitfall 1.
  const supabase = createRawAdminClient()
  const turnId = randomUUID()

  try {
    // -----------------------------------------------------------------
    // 1. Dedup prompt versions
    // -----------------------------------------------------------------
    // Build the dedup map ONCE per turn so a turn that calls the same
    // prompt N times only emits a single upsert row.
    const promptMeta = new Map<string, PromptVersionInput>()
    for (const call of collector.aiCalls) {
      if (!promptMeta.has(call.promptHash)) {
        promptMeta.set(call.promptHash, {
          systemPrompt: call.systemPrompt,
          model: call.model,
          temperature: call.temperature,
          maxTokens: call.maxTokens,
          provider: call.provider,
        })
      }
    }
    const promptVersionIds = await resolvePromptVersions(supabase, promptMeta)

    // -----------------------------------------------------------------
    // 2. Insert turn row
    // -----------------------------------------------------------------
    const finishedAt = new Date()
    const { error: turnError } = await supabase
      .from('agent_observability_turns')
      .insert({
        id: turnId,
        conversation_id: collector.conversationId,
        workspace_id: collector.workspaceId,
        agent_id: collector.agentId,
        // ObservabilityCollectorInit does not currently expose
        // `turnNumber`; the schema column is nullable so we leave it
        // as NULL until a future plan threads it through.
        turn_number: null,
        started_at: collector.turnStartedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        event_count: collector.events.length,
        query_count: collector.queries.length,
        ai_call_count: collector.aiCalls.length,
        total_tokens: collector.totalTokens,
        total_cost_usd: collector.totalCostUsd,
        error: collector.error,
        trigger_message_id: collector.triggerMessageId ?? null,
        trigger_kind: collector.triggerKind,
        current_mode: collector.currentMode ?? null,
        new_mode: collector.newMode ?? null,
      })

    if (turnError) throw turnError

    // -----------------------------------------------------------------
    // 3. Children inserts in parallel (with internal chunking)
    // -----------------------------------------------------------------
    const eventRows = collector.events.map((e) => ({
      turn_id: turnId,
      recorded_at: e.recordedAt.toISOString(),
      sequence: e.sequence,
      category: e.category,
      label: e.label ?? null,
      payload: e.payload,
      duration_ms: e.durationMs != null ? Math.round(e.durationMs) : null,
    }))

    const queryRows = collector.queries.map((q) => ({
      turn_id: turnId,
      recorded_at: q.recordedAt.toISOString(),
      sequence: q.sequence,
      table_name: q.tableName,
      operation: q.operation,
      filters: q.filters,
      // Schema column is TEXT (not array) — serialize the parsed
      // ?select=... so the UI can re-parse on read if needed.
      columns: q.columns === null ? null : JSON.stringify(q.columns),
      request_body: q.requestBody as Record<string, unknown> | null,
      duration_ms: Math.round(q.durationMs),
      status_code: q.statusCode,
      row_count: q.rowCount ?? null,
      error: q.error ?? null,
    }))

    const aiCallRows = collector.aiCalls.map((a) => ({
      turn_id: turnId,
      recorded_at: a.recordedAt.toISOString(),
      sequence: a.sequence,
      prompt_version_id: promptVersionIds.get(a.promptHash) ?? null,
      purpose: a.purpose,
      model: a.model,
      messages: a.messages,
      response_content: a.responseContent ?? null,
      input_tokens: a.inputTokens,
      output_tokens: a.outputTokens,
      cache_creation_input_tokens: a.cacheCreationInputTokens,
      cache_read_input_tokens: a.cacheReadInputTokens,
      cost_usd: a.costUsd,
      duration_ms: Math.round(a.durationMs),
      status_code: a.statusCode,
      error: a.error ?? null,
    }))

    await Promise.all([
      insertChunked(supabase, 'agent_observability_events', eventRows),
      insertChunked(supabase, 'agent_observability_queries', queryRows),
      insertChunked(supabase, 'agent_observability_ai_calls', aiCallRows),
    ])

    const durationMs = performance.now() - startedAt
    logger.info(
      {
        turnId,
        conversationId: collector.conversationId,
        workspaceId: collector.workspaceId,
        agentId: collector.agentId,
        events: collector.events.length,
        queries: collector.queries.length,
        aiCalls: collector.aiCalls.length,
        promptVersions: promptMeta.size,
        durationMs,
      },
      'observability flush complete',
    )

    // Soft-cap warnings. None of these are errors -- they signal that
    // the per-turn budget assumptions from the research-phase no longer
    // hold and we should investigate (e.g. a runaway loop in the
    // pipeline pushing thousands of events).
    if (
      collector.events.length > CHUNK_SIZE ||
      collector.queries.length > CHUNK_SIZE ||
      collector.aiCalls.length > CHUNK_SIZE
    ) {
      logger.warn(
        {
          turnId,
          conversationId: collector.conversationId,
          events: collector.events.length,
          queries: collector.queries.length,
          aiCalls: collector.aiCalls.length,
        },
        'turn exceeded soft cap — chunked inserts',
      )
    }
    if (durationMs > FLUSH_DURATION_WARN_MS) {
      logger.warn(
        { turnId, conversationId: collector.conversationId, durationMs },
        'observability flush exceeded latency budget (>200ms)',
      )
    }
  } catch (err) {
    // Swallow-on-error (REGLA 6): the production turn already
    // succeeded -- we will not let observability persistence break it.
    // The lost data is logged in full so a future operator can
    // diagnose the failure from the runtime logs.
    logger.error(
      {
        err,
        turnId,
        conversationId: collector.conversationId,
        workspaceId: collector.workspaceId,
        agentId: collector.agentId,
        events: collector.events.length,
        queries: collector.queries.length,
        aiCalls: collector.aiCalls.length,
      },
      'observability flush failed — events dropped',
    )
    return
  }
}

/**
 * Insert `rows` in chunks of `CHUNK_SIZE`. Postgrest will reject very
 * large payloads (~1MB by default) and a single 500-row insert can
 * easily blow that budget when each row carries a full system prompt
 * or a fat JSONB payload. Chunking keeps every individual round-trip
 * predictable.
 *
 * NOTE: chunks run sequentially within a single table so a partial
 * failure inside the second chunk does not silently leave the first
 * chunk persisted -- on error we throw, the parent catches, swallows,
 * and logs. The whole turn is then dropped (atomic-ish: at most ONE
 * chunk and the parent turn row will already be in the DB). A future
 * plan may add a deferred-cleanup or transactional wrapper if this
 * proves insufficient in practice.
 */
async function insertChunked<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createRawAdminClient>,
  table: string,
  rows: T[],
): Promise<void> {
  if (rows.length === 0) return
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) throw error
  }
}
