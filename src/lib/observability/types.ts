/**
 * Public type definitions for the production observability module.
 *
 * Decision A (42.1-CONTEXT.md): These types are intentionally PARALLEL
 * to the sandbox Debug Panel types. They MUST NOT import from
 * `src/lib/sandbox/*`. The production system is free to evolve more
 * deeply than the sandbox without backward-compat coupling.
 *
 * Future migration of the sandbox to this schema is out of scope for
 * Phase 42.1.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Agents covered by observability.
 *
 * - Somnio V3 / GoDentist / Somnio Recompra / Somnio V2 are conversational
 *   bots introduced in Phase 42.1 (Decision #1).
 * - 'crm-reader' and 'crm-writer' added in Phase 44 (API-only tool providers,
 *   no conversation). They emit observability turns per API call with
 *   triggerKind='api' and a synthetic conversationId.
 * - 'somnio-recompra-v1' added in standalone `agent-forensics-panel` Plan 01
 *   (D-10, D-12). The legacy bucket `'somnio-recompra'` is preserved for
 *   backwards compatibility with rows already flushed via
 *   `resolveAgentIdForWorkspace()`. New routing captures from
 *   webhook-processor.ts use the explicit `-v1` suffix (matches the agent
 *   registry id documented in `.claude/rules/agent-scope.md` §Somnio
 *   Recompra Agent).
 */
export type AgentId =
  | 'somnio-v3'
  | 'godentist'
  | 'somnio-recompra'
  | 'somnio-recompra-v1'
  | 'somnio-v2'
  | 'crm-reader'
  | 'crm-writer'

/** What initiated a turn. */
export type TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api'

// ---------------------------------------------------------------------------
// Event taxonomy
// ---------------------------------------------------------------------------

/**
 * High-level category for a recorded event. The list is exhaustive for
 * the mechanisms enumerated in 42.1-CONTEXT.md "Scope Tentativo de
 * Captura". New categories may be added in later plans, but existing
 * ones must remain stable for downstream UI filters.
 */
export type EventCategory =
  | 'classifier'
  | 'intent'
  | 'mode_transition'
  | 'template_selection'
  | 'no_repetition'
  | 'guard'
  | 'block_composition'
  | 'pre_send_check'
  | 'timer_signal'
  | 'handoff'
  | 'tool_call'
  | 'session_lifecycle'
  | 'error'
  | 'media_gate'
  | 'ofi_inter'
  | 'retake'
  | 'char_delay'
  | 'disambiguation'
  | 'silence_timer'
  | 'interruption_handling'
  | 'pending_pool'
  | 'pipeline_decision'
  | 'comprehension'

// ---------------------------------------------------------------------------
// Records appended to the in-memory collector
// ---------------------------------------------------------------------------

/**
 * A pipeline event recorded during a turn (classifier output, mode
 * transition, template selection, guard hit, etc.). The `payload` is
 * an opaque structured object specific to the category — UI knows how
 * to render each.
 */
export interface ObservabilityEvent {
  /** Monotonic per-turn sequence number for global timeline order. */
  sequence: number
  /** When the event was appended (collector clock). */
  recordedAt: Date
  category: EventCategory
  /** Optional short human label, e.g. "comprehension.intent_detected". */
  label?: string
  /** Category-specific structured data. */
  payload: Record<string, unknown>
  /** Wall-clock duration in milliseconds (if the step was timed). */
  durationMs?: number
}

/**
 * A SQL query captured by the supabase fetch wrapper (Plan 03).
 * Fields mirror what we can extract from a Postgrest URL + response.
 */
export interface ObservabilityQuery {
  sequence: number
  recordedAt: Date
  /** Postgrest table name (`/rest/v1/{tableName}`). */
  tableName: string
  /** HTTP verb mapped to logical operation. */
  operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc' | 'unknown'
  /** Parsed query-string filters (`id=eq.1` -> `{ id: 'eq.1' }`). */
  filters: Record<string, string>
  /** Columns from `?select=...` if present. */
  columns: string[] | null
  /** Body for INSERT/UPDATE/UPSERT/RPC. */
  requestBody: unknown
  durationMs: number
  statusCode: number
  /** Row count if Postgrest returned `Content-Range`. */
  rowCount?: number
  /** Error message if statusCode >= 400. */
  error?: string
}

/**
 * An IA call captured by the Anthropic fetch wrapper (Plan 04).
 *
 * `promptHash` is computed from the system prompt content (sha256) and
 * is used to deduplicate prompts across turns into the
 * `agent_prompt_versions` table (Decision #7). Plan 04 implements the
 * hash function in `./prompt-version`. Until then the collector passes
 * an empty string.
 */
export interface ObservabilityAiCall {
  sequence: number
  recordedAt: Date
  /** Logical purpose: 'comprehension', 'minifrase', 'paraphrase', etc. */
  purpose: string
  /** sha256 of the system prompt content (Plan 04). */
  promptHash: string
  /** Full system prompt text (deduped via promptHash in storage). */
  systemPrompt: string
  /** Model id, e.g. `claude-haiku-4-5-20251001`. */
  model: string
  temperature?: number
  maxTokens?: number
  /** Provider tag, currently always 'anthropic'. */
  provider: 'anthropic'
  /** Conversation turns sent to the model. */
  messages: unknown
  /** Raw response content (text or tool_use blocks). */
  responseContent?: unknown
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  /** Estimated cost in USD via `pricing.estimateCost()`. */
  costUsd: number
  durationMs: number
  statusCode: number
  error?: string
}

// ---------------------------------------------------------------------------
// Collector init
// ---------------------------------------------------------------------------

/**
 * Required context to instantiate an ObservabilityCollector at the
 * start of a turn. Provided by the entry point (the Inngest agent
 * processor function in Plan 05).
 */
export interface ObservabilityCollectorInit {
  conversationId: string
  workspaceId: string
  agentId: AgentId
  turnStartedAt: Date
  /** WhatsApp message id that triggered this turn (if any). */
  triggerMessageId?: string
  triggerKind: TriggerKind
  /** Mode/state at turn start (e.g. 'collecting_data'). */
  currentMode?: string
  /** Mode/state at turn end (filled by the pipeline). */
  newMode?: string
  /**
   * Seed value for the `respondingAgentId` collector field (D-10 standalone
   * `agent-forensics-panel` Plan 01). Optional; defaults to null and is
   * populated mid-turn via `setRespondingAgentId()` from the routing
   * branches of webhook-processor.ts. Passed explicitly when cloning a
   * collector into a step.run inner scope so the step-level collector
   * inherits any value the outer collector already captured (e.g. merged
   * from a previous step's __obs payload).
   */
  respondingAgentId?: AgentId | null
}
