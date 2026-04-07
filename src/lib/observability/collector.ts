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

/**
 * Stub for prompt hashing. Plan 04 will replace this with the real
 * sha256 hash from `./prompt-version`. Until then we return an empty
 * string so the collector compiles and tests pass.
 *
 * TODO(plan-04): import { hashPrompt } from './prompt-version'
 */
function hashPromptStub(_systemPrompt: string): string {
  return ''
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

      this.aiCalls.push({
        sequence: this.sequenceCounter++,
        recordedAt: new Date(),
        purpose: input.purpose,
        promptHash: hashPromptStub(input.systemPrompt),
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
  // Persistence — implemented in Plan 07.
  // -------------------------------------------------------------------------

  // TODO(plan-07): persist events / queries / aiCalls / error in a single
  // batch INSERT against the observability schema (migration in Plan 06).
  async flush(): Promise<void> {
    // implemented in Plan 07
  }
}
