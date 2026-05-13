# Phase Research — v4-subloop-debug-view

**Researched:** 2026-05-13
**Domain:** Sandbox UI debug surface — sub-loop telemetry pass-through
**Confidence:** HIGH

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 .. D-10)

| ID | Decision |
|---|---|
| **D-01** | Skip `/gsd-discuss-phase`. Standalone name: `v4-subloop-debug-view`. Research → Plan → Execute. |
| **D-02** | Data shape: add optional `subLoopDebug` field to `V4AgentOutput` (`src/lib/agents/somnio-v4/types.ts`) and `DebugTurn` (`src/lib/sandbox/types.ts`). Fields: `fired`, `reason`, `finishReason?`, `stepCount?`, `toolCalls[]`, `toolResults[]` (result truncated 500 chars), `kbHits?[]`, `outcome?`, `invariantViolation?`, `nuncaDecirViolation?`, `latencyMs?`, `errorMessage?`. |
| **D-03** | Propagation: do NOT change `runSubLoop` return type (stays `Promise<LoopOutcome>`). Accept optional arg `onDebug?: (debug: SubLoopDebugPayload) => void` that `runSubLoop` invokes before returning. The caller stores in local variable and places on `V4AgentOutput.subLoopDebug`. |
| **D-04** | New tab `src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx`. Replicate `classify-tab.tsx` / `transitions-tab.tsx` / `response-tab.tsx` pattern. |
| **D-05** | Layout: top banner (reason + fired + finishReason + latencyMs), fired=false explainer, steps timeline (collapsable), KB Hits section, Outcome section, red banners for invariantViolation / nuncaDecirViolation / errorMessage. |
| **D-06** | `kbHits` extraction: parse `toolResults` where `toolName==='kb_search'`. Shape: array of `{ topic, similarity, content, nunca_decir }`. If parse fails, do NOT set kbHits (silent omission). |
| **D-07** | Persistence: ZERO. Runtime-only debug. Do NOT write to `agent_observability_turns`. Payload lives in memory per turn and is rendered via JSON response of the API action. |
| **D-08** | LOCKED files (DO NOT MODIFY): `sub-loop/output-schema.ts` (D-29 Plan 02), `sub-loop/prompt.ts`, `sub-loop/tools.ts` (Plan 05). MODIFIABLE: `sub-loop/index.ts` (only to add `onDebug` callback — existing diagnostic wraps intact), `engine-v4.ts`, `somnio-v4-agent.ts`, `types.ts`, `sandbox/types.ts`, debug-panel components. |
| **D-09** | DO NOT modify godentist / recompra / pw-confirmation / v3 (Regla 6 CLAUDE.md). |
| **D-10** | TypeScript estricto, zero `any` salvo casts dirigidos con comment. Tailwind como resto del panel. Sin emojis salvo si ya hay patrón. |

### Claude's Discretion
None marked — D-01..D-10 cover all decisions.

### Deferred Ideas (OUT OF SCOPE)
- Persisting `subLoopDebug` to `agent_observability_turns` (D-07 — zero persistence).
- Building a separate route or PR-side rendering. The new tab is in-place, in the existing debug-panel grid.
- Surfacing v3 / recompra / pw-confirmation sub-flows. Regla 6.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SLD-01 | Surface tool calls (name + input + output truncated) of sub-loop in new tab | AI SDK v6 step shape documented §Sub-Loop Internals; pattern from `crm-reader/index.ts` |
| SLD-02 | Surface LoopOutcome (status + responseTemplate + canonicalText + sourceTopic + requiresHuman + reason) | `LoopOutcomeSchema` already returned by `runSubLoop` §Sub-Loop Internals |
| SLD-03 | Surface kb_search hits with similarity scores | `KbHit` shape documented §kb_search Return Shape |
| SLD-04 | Surface invariantViolation / nuncaDecirViolation / errorMessage with red banner | Existing escalation in `sub-loop/index.ts` captures these — payload exposes them §Sub-Loop Internals |
| SLD-05 | Banner shows fired=true vs fired=false (when sub-loop did not fire due to confidence ≥ threshold) | Currently `subLoopReason: null` indicates skipped — payload mirrors this §File-by-file |
| SLD-06 | Tab registered in DebugTabs DEFAULT_TABS + PanelContainer switch + TabBar icon | §Debug Panel Anatomy |

---

## Summary

- **No new external libraries.** All wiring uses existing AI SDK v6, Tailwind, shadcn `Badge` / `Progress` already in the panel.
- **Wiring is a 5-layer fan-out, additive only.** `sub-loop/index.ts` (callback) → `somnio-v4-agent.ts` (capture) → `types.ts` + `sandbox/types.ts` (mirror field) → `engine-v4.ts` (passthrough) → new `subloop-tab.tsx` + 4 small edits in `debug-tabs.tsx` / `panel-container.tsx` / `tab-bar.tsx`.
- **AI SDK v6 critical gotcha:** `result.steps[].toolCalls[]` exposes `{ toolName, input }` (NOT `args`) and `result.steps[].toolResults[]` exposes `{ toolName, toolCallId, input, output }` (NOT `result`). The existing diagnostic catch in `sub-loop/index.ts` lines 126-145 uses the OLD names (`args`, `result`) — these are typed loosely with `?: unknown` so they ARE undefined at runtime but the JSON.stringify produces empty objects. The new callback MUST use the correct v6 names. See §Common Pitfalls #1.
- **kb_search returns objects, not strings.** `KbHit[]` is the canonical shape — no JSON parsing needed; just narrow type guard `Array.isArray(output) && output[0]?.topic && typeof output[0]?.similarity === 'number'`.
- **Coordination with concurrent session is the highest-risk pitfall.** Another Claude session is iterating diagnostic wraps inside `sub-loop/index.ts` (commits `caf906a` + `3e009d6`). Our change adds an `onDebug` arg + an invocation; do not delete or restructure their try/catch.

**Primary recommendation:** Implement the callback hook BEFORE the existing post-invariant/post-nunca-decir guards return, so the payload reflects the ACTUAL outcome (post-escalation, not pre). Capture data at three points: (1) success path post-checks, (2) invariant violation path, (3) nunca-decir violation path. catch-block path emits payload with `errorMessage` set + `outcome` undefined. Latency timer wraps the entire `runSubLoop` body.

---

## Standard Stack

### Core (already installed — no new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (AI SDK) | v6 (installed) | `generateText`, `Output.object`, `stepCountIs`, `TypedToolCall<>`, `TypedToolResult<>` | `runSubLoop` already uses; we read `result.steps[]` shape from same package |
| React 19 + Next 15 | n/a | Component model | Existing `classify-tab.tsx` is `'use client'`, hooks via `useState` |
| Tailwind | n/a | All styling | Matches every other tab |
| shadcn `Badge`, `Progress` | n/a | Status visualization | Already used in `classify-tab.tsx` for the v4 escalation surface |
| `lucide-react` | n/a | Icons (`Activity`, `Database`, `AlertTriangle`, `ChevronDown/Right`) | Same icon-set used throughout debug-panel |
| `date-fns` `format` | n/a | Timestamp HH:mm:ss formatting | `classify-tab.tsx` line 19 |

### Supporting (already in project)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `@/components/ui/badge` | Status badge for `outcome.status`, `subLoopReason`, `finishReason` | Mirror `classify-tab.tsx` line 95 / line 130 |
| `@/components/ui/progress` | Similarity bar (0-1 → 0-100) | Same as confidence bar in `classify-tab.tsx` line 108 |
| `@/lib/utils` `cn()` | Conditional class names | Universal pattern in debug-panel |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline render of toolResult JSON via `<pre>` | A react-json-tree dependency | shadcn pattern + `<pre className="text-xs overflow-auto max-h-32">` is what `tools-tab.tsx` line 72 already does — no new dep |
| `useReducer` for expand state | Local `useState<Record<index, boolean>>` | Matches `tools-tab.tsx` line 23 — per-item `useState(false)` lift into sub-component |
| Polling for live updates | Snapshot per turn (already how the rest works) | Sandbox is request/response per message — no streaming needed |

**Installation:** None. `pnpm install` not required for this phase.

---

## Architecture Patterns

### System Architecture Diagram

```
User message in sandbox
         │
         ▼
┌──────────────────────────────────┐
│  /api/sandbox/process            │  src/app/api/sandbox/process/route.ts:133
│  if (agentId === 'somnio-sales-v4') → SomnioV4Engine                       │
└──────────────────┬───────────────┘
                   │
                   ▼
┌──────────────────────────────────┐
│  SomnioV4Engine.processMessage   │  src/lib/agents/somnio-v4/engine-v4.ts:53
│  Calls processMessage() agent    │
│  Builds debugTurn from output    │
└──────────────────┬───────────────┘
                   │
                   ▼
┌──────────────────────────────────┐
│  somnio-v4-agent.processMessage  │  src/lib/agents/somnio-v4/somnio-v4-agent.ts:67
│  ┌────────────────────────────┐  │
│  │ comprehend → analysis      │  │
│  │ decideSubLoopReason        │──┼──► reason !== null ► runSubLoop(args, ON_DEBUG)
│  │ guards / sales-track       │  │      capture: localPayload
│  │ executeInvocations         │──┼──► CAS reject ► runSubLoop(reason='cas_reject', ON_DEBUG)
│  │ response-track             │  │      capture: localPayload
│  │ Build V4AgentOutput        │  │
│  │   .subLoopDebug = local    │  │
│  └────────────────────────────┘  │
└──────────────────┬───────────────┘
                   │
                   ▼
┌──────────────────────────────────┐
│  runSubLoop                      │  src/lib/agents/somnio-v4/sub-loop/index.ts:79
│  ┌────────────────────────────┐  │
│  │ generateText (steps[])     │──┼──► capture toolCalls / toolResults
│  │ validateLoopOutcomeInv     │──┼──► capture invariantViolation
│  │ checkNuncaDecir            │──┼──► capture nuncaDecirViolation
│  │ onDebug(payload)           │  │  ← single emission point per call (3 paths)
│  │ return LoopOutcome         │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
                   │
                   │ V4AgentOutput JSON over HTTP
                   ▼
┌──────────────────────────────────┐
│  Frontend SandboxPage            │  receives DebugTurn with subLoopDebug
│  DebugTabs / TabBar / Panel      │
│  PanelContainer routes 'subloop' │  src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
│  → SubloopTab                    │  NEW: subloop-tab.tsx
└──────────────────────────────────┘
```

### Component Responsibilities

| File | Responsibility |
|------|----------------|
| `sub-loop/index.ts` | Invokes `onDebug?(payload)` before return at 3 paths (success, invariant violation, nunca-decir violation). Wraps body in latency timer. catch-block also emits payload with `errorMessage`. |
| `somnio-v4-agent.ts` | Declares `let subLoopDebug: SubLoopDebugPayload | undefined`. Passes `onDebug: (p) => { subLoopDebug = p }` to each `runSubLoop` call. Injects `subLoopDebug` into the V4AgentOutput before return. The non-sub-loop path emits payload `{ fired: false, reason: null }` if D-05 banner requires it (recommend: only emit when fired). |
| `types.ts` (v4) | Adds `subLoopDebug?: SubLoopDebugPayload` to `V4AgentOutput`. Declares `SubLoopDebugPayload` interface inline (export). |
| `sandbox/types.ts` | Adds `subLoopDebug?: SubLoopDebugPayload` to `DebugTurn`. Re-imports `SubLoopDebugPayload` from `@/lib/agents/somnio-v4/types` (one-way dependency, sandbox already imports v3/v4 types). Adds `'subloop'` to `DebugPanelTabId`. |
| `engine-v4.ts` | Passes `subLoopDebug: output.subLoopDebug` through to `debugTurn` in 2 paths: success branch (line 103) and error branch (line 181). |
| `subloop-tab.tsx` (NEW) | Renders the 4 sections per D-05 layout. Filters `debugTurns` to only those with `subLoopDebug` defined. |
| `debug-tabs.tsx` | Adds `{ id: 'subloop', label: 'Sub-Loop', visible: false }` to `DEFAULT_TABS`. |
| `panel-container.tsx` | Adds `case 'subloop': return <SubloopTab debugTurns={...} />` to switch. Adds `SubloopTab` to imports. |
| `tab-bar.tsx` | Adds `subloop: Activity` (or `Network`) to `TAB_ICONS` map. |
| `debug-panel/index.ts` | Exports `SubloopTab`. |

### Pattern 1: Optional `onDebug` Callback Hook (D-03)

**What:** Add an optional 2nd argument to `runSubLoop` that — when present — receives a snapshot of telemetry just before each return point.

**When to use:** Anywhere a function already does internal work that the caller wants to observe without changing the return type. Standard "tap" pattern.

**Example pattern (paraphrased — actual code in §Code Examples):**

```typescript
// In sub-loop/index.ts
export interface SubLoopDebugPayload { /* ... see §Sub-Loop Internals ... */ }

export async function runSubLoop(args: {
  reason: SubLoopReason
  ctx: SubLoopContext
  onDebug?: (payload: SubLoopDebugPayload) => void  // NEW optional arg
}): Promise<LoopOutcome> {
  const t0 = performance.now()
  // ... existing body unchanged ...
  // BEFORE each `return`:
  args.onDebug?.({
    fired: true,
    reason: args.reason,
    finishReason: subLoopResult?.finishReason ?? null,
    stepCount,
    toolCalls,
    toolResults,
    kbHits,
    outcome: output,           // or null if invariantViolation triggered before
    invariantViolation: ...,
    nuncaDecirViolation: ...,
    latencyMs: performance.now() - t0,
    errorMessage: undefined,
  })
}
```

**Anti-patterns:**
- DO NOT change the return type of `runSubLoop` to `[LoopOutcome, debug]` — breaks every existing caller.
- DO NOT make the callback `async` — caller doesn't await; fire and store.

### Pattern 2: Optional Mirror Field on Output Types (D-02)

**What:** Add `subLoopDebug?: SubLoopDebugPayload` as optional field to both `V4AgentOutput` and `DebugTurn`.

**When to use:** When telemetry needs to traverse multiple layers (agent → engine → API → UI) without forcing the field to exist at every layer. Optional fields preserve backward compatibility with existing tests + sandbox unit tests.

**Existing analog in repo:** `V4AgentOutput.subLoopReason?: 'low_confidence' | ... | null` (types.ts line 215) — already added in Plan 07 as a Plan-03 debt-payment. Mirrored on `DebugTurn.subLoopReason` (sandbox/types.ts line 201). Same exact mechanic. Just add another field.

### Pattern 3: AI SDK v6 `result.steps[]` Extraction (CRITICAL — see Pitfall #1)

**What:** Iterate `result.steps[]` from AI SDK v6's `generateText`. Each step exposes `toolCalls: TypedToolCall<TOOLS>[]` and `toolResults: TypedToolResult<TOOLS>[]`.

**Canonical extraction (from `crm-reader/index.ts:59-68`, AI SDK v6, VERIFIED in `node_modules/ai/dist/index.d.ts`):**

```typescript
const toolCalls = (result.steps ?? []).flatMap((step) => {
  const resultsById = new Map(
    (step.toolResults ?? []).map((tr) => [tr.toolCallId, tr.output] as const),
  )
  return (step.toolCalls ?? []).map((tc) => ({
    name: tc.toolName,
    input: tc.input,                              // NOT tc.args !!
    output: resultsById.get(tc.toolCallId) ?? null,  // NOT tr.result !!
  }))
})
```

**AI SDK v6 type names (verified in `node_modules/ai/dist/index.d.ts`):**

```typescript
type StaticToolCall<TOOLS> = {
  toolCallId: string
  toolName: string
  input: InferToolInput<TOOLS[NAME]>      // <-- "input", not "args"
  dynamic?: false | undefined
}

type StaticToolResult<TOOLS> = {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  input: InferToolInput<TOOLS[NAME]>
  output: InferToolOutput<TOOLS[NAME]>     // <-- "output", not "result"
}
```

**The bug:** Lines 126-129 of current `sub-loop/index.ts` use the OLD names:

```typescript
const srSteps = sr?.steps as Array<{
  toolCalls?: Array<{ toolName?: string; args?: unknown }>     // ❌ "args"
  toolResults?: Array<{ toolName?: string; result?: unknown }>  // ❌ "result"
}> | undefined
```

This is permissive (everything optional / `unknown`), so it COMPILES, but at runtime `tc.args` is undefined and `tr.result` is undefined — the error log strings show empty objects. This explains why diagnostic wraps haven't been giving the parent session real data.

The NEW `onDebug` callback MUST use `tc.input` and `tr.output`. Coordination note: do NOT "fix" the existing diagnostic wrap lines — that's another session's territory. Just emit clean data in the new callback alongside.

### Anti-Patterns to Avoid

- **DO NOT** parse `toolResults` JSON from string — AI SDK v6 returns the tool's `execute()` return value as a typed object. `kbSearchTool.execute` returns `Promise<KbHit[]>`, so `tr.output` IS already a `KbHit[]`. Just narrow it.
- **DO NOT** mutate `output: LoopOutcome` to add debug info. The `LoopOutcome` schema is LOCKED per D-08. The debug payload is a SIBLING field, not embedded in the outcome.
- **DO NOT** depend on `getCollector()?.recordEvent` to populate the panel. Collector is per-purpose ALS and the data does not survive the HTTP boundary back to the frontend. D-07: zero persistence; in-memory passthrough only.

---

## Sub-Loop Internals

### Where to Hook `onDebug`

`runSubLoop` (`src/lib/agents/somnio-v4/sub-loop/index.ts:79-241`) has FOUR exit points. The callback fires at each:

| Line range | Path | Outcome | What to emit |
|------------|------|---------|--------------|
| 113-115 | `generateText` success → `output = subLoopResult.output` | (continues to checks) | n/a (mid-flight) |
| 116-158 | `catch (genErr)` | throw enriched error | `{ fired: true, reason, errorMessage, latencyMs, toolCalls/toolResults from peek }` — but throwing means the caller never sees the payload; the `processUserMessage` catch in `somnio-v4-agent.ts:573-590` catches the throw and produces `errorMessage` on V4AgentOutput. **DESIGN DECISION FOR PLANNER:** prefer (a) emit `onDebug` in `catch` BEFORE rethrow; or (b) accept that error path surfaces via existing `V4AgentOutput.errorMessage` and skip the catch emission. Recommend (a) — single source of truth for debug surface. |
| 188 | `validateLoopOutcomeInvariants` fails → return escalated `no_match` | escalated LoopOutcome | `{ fired: true, outcome: escalated, invariantViolation: invariantCheck.violation, toolCalls/toolResults captured from result.steps, latencyMs }` |
| 227 | `checkNuncaDecir` fails → return escalated `no_match` | escalated LoopOutcome | `{ fired: true, outcome: escalated, nuncaDecirViolation: check.violation, toolCalls/toolResults, latencyMs }` |
| 240 | Success path → return `output` | LoopOutcome | `{ fired: true, outcome: output, toolCalls/toolResults, kbHits parsed, latencyMs }` |

**Recommended single-helper approach:**

Build the payload incrementally as a `let` binding declared at top of function, and update through the body. Before EACH return, call `args.onDebug?.(payload)`. This avoids duplicating the extraction logic.

### Exact `SubLoopDebugPayload` Shape

```typescript
// Add to src/lib/agents/somnio-v4/types.ts (or new file sub-loop/debug-types.ts)
export interface SubLoopToolCallSnapshot {
  toolName: string
  input: unknown        // tool's inputSchema-validated input (varies by tool)
  output: unknown       // tool's execute() return value (varies by tool)
  /** truncated stringified output capped at 500 chars per D-02 (only when stringifying for display) */
  outputPreview?: string
}

export interface SubLoopKbHitSnapshot {
  topic: string
  similarity: number             // 0..1 (KbHit.similarity)
  contentPreview: string         // first 200 chars of canonicalResponse for compactness
  hasNuncaDecir: boolean         // (nunca_decir?.length ?? 0) > 0
}

export interface SubLoopDebugPayload {
  fired: true                    // always true when payload emitted; absence of payload = not fired
  reason: 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre'
  finishReason?: string          // AI SDK FinishReason: 'stop' | 'length' | 'tool-calls' | 'error' | 'other' | 'unknown'
  stepCount?: number             // result.steps?.length
  toolCalls: SubLoopToolCallSnapshot[]
  toolResults: SubLoopToolCallSnapshot[]   // same shape, kept separate for D-02 verbatim
  kbHits?: SubLoopKbHitSnapshot[]
  outcome?: LoopOutcome          // the final outcome that runSubLoop returned (may be escalated)
  invariantViolation?: string    // from validateLoopOutcomeInvariants
  nuncaDecirViolation?: string   // from checkNuncaDecir
  latencyMs?: number             // performance.now() delta from t0
  errorMessage?: string          // catch-block message (set in throw path only)
}
```

**D-02 truncation semantics:**
> "toolResults[] (result truncado 500ch)"

Per D-10 (TypeScript estricto): keep the raw `output: unknown` in `SubLoopToolCallSnapshot.output` (for type fidelity) AND emit `outputPreview: string` (truncated, for UI). The truncation is a UI concern, not a storage concern — do it at the callback site:

```typescript
const outputPreview =
  typeof output === 'string'
    ? output.slice(0, 500)
    : JSON.stringify(output).slice(0, 500)
```

### Latency Capture

Wrap the entire `runSubLoop` body in `const t0 = performance.now()` at line 80, then compute `performance.now() - t0` before each `onDebug` invocation. `performance.now()` is available in Vercel Node 18+ runtime without import.

---

## kb_search Return Shape

From `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts:11-23`, `kbSearchTool.execute()` returns `Promise<KbHit[]>`:

```typescript
export interface KbHit {
  topic: string                  // KB doc topic (e.g., "alcohol", "embarazo")
  canonicalResponse: string | null
  nuncaDecirRules: string[]      // mapped from row.nunca_decir TEXT[] column
  relatedTopics: string[]
  category: string               // 'product' | 'policies' | 'edge-cases' | 'faqs-no-templated'
  similarity: number             // 1 - distance (i.e., higher = closer match), 0..1
}
```

**Extraction logic for D-06 (in `onDebug` callback or `engine-v4.ts`):**

```typescript
function extractKbHits(toolResults: SubLoopToolCallSnapshot[]): SubLoopKbHitSnapshot[] | undefined {
  try {
    const kbResult = toolResults.find((tr) => tr.toolName === 'kb_search')
    if (!kbResult) return undefined
    const hits = kbResult.output
    if (!Array.isArray(hits)) return undefined
    // Type narrow with structural check (D-10: zero `any` casts unless commented)
    if (hits.length === 0) return []
    const first = hits[0] as Record<string, unknown>
    if (typeof first?.topic !== 'string' || typeof first?.similarity !== 'number') {
      return undefined  // shape mismatch — D-06 silent omission
    }
    return (hits as KbHit[]).map((h) => ({
      topic: h.topic,
      similarity: h.similarity,
      contentPreview: (h.canonicalResponse ?? '').slice(0, 200),
      hasNuncaDecir: (h.nuncaDecirRules?.length ?? 0) > 0,
    }))
  } catch {
    return undefined  // D-06: parse failure → silently omit
  }
}
```

**D-06 wording reminder:**
> "Formato del result: array de hits con `{ topic, similarity, content, nunca_decir }`. Si parse falla, no setear kbHits."

User CONTEXT used short field names (`content`, `nunca_decir`). The codebase uses `canonicalResponse` and `nuncaDecirRules`. The plan should map between them. Recommended display field names align with the UI label, not the source field name (`contentPreview`, `hasNuncaDecir`).

**Tool may not be called.** If `reason === 'crm_mutation'` and the model decided to skip kb_search and go straight to a mutation tool, `toolResults` may contain `getActiveOrderByPhone` / `createOrder` etc. but NO kb_search. Per D-06, `kbHits` should simply be `undefined` (not set). The UI tab must handle this gracefully (show "KB not consulted" or omit the section).

---

## Debug Panel Anatomy

### Tab Registration Mechanism

**Three places to register a new tab. ALL THREE are required:**

1. **`src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx:16-25`** — append to `DEFAULT_TABS`:
   ```typescript
   const DEFAULT_TABS: DebugPanelTab[] = [
     { id: 'pipeline', label: 'Pipeline', visible: true },
     // ... existing ...
     { id: 'config', label: 'Config', visible: false },
     { id: 'subloop', label: 'Sub-Loop', visible: false },  // NEW
   ]
   ```

2. **`src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx:40-77`** — add case + import:
   ```typescript
   import { SubloopTab } from './subloop-tab'
   // ...
   case 'subloop':
     return <SubloopTab debugTurns={props.debugTurns} />
   ```

3. **`src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx:21-30`** — add icon to `TAB_ICONS`:
   ```typescript
   import { Activity, /* ... */ } from 'lucide-react'
   const TAB_ICONS: Record<DebugPanelTabId, ...> = {
     // ... existing ...
     subloop: Activity,  // or Network, GitFork — pick what's visually distinct from pipeline GitBranch
   }
   ```

4. **`src/lib/sandbox/types.ts:344`** — extend `DebugPanelTabId` union:
   ```typescript
   export type DebugPanelTabId = 'pipeline' | 'classify' | 'bloques' | 'tools' | 'state' | 'tokens' | 'ingest' | 'config' | 'subloop'
   ```

5. **`src/app/(dashboard)/sandbox/components/debug-panel/index.ts:6-15`** — re-export (optional but matches existing style):
   ```typescript
   export { SubloopTab } from './subloop-tab'
   ```

### DebugTurn → Tab Data Flow

`DebugTabs` (`debug-tabs.tsx`) accepts `debugTurns: DebugTurn[]` as a prop. It forwards verbatim through `PanelContainer` to each visible tab. Each tab receives `debugTurns: DebugTurn[]` and filters/maps as needed.

`SubloopTab` filters via:
```typescript
const turnsWithSubLoop = debugTurns.filter(t => t.subLoopDebug !== undefined)
```

Same pattern as `classify-tab.tsx:355`:
```typescript
const turnsWithIntent = debugTurns.filter(turn => turn.intent)
```

### `classify-tab.tsx` as Template — Reusable Sub-Patterns

Inspected from `src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx`:

| Element | Lines | What to reuse |
|---------|-------|----------------|
| Empty state | 355-363 | `<div className="flex items-center justify-center h-32 text-sm text-muted-foreground">No hay ...</div>` |
| Turn container | 367-369 | `<div className="border rounded-lg p-3 space-y-3">` |
| Turn header (number + timestamp) | 370-377 | `<div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Turno {turn.turnNumber}</span><span className="text-xs text-muted-foreground">{format(new Date(...), 'HH:mm:ss')}</span></div>` |
| Section label + icon | 87-91 | `<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="h-3.5 w-3.5" />Title</div>` |
| Badge for status | 95-98 | `<Badge variant={...}>label</Badge>` |
| Progress bar | 100-109 | `<div className="space-y-1"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Label</span><span className={cn('font-medium', getConfidenceColor(v))}>{normalizeConfidence(v)}%</span></div><Progress value={normalizeConfidence(v)} className="h-2" /></div>` |
| Sub-section divider | 173 | `<div className="space-y-2 pt-2 border-t">` |
| Dashed sub-section (used for v4 escalation surface) | 113-139 | `<div className="pt-1 border-t border-dashed border-muted-foreground/20 space-y-1">` |
| Colored category badge | 181-189 | `<span className={cn('inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border', getCategoryColor(category))}>{category}</span>` |
| Collapsable section | 280-347 | `useState(false)` + button toggle + conditional render with `ChevronDown` / `ChevronRight` from `lucide-react` |

### `tools-tab.tsx` as Secondary Template — Sub-Loop Tool Renderer

The "tool execution timeline" (D-05 second section) maps very closely to `tools-tab.tsx`. Key patterns:

| Element | Lines | What to reuse |
|---------|-------|---------------|
| Per-tool expandable card | 22-98 | `<div className="border rounded-lg overflow-hidden">` with header button + collapsable body |
| Input JSON pretty-print | 70-74 | `<pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">{JSON.stringify(input, null, 2)}</pre>` |
| Result badge | 50-65 | `<Badge variant={success ? 'default' : 'destructive'}>...</Badge>` |
| Mode badge (style for our `reason` badge) | 40-46 | `<Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">{label}</Badge>` |

### `normalizeConfidence` — Reusable Helper

From `classify-tab.tsx:39-41`:
```typescript
function normalizeConfidence(confidence: number): number {
  return confidence <= 1 ? Math.round(confidence * 100) : confidence
}
```

Use for `similarity` bars (KB hits) — similarity is 0..1, so this normalizer scales it correctly.

`getConfidenceColor(c)` (lines 43-49) returns the right Tailwind class for the score band — reuse for similarity color coding (≥85 green, ≥60 yellow, ≥40 orange, else red).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confidence/similarity bar | Custom div + style.width | shadcn `<Progress value={pct} className="h-2" />` | Already used in `classify-tab.tsx`; no new dep |
| Confidence color thresholds | Custom switch | Reuse `getConfidenceColor` / `getConfidenceBadge` from `classify-tab.tsx` | Exists, tested, consistent across tabs |
| Scale normalization | Inline ternary | Reuse `normalizeConfidence` | Same — exists |
| JSON pretty-print | Custom recursive renderer | `<pre>{JSON.stringify(x, null, 2)}</pre>` inside `bg-background rounded text-xs overflow-auto max-h-32` | Pattern in `tools-tab.tsx:72` |
| Expand/collapse state | Reducer | `useState(false)` per item, lift into sub-component | `tools-tab.tsx:23`, `classify-tab.tsx:282` |
| Tab registration plumbing | Custom router | Edit 4 files per §Debug Panel Anatomy | Existing additive pattern; no central registry |
| AI SDK step extraction | Custom parser | Map `result.steps[]` per `crm-reader/index.ts:59-68` | AI SDK v6 native types |
| Tool result truncation | Custom recursive depth limit | `JSON.stringify(x).slice(0, 500)` | D-02 explicit |

**Key insight:** Every visual element of the new tab has an established pattern within ~250 lines of `classify-tab.tsx` + `tools-tab.tsx`. The plan should reference exact line numbers rather than re-deriving patterns.

---

## Common Pitfalls

### Pitfall 1: AI SDK v6 step field names — `input`/`output` NOT `args`/`result`

**What goes wrong:** Existing diagnostic code in `sub-loop/index.ts:126-145` types steps with `{ toolCalls?: Array<{ args?: unknown }>; toolResults?: Array<{ result?: unknown }> }`. These names are wrong for AI SDK v6. The actual fields are `input` and `output` (verified in `node_modules/ai/dist/index.d.ts` + working usage in `src/lib/agents/crm-reader/index.ts:59-68` + `src/lib/agents/crm-writer/index.ts:69-70`).

**Why it happens:** The diagnostic code was written defensively with `?:` and `unknown`, so TypeScript compiles. At runtime the wrong field name returns `undefined`. JSON.stringify of `{ toolName: 'kb_search', args: undefined }` produces `{"toolName":"kb_search"}`. No type error; just empty output in log strings — looks like "no tool calls" when there were actually several.

**How to avoid:** In the new `onDebug` callback, use `tc.input` and `tr.output`. Verify by writing a quick TypeScript probe (no `as any`):

```typescript
import type { StaticToolCall, StaticToolResult } from 'ai'
// At runtime: tc.input is defined; tc.args is NOT.
```

**Warning signs:** The new tab renders with empty input objects → look at the field name first. Cross-check against `crm-reader/index.ts:63-66`.

### Pitfall 2: Concurrent session coordination on `sub-loop/index.ts`

**What goes wrong:** Another Claude session is iterating diagnostic wraps in `sub-loop/index.ts` (commits `caf906a` + `3e009d6`). If our PR removes / restructures their try/catch (lines 92-158), we'll either lose their work or trigger a merge conflict at push time. The CONTEXT explicitly says: "mi cambio (estructural) prevalece, la otra session rebasea."

**Why it happens:** Two parallel iterations on a hot file. Even small reformatting of the existing catch block can produce noisy diffs.

**How to avoid:**
- Add `onDebug` as a new parameter — do not rename `args.reason` / `args.ctx`.
- Add the latency timer (`const t0 = performance.now()`) as the FIRST line inside the function body — minimal context delta.
- Build the payload variable (`let debugPayload: SubLoopDebugPayload | null = null` or accumulator) at the TOP of the function — adjacent to existing `let output: LoopOutcome` declaration, NOT inside the try.
- Add `args.onDebug?.(payload)` calls IMMEDIATELY BEFORE existing `return` statements — single-line additions. Do not refactor the diagnostic catch block.
- After local commits land, `git pull origin main` BEFORE `git push` to surface conflicts early. If conflict in `sub-loop/index.ts`: keep our structural changes (new param, callback emissions), let their diagnostic improvements re-apply on top.

**Warning signs:** Merge conflicts at push → resolve by reading both upstream diff + our diff, prefer additive merge of both.

### Pitfall 3: LOCKED files (D-08) — cannot modify schema

**What goes wrong:** Temptation to add `subLoopDebug` to `LoopOutcomeSchema` in `sub-loop/output-schema.ts`. This is LOCKED by D-29 Plan 02 because the schema is consumed by AI SDK `Output.object({ schema })` and is provider-strict — changing it risks regressions across Anthropic / OpenAI / Gemini.

**Why it happens:** Conceptual ergonomic — "if the sub-loop produces telemetry, why not put it on the output object?" Answer: telemetry is sandbox-only and the schema is a production-grade contract.

**How to avoid:** `SubLoopDebugPayload` lives in `src/lib/agents/somnio-v4/types.ts` (or a new sibling file `sub-loop/debug-payload.ts`) — totally separate from `LoopOutcomeSchema`. The callback receives a copy of `output` but does not feed it back through `LoopOutcome`.

**Warning signs:** Plan mentions `output.debug` or similar — reject.

### Pitfall 4: Regla 6 — cross-agent contamination

**What goes wrong:** Adding `subLoopDebug?: ...` to `DebugTurn` is global to ALL agents (sandbox/types.ts is shared). If `v3-production-runner` or `recompra` or `pw-confirmation` constructs `DebugTurn` objects, they get the new optional field automatically. That's FINE because the field is optional and they leave it undefined. But the planner must avoid modifying their construction sites.

**Why it happens:** Easy to confuse "the type can be extended" with "all consumers need updating."

**How to avoid:** Verify with `git diff --stat` at end of phase — should show changes ONLY in `src/lib/agents/somnio-v4/**`, `src/lib/sandbox/types.ts`, and `src/app/(dashboard)/sandbox/components/debug-panel/**`. Specifically NOT in `somnio-v3/`, `somnio-recompra/`, `godentist/`, `godentist-fb-ig/`, `somnio-pw-confirmation/`.

**Warning signs:** Bash gate command before commit:
```bash
git diff origin/main..HEAD -- 'src/lib/agents/somnio-v3/**' 'src/lib/agents/somnio-recompra/**' 'src/lib/agents/godentist/**' 'src/lib/agents/godentist-fb-ig/**' 'src/lib/agents/somnio-pw-confirmation/**'
# Expected: empty
```

### Pitfall 5: `kb_search` may not be invoked (D-06 silent omission)

**What goes wrong:** If the sub-loop fires with `reason='crm_mutation'` and the model decides to skip kb_search, `toolResults` will not contain any `toolName === 'kb_search'` entry. The naive code `kbHits: extractKbHits(toolResults)` would return `undefined` and the UI must NOT render a misleading "0 hits" — it must render either nothing or an explicit "KB not consulted" message.

**Why it happens:** Tool calls are model decisions; not all sub-loops query KB.

**How to avoid:** D-06 says "Si parse falla, no setear kbHits." Treat "tool not invoked" the same as "parse fails." UI conditionally renders:
```tsx
{turn.subLoopDebug.kbHits !== undefined && turn.subLoopDebug.kbHits.length > 0 && (
  <KbHitsSection hits={turn.subLoopDebug.kbHits} />
)}
{turn.subLoopDebug.kbHits === undefined && (
  <div className="text-xs text-muted-foreground/60">KB not consulted</div>
)}
```

**Warning signs:** UI shows "0 KB hits" with empty list — likely confusing "tool not invoked" with "tool returned empty array."

### Pitfall 6: Truncation site (D-02 "result truncated 500ch")

**What goes wrong:** Truncating `output: unknown` inside the type itself loses fidelity. Truncating at the React tab leaks the full payload over the wire (D-07 is "no persistence" but the response body is unbounded).

**Why it happens:** Ambiguity about WHERE truncation lives.

**How to avoid:** Truncate at the EMISSION site (inside `runSubLoop`'s `onDebug` callback) — compute `outputPreview: string` capped at 500 chars and ALSO include the raw `output: unknown`. Frontend prefers `outputPreview` for display. This way the wire payload is bounded, but a future consumer (e.g., test runner) can still inspect raw output if they want it. If wire size is a concern, drop `output` and keep only `outputPreview`.

**Warning signs:** API response includes a 5MB tool output → truncate at emission.

### Pitfall 7: `errorMessage` path — payload before throw

**What goes wrong:** The catch block in `sub-loop/index.ts:116-158` throws an enriched error. If we emit `onDebug` BEFORE the throw, the caller (in `processUserMessage`) catches the throw in its own try/catch (line 573), which has NO access to the debug payload — it constructs an error V4AgentOutput that won't include `subLoopDebug`.

**Why it happens:** The catch in `sub-loop/index.ts` throws; the catch in `somnio-v4-agent.ts` builds the error output. Two different scopes.

**How to avoid:** Two options for the planner:

(a) **Recommended:** Emit `onDebug` in `sub-loop/index.ts:catch` BEFORE the throw. The `onDebug` callback is synchronous; it executes before the `throw new Error(...)` line. Caller's `onDebug: (p) => { subLoopDebug = p }` captures the payload into the closure variable. Then when the throw lands in `processUserMessage`'s catch (line 573), the closure variable still holds the payload — just inject it into the error V4AgentOutput before returning.

(b) Skip catch emission. The error path surfaces only via `V4AgentOutput.errorMessage` (already wired in Plan 07). New tab simply doesn't show sub-loop info for error turns.

Option (a) is preferred because the user explicitly asked for `errorMessage` in `subLoopDebug` (D-02).

**Warning signs:** Error message visible in classify tab but Sub-Loop tab is empty for the same turn → check that error path emits payload.

### Pitfall 8: TypeScript strict mode (D-10)

**What goes wrong:** Using `any` to short-circuit type plumbing. CLAUDE.md mandates strict TypeScript and zero `any` salvo casts dirigidos con comment.

**Why it happens:** AI SDK `TypedToolCall<TOOLS>` has dynamic input type per tool; easier to type as `any`.

**How to avoid:** Use `unknown` for `input` / `output` in `SubLoopToolCallSnapshot` (callback site is type-erased — different tools have different shapes). Narrow with structural checks in `extractKbHits` (Record-typed check on `topic` + `similarity`). Single allowed `as KbHit[]` cast after the structural check with comment.

**Warning signs:** `tsc --noEmit` errors or grep finds `: any` in new files.

### Pitfall 9: Sandbox state import order — types.ts circular risk

**What goes wrong:** `sandbox/types.ts` already imports from `@/lib/agents/somnio-v3/types`. Adding an import from `@/lib/agents/somnio-v4/types` doubles the agent → sandbox dependency. If `somnio-v4/types.ts` ever imports from `@/lib/sandbox/types.ts` (e.g., to reuse `DebugTurn`), there's a cycle.

**Why it happens:** Convenience cross-imports.

**How to avoid:** Declare `SubLoopDebugPayload` (and its sub-types `SubLoopToolCallSnapshot`, `SubLoopKbHitSnapshot`) in a self-contained file `src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` that imports ONLY from `./output-schema` (for `LoopOutcome`) and re-exports. Both `types.ts` (v4) and `sandbox/types.ts` import from this file — flat dependency. The file is NEW (not LOCKED).

**Warning signs:** TypeScript `error TS2367: This expression is not callable` or runtime undefined types → check for cycle with `madge`.

---

## Code Examples

All snippets are real codebase excerpts. Paths included.

### Example 1: AI SDK v6 result.steps extraction (canonical)

Source: `src/lib/agents/crm-reader/index.ts:59-68`

```typescript
const toolCalls: ReaderOutput['toolCalls'] = (result.steps ?? []).flatMap((step) => {
  const resultsById = new Map(
    (step.toolResults ?? []).map((tr) => [tr.toolCallId, tr.output] as const),
  )
  return (step.toolCalls ?? []).map((tc) => ({
    name: tc.toolName,
    input: tc.input,
    output: resultsById.get(tc.toolCallId) ?? null,
  }))
})
```

### Example 2: Optional debug field on V4AgentOutput (existing analog)

Source: `src/lib/agents/somnio-v4/types.ts:215-217`

```typescript
/**
 * Sub-loop diagnostic surface (Plan 03 D-20 TODO honored Plan 07 debug).
 * Populated by somnio-v4-agent.ts; consumed by engine-v4.ts debugTurn mapping.
 */
subLoopReason?: 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre' | null
/** platform_config.somnio_v4_low_confidence_threshold value used in this turn (D-11). */
threshold?: number
```

This is the EXACT pattern to replicate for `subLoopDebug?: SubLoopDebugPayload`.

### Example 3: Engine passthrough into DebugTurn (existing analog)

Source: `src/lib/agents/somnio-v4/engine-v4.ts:163-166`

```typescript
// V4 escalation visibility (Plan 03 D-20 TODO honored in Plan 07 debug):
// subLoopReason populated when sub-loop fired (otherwise null/undefined).
// threshold = platform_config.somnio_v4_low_confidence_threshold value used.
subLoopReason: output.subLoopReason ?? undefined,
threshold: output.threshold,
```

Add `subLoopDebug: output.subLoopDebug` here (in the success branch). For the catch branch (line 181), explicitly do NOT set the field — error turn has no debug data unless the closure captured it earlier.

### Example 4: Empty state pattern

Source: `src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx:357-363`

```tsx
if (turnsWithIntent.length === 0) {
  return (
    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
      No hay detecciones de intent todavia
    </div>
  )
}
```

### Example 5: Turn container header

Source: `src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx:367-377`

```tsx
{turnsWithIntent.map((turn, idx) => (
  <div key={idx} className="border rounded-lg p-3 space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">
        Turno {turn.turnNumber}
      </span>
      <span className="text-xs text-muted-foreground">
        {format(new Date(turn.intent!.timestamp), 'HH:mm:ss')}
      </span>
    </div>
    {/* sections */}
  </div>
))}
```

### Example 6: Expandable item (for tool call timeline)

Source: `src/app/(dashboard)/sandbox/components/debug-panel/tools-tab.tsx:22-98` (excerpt)

```tsx
function ToolExecutionItem({ tool }: { tool: ToolExecution }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="font-mono text-sm truncate flex-1">{tool.name}</span>
        {/* badges */}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t bg-muted/30">
          <div className="pt-2">
            <span className="text-xs text-muted-foreground">Input:</span>
            <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
          {/* output */}
        </div>
      )}
    </div>
  )
}
```

### Example 7: V4 escalation dashed sub-section (use for "fired/threshold" banner)

Source: `src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx:113-139`

```tsx
{(turn.intent.intent_confidence !== undefined || turn.threshold !== undefined || turn.subLoopReason) && (
  <div className="pt-1 border-t border-dashed border-muted-foreground/20 space-y-1">
    {turn.intent.intent_confidence !== undefined && (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">intent_confidence (0..1)</span>
        <span className="font-mono font-medium">{turn.intent.intent_confidence.toFixed(3)}</span>
      </div>
    )}
    {turn.subLoopReason && (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">sub-loop trigger</span>
        <Badge variant="outline" className="text-[10px]">{turn.subLoopReason}</Badge>
      </div>
    )}
    {turn.intent.intent_confidence !== undefined && turn.threshold !== undefined && !turn.subLoopReason && (
      <div className="text-[10px] text-muted-foreground/70 italic">
        no sub-loop fired ({turn.intent.intent_confidence.toFixed(3)} ≥ {turn.threshold.toFixed(2)})
      </div>
    )}
  </div>
)}
```

This is the EXACT pattern for D-05 fired=false explanation.

### Example 8: Existing diagnostic peek (lines 126-145, sub-loop/index.ts) — DO NOT REMOVE

```typescript
const srSteps = sr?.steps as Array<{
  toolCalls?: Array<{ toolName?: string; args?: unknown }>      // ❌ wrong field names
  toolResults?: Array<{ toolName?: string; result?: unknown }>   // ❌ wrong field names
}> | undefined
```

This block lives inside the catch and is owned by the concurrent session. DO NOT MODIFY. The new `onDebug` callback bypasses it entirely — different code path, different extraction logic with correct AI SDK v6 names.

---

## File-by-file Change Map

For the planner. Concise edit-by-edit guide. All paths absolute.

### NEW files

1. **`src/lib/agents/somnio-v4/sub-loop/debug-payload.ts`** (NEW)
   - Define `SubLoopToolCallSnapshot`, `SubLoopKbHitSnapshot`, `SubLoopDebugPayload`.
   - Re-export `LoopOutcome` from `./output-schema` to avoid downstream double-import.
   - No runtime exports.

2. **`src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx`** (NEW)
   - Top-level `SubloopTab({ debugTurns }: { debugTurns: DebugTurn[] })`.
   - Sub-components: `BannerSection`, `ToolCallsTimeline`, `KbHitsSection`, `OutcomeSection`, `ViolationBanner`.
   - Filter `debugTurns.filter(t => t.subLoopDebug !== undefined)`.
   - Reuse `normalizeConfidence` (or copy locally to avoid cross-file import — classify-tab.tsx keeps it private).
   - Use `Badge` from `@/components/ui/badge`, `Progress` from `@/components/ui/progress`, `cn` from `@/lib/utils`, `format` from `date-fns`.
   - Icons: `Activity`, `Database`, `AlertTriangle`, `Wrench`, `CheckCircle`, `XCircle`, `ChevronDown`, `ChevronRight` from `lucide-react`.

### MODIFIED files

3. **`src/lib/agents/somnio-v4/sub-loop/index.ts`** (~25 LOC added)
   - Import `SubLoopDebugPayload` from `./debug-payload`.
   - Add `onDebug?: (payload: SubLoopDebugPayload) => void` to `runSubLoop` args (line 79).
   - Add `const t0 = performance.now()` as line 81 (first line of function body).
   - Add helper `extractStepData(result)` that walks `result.steps` and returns `{ toolCalls, toolResults, kbHits, stepCount, finishReason }` using AI SDK v6 names (`tc.input`, `tr.output`).
   - Add `args.onDebug?.(payload)` invocations at 4 sites:
     - Inside `catch (genErr)` before the `throw` (line ~150).
     - Inside `if (!invariantCheck.ok)` before the return at line 188.
     - Inside the `if (!check.ok)` (nunca-decir) before the return at line 227.
     - Just before the final `return output` at line 240.
   - DO NOT touch existing diagnostic peek lines 126-145.

4. **`src/lib/agents/somnio-v4/types.ts`** (~3 LOC added)
   - Import `SubLoopDebugPayload` from `./sub-loop/debug-payload`.
   - Add `subLoopDebug?: SubLoopDebugPayload` to `V4AgentOutput` interface (around line 217, next to `threshold?: number`).

5. **`src/lib/agents/somnio-v4/somnio-v4-agent.ts`** (~20 LOC added across 3 call sites)
   - At top of `processUserMessage`, declare `let capturedSubLoopDebug: SubLoopDebugPayload | undefined = undefined`.
   - Each of the 2 `runSubLoop({ ... })` calls (line 144 and line 313): add `onDebug: (p) => { capturedSubLoopDebug = p }` to the args object.
   - In `mapOutcomeToAgentOutput` (or at each direct return site of `processUserMessage`): include `subLoopDebug: capturedSubLoopDebug` on the V4AgentOutput.
   - In the catch block (line 573-590): include `subLoopDebug: capturedSubLoopDebug` on the error V4AgentOutput (per Pitfall 7 option a). The closure variable still holds payload if `onDebug` fired before throw.

6. **`src/lib/sandbox/types.ts`** (~5 LOC added)
   - Import `SubLoopDebugPayload` from `@/lib/agents/somnio-v4/sub-loop/debug-payload`.
   - Add `subLoopDebug?: SubLoopDebugPayload` to `DebugTurn` interface (in the v4 extensions block around lines 193-207).
   - Add `'subloop'` to `DebugPanelTabId` union (line 344).

7. **`src/lib/agents/somnio-v4/engine-v4.ts`** (~3 LOC added)
   - Add `subLoopDebug: output.subLoopDebug` to the success-branch `debugTurn` object (after line 165 `threshold: output.threshold`).
   - Leave error-branch (line 181) alone — error path doesn't surface subLoopDebug unless we want to plumb it from V4AgentOutput.errorMessage path. **Plan decision:** Plan should specify whether error branch passes through. Recommend: also pass through, since `errorMessage` is on V4AgentOutput now.

8. **`src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx`** (1 LOC added)
   - Add `{ id: 'subloop', label: 'Sub-Loop', visible: false },` to `DEFAULT_TABS` (line 24, after `config`).

9. **`src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx`** (2 LOC added)
   - Import: `import { SubloopTab } from './subloop-tab'` (after line 19).
   - Switch case: `case 'subloop': return <SubloopTab debugTurns={props.debugTurns} />` (in the `PanelContent` function around line 74).

10. **`src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx`** (2 LOC modified)
    - Import: add `Activity` (or `Network`) to the `lucide-react` import line 17.
    - `TAB_ICONS` map (line 30): add `subloop: Activity`.

11. **`src/app/(dashboard)/sandbox/components/debug-panel/index.ts`** (1 LOC added)
    - Add `export { SubloopTab } from './subloop-tab'` after line 14.

### Total touched

- 2 new files (`debug-payload.ts`, `subloop-tab.tsx`).
- 9 modified files (small additive edits).
- 0 LOCKED files touched (output-schema.ts, prompt.ts, tools.ts in sub-loop/ — untouched).
- 0 cross-agent files touched (v3, recompra, godentist, pw-confirmation — untouched).

---

## Open Questions for Plan-Phase

None of the locked decisions left ambiguity, but two minor implementation choices benefit from explicit plan resolution:

1. **OQ-1 — Error path emission for `subLoopDebug` on V4AgentOutput error branch.**
   - Sub-loop throw → `processUserMessage` catch → error V4AgentOutput. Should the error output include `subLoopDebug` (with `errorMessage` set)?
   - **Recommended:** Yes — captures `kb_search` calls made before the throw, useful diagnostic.
   - Pitfall 7 option (a) is the resolution path.

2. **OQ-2 — `engine-v4.ts` error branch passthrough.**
   - Same question one layer up. If `V4AgentOutput.subLoopDebug` is populated in error path, should `engine-v4.ts:181` also pass it through to the debugTurn?
   - **Recommended:** Yes for symmetry; the SubloopTab handles `errorMessage` rendering per D-05.

3. **OQ-3 — Confidence/similarity coloring threshold for KB hits.**
   - `getConfidenceColor` uses ≥85 green / ≥60 yellow / ≥40 orange / else red. Cosine similarity values from `match_knowledge_base` typically cluster around 0.6-0.9 for "good" hits. A 0.6 hit (60%) renders orange-yellow, which understates relevance.
   - **Recommended:** Plan can leave coloring identical (visual consistency across tabs) OR define `getSimilarityColor` with thresholds shifted upward (≥75 green / ≥55 yellow / ≥35 orange / else red). Defer to executor judgment if not addressed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `performance.now()` is available in Vercel Node 18+ without import | §Latency Capture | LOW — Node 16+ has it globally. If runtime differs, swap to `Date.now()`. |
| A2 | `SubLoopDebugPayload` declared in new file `sub-loop/debug-payload.ts` avoids circular imports | §Pitfall 9 | MEDIUM — only verified by reasoning, not by build. If cycle appears, move types to `src/lib/sandbox/types.ts` (one-way agent → sandbox is fine; sandbox → agent already exists for v3). |
| A3 | `Activity` icon from `lucide-react` is visually distinct from `GitBranch` (pipeline) | §Tab Registration | LOW — cosmetic only; swap to `Network` or `GitFork` if needed. |
| A4 | The concurrent session's diagnostic wraps in `sub-loop/index.ts:126-145` will eventually be removed (since they have the wrong AI SDK v6 names) | §Pitfall 1 / §Code Examples #8 | LOW — they don't conflict with our additive callback. If they stay forever, no harm; new tab uses correct names. |

All other claims are VERIFIED via Read tool against source files in this session.

---

## Sources

### Primary (HIGH confidence — read verbatim during research)

- `src/lib/agents/somnio-v4/sub-loop/index.ts:1-241` — current runSubLoop body, return paths, escalation logic, diagnostic catch wraps
- `src/lib/agents/somnio-v4/sub-loop/output-schema.ts:1-149` — LoopOutcome schema + validateLoopOutcomeInvariants (LOCKED)
- `src/lib/agents/somnio-v4/sub-loop/tools.ts:1-71` — tool factory (LOCKED)
- `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts:1-92` — KbHit shape + RPC mapping
- `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts:1-71` — checkNuncaDecir contract
- `src/lib/agents/somnio-v4/escalation.ts:1-66` — decideSubLoopReason pure function
- `src/lib/agents/somnio-v4/engine-v4.ts:1-205` — V4EngineOutput / debugTurn build (success + error branches)
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts:1-859` — processMessage / processUserMessage / mapOutcomeToAgentOutput, both runSubLoop call sites, error catch
- `src/lib/agents/somnio-v4/types.ts:1-370` — V4AgentInput / V4AgentOutput / SubLoopReason
- `src/lib/sandbox/types.ts:1-424` — DebugTurn / DebugPanelTabId / IntentInfo / V4 extension block (line 193-207)
- `src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx:1-395` — pattern template (sections, normalizeConfidence, color helpers, badges, progress bars, collapsable)
- `src/app/(dashboard)/sandbox/components/debug-panel/tools-tab.tsx:1-100` — expandable tool item with JSON pretty-print
- `src/app/(dashboard)/sandbox/components/debug-panel/pipeline-tab.tsx:1-208` — turn chip nav pattern (useful for sub-loop timeline)
- `src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx:1-120` — DEFAULT_TABS registration
- `src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx:1-104` — switch case routing
- `src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx:1-148` — TAB_ICONS map
- `src/app/(dashboard)/sandbox/components/debug-panel/index.ts:1-15` — re-export pattern
- `src/app/api/sandbox/process/route.ts:1-205` — v4 dispatch (line 133)
- `src/lib/agents/crm-reader/index.ts:1-90` — canonical AI SDK v6 step extraction (PROOF for `input`/`output` field names)
- `src/lib/agents/crm-writer/index.ts:67-87` — second confirmation of AI SDK v6 step shape
- `node_modules/ai/dist/index.d.ts` — `StaticToolCall` / `StaticToolResult` / `StepResult` type definitions
- `.planning/standalone/v4-subloop-debug-view/CONTEXT.md` — locked decisions D-01..D-10
- `.planning/standalone/somnio-sales-v4-runtime-wiring/07-CONTINUATION.md` — parent standalone state

### Secondary (MEDIUM confidence)

- `CLAUDE.md` — project rules (Regla 6 cross-agent isolation, TypeScript strict)
- `.claude/rules/agent-scope.md` — agent scope discipline

### Tertiary (LOW confidence)

- None used. All claims are sourced directly from code reads.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libs already in `package.json`, no version research needed
- Architecture: HIGH — all 5 data-flow layers traced through actual code reads
- Pitfalls: HIGH — Pitfall #1 (AI SDK v6 field names) is provable via the .d.ts and working analog in crm-reader; Pitfall #2 (concurrent session) is explicit in CONTEXT
- File-by-file map: HIGH — exact line numbers reference real code as of HEAD `6ed2cbf`

**Research date:** 2026-05-13
**Valid until:** 2026-05-20 (7 days — phase is in active iteration; concurrent session on sub-loop/index.ts may move line numbers slightly)
