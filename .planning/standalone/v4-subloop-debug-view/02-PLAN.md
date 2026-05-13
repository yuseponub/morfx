---
plan: 02
title: Sub-Loop onDebug Callback Hook — additive in concurrent-session file
wave: 1
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/index.ts
autonomous: true
estimated_minutes: 30
locked_files_blocked:
  - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/tools.ts
must_haves:
  truths:
    - "runSubLoop accepts an optional onDebug callback (D-03)"
    - "runSubLoop measures latency from body entry to each return/throw"
    - "onDebug fires at 4 sites: catch-before-throw, invariant-violation, nunca-decir-violation, success"
    - "Payload uses AI SDK v6 field names (tc.input, tr.output) — NOT (tc.args, tr.result) (Pitfall 1)"
    - "Existing diagnostic peek lines (concurrent session ownership) remain INTACT"
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "runSubLoop with onDebug callback hook (additive)"
      contains: "onDebug?:"
  key_links:
    - from: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/debug-payload.ts"
      via: "type import of SubLoopDebugPayload + SubLoopToolCallSnapshot + SubLoopKbHitSnapshot"
      pattern: "from './debug-payload'"
---

## Objective

Add an optional `onDebug` callback parameter to `runSubLoop` (D-03) that fires at each of the four exit points with a `SubLoopDebugPayload` snapshot. The callback uses AI SDK v6 field names (`tc.input` / `tr.output`) — Pitfall 1 in RESEARCH.md confirms that the existing diagnostic peek at lines 132-145 already uses the correct v6 names since iter 7c (commit caf906a + 3e009d6), so the codebase is consistent.

**Concurrent-session coordination (Pitfall 2):** Another Claude session is iterating diagnostic wraps in this file. Our edits MUST be ADDITIVE — do NOT delete or restructure their existing try/catch or peek logic. We add: (1) a new `onDebug?` arg, (2) a `t0` latency timer at the top of the body, (3) helper `extractStepData(result)` that wraps the AI SDK v6 step extraction once, and (4) four `args.onDebug?.(payload)` invocations placed IMMEDIATELY BEFORE existing returns / throws.

## Tasks

### Task 1: Add `onDebug?` parameter + latency timer + step extraction helper

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts (entire file — 251 lines)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/debug-payload.ts (created by Plan 01)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts (lines 11-23 — KbHit shape for kbHits extraction)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/crm-reader/index.ts:59-68 (CANONICAL AI SDK v6 step extraction pattern)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (sections "Pattern 3: AI SDK v6 result.steps[] Extraction" + "Sub-Loop Internals: Where to Hook onDebug" + "Pitfall 2 Concurrent session coordination" + "Pitfall 6 Truncation site")
</read_first>

<action>
Edit `src/lib/agents/somnio-v4/sub-loop/index.ts`:

**Step 1 — Update imports.** At the top of the file, after the existing imports block (line 13: `import { SOMNIO_V4_AGENT_ID } from '../config'`), add:

```typescript
import type {
  SubLoopDebugPayload,
  SubLoopToolCallSnapshot,
  SubLoopKbHitSnapshot,
} from './debug-payload'
```

**Step 2 — Add `onDebug?` to `runSubLoop` args.** Find the existing signature at line 79:

```typescript
export async function runSubLoop(args: {
  reason: SubLoopReason
  ctx: SubLoopContext
}): Promise<LoopOutcome> {
```

Replace with:

```typescript
export async function runSubLoop(args: {
  reason: SubLoopReason
  ctx: SubLoopContext
  /**
   * Optional debug callback (D-03) — fires before each return/throw with a
   * snapshot of telemetry (toolCalls, toolResults, kbHits, outcome, violations,
   * errorMessage, latencyMs). Caller can capture into a closure variable to
   * propagate to V4AgentOutput.subLoopDebug. Synchronous — not awaited.
   * Standalone: v4-subloop-debug-view / Plan 02.
   */
  onDebug?: (payload: SubLoopDebugPayload) => void
}): Promise<LoopOutcome> {
```

**Step 3 — Add latency timer + helper after the function opens.** The function body currently starts at line 83 with `const tools = buildSubLoopTools(args.reason, args.ctx)`. Insert IMMEDIATELY BEFORE that line:

```typescript
  // Latency timer for SubLoopDebugPayload (Plan 02). performance.now() is
  // available in Vercel Node 18+ runtime without import.
  const t0 = performance.now()

```

Then, IMMEDIATELY AFTER the `const tools = buildSubLoopTools(...)` line, add the helper function as an inner closure (so it can read `args.reason` if needed via parameter):

```typescript

  // Extract AI SDK v6 step data using CORRECT field names (Pitfall 1: input/output, NOT args/result).
  // Canonical pattern from src/lib/agents/crm-reader/index.ts:59-68.
  function extractStepData(
    result: Awaited<ReturnType<typeof generateText>> | null,
  ): {
    toolCalls: SubLoopToolCallSnapshot[]
    toolResults: SubLoopToolCallSnapshot[]
    kbHits?: SubLoopKbHitSnapshot[]
    stepCount: number
    finishReason?: string
  } {
    if (!result) {
      return { toolCalls: [], toolResults: [], stepCount: 0 }
    }
    const steps = result.steps ?? []
    const toolCalls: SubLoopToolCallSnapshot[] = steps.flatMap((step) =>
      (step.toolCalls ?? []).map((tc) => ({
        toolName: tc.toolName,
        input: tc.input,
        output: null,
        outputPreview: undefined,
      })),
    )
    // Build toolResults — separate flat list keyed for the UI per D-02 verbatim.
    const toolResults: SubLoopToolCallSnapshot[] = steps.flatMap((step) =>
      (step.toolResults ?? []).map((tr) => {
        const out: unknown = tr.output
        // Pitfall 6: truncate at emission site, capped 500 chars.
        const outputPreview =
          typeof out === 'string'
            ? out.slice(0, 500)
            : JSON.stringify(out).slice(0, 500)
        return {
          toolName: tr.toolName,
          input: tr.input,
          output: out,
          outputPreview,
        }
      }),
    )

    // D-06: extract kb_search hits with structural type check; silent omission on shape mismatch.
    let kbHits: SubLoopKbHitSnapshot[] | undefined = undefined
    const kbResult = toolResults.find((tr) => tr.toolName === 'kb_search')
    if (kbResult) {
      const hits = kbResult.output
      if (Array.isArray(hits)) {
        if (hits.length === 0) {
          kbHits = []
        } else {
          const first = hits[0] as Record<string, unknown>
          if (
            typeof first?.topic === 'string' &&
            typeof first?.similarity === 'number'
          ) {
            // Structural check passed — safe to cast.
            // Cast targets the runtime shape returned by kb-search-tool.ts (KbHit[]).
            type KbHitRow = {
              topic: string
              similarity: number
              canonicalResponse: string | null
              nuncaDecirRules?: string[]
            }
            kbHits = (hits as KbHitRow[]).map((h) => ({
              topic: h.topic,
              similarity: h.similarity,
              contentPreview: (h.canonicalResponse ?? '').slice(0, 200),
              hasNuncaDecir: (h.nuncaDecirRules?.length ?? 0) > 0,
            }))
          }
        }
      }
    }

    return {
      toolCalls,
      toolResults,
      kbHits,
      stepCount: steps.length,
      finishReason: result.finishReason,
    }
  }

```

The helper is placed INSIDE the function body (closure over `args`) but AFTER `tools = buildSubLoopTools(...)` so it doesn't interfere with the existing local declarations.
</action>

<acceptance_criteria>
- `grep -c "onDebug?: (payload: SubLoopDebugPayload) => void" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns 1
- `grep -c "const t0 = performance.now()" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns 1
- `grep -c "function extractStepData" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns 1
- `grep -c "SubLoopDebugPayload" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns >= 2 (import + signature)
- `grep -cE "tc\\.input\\b" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns >= 1
- `grep -cE "tr\\.output\\b" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns >= 1
- The existing diagnostic peek block (lines that currently contain `srSteps` and `toolCallsBrief` / `toolResultsBrief`) is INTACT — `grep -c "toolCallsBrief" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` still returns >= 1 (untouched)
</acceptance_criteria>

### Task 2: Wire `args.onDebug?.(...)` invocations at the 4 exit sites

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts (lines 116-167 = catch block; lines 175-198 = invariant escalation; lines 206-238 = nunca-decir escalation; lines 240-249 = success return)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (section "Sub-Loop Internals: Where to Hook onDebug" + "Pitfall 7: errorMessage path — payload before throw" option (a))
</read_first>

<action>
Add four `args.onDebug?.(...)` invocations in `src/lib/agents/somnio-v4/sub-loop/index.ts`. Each invocation MUST appear IMMEDIATELY BEFORE the existing `throw` or `return` statement at that site. DO NOT delete or modify the surrounding code.

**Site 1 — Inside `catch (genErr)` block, BEFORE the `throw new Error(...)`.**

Find the existing `throw new Error(` line near line 160 (it spans multiple lines ending with `cause="${cause}"`)`)`. Immediately BEFORE the `throw new Error(` line, insert:

```typescript
    // D-03: emit debug payload BEFORE throw so caller closure captures it (Pitfall 7 option a).
    const errStep = extractStepData(subLoopResult)
    args.onDebug?.({
      fired: true,
      reason: args.reason,
      finishReason: errStep.finishReason ?? srFinishReason ?? undefined,
      stepCount: errStep.stepCount,
      toolCalls: errStep.toolCalls,
      toolResults: errStep.toolResults,
      kbHits: errStep.kbHits,
      outcome: undefined,
      latencyMs: performance.now() - t0,
      errorMessage: `${errName}: ${errMsg}`,
    })
```

**Site 2 — Invariant violation escalation, BEFORE the `return escalated` at line 197.**

Find the existing block:
```typescript
    const escalated: LoopOutcome = {
      status: 'no_match',
      responseTemplate: 'handoff_humano',
      ...
    }
    return escalated
```
inside the `if (!invariantCheck.ok) { ... }` block. Immediately BEFORE the `return escalated` line, insert:

```typescript
    // D-03: emit debug payload before returning escalated outcome.
    const invStep = extractStepData(subLoopResult)
    args.onDebug?.({
      fired: true,
      reason: args.reason,
      finishReason: invStep.finishReason,
      stepCount: invStep.stepCount,
      toolCalls: invStep.toolCalls,
      toolResults: invStep.toolResults,
      kbHits: invStep.kbHits,
      outcome: escalated,
      invariantViolation: invariantCheck.violation ?? 'unspecified',
      latencyMs: performance.now() - t0,
    })
```

**Site 3 — Nunca-decir violation escalation, BEFORE the `return escalated` inside the `if (!check.ok) { ... }` block (around line 236).**

Find the second `const escalated: LoopOutcome = { ... }` inside the `if (output.status === 'canonical') { ... if (!check.ok) { ... } }` block. The block currently looks like:

```typescript
    if (!check.ok) {
      const escalated: LoopOutcome = { ... }
      getCollector()?.recordEvent(...)
      return escalated
    }
```

Note the existing code calls `getCollector()?.recordEvent(...)` AFTER building `escalated` but BEFORE the `return`. Place our emission IMMEDIATELY BEFORE that `return escalated` line (after the existing recordEvent call). Insert:

```typescript
      // D-03: emit debug payload before returning escalated outcome.
      const ndStep = extractStepData(subLoopResult)
      args.onDebug?.({
        fired: true,
        reason: args.reason,
        finishReason: ndStep.finishReason,
        stepCount: ndStep.stepCount,
        toolCalls: ndStep.toolCalls,
        toolResults: ndStep.toolResults,
        kbHits: ndStep.kbHits,
        outcome: escalated,
        nuncaDecirViolation: check.violation ?? 'unspecified',
        latencyMs: performance.now() - t0,
      })
```

(Note 6-space indentation since this is nested two levels deep: `if (output.status === 'canonical') { if (!check.ok) { ... } }`.)

**Site 4 — Success path, BEFORE the final `return output` at line 249.**

The function ends with:

```typescript
  getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
    ...
  })

  return output
}
```

Immediately BEFORE `return output`, insert:

```typescript
  // D-03: emit debug payload on success path.
  const okStep = extractStepData(subLoopResult)
  args.onDebug?.({
    fired: true,
    reason: args.reason,
    finishReason: okStep.finishReason,
    stepCount: okStep.stepCount,
    toolCalls: okStep.toolCalls,
    toolResults: okStep.toolResults,
    kbHits: okStep.kbHits,
    outcome: output,
    latencyMs: performance.now() - t0,
  })

```
</action>

<acceptance_criteria>
- `grep -c "args.onDebug?.(" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns 4
- `grep -c "performance.now() - t0" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns 4 (one per emission site)
- `grep -c "extractStepData(subLoopResult)" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns 4 (one per site)
- `grep -c "errorMessage:" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns >= 1 (catch site)
- `grep -c "invariantViolation:" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns >= 1
- `grep -c "nuncaDecirViolation:" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns >= 1
- Existing diagnostic peek block intact: `grep -c "toolCallsBrief" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` still returns >= 1 (NOT removed)
- Existing throw line intact: `grep -c "SubLoop generateText reason=" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts` returns >= 1 (NOT removed)
</acceptance_criteria>

### Task 3: Typecheck + commit

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/CLAUDE.md (commit style)
</read_first>

<action>
Run `pnpm typecheck`. Must exit 0. Likely failure modes:
- `'subLoopResult' is possibly 'null'` inside `extractStepData` — already handled by the `if (!result) return ...` guard. The 4 emission sites pass `subLoopResult` directly which IS nullable; the helper handles null internally so this is fine.
- Type narrowing error on `tr.input` — AI SDK v6 typing should resolve to `unknown` via `InferToolInput`. If TypeScript complains, cast at the call site with a comment: `input: tr.input as unknown` (only inside extractStepData, NOT in user-facing types).
- `errStep.finishReason` is `string | undefined` and `errorMessage` field expects `string | undefined` — should be OK. If not, wrap: `errStep.finishReason ?? undefined`.

After typecheck passes, commit:

```bash
git add src/lib/agents/somnio-v4/sub-loop/index.ts
git commit -m "$(cat <<'EOF'
feat(v4-subloop-debug-view): runSubLoop onDebug callback hook

Standalone: v4-subloop-debug-view / Plan 02 (D-03).

- New optional onDebug callback arg fires before each return/throw with
  SubLoopDebugPayload (4 sites: catch-before-throw, invariant-violation,
  nunca-decir-violation, success).
- New extractStepData helper uses correct AI SDK v6 names (tc.input,
  tr.output) per Pitfall 1; mirrors canonical pattern from
  crm-reader/index.ts:59-68.
- Truncation at emission site: outputPreview capped 500 chars (D-02, Pitfall 6).
- KB hits parsed from toolResults[?.toolName === 'kb_search'] with structural
  type check; silent omission on shape mismatch (D-06).
- Latency timer t0 = performance.now() wraps entire body.
- Existing diagnostic peek block intact — additive only (Pitfall 2 concurrent
  session coordination).

LOCKED files untouched: output-schema.ts, prompt.ts, tools.ts.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

Do NOT push — Plan 05 batches push.
</action>

<acceptance_criteria>
- `pnpm typecheck` exits 0 from repo root
- `git log --oneline -1` shows `feat(v4-subloop-debug-view): runSubLoop onDebug callback hook`
- `git diff origin/main..HEAD --name-only` adds `src/lib/agents/somnio-v4/sub-loop/index.ts` to the list from Plan 01
- `git diff origin/main -- 'src/lib/agents/somnio-v4/sub-loop/output-schema.ts' 'src/lib/agents/somnio-v4/sub-loop/prompt.ts' 'src/lib/agents/somnio-v4/sub-loop/tools.ts'` is empty (LOCKED untouched)
- `git diff origin/main -- 'src/lib/agents/somnio-v3/**' 'src/lib/agents/somnio-recompra/**' 'src/lib/agents/godentist/**' 'src/lib/agents/godentist-fb-ig/**' 'src/lib/agents/somnio-pw-confirmation/**'` is empty (Regla 6)
</acceptance_criteria>

## Verification

After this plan:
- `runSubLoop` accepts `onDebug?` and emits payload at 4 sites
- Existing callers (somnio-v4-agent.ts at lines 144 and 313) continue to work UNCHANGED — the callback is optional, no caller needs to pass it yet (Plan 03 wires the callers)
- AI SDK v6 step extraction is centralized in `extractStepData` helper; all 4 sites share the same logic
- Concurrent session's diagnostic peek lines are intact
