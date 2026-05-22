/**
 * Sub-Loop Debug Payload Types
 *
 * Standalone: v4-subloop-debug-view / Plan 01.
 *
 * Self-contained types for the sub-loop debug surface (D-02). Lives in a
 * standalone file (NOT `types.ts`, NOT `output-schema.ts`) to avoid circular
 * imports between agents/somnio-v4/types.ts and sandbox/types.ts (RESEARCH
 * Pitfall 9). Both sides import from here — flat dependency.
 *
 * NO runtime exports. Types only.
 */

import type { LoopOutcome, SubLoopReason } from './output-schema'

/**
 * Snapshot of a single AI SDK v6 tool call OR tool result.
 *
 * AI SDK v6 (verified in node_modules/ai/dist/index.d.ts + working analog in
 * src/lib/agents/crm-reader/index.ts:59-68): tool calls expose `input` (NOT
 * `args`) and tool results expose `output` (NOT `result`). The existing
 * diagnostic peek in sub-loop/index.ts uses the correct v6 names since iter 7c.
 *
 * Truncation: `outputPreview` is computed at emission site (inside runSubLoop's
 * onDebug callback) — capped at 500 chars per D-02. The raw `output: unknown`
 * is retained for type fidelity; UI prefers `outputPreview` for display.
 */
export interface SubLoopToolCallSnapshot {
  toolName: string
  /** Tool's inputSchema-validated input (varies by tool — kb_search uses {query}, post Iter 7i) */
  input: unknown
  /** Tool's execute() return value (varies by tool — kb_search returns KbHit[]) */
  output: unknown
  /** Stringified output truncated to 500 chars for display — populated at emission site (D-02). */
  outputPreview?: string
}

/**
 * Snapshot of a single KB hit returned by kb_search tool — extracted from
 * `toolResults[?.toolName === 'kb_search'].output` when shape check passes.
 *
 * D-06: if parse fails OR kb_search was not invoked, the parent
 * SubLoopDebugPayload.kbHits stays `undefined` (silent omission).
 */
export interface SubLoopKbHitSnapshot {
  topic: string
  /** 0..1 (kb-search-tool.ts:88 — `1 - distance` from match_knowledge_base RPC). */
  similarity: number
  /** First 200 chars of canonicalResponse for compact display in the panel. */
  contentPreview: string
  /** Whether this KB hit carries NUNCA-decir rules (length > 0). */
  hasNuncaDecir: boolean
}

/**
 * Runtime-only payload (D-07) emitted by `runSubLoop` via optional onDebug
 * callback (D-03). Lives in memory per turn; rendered by the Sub-Loop tab
 * (subloop-tab.tsx) from `DebugTurn.subLoopDebug`. ZERO persistence — never
 * written to `agent_observability_turns`.
 *
 * Absence of this payload on a turn = sub-loop did not fire (UI shows empty
 * state or per-turn explainer banner). Presence ⇒ `fired === true`.
 */
export interface SubLoopDebugPayload {
  /** Always true when payload emitted; absence of payload on DebugTurn = not fired. */
  fired: true
  /** Trigger reason (D-02 4-value union). */
  reason: SubLoopReason
  /** AI SDK FinishReason: 'stop' | 'length' | 'tool-calls' | 'error' | 'other' | 'unknown'. */
  finishReason?: string
  /** result.steps.length (AI SDK v6). */
  stepCount?: number
  /** All tool calls across all steps (flat list, AI SDK v6 `tc.input`). */
  toolCalls: SubLoopToolCallSnapshot[]
  /** All tool results across all steps (flat list, AI SDK v6 `tr.output`). Kept separate from toolCalls per D-02. */
  toolResults: SubLoopToolCallSnapshot[]
  /** kb_search hits extracted from toolResults — `undefined` when kb_search not invoked OR shape mismatch (D-06). */
  kbHits?: SubLoopKbHitSnapshot[]
  /** Final LoopOutcome returned by runSubLoop (may be escalated to no_match). */
  outcome?: LoopOutcome
  /** Violation message from validateLoopOutcomeInvariants (sub-loop/output-schema.ts) when invariant rejected. */
  invariantViolation?: string
  /** Violation message from checkNuncaDecir (sub-loop/nunca-decir-check.ts) when nunca-decir rule fired. */
  nuncaDecirViolation?: string
  /** performance.now() delta from t0 (start of runSubLoop body). */
  latencyMs?: number
  /** Error message captured in runSubLoop's catch block before throw (Pitfall 7 option a). */
  errorMessage?: string
  /**
   * Plan 03 RAG-generative: snapshot del Call 1 (tooling). Presente para
   * low_confidence/razonamiento_libre. Absent para crm_mutation/cas_reject (path legacy).
   */
  toolingCall?: {
    stepCount: number
    finishReason: string
    output: import('./tooling-call').ToolingOutput
    latencyMs?: number
  }
  /**
   * Plan 03 RAG-generative: snapshot del Call 2 (generation Gemini Flash). Solo presente
   * cuando tooling success y se procedió a Call 2. Absent si tooling decidió handoff inmediato.
   */
  generationCall?: {
    finishReason: string
    output: import('./generation-call').GenerationOutput
    latencyMs?: number
  }
  /**
   * 2026-05-22: snapshot del Call 3 (compliance verifier Gemini Flash). Presente cuando
   * tooling success y generación produjo responseText (incluso handoff por threshold del
   * generator). Absent cuando tooling decidió handoff inmediato (no hubo respuesta que
   * verificar). Surface las 2 dimensiones independientes (nunca-decir + escalation).
   */
  complianceCheck?: {
    output: import('./compliance-check').ComplianceCheckOutput
    latencyMs?: number
  }
}

// Re-export LoopOutcome + SubLoopReason for downstream consumers (sandbox/types.ts,
// subloop-tab.tsx) so they don't need to import from output-schema.ts (LOCKED).
export type { LoopOutcome, SubLoopReason }
