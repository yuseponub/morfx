/**
 * ObservabilityCollector — in-memory record bag for a single agent turn.
 *
 * The collector is created at the start of a turn (by the entry point
 * in Plan 05), put into the AsyncLocalStorage context via
 * `runWithCollector`, and receives synchronous `record*()` calls from
 * downstream code (pipeline, fetch wrappers in Plans 03/04). At the
 * end of the turn `flush()` (Plan 07) persists the bag to Supabase
 * in a single batch INSERT.
 *
 * Hard rules:
 *
 *   1. record methods are SYNCHRONOUS — they only push to in-memory
 *      arrays. NO awaits, NO I/O. This is critical for latency: we
 *      add ~0ms per recorded event on the hot path.
 *
 *   2. The collector NEVER throws from a record call. Any internal
 *      bug here would corrupt the production agent path, which is
 *      unacceptable (REGLA 6). Defensive try/catch wraps every push.
 *
 *   3. `sequence` is monotonic per turn so the UI can render a single
 *      ordered timeline mixing events / queries / ai calls.
 *
 *   4. `error` captures only the first fatal error of the turn. Once
 *      set, subsequent recordError calls are ignored to preserve the
 *      original cause.
 */

import { estimateCost } from './pricing'
import { hashPrompt } from './prompt-version'
import type {
  EventCategory,
  ObservabilityAiCall,
  ObservabilityCollectorInit,
  ObservabilityEvent,
  ObservabilityQuery,
} from './types'

/** Parsed shape returned by the postgrest URL parser (Plan 03). */
export interface ParsedQuery {
  tableName: string
  operation: ObservabilityQuery['operation']
  filters: Record<string, string>
  columns: string[] | null
  requestBody: unknown
}

export interface RecordAiCallInput {
  purpose: string
  systemPrompt: string
  model: string
  temperature?: number
  maxTokens?: number
  messages: unknown
  responseContent?: unknown
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  durationMs: number
  statusCode: number
  error?: string
}

export interface RecordedErrorInfo {
  name: string
  message: string
  stack?: string
}

export class ObservabilityCollector {
  // Identity / context (set in constructor, immutable thereafter except newMode)
  readonly conversationId: string
  readonly workspaceId: string
  readonly agentId: ObservabilityCollectorInit['agentId']
  readonly turnStartedAt: Date
  readonly triggerMessageId?: string
  readonly triggerKind: ObservabilityCollectorInit['triggerKind']
  readonly currentMode?: string
  newMode?: string

  // Record bags
  readonly events: ObservabilityEvent[] = []
  readonly queries: ObservabilityQuery[] = []
  readonly aiCalls: ObservabilityAiCall[] = []

  // First fatal error of the turn (if any)
  error: RecordedErrorInfo | null = null

  // Monotonic sequence for global timeline order
  private sequenceCounter = 0

  constructor(init: ObservabilityCollectorInit) {
    this.conversationId = init.conversationId
    this.workspaceId = init.workspaceId
    this.agentId = init.agentId
    this.turnStartedAt = init.turnStartedAt
    this.triggerMessageId = init.triggerMessageId
    this.triggerKind = init.triggerKind
    this.currentMode = init.currentMode
    this.newMode = init.newMode
  }

  // -------------------------------------------------------------------------
  // Synchronous record methods — push only, no I/O.
  // -------------------------------------------------------------------------

  recordEvent(
    category: EventCategory,
    label: string | undefined,
    payload: Record<string, unknown>,
    durationMs?: number,
  ): void {
    try {
      this.events.push({
        sequence: this.sequenceCounter++,
        recordedAt: new Date(),
        category,
        label,
        payload,
        durationMs,
      })
    } catch {
      // Defensive: never throw from a record call (REGLA 6).
    }
  }

  recordQuery(
    parsed: ParsedQuery,
    durationMs: number,
    statusCode: number,
    rowCount?: number,
    error?: string,
  ): void {
    try {
      this.queries.push({
        sequence: this.sequenceCounter++,
        recordedAt: new Date(),
        tableName: parsed.tableName,
        operation: parsed.operation,
        filters: parsed.filters,
        columns: parsed.columns,
        requestBody: parsed.requestBody,
        durationMs,
        statusCode,
        rowCount,
        error,
      })
    } catch {
      // Defensive: never throw from a record call.
    }
  }

  recordAiCall(input: RecordAiCallInput): void {
    try {
      const cacheCreationInputTokens = input.cacheCreationInputTokens ?? 0
      const cacheReadInputTokens = input.cacheReadInputTokens ?? 0
      const costUsd = estimateCost({
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
      })

      const promptHash = hashPrompt(input.systemPrompt, input.model, {
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      })

      this.aiCalls.push({
        sequence: this.sequenceCounter++,
        recordedAt: new Date(),
        purpose: input.purpose,
        promptHash,
        systemPrompt: input.systemPrompt,
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        provider: 'anthropic',
        messages: input.messages,
        responseContent: input.responseContent,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        costUsd,
        durationMs: input.durationMs,
        statusCode: input.statusCode,
        error: input.error,
      })
    } catch {
      // Defensive: never throw from a record call.
    }
  }

  /**
   * Merge another collector's captured data into this one. Used to work
   * around Inngest's lambda-boundary memoization: a step.run callback
   * creates a local collector, returns its raw arrays in the step output,
   * and the outer handler (running in a later replay lambda with a fresh
   * collector) merges them here before flush.
   *
   * After merging, all three arrays are re-sorted by recordedAt and
   * assigned monotonic sequence numbers so the UI timeline renders
   * cleanly. Within the same millisecond, we fall back to the original
   * sequence for stable ordering.
   */
  mergeFrom(other: {
    events: ObservabilityEvent[]
    queries: ObservabilityQuery[]
    aiCalls: ObservabilityAiCall[]
  }): void {
    try {
      for (const e of other.events) this.events.push(e)
      for (const q of other.queries) this.queries.push(q)
      for (const a of other.aiCalls) this.aiCalls.push(a)

      // Re-normalize sequence by recordedAt across all three arrays
      // combined, so the timeline is monotonic. Stable within the same
      // millisecond by falling back to original sequence.
      type Anchored = {
        recordedAt: Date
        sequence: number
        bucket: 'e' | 'q' | 'a'
        idx: number
      }
      const anchors: Anchored[] = []
      this.events.forEach((e, idx) =>
        anchors.push({ recordedAt: e.recordedAt, sequence: e.sequence, bucket: 'e', idx }),
      )
      this.queries.forEach((q, idx) =>
        anchors.push({ recordedAt: q.recordedAt, sequence: q.sequence, bucket: 'q', idx }),
      )
      this.aiCalls.forEach((a, idx) =>
        anchors.push({ recordedAt: a.recordedAt, sequence: a.sequence, bucket: 'a', idx }),
      )

      anchors.sort((x, y) => {
        const dt = x.recordedAt.getTime() - y.recordedAt.getTime()
        if (dt !== 0) return dt
        return x.sequence - y.sequence
      })

      let seq = 0
      for (const anchor of anchors) {
        const target =
          anchor.bucket === 'e'
            ? this.events[anchor.idx]
            : anchor.bucket === 'q'
              ? this.queries[anchor.idx]
              : this.aiCalls[anchor.idx]
        target.sequence = seq++
      }
      // Keep the internal counter ahead of anything we might still
      // append later in the same iteration (e.g. turn_completed event
      // fired after the merge).
      this.sequenceCounter = seq
    } catch {
      // Defensive: never throw from observability bookkeeping (REGLA 6).
    }
  }

  recordError(errorInfo: RecordedErrorInfo): void {
    // Only the first fatal error wins — preserves the original cause.
    if (this.error !== null) return
    try {
      this.error = errorInfo
    } catch {
      // Defensive: never throw from a record call.
    }
  }

  // -------------------------------------------------------------------------
  // Aggregates (cheap getters used by the UI / flush metadata)
  // -------------------------------------------------------------------------

  get totalTokens(): number {
    let total = 0
    for (const call of this.aiCalls) {
      total +=
        call.inputTokens +
        call.outputTokens +
        call.cacheCreationInputTokens +
        call.cacheReadInputTokens
    }
    return total
  }

  get totalCostUsd(): number {
    let total = 0
    for (const call of this.aiCalls) total += call.costUsd
    return total
  }

  // -------------------------------------------------------------------------
  // Persistence (Plan 07)
  // -------------------------------------------------------------------------

  /**
   * Persist the in-memory contents of this collector to the 5
   * observability tables in a single batch (1 turn row + chunked
   * children, with prompt-version dedup).
   *
   * The implementation lives in `./flush` and is loaded via a dynamic
   * import so the cycle `collector -> flush -> (raw admin client) ->
   * supabase types` cannot become a circular module load even if a
   * future plan adds more imports to `flush.ts`. This call also keeps
   * the static dependency graph of `collector.ts` minimal: importers
   * who only call `recordEvent` / `recordQuery` / `recordAiCall` do
   * not pay the cost of pulling in the supabase admin module.
   *
   * NEVER throws (REGLA 6): see `flushCollector` for the swallow-on-
   * error rationale.
   */
  async flush(): Promise<void> {
    const { flushCollector } = await import('./flush')
    return flushCollector(this)
  }
}
