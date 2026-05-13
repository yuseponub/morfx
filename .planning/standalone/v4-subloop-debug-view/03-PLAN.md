---
plan: 03
title: Agent + Engine wiring — propagate subLoopDebug from runSubLoop to DebugTurn
wave: 2
depends_on: [01, 02]
files_modified:
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/engine-v4.ts
autonomous: true
estimated_minutes: 25
locked_files_blocked:
  - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/tools.ts
must_haves:
  truths:
    - "somnio-v4-agent.ts declares capturedSubLoopDebug closure var and passes onDebug to each runSubLoop call"
    - "All V4AgentOutput return sites (success + silence + error catch) include subLoopDebug field"
    - "engine-v4.ts propagates output.subLoopDebug to debugTurn.subLoopDebug in BOTH success and error branches (OQ-1/OQ-2 recommended yes)"
    - "Zero TypeScript errors"
  artifacts:
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "capturedSubLoopDebug propagation across 2 runSubLoop call sites + 3 return sites + catch"
      contains: "capturedSubLoopDebug"
    - path: "src/lib/agents/somnio-v4/engine-v4.ts"
      provides: "debugTurn.subLoopDebug populated from output.subLoopDebug"
      contains: "subLoopDebug: output.subLoopDebug"
  key_links:
    - from: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      to: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      via: "onDebug callback arg in runSubLoop call"
      pattern: "onDebug: \\(p\\) =>"
    - from: "src/lib/agents/somnio-v4/engine-v4.ts"
      to: "src/lib/agents/somnio-v4/types.ts"
      via: "output.subLoopDebug field read"
      pattern: "subLoopDebug: output\\.subLoopDebug"
---

## Objective

Wire the `onDebug` callback from Plan 02 all the way through `somnio-v4-agent.ts` → `engine-v4.ts` → DebugTurn so the sandbox HTTP response carries the payload. The agent declares a closure variable (`capturedSubLoopDebug`), passes `onDebug: (p) => { capturedSubLoopDebug = p }` to each `runSubLoop({ ... })` call, and injects the captured value into every V4AgentOutput return — including the error-catch path per Pitfall 7 option (a) (RESEARCH OQ-1 recommended YES).

Engine-v4 then propagates `output.subLoopDebug` into `debugTurn.subLoopDebug` in BOTH the success branch (after line 165 next to `threshold`) AND the error branch (line 181) — RESEARCH OQ-2 recommended YES for symmetry. The error branch can't read `output.subLoopDebug` directly (the catch fires when processMessage throws), but if the agent's own catch block at lines 573-590 included `subLoopDebug: capturedSubLoopDebug` on its error output, that value reaches engine-v4's success branch (not error branch — agent's catch returns success=false, not throws). The engine-v4 error branch fires only when the agent itself throws unhandled, which is rare. We pass through in both for symmetry but understand the error branch path receives `subLoopDebug` only when the agent's own catch captured it (closure preserves the variable across the throw, see Pitfall 7).

## Tasks

### Task 1: Declare closure var + wire `onDebug` to both `runSubLoop` calls + add `subLoopDebug` to V4AgentOutput returns

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts (lines 1-100 for imports + processUserMessage signature; lines 100-200 for first runSubLoop call at ~line 144; lines 280-360 for cas_reject runSubLoop call at ~line 313; lines 200-590 for all V4AgentOutput return sites)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (sections "File-by-file Change Map" item 5 + "Pitfall 7 errorMessage path — payload before throw" option (a))
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/debug-payload.ts (Plan 01 — SubLoopDebugPayload type)
</read_first>

<action>
Edit `src/lib/agents/somnio-v4/somnio-v4-agent.ts`:

**Step 1 — Add import.** At the top of the file with the other imports from `./sub-loop` (look for the existing `import { runSubLoop } from './sub-loop'` or similar), add:

```typescript
import type { SubLoopDebugPayload } from './sub-loop/debug-payload'
```

If there is already a `import { runSubLoop, type SubLoopReason } from './sub-loop'`-style line, keep that and add the new type import as a separate line. Do not merge into the same line because `./sub-loop` and `./sub-loop/debug-payload` are different module paths.

**Step 2 — Declare closure variable inside `processUserMessage`.** The function `processUserMessage` starts around line 67. Find the early section (before any `runSubLoop` call) where `let timerSignals` or `let mergedState` are declared. Add adjacent to those declarations:

```typescript
    // Plan 03 D-03: closure var captures sub-loop debug payload across all
    // runSubLoop invocations + error path. Survives throws (Pitfall 7 option a).
    let capturedSubLoopDebug: SubLoopDebugPayload | undefined = undefined
```

(6-space indentation since it's inside `processUserMessage` body which is one level inside the try.)

**Step 3 — Add `onDebug` to the first `runSubLoop` call (~line 144).** Find:

```typescript
      const outcome = await runSubLoop({
        reason: earlyReason,
        ctx: {
          workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
          conversationId: input.sessionId ?? '',
          sessionId: input.sessionId ?? '',
          userMessage: input.message,
          recentMessages: input.history
            .slice(-4)
            .map((m) => ({ role: m.role, content: m.content })),
        },
      })
```

Add a NEW property `onDebug` after `ctx:` (before the closing `})`):

```typescript
      const outcome = await runSubLoop({
        reason: earlyReason,
        ctx: {
          workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
          conversationId: input.sessionId ?? '',
          sessionId: input.sessionId ?? '',
          userMessage: input.message,
          recentMessages: input.history
            .slice(-4)
            .map((m) => ({ role: m.role, content: m.content })),
        },
        onDebug: (p) => {
          capturedSubLoopDebug = p
        },
      })
```

**Step 4 — Add `onDebug` to the second `runSubLoop` call (~line 313, CAS reject branch).** Find the equivalent block:

```typescript
      const outcome = await runSubLoop({
        reason: 'cas_reject',
        ctx: { ... },
      })
```

Apply the SAME modification — append `onDebug: (p) => { capturedSubLoopDebug = p }` as a new property.

**Step 5 — Inject `subLoopDebug` into ALL V4AgentOutput returns.** Find every `return { success: true, ... }` AND `return { success: false, ... }` that comes from `processUserMessage` (do not modify `processSystemEvent` returns — out of scope, timer path doesn't fire sub-loop). The return sites are:

(a) Guard handoff return at lines 210-243 (the block that returns when `guardResult.blocked` is true). Add `subLoopDebug: capturedSubLoopDebug,` adjacent to the existing `subLoopReason: null, threshold,` lines.

(b) Natural silence return at lines 462-508. Same pattern — add adjacent to `subLoopReason: null, threshold,`.

(c) Final messages return at lines 514-572. Same pattern — add adjacent to `subLoopReason: null, threshold,`.

(d) Catch block error return at lines 577-589. This block currently returns:

```typescript
    return {
      success: false,
      messages: [],
      errorMessage: errStack ? `${errMsg} :: ${errStack}` : errMsg,
      intentsVistos: input.intentsVistos,
      ...
      timerSignals: [],
    }
```

Add `subLoopDebug: capturedSubLoopDebug,` BEFORE the closing `}` (Pitfall 7 option a — closure var preserves the value if onDebug fired before the throw).

(e) The two `return mapOutcomeToAgentOutput({ ... })` sites at lines 185-194 and 352-361. These delegate to `mapOutcomeToAgentOutput` to build the V4AgentOutput. Add `subLoopDebug: capturedSubLoopDebug,` as a new property in EACH call site's args object.

**Step 6 — Add subLoopDebug to `mapOutcomeToAgentOutput` function signature + return.**

Find the `function mapOutcomeToAgentOutput(args: { ... }): V4AgentOutput` declaration (search via grep — likely in the same file or imported from a sibling). If it's in the same file:

- Add `subLoopDebug?: SubLoopDebugPayload` to the args parameter object.
- Inside the function body, include `subLoopDebug: args.subLoopDebug,` in the V4AgentOutput it returns.

If `mapOutcomeToAgentOutput` is in a DIFFERENT file, read that file first via Read tool, then apply the same modification there. Run `grep -n "function mapOutcomeToAgentOutput" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts` and adjacent files to locate.
</action>

<acceptance_criteria>
- `grep -c "let capturedSubLoopDebug: SubLoopDebugPayload | undefined" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 1
- `grep -cE "onDebug: \\(p\\) =>" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 2 (one per runSubLoop call)
- `grep -c "capturedSubLoopDebug = p" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 2
- `grep -c "subLoopDebug: capturedSubLoopDebug" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns >= 5 (3 return sites + catch + 2 mapOutcomeToAgentOutput args = 5+ depending on mapOutcome location)
- `grep -c "import type { SubLoopDebugPayload }" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 1
- The mapOutcomeToAgentOutput function (whether in this file or a sibling) accepts and propagates `subLoopDebug`
</acceptance_criteria>

### Task 2: Propagate `output.subLoopDebug` to `debugTurn.subLoopDebug` in engine-v4.ts

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/engine-v4.ts (entire file — 205 lines; key sites: line 163-165 success branch debugTurn, line 181 error branch debugTurn)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (Example 3 + section "File-by-file Change Map" item 7 + "Open Questions OQ-2")
</read_first>

<action>
Edit `src/lib/agents/somnio-v4/engine-v4.ts`:

**Step 1 — Success branch.** Find the existing block at lines 161-165:

```typescript
          // V4 escalation visibility (Plan 03 D-20 TODO honored in Plan 07 debug):
          // subLoopReason populated when sub-loop fired (otherwise null/undefined).
          // threshold = platform_config.somnio_v4_low_confidence_threshold value used.
          subLoopReason: output.subLoopReason ?? undefined,
          threshold: output.threshold,
```

Immediately AFTER `threshold: output.threshold,` and BEFORE the next line (`timerSignals: ...`), add:

```typescript
          // Standalone: v4-subloop-debug-view / Plan 03 (D-02).
          // Sub-loop debug payload propagated when sub-loop fired (otherwise undefined).
          subLoopDebug: output.subLoopDebug,
```

**Step 2 — Error branch.** Find the catch block at lines 173-202 — specifically the debugTurn at lines 181-197:

```typescript
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: { ... },
          tools: [],
          tokens: { ... },
          stateAfter: input.state,
        },
```

The error branch fires when `processMessage(...)` itself throws unhandled (the agent's own catch block already converts throws to `success: false` with `errorMessage`, so this engine-v4 catch is a fallback). In this branch, `output` does NOT exist in scope (catch block) — we cannot read `output.subLoopDebug`. RESEARCH OQ-2 recommends YES for symmetry; the only way to surface anything here is leave the field unset (undefined). Since the field is optional, simply do not add it in the error branch — equivalent to undefined.

**However**, for visibility, add an EXPLICIT undefined annotation as a comment marker so the next maintainer understands:

Insert immediately AFTER `stateAfter: input.state,` and BEFORE the closing `}` of the debugTurn object:

```typescript
          // Standalone: v4-subloop-debug-view / Plan 03 (D-02).
          // Engine-v4 catch branch fires only on unhandled throw from processMessage
          // (agent's own catch at lines 573-590 normally converts throws to success=false
          // with errorMessage + subLoopDebug populated, reaching the success branch above).
          // No subLoopDebug surfaced here — undefined by omission.
```

(no code added, just comment for traceability — the optional field defaults to undefined).
</action>

<acceptance_criteria>
- `grep -c "subLoopDebug: output.subLoopDebug" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/engine-v4.ts` returns 1
- The new line `subLoopDebug: output.subLoopDebug,` appears AFTER the existing `threshold: output.threshold,` line (verifiable: `grep -nA 1 "threshold: output.threshold" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/engine-v4.ts` shows subLoopDebug next)
- `grep -c "v4-subloop-debug-view / Plan 03" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/engine-v4.ts` returns >= 1
- No new imports needed in engine-v4.ts (output type already imported via processMessage return type inference)
</acceptance_criteria>

### Task 3: Typecheck + commit

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/CLAUDE.md (commit style)
</read_first>

<action>
Run `pnpm typecheck`. Must exit 0.

Likely failure modes:
- `Type 'SubLoopDebugPayload | undefined' is not assignable to type 'undefined'` — means a return site is missing the field but also possibly a path. Search for any `return { ... }` in processUserMessage and ensure all branches include `subLoopDebug` (or rely on the optional `?` field marker).
- If TypeScript complains about the `processSystemEvent` returns missing the field, leave them — they are returning the same V4AgentOutput type and the field is optional. If a strict-mode error appears there, add `subLoopDebug: undefined` explicitly on those returns (system events never fire sub-loop, so undefined is correct).

After typecheck passes:

```bash
git add src/lib/agents/somnio-v4/somnio-v4-agent.ts src/lib/agents/somnio-v4/engine-v4.ts
git commit -m "$(cat <<'EOF'
feat(v4-subloop-debug-view): propagate subLoopDebug through agent + engine

Standalone: v4-subloop-debug-view / Plan 03 (D-02, D-03).

- somnio-v4-agent.ts: closure var capturedSubLoopDebug captures the payload
  emitted by runSubLoop's onDebug callback (Plan 02). Wired to both runSubLoop
  call sites (low_confidence/razonamiento_libre + cas_reject) and propagated
  to ALL V4AgentOutput return paths including the catch block (Pitfall 7
  option a — closure survives the throw).
- engine-v4.ts: success branch debugTurn now includes
  subLoopDebug: output.subLoopDebug adjacent to existing threshold field.
  Error branch leaves it undefined by omission (catch fires only on
  unhandled throws which is rare — agent's own catch normally produces
  success=false on the happy path).

LOCKED files untouched. Regla 6 cross-agent untouched.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

Do NOT push — Plan 05 batches.
</action>

<acceptance_criteria>
- `pnpm typecheck` exits 0 from repo root
- `git log --oneline -1` shows `feat(v4-subloop-debug-view): propagate subLoopDebug through agent + engine`
- `git diff origin/main..HEAD --name-only` after Plan 03 includes (from prior plans + this plan):
  - src/lib/agents/somnio-v4/sub-loop/debug-payload.ts
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/sandbox/types.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/engine-v4.ts
- `git diff origin/main -- 'src/lib/agents/somnio-v4/sub-loop/output-schema.ts' 'src/lib/agents/somnio-v4/sub-loop/prompt.ts' 'src/lib/agents/somnio-v4/sub-loop/tools.ts'` is empty
- `git diff origin/main -- 'src/lib/agents/somnio-v3/**' 'src/lib/agents/somnio-recompra/**' 'src/lib/agents/godentist/**' 'src/lib/agents/godentist-fb-ig/**' 'src/lib/agents/somnio-pw-confirmation/**'` is empty
</acceptance_criteria>

## Verification

After this plan:
- The full data path agent → engine → DebugTurn carries the payload (modulo Plan 04's UI consumer)
- Sandbox HTTP response (`/api/sandbox/process`) now includes `debugTurn.subLoopDebug` for v4 turns when sub-loop fires
- Verifiable via temporary console.log or browser network tab inspect on existing turns (not required — Plan 05 smoke covers this)
