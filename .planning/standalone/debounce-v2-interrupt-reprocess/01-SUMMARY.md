---
phase: standalone-debounce-v2-interrupt-reprocess
plan: 01
subsystem: somnio-v4 runtime
tags: [interrupt-reprocess, restart-loop, debounce-v2, somnio-v4, regla-6-preserved]
dependency-graph:
  requires: [debounce-interruption-system-v2]
  provides: [outer-restart-loop, agent-discriminator-detector, token-accumulator, pitfall-7-fix]
  affects: [src/lib/agents/engine/v4-production-runner.ts, src/lib/agents/somnio-v4/somnio-v4-agent.ts]
tech-stack:
  added: []
  patterns: [outer-restart-loop, in-lambda-re-comprehension, string-prefix-discriminator]
key-files:
  created: []
  modified:
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/engine/v4-production-runner.ts
decisions:
  - "Restart loop wraps the inner-try body; outer-try finally (lock release + heartbeat stop) stays outside (Pitfall 6)"
  - "Explicit `: string` type annotation on `priorMsg` + `turnEffectiveMessage` resolves TS7022 self-referencing implicit-any when narrowing a `let: string | null` via `??`"
  - "Existing `effectiveMessage` const at old line 188 renamed to `turnEffectiveMessage` to avoid shadowing the new outer-scope `let effectiveMessage: string | null = null`"
  - "Debug adapter recordTokens + addTurn user-row also switched to totalTokensAcrossRestarts (was output.totalTokens) — strict Pitfall 2 single-source-of-truth"
metrics:
  duration: "~25 min execution"
  completed: 2026-05-26
---

# Phase debounce-v2-interrupt-reprocess Plan 01: Wave 1 Runner Restart Loop — Summary

One-liner: Outer `while (shouldRestart)` loop in v4-production-runner with agent-discriminator detector + token accumulator + 4 CKPT restart sites (CKPT-0, agent-disc, CKPT-6a, CKPT-6b Path A), plus Pitfall 7 fix in `mapOutcomeToAgentOutput` propagating sub-loop CKPT-3/4/5 interrupts via `errorMessage` instead of silent handoff.

## Commits

| # | SHA | Subject |
| - | --- | ------- |
| 1 | `e5ead607` | fix(somnio-v4-agent): propagate sub-loop CKPT interrupts via errorMessage (Pitfall 7) |
| 2 | `21b47276` | feat(v4-runner): outer restart loop for Path A interrupts (D-04 + R-01) — drains pending in-lambda instead of silent persist |

Both pushed to `origin/main` as fast-forward (7f31e65a → 21b47276). Branch `exec/debounce-v2-wave6` matches `origin/main`.

## Actual Line Numbers (post-edit, file is now 902 LOC)

### `src/lib/agents/somnio-v4/somnio-v4-agent.ts`

| Site | Line(s) | Notes |
| ---- | ------- | ----- |
| CKPT-1 in-agent interrupt return | 137-156 | UNCHANGED (already correct shape) |
| CKPT-2 in-agent interrupt return | 335-355 | UNCHANGED (already correct shape) |
| `mapOutcomeToAgentOutput` no_match branch (Pitfall 7 fix) | 892-927 | NEW prefix check at L912-918 with full code-comment block at L893-911 explaining why it must NOT add `requiresHuman=true`/`newMode='handoff'` (those are user-facing side effects, this is a transient signal) |

Grep counts:
- `grep -c "interrupted_at_ckpt_"` → 6 (was 3 in-agent CKPT-1 + CKPT-2 lines; now +1 prefix string in fix + 2 in comments)
- `grep -c "outcome.reason.startsWith"` → 1 (the new prefix check)

### `src/lib/agents/engine/v4-production-runner.ts`

| Site | Line(s) | Notes |
| ---- | ------- | ----- |
| Outer-scope accumulators declaration | 119-121 | `totalTokensAcrossRestarts`, `restartIteration`, `effectiveMessage: string \| null` |
| `let shouldRestart = true` + `while (shouldRestart)` open | 138-139 | INSIDE inner try (line 109 open) |
| CKPT-0 inline site → restart-continue | 165-209 | Includes `restartIteration++` at L190, both emits with `restart_iteration` at L198+L204, `shouldRestart = true; continue` at L207-208 |
| `turnEffectiveMessage` declaration (R-03 hook) | 223 | `effectiveMessage ?? legacy-path` with explicit `: string` annotation |
| Token accumulator (R-05) | 323 | `totalTokensAcrossRestarts += (output.totalTokens ?? 0)` |
| Agent-discriminator detector (R-04 + Pitfall 7) | 326-371 | `output.errorMessage.startsWith('interrupted_at_ckpt_')` at L342; `shouldRestart = true; continue` at L367-368 |
| CKPT-6a inline site → restart-continue | 422-460 | `restartIteration++` at L441; `shouldRestart = true; continue` at L456-457 |
| CKPT-6b D-01 split (Path A = restart, Path B = preserve) | 530-589 | Path A branch L536-572 with `restartIteration++` L556; Path B branch L574-588 preserves verbatim with `tokensUsed: totalTokensAcrossRestarts` at L587 |
| `wasInterruptedWithZeroSends` legacy block (Pitfall 5 preserved) | 715-742 | Comment-only update at L702-714 explaining CKPT-7.1 edge case + Pitfall 5 cross-reference |
| Final EngineOutput return → accumulator | 879-884 | Was `output.totalTokens`; now `totalTokensAcrossRestarts` |
| User-turn DB row tokens (Pitfall 2 strict) | 805 | Was `output.totalTokens`; now `totalTokensAcrossRestarts` |
| Debug adapter recordTokens (Pitfall 2 strict) | 866 | Was `output.totalTokens`; now `totalTokensAcrossRestarts` |
| Defensive throw + while close | 896-901 | `} // end while (shouldRestart)` + `throw new Error('[V4-RUNNER] restart loop exited without return...')` with `// eslint-disable-next-line no-unreachable` |
| `startHeartbeat(input.lockHandle)` (Pitfall 6 — OUTSIDE while) | 104 | Verified by manual inspection: heartbeat at L104, while at L139 |

Grep counts (acceptance criteria):
- `while (shouldRestart)`: 3 (≥1) — declaration + close-brace comment + jsdoc header
- `let shouldRestart = true`: 1
- `shouldRestart = true`: 5 (≥4) — `let` at L138 + 4 restart sites (CKPT-0, agent-disc, CKPT-6a, CKPT-6b Path A)
- `restart_iteration:`: 8 (=8 required) — 4 sites × 2 emits (msg_aborted_path_a_combined + pending_list_combined)
- `totalTokensAcrossRestarts`: 7 (≥4) — declaration + 1 accumulator update + 4 token return sites + 1 comment
- `tokensUsed: output.totalTokens`: 0 (== 0 required)
- `effectiveMessage`: 16 (≥5)
- `output.errorMessage.startsWith('interrupted_at_ckpt_')`: 1
- `wasInterruptedWithZeroSends`: 7 (≥3) — declaration + assignment + 4 checks/uses + 1 comment
- `startHeartbeat(input.lockHandle)`: 1 (line 104, before while at 139)
- `saveState _v3:pendingUserMessage`: 1 site (legacy block line 745 — Pitfall 5 preserved)

### `tokensUsed:` return sites converted (4 total)

| Line | Context |
| ---- | ------- |
| 587 | CKPT-6b Path B early return |
| 805 | `addTurn({ role: 'user', tokensUsed: ... })` DB row |
| 866 | `debug.recordTokens({ tokensUsed: ... })` |
| 884 | Final EngineOutput return |

All four use `totalTokensAcrossRestarts` (Pitfall 2 single source of truth). No `output.totalTokens` references in any `tokensUsed:` site remain.

## TypeScript Narrowings Encountered

**TS7022 self-referencing implicit-any on `priorMsg` (line 191) and `turnEffectiveMessage` (line 223):**

When narrowing the outer-scope `let effectiveMessage: string | null = null` via `??`, TypeScript inside the `while` loop body could not infer the resulting type and flagged "implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer". This is a known interaction between `let` mutation across `continue` boundaries and `??` narrowing.

Fix: explicit `: string` annotation on both:
- L191: `const priorMsg: string = effectiveMessage ?? input.message`
- L223: `const turnEffectiveMessage: string = effectiveMessage ?? (pendingUserMessage ? ... : input.message)`

No `as` casts needed; no `!` non-null assertions needed; no other TypeScript narrowings encountered.

## Gate Confirmations

| Gate | Status |
| ---- | ------ |
| `npx tsc --noEmit -p tsconfig.json` (filtered to modified files) | PASS — zero errors attributable to either modified file. Pre-existing errors in `.next/dev/types/validator.ts` (Next build cache) and `src/lib/domain/__tests__/conversations.test.ts` (pre-existing test typing issue) are unrelated. |
| Regla 6 zero-touch: `git status --short` on v3-production-runner, somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation | PASS — only an untracked `src/lib/agents/somnio-v3/ARCHITECTURE.md` shows up; not modified by this plan. |
| Sub-loop zero-touch: `git status --short src/lib/agents/somnio-v4/sub-loop/index.ts` | PASS — no output |
| types.ts zero-touch: `git status --short src/lib/agents/somnio-v4/types.ts` | PASS — no output |
| `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` | PASS — 5 suites / 40 tests / Duration 15.12s / exit 0 |
| Pitfall 9 — no `step.run` wrapping processMessage | PASS — `grep step.run src/inngest/functions/agent-production.ts | grep processMessage | wc -l` = 0 |
| Heartbeat outside while (Pitfall 6) | PASS — heartbeat at L104, `while (shouldRestart)` at L139 |
| Push to `origin/main` fast-forward | PASS — `7f31e65a..21b47276 HEAD -> main` |

## Deviations from Plan

**None substantive.** Three minor adaptations:

1. **Step H scope expanded to include observability sites (Pitfall 2 strict reading):** The plan's Step H said "every `tokensUsed:` return site that the new restart loop touches MUST use `totalTokensAcrossRestarts`", but the acceptance criterion required `grep -c "tokensUsed: output.totalTokens" == 0`. Two non-return sites used `output.totalTokens`: the user-turn DB row (`addTurn({...tokensUsed})`, L805) and the debug adapter recordTokens (`debug.recordTokens({...tokensUsed})`, L866). Both converted to `totalTokensAcrossRestarts` to satisfy the strict zero-count criterion — semantically correct since these are per-lambda observability sinks that should reflect total resource use across all iterations.

2. **TypeScript strict-mode adaptation:** Added explicit `: string` annotations on `priorMsg` (L191) and `turnEffectiveMessage` (L223) to defeat TS7022 implicit-any on outer-`let` narrowing across loop body. Not in the plan but necessary for `npx tsc --noEmit` to stay clean.

3. **`turnEffectiveMessage` rename:** The plan's R-03 step renames the existing `const effectiveMessage` (old L188) to `turnEffectiveMessage` so the outer-scope `let effectiveMessage` doesn't shadow it. Cascaded renames at 3 use sites (V4AgentInput.message at L237; console.log at L207; addTurn user content at L799). All three updated.

## Cross-Reference

Plan 02 (vitest scenarios S1..S5) validates the runtime behavior of this scaffolding end-to-end:
- S1: CKPT-0 Path A interrupt → restart_iteration=1 → next pending arrives → restart_iteration=2 → quiescence
- S2: CKPT-1 (in-agent post-comprehension) → discriminator detector triggers
- S3: CKPT-3/4/5 (sub-loop) → Pitfall 7 fix surfaces via mapper → discriminator detector triggers
- S4: CKPT-6b Path B (sentCount > 0) → does NOT restart, preserves D-01 split
- S5: Token accumulator sums correctly across 2+ iterations

## Self-Check: PASSED

- `e5ead607` commit exists: `git log --oneline | grep e5ead607` → FOUND
- `21b47276` commit exists: `git log --oneline | grep 21b47276` → FOUND
- Both files modified verified via `git show --stat e5ead607 21b47276`
- Push to main verified via `git push origin HEAD:main` output `7f31e65a..21b47276 HEAD -> main`
- All grep counts for acceptance criteria verified in the table above
