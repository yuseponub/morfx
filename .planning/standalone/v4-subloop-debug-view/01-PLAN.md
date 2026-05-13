---
plan: 01
title: Types Foundation — SubLoopDebugPayload + V4AgentOutput + DebugTurn extension
wave: 0
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/debug-payload.ts
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/sandbox/types.ts
autonomous: true
estimated_minutes: 25
locked_files_blocked:
  - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/tools.ts
must_haves:
  truths:
    - "SubLoopDebugPayload type exists in a new file separate from output-schema.ts (D-08 LOCKED)"
    - "V4AgentOutput accepts an optional subLoopDebug field (D-02)"
    - "DebugTurn accepts an optional subLoopDebug field (D-02)"
    - "DebugPanelTabId union includes 'subloop' (D-04)"
    - "Zero TypeScript errors after this plan ships (pnpm typecheck)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/debug-payload.ts"
      provides: "SubLoopToolCallSnapshot + SubLoopKbHitSnapshot + SubLoopDebugPayload interfaces"
      contains: "export interface SubLoopDebugPayload"
    - path: "src/lib/agents/somnio-v4/types.ts"
      provides: "V4AgentOutput.subLoopDebug optional field"
    - path: "src/lib/sandbox/types.ts"
      provides: "DebugTurn.subLoopDebug optional field + DebugPanelTabId 'subloop' union member"
  key_links:
    - from: "src/lib/sandbox/types.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/debug-payload.ts"
      via: "type import of SubLoopDebugPayload"
      pattern: "from '@/lib/agents/somnio-v4/sub-loop/debug-payload'"
    - from: "src/lib/agents/somnio-v4/types.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/debug-payload.ts"
      via: "type import of SubLoopDebugPayload"
      pattern: "from './sub-loop/debug-payload'"
---

## Objective

Lay the type foundation for the Sub-Loop debug surface (D-02). Create a NEW self-contained file `sub-loop/debug-payload.ts` declaring `SubLoopDebugPayload` + sub-interfaces, then add optional `subLoopDebug` fields to both `V4AgentOutput` (v4 agent output) and `DebugTurn` (sandbox debug surface), and extend `DebugPanelTabId` to include `'subloop'`. This unblocks Plans 02/03/04 which depend on these types being importable.

The new file pattern avoids the circular-import risk noted in RESEARCH.md Pitfall 9 — both `types.ts` and `sandbox/types.ts` import from this flat-dependency file. Mirrors the EXACT analog of `V4AgentOutput.subLoopReason` / `DebugTurn.subLoopReason` already in place from Plan 07 of the parent standalone (lines 215 and 201 respectively).

## Tasks

### Task 1: Create `sub-loop/debug-payload.ts` with payload interfaces

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (sections "Exact `SubLoopDebugPayload` Shape" + "kb_search Return Shape" + "Pitfall 9")
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/output-schema.ts (LOCKED — read-only, source of `LoopOutcome` + `SubLoopReason` types to re-export)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts (read-only, `KbHit` shape source)
</read_first>

<action>
Create a NEW file `src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` with this exact content:

```typescript
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
  /** Tool's inputSchema-validated input (varies by tool — kb_search uses {query, category?}) */
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
}

// Re-export LoopOutcome + SubLoopReason for downstream consumers (sandbox/types.ts,
// subloop-tab.tsx) so they don't need to import from output-schema.ts (LOCKED).
export type { LoopOutcome, SubLoopReason }
```

DO NOT include any runtime exports beyond the `export type` re-exports above. No constants, no helper functions. Types only.
</action>

<acceptance_criteria>
- `test -f /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` returns 0
- `grep -c "export interface SubLoopDebugPayload" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` returns >= 1
- `grep -c "export interface SubLoopToolCallSnapshot" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` returns >= 1
- `grep -c "export interface SubLoopKbHitSnapshot" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` returns >= 1
- `grep -c "export type { LoopOutcome, SubLoopReason }" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` returns >= 1
- `grep -E ": any\\b" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/debug-payload.ts` returns 0 matches (D-10 zero `any`)
- File contains zero runtime statements (no `const`, no `function`, no `export function`)
- `git diff /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/output-schema.ts` is empty (LOCKED — must remain untouched)
- `git diff /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/prompt.ts` is empty
- `git diff /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/tools.ts` is empty
</acceptance_criteria>

### Task 2: Add `subLoopDebug` field to `V4AgentOutput` in `types.ts`

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/types.ts (lines 160-220 — V4AgentOutput interface)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (Example 2 — "Optional debug field on V4AgentOutput (existing analog)")
</read_first>

<action>
Modify `src/lib/agents/somnio-v4/types.ts`:

1. At the top of the file (after existing `import type { StateChanges } from './state'`), add:

```typescript
import type { SubLoopDebugPayload } from './sub-loop/debug-payload'
```

2. Inside the `V4AgentOutput` interface, locate the existing `threshold?: number` declaration at line 217 (the closing of the v4 escalation visibility block). IMMEDIATELY AFTER that line and BEFORE the existing blank line + `totalTokens: number`, insert:

```typescript

  /**
   * Sub-loop debug payload (D-02 v4-subloop-debug-view standalone).
   * Populated by somnio-v4-agent.ts via onDebug callback passed to runSubLoop.
   * Undefined when sub-loop did not fire OR when caller did not wire onDebug.
   * Runtime-only — never persisted (D-07).
   */
  subLoopDebug?: SubLoopDebugPayload
```

Result: the V4AgentOutput block in lines 211-218 expands to include the new field after `threshold?: number`. The placement next to `subLoopReason` and `threshold` keeps all v4 escalation/debug fields adjacent.
</action>

<acceptance_criteria>
- `grep -c "import type { SubLoopDebugPayload } from './sub-loop/debug-payload'" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/types.ts` returns 1
- `grep -c "subLoopDebug?: SubLoopDebugPayload" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/types.ts` returns 1
- `grep -nE "subLoopDebug\?: SubLoopDebugPayload" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/types.ts` line number > line number of `subLoopReason\?:` (proves it's adjacent in V4AgentOutput, not a stray location)
</acceptance_criteria>

### Task 3: Add `subLoopDebug` field + `'subloop'` tab id to `sandbox/types.ts`

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/sandbox/types.ts (lines 168-208 = DebugTurn block; line 344 = DebugPanelTabId)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (section "Debug Panel Anatomy" subsection "Tab Registration Mechanism" step 4)
</read_first>

<action>
Modify `src/lib/sandbox/types.ts`:

1. Find the existing imports block at the top (lines 9-11). After the existing `import type { AccionRegistrada } from '@/lib/agents/somnio-v3/types'`, add:

```typescript
import type { SubLoopDebugPayload } from '@/lib/agents/somnio-v4/sub-loop/debug-payload'
```

2. Inside the `DebugTurn` interface, locate the existing v4 extensions block lines 193-207. The block currently ends with `threshold?: number` and then closing `}`. RIGHT AFTER the existing `threshold?: number` line (line 207) and BEFORE the closing `}` on line 208, insert:

```typescript
  /**
   * Sub-loop debug payload (D-02 v4-subloop-debug-view standalone).
   * Populated by engine-v4.ts when V4AgentOutput.subLoopDebug is set.
   * Undefined when sub-loop did not fire OR for non-v4 agents.
   */
  subLoopDebug?: SubLoopDebugPayload
```

3. Find `DebugPanelTabId` at line 344. Currently:

```typescript
export type DebugPanelTabId = 'pipeline' | 'classify' | 'bloques' | 'tools' | 'state' | 'tokens' | 'ingest' | 'config'
```

Replace with:

```typescript
export type DebugPanelTabId = 'pipeline' | 'classify' | 'bloques' | 'tools' | 'state' | 'tokens' | 'ingest' | 'config' | 'subloop'
```
</action>

<acceptance_criteria>
- `grep -c "import type { SubLoopDebugPayload } from '@/lib/agents/somnio-v4/sub-loop/debug-payload'" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/sandbox/types.ts` returns 1
- `grep -c "subLoopDebug?: SubLoopDebugPayload" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/sandbox/types.ts` returns 1
- `grep -c "'subloop'" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/sandbox/types.ts` returns >= 1
- `grep "export type DebugPanelTabId" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/sandbox/types.ts` output contains `| 'subloop'`
- The new `subLoopDebug` field is positioned inside the DebugTurn interface (verifiable: line number of new field > line number of `threshold?: number` in DebugTurn block AND < the line `}` closing DebugTurn)
</acceptance_criteria>

### Task 4: Verify TypeScript compiles + commit

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/CLAUDE.md (commit conventions)
</read_first>

<action>
Run `pnpm typecheck` from repo root. Must exit 0 with zero errors. If errors exist, fix them — most likely culprit: typo in the import path or forgetting the `import type` keyword (Plan 01 declares types only, so all imports MUST use `import type` to avoid emitting runtime require statements).

After typecheck passes, stage and commit:

```bash
git add src/lib/agents/somnio-v4/sub-loop/debug-payload.ts src/lib/agents/somnio-v4/types.ts src/lib/sandbox/types.ts
git commit -m "$(cat <<'EOF'
feat(v4-subloop-debug-view): types foundation for SubLoopDebugPayload

Standalone: v4-subloop-debug-view / Plan 01.

- New file sub-loop/debug-payload.ts with SubLoopDebugPayload +
  SubLoopToolCallSnapshot + SubLoopKbHitSnapshot interfaces (D-02).
  Self-contained to avoid circular imports types.ts <-> sandbox/types.ts.
- types.ts: V4AgentOutput.subLoopDebug optional field (mirror analog of
  subLoopReason + threshold already in place from Plan 07 parent standalone).
- sandbox/types.ts: DebugTurn.subLoopDebug optional + DebugPanelTabId
  extended with 'subloop' tab id (D-04).

LOCKED files untouched (D-08): sub-loop/output-schema.ts, prompt.ts, tools.ts.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

Do NOT push yet — Plan 05 batches the push after all plans land (allows Pitfall 2 git pull rebase against the concurrent session).
</action>

<acceptance_criteria>
- `pnpm typecheck` exits 0 from repo root
- `git log --oneline -1` shows commit subject `feat(v4-subloop-debug-view): types foundation for SubLoopDebugPayload`
- `git status` shows working tree clean for the 3 files in this plan (modified files staged + committed)
- `git diff origin/main..HEAD --name-only` lists exactly: `src/lib/agents/somnio-v4/sub-loop/debug-payload.ts`, `src/lib/agents/somnio-v4/types.ts`, `src/lib/sandbox/types.ts` (no extra files in this commit)
</acceptance_criteria>

## Verification

After this plan completes:
- The 3 files exist and pass typecheck
- No runtime code added (types only)
- No LOCKED files touched
- Plans 02 and 04 can now import `SubLoopDebugPayload` and `SubLoopToolCallSnapshot` / `SubLoopKbHitSnapshot` from `./sub-loop/debug-payload` and `@/lib/agents/somnio-v4/sub-loop/debug-payload` respectively
