---
plan: 05
title: Verification gates + git pull rebase + push to main + LEARNINGS.md
wave: 3
depends_on: [01, 02, 03, 04]
files_modified:
  - .planning/standalone/v4-subloop-debug-view/LEARNINGS.md
autonomous: false
estimated_minutes: 30
locked_files_blocked:
  - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/tools.ts
must_haves:
  truths:
    - "pnpm typecheck passes clean"
    - "pnpm lint passes clean"
    - "Regla 6 gate (cross-agent paths) returns empty diff"
    - "LOCKED files gate returns empty diff"
    - "All 4 prior commits pushed to origin/main"
    - "LEARNINGS.md documents findings + concurrent-session-coordination outcome"
    - "User-driven smoke checkpoint defined for /sandbox testing"
  artifacts:
    - path: ".planning/standalone/v4-subloop-debug-view/LEARNINGS.md"
      provides: "Standalone retrospective documenting pitfalls + outcomes"
      min_lines: 50
      contains: "Pitfall 1"
  key_links:
    - from: "origin/main"
      to: "HEAD"
      via: "git push"
      pattern: "5+ commits ahead of origin/main pre-push"
---

## Objective

Run the verification gates from RESEARCH.md Pitfall 2 / 3 / 4, rebase against origin/main (to surface any conflict with the concurrent session iterating `sub-loop/index.ts`), push the 4 atomic commits to main, write LEARNINGS.md, and define the user-driven sandbox smoke test as a checkpoint.

This plan is **autonomous: false** because Task 4 is a `checkpoint:human-verify` for the user to manually exercise the new tab in their browser at /sandbox.

## Tasks

### Task 1: Run automated verification gates

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (sections "Pitfall 2 Concurrent session coordination", "Pitfall 3 LOCKED files", "Pitfall 4 Regla 6 — cross-agent contamination")
- /mnt/c/Users/Usuario/Proyectos/morfx-new/CLAUDE.md (Regla 6)
</read_first>

<action>
Run the following sequence from repo root, in order. STOP and surface to user if ANY gate fails.

**Gate 1 — Typecheck:**

```bash
pnpm typecheck
```

Must exit 0.

**Gate 2 — Lint:**

```bash
pnpm lint
```

Must exit 0. If lint warns about a stylistic issue in one of the new files, fix it inline (likely culprit: unused import in subloop-tab.tsx — remove the unused icon). If lint errors point to project-wide pre-existing problems unrelated to our changes (e.g., warnings already present on origin/main), document in Task 3 LEARNINGS as a known pre-existing state but do NOT fail the gate — confirm by checking `git stash; pnpm lint; git stash pop` if needed.

**Gate 3 — LOCKED files diff:**

```bash
git diff origin/main -- \
  'src/lib/agents/somnio-v4/sub-loop/output-schema.ts' \
  'src/lib/agents/somnio-v4/sub-loop/prompt.ts' \
  'src/lib/agents/somnio-v4/sub-loop/tools.ts'
```

Expected: empty output. If any diff appears, ABORT — Plan 02 violated D-08.

**Gate 4 — Regla 6 cross-agent diff:**

```bash
git diff origin/main -- \
  'src/lib/agents/somnio-v3/**' \
  'src/lib/agents/somnio-recompra/**' \
  'src/lib/agents/godentist/**' \
  'src/lib/agents/godentist-fb-ig/**' \
  'src/lib/agents/somnio-pw-confirmation/**'
```

Expected: empty output. If any diff appears, ABORT — D-09 violated.

**Gate 5 — Expected files modified:**

```bash
git diff origin/main..HEAD --name-only | sort
```

Expected exactly this set (sorted):

```
.planning/standalone/v4-subloop-debug-view/01-PLAN.md
.planning/standalone/v4-subloop-debug-view/02-PLAN.md
.planning/standalone/v4-subloop-debug-view/03-PLAN.md
.planning/standalone/v4-subloop-debug-view/04-PLAN.md
.planning/standalone/v4-subloop-debug-view/05-PLAN.md
src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx
src/app/(dashboard)/sandbox/components/debug-panel/index.ts
src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx
src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx
src/lib/agents/somnio-v4/engine-v4.ts
src/lib/agents/somnio-v4/somnio-v4-agent.ts
src/lib/agents/somnio-v4/sub-loop/debug-payload.ts
src/lib/agents/somnio-v4/sub-loop/index.ts
src/lib/agents/somnio-v4/types.ts
src/lib/sandbox/types.ts
```

If file list does NOT match (extra files OR missing files), ABORT and investigate.

**Gate 6 — Confirm correct commit count:**

```bash
git log origin/main..HEAD --oneline
```

Expected: 4 commits (one per Plan 01-04). After this Plan 05 commits LEARNINGS.md, it becomes 5 commits ahead of origin/main.
</action>

<acceptance_criteria>
- `pnpm typecheck` exits 0
- `pnpm lint` exits 0 (or only emits pre-existing warnings documented in LEARNINGS)
- Gate 3 produces empty output
- Gate 4 produces empty output
- Gate 5 file list matches expected (or has only the documented additions/PLAN.md files plus the LEARNINGS file once Task 3 commits)
- Gate 6 shows exactly 4 commits before LEARNINGS commit
</acceptance_criteria>

### Task 2: Rebase against origin/main to resolve concurrent-session conflict

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (Pitfall 2 — Concurrent session coordination on sub-loop/index.ts)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/CONTEXT.md (Coordination Constraint section)
</read_first>

<action>
Fetch latest origin/main and rebase. The concurrent session may have pushed additional diagnostic-wrap commits to `sub-loop/index.ts` during the time it took to land Plans 01-04.

```bash
git fetch origin
git status
git log origin/main..HEAD --oneline
git log HEAD..origin/main --oneline
```

If `HEAD..origin/main` is empty → no remote changes during our plans → proceed to Task 3 push directly.

If `HEAD..origin/main` shows commits → rebase:

```bash
git rebase origin/main
```

**Conflict resolution policy (CONTEXT Coordination Constraint, RESEARCH Pitfall 2):**

If conflict on `src/lib/agents/somnio-v4/sub-loop/index.ts`:
- Our structural changes (new `onDebug?` arg, `t0` timer at top, `extractStepData` helper, 4 emission sites) MUST be preserved.
- Their diagnostic-wrap changes (likely refinements to the catch block lines 116-167) should be RE-APPLIED on top of our structure where possible.
- The agreed merge strategy: KEEP both — our additive callback PLUS their diagnostic peek text refinements.

Practical procedure:
1. Open the conflicted file in editor (or read it with Read tool).
2. Inspect both sides of `<<<<<<<` / `=======` / `>>>>>>>` markers.
3. Construct a merged result that:
   - Preserves our new `onDebug?` arg in the function signature.
   - Preserves our `const t0 = performance.now()` at the top of the body.
   - Preserves our `extractStepData` helper.
   - Preserves our 4 `args.onDebug?.(...)` invocation sites.
   - Preserves any diagnostic-text improvements from the other session (e.g., new fields in the error message).
4. Run `pnpm typecheck` after manual merge — must pass.
5. `git add src/lib/agents/somnio-v4/sub-loop/index.ts && git rebase --continue`.

If conflicts appear in OTHER files (engine-v4, types.ts, sandbox/types.ts, somnio-v4-agent.ts) — those are NOT under concurrent-session ownership; investigate and resolve conservatively (likely a different unrelated session). If ambiguous, ABORT rebase with `git rebase --abort` and surface to user.

After rebase succeeds:

```bash
git log origin/main..HEAD --oneline
# Expected: still 4 commits, possibly with new SHAs after rebase.
pnpm typecheck
```

Typecheck must still pass post-rebase.
</action>

<acceptance_criteria>
- `git fetch origin` succeeds
- After fetch + rebase, `git status` shows clean working tree (no conflicts unresolved)
- `git log origin/main..HEAD --oneline` shows 4 commits ahead
- `pnpm typecheck` exits 0 post-rebase
- No commits dropped from our work (each commit subject `feat(v4-subloop-debug-view): ...` still present in `git log -4 --oneline`)
</acceptance_criteria>

### Task 3: Write LEARNINGS.md + commit + push to main

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/CONTEXT.md (decisions for retrospective)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (pitfalls observed)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/CLAUDE.md (Regla 1 push to Vercel)
</read_first>

<action>
Create `.planning/standalone/v4-subloop-debug-view/LEARNINGS.md` with this structure (fill placeholders with actual outcomes from executing Plans 01-04):

```markdown
# LEARNINGS — v4-subloop-debug-view

**Standalone:** v4-subloop-debug-view
**Shipped:** 2026-05-13
**Parent context:** somnio-sales-v4-runtime-wiring Plan 07 (DORMANT v4 — no routing rule, no production impact)
**Goal:** surface sub-loop tool calls / KB hits / outcome / violations in a new Sub-Loop tab of /sandbox debug panel
**Files touched:** 11 (1 new debug-payload.ts, 1 new subloop-tab.tsx, 5 sandbox UI files, 4 v4 agent/engine/types files)
**Persistence:** ZERO (D-07 runtime-only)

## Pitfalls Hit (or Confirmed Avoided)

### Pitfall 1 — AI SDK v6 field names (`tc.input` / `tr.output`, NOT `tc.args` / `tr.result`)
- **Status:** [CONFIRMED AVOIDED | HIT — describe]
- **How:** Plan 02 helper `extractStepData` uses `tc.input` and `tr.output` per RESEARCH §Pattern 3, verified against canonical pattern in `src/lib/agents/crm-reader/index.ts:59-68`. Existing diagnostic peek in `sub-loop/index.ts` lines 132-145 had been corrected to v6 names since iter 7c (commit caf906a) — so codebase was already consistent.
- **Lesson:** Always verify AI SDK type names against `node_modules/ai/dist/index.d.ts` (or working callers like crm-reader) when adding new step-iteration code.

### Pitfall 2 — Concurrent session coordination on `sub-loop/index.ts`
- **Status:** [NO CONFLICT | CONFLICT RESOLVED — describe what was preserved]
- **Outcome:** [describe — e.g., "Other session pushed 0 commits while Plans 01-04 landed; rebase had no conflict" OR "Conflict on lines 130-145; merged by keeping our extractStepData helper + their refined error message text"]
- **Lesson:** Coordination via "additive-only" rule worked: new param, new helper, new emission lines — no refactor of existing try/catch. The agreement that "structural changes prevail, diagnostic refinements rebase on top" held.

### Pitfall 3 — LOCKED files
- **Status:** CONFIRMED AVOIDED
- **Verification:** Gate 3 in Plan 05 Task 1 returned empty diff for `output-schema.ts`, `prompt.ts`, `tools.ts`.
- **Lesson:** Declaring `SubLoopDebugPayload` in a NEW sibling file (`sub-loop/debug-payload.ts`) instead of editing `output-schema.ts` cleanly avoided the lock.

### Pitfall 4 — Regla 6 cross-agent contamination
- **Status:** CONFIRMED AVOIDED
- **Verification:** Gate 4 in Plan 05 Task 1 returned empty diff for v3 / recompra / godentist / godentist-fb-ig / pw-confirmation paths.
- **Lesson:** Optional `subLoopDebug?: SubLoopDebugPayload` field on shared `DebugTurn` type is invisible to non-v4 agents (they leave it undefined; no construction-site changes needed).

### Pitfall 5 — `kb_search` may not be invoked
- **Status:** Handled explicitly in subloop-tab.tsx via `KbNotConsulted` component when `payload.kbHits === undefined`.
- **Lesson:** UI conditional MUST distinguish "tool returned 0 hits" (`kbHits === []`) from "tool not invoked / shape mismatch" (`kbHits === undefined`).

### Pitfall 6 — Truncation site
- **Status:** Truncation lives at the emission site (inside `runSubLoop`'s `onDebug` callback in `extractStepData`), producing `outputPreview: string` capped 500 chars. Raw `output: unknown` is also retained.
- **Lesson:** Truncate at the producer, not the consumer — keeps wire payload bounded while preserving type fidelity for any future test runner.

### Pitfall 7 — `errorMessage` path (payload before throw)
- **Status:** Option (a) implemented — emit `onDebug` BEFORE `throw` in catch block.
- **Verification:** Plan 03 closure variable `capturedSubLoopDebug` retains the payload across the throw; agent's own catch at lines 573-590 includes `subLoopDebug: capturedSubLoopDebug` on the error V4AgentOutput.
- **Lesson:** Callback-based telemetry must fire BEFORE control transfers (throw / return) so the closure captures it.

### Pitfall 8 — TypeScript strict mode (D-10)
- **Status:** Zero `any` casts in new files. Used `unknown` for tool input/output (callback site is type-erased) + structural narrowing in `extractStepData` for `KbHitRow` cast.
- **Lesson:** AI SDK `TypedToolCall<TOOLS>` becomes `unknown` once flattened into `SubLoopToolCallSnapshot` — narrow via structural check + commented cast.

### Pitfall 9 — Circular import risk
- **Status:** Avoided by declaring types in `sub-loop/debug-payload.ts` — both `v4/types.ts` and `sandbox/types.ts` import from this flat-dependency file.
- **Lesson:** When a new type is consumed by both an agent and the sandbox (which already imports from agents), put the type in a third sibling file rather than the agent's main `types.ts`.

## Smoke Test Outcomes

[Fill in after Task 4 user verification:]
- `"puedo tomar alcohol?"` (intent_confidence ~0.30 post-fix dbddb7d): [PASS / FAIL — describe what was rendered]
- `"hola"` (intent_confidence 0.95, sub-loop should NOT fire): [PASS / FAIL — describe]

## Patterns Established

1. **Optional `onDebug` callback hook on internal functions** — when a function (`runSubLoop`) does internal work the caller wants to observe without changing the return type. Reusable for `comprehend`, `executeInvocations`, etc. in future v4 debug surfaces.

2. **Closure-variable capture for cross-throw payload** — declare `let captured*: T | undefined` in caller scope, pass setter as callback, payload survives the throw.

3. **Sibling-file debug-payload pattern** — types shared between an agent and the sandbox live in a third file that neither side owns. Avoids circular imports.

4. **AI SDK v6 step extraction helper inline** — `extractStepData(result)` returns `{ toolCalls, toolResults, kbHits, stepCount, finishReason }` reused at all emission sites. Pattern works for any future agent that wants to surface step telemetry.

5. **Truncation at emission, not at type** — keep raw values on the type for future flexibility; emit `*Preview` strings for display.

## Concurrent-Session Lessons

- Two parallel Claude sessions on the SAME hot file worked when both followed the rule "additive only, no refactor." The other session's diagnostic-wrap text refinements and our structural callback hook coexisted because neither touched the other's lines.
- `git pull --rebase` BEFORE pushing surfaced the coordination check cleanly. If we had pushed without fetching, the conflict would have appeared at push time, requiring undo.

## Open Follow-Ups (Out of Scope)

- Persisting `subLoopDebug` to `agent_observability_turns` so historical sub-loop calls can be inspected outside of /sandbox. D-07 explicitly excluded this.
- Surfacing similar telemetry for `comprehend` / `executeInvocations` — same pattern (callback hook + payload type + tab) would work.
- A debug-panel-wide search/filter across turns would help when long sandbox sessions produce many `subLoopDebug` entries.
```

Replace bracketed placeholders with actual outcomes (e.g., "CONFIRMED AVOIDED" / specific commit SHAs / outcome of smoke if known at write-time).

Then commit:

```bash
git add .planning/standalone/v4-subloop-debug-view/LEARNINGS.md
git commit -m "$(cat <<'EOF'
docs(v4-subloop-debug-view): LEARNINGS.md — pitfalls + patterns retrospective

Standalone: v4-subloop-debug-view / Plan 05.

Documents the 9 pitfalls from RESEARCH.md with outcomes (avoided/hit),
smoke test placeholders for user verification, established patterns
(onDebug callback hook, closure-variable capture, sibling debug-payload file,
AI SDK v6 step extraction helper, truncation at emission), and
concurrent-session coordination lessons.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

Then push:

```bash
git push origin main
```

Confirm push succeeded:

```bash
git status
# Expected: "Your branch is up to date with 'origin/main'."
```

Per Regla 1 (CLAUDE.md), push to Vercel happens automatically via main branch trigger. Wait for Vercel build to complete OR move directly to Task 4 user-verification checkpoint (the new tab works in `pnpm dev` locally regardless of Vercel deploy state).
</action>

<acceptance_criteria>
- `test -f /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/LEARNINGS.md` returns 0
- LEARNINGS.md is at least 50 lines
- `grep -c "Pitfall 1" /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/LEARNINGS.md` returns >= 1
- `grep -c "Pitfall 9" /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/LEARNINGS.md` returns >= 1
- `git push origin main` succeeds (exit 0)
- `git status` shows working tree clean + up to date with origin/main
- `git log origin/main..HEAD --oneline` returns empty (all 5 commits now on main)
</acceptance_criteria>

### Task 4: User-verified sandbox smoke test (checkpoint)

<what-built>
Plans 01-04 added:
- A new "Sub-Loop" tab in the sandbox debug panel (hidden by default, must be activated from the tab bar — max 3 visible tabs simultaneously)
- The tab surfaces sub-loop telemetry: trigger reason, tool calls (especially `kb_search`), KB hits with similarity, LoopOutcome, invariant/nunca-decir violations, errorMessage, latency
- Zero impact on production agents (v3, recompra, godentist, godentist-fb-ig, pw-confirmation untouched)
- Zero persistence — runtime-only inspector data
</what-built>

<how-to-verify>
1. Pull latest main locally: `git pull origin main`
2. Start dev server: `pnpm dev` (port 3020 per CLAUDE.md)
3. Open browser at `http://localhost:3020/sandbox`
4. In the sandbox UI, select agent `somnio-sales-v4` (workspace Somnio `a3843b3f-c337-4836-92b5-89c58bb98490`)
5. In the debug panel tab bar at the top of the right pane, click the new **"Sub-Loop"** tab to activate it (you may need to close one of pipeline/classify/bloques first since max 3 visible)
6. **Test A — sub-loop FIRES:** Type `puedo tomar alcohol?` and send. Wait for the assistant response.
   - Open the Sub-Loop tab.
   - Expected: a card showing Turno N with `sub-loop fired` badge, reason badge `low_confidence` (yellow), `kb_search` listed in tool calls (click to expand and see the input `{ "query": "puedo tomar alcohol?", ... }` and outputPreview with KB hits JSON), KB Hits section showing similarity bars (likely 1-3 entries with topics like `alcohol` or `contraindicaciones`), and an Outcome section with a status badge.
   - The `intent_confidence` field on the Classify tab should be ~0.30 (post-fix `dbddb7d`).
7. **Test B — sub-loop does NOT fire:** Send `hola`.
   - Open the Sub-Loop tab.
   - Expected: a card showing Turno N+1 with `not fired` badge, the fired=false explainer ("Sub-loop did not fire — confidence ≥ threshold"), and the intent_confidence ≈ 0.95 vs threshold (e.g., 0.70) displayed in the explainer.
8. **Test C — error path (optional, may not surface easily):** No easy reproduction; if a generation error occurs during testing, verify the red error banner renders.
9. Confirm the tab does NOT appear / does NOT crash for non-v4 agents — switch agentId to `somnio-sales-v3` and confirm the Sub-Loop tab shows the empty-state explainer "No v4 turns yet".
</how-to-verify>

<resume-signal>
Type `approved` if Tests A and B pass; describe issues if anything else.
</resume-signal>

<acceptance_criteria>
- User confirms Test A: Sub-Loop tab renders fired card with kb_search tool call + KB hits + outcome for "puedo tomar alcohol?"
- User confirms Test B: Sub-Loop tab renders fired=false explainer for "hola"
- User confirms no regression in Classify / Pipeline / Tools tabs for v3 or v4 agents
- User signs off LEARNINGS.md placeholder updates (smoke section)
</acceptance_criteria>

## Verification

After this plan completes:
- All 5 commits live on origin/main
- Vercel deployment auto-triggered (Regla 1)
- User has verified the new tab works locally
- LEARNINGS.md captures the retrospective for future reference
- Standalone `v4-subloop-debug-view` is SHIPPED — unblocks Plan 07 iters 7/8/9 of `somnio-sales-v4-runtime-wiring` (calibration / templates / KB content iterations now have a real debug surface)
