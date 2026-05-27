# UAT — debounce-v2-interrupt-reprocess

**Date:** 2026-05-26
**Approver:** joseromerorincon041100@gmail.com
**Branch shipped:** `exec/debounce-v2-wave6` → fast-forwarded to `origin/main`

---

## Scope

This standalone converts the v4 inbound-message pipeline from "silent persist + return
on interrupt" to "restart in-lambda" semantics for Path A interrupts at CKPTs 0..6.
Path B (post-send) preserves current behavior verbatim per D-01 + D-05. Sub-loop and
types.ts are ZERO TOUCH (R-04).

v4 is DORMANT in prod (zero workspaces have `conversational_agent_id='somnio-sales-v4'`).
Manual WhatsApp smoke is DEFERRED to sibling standalone `debounce-v2-sandbox-integration`
(per DISCUSSION-LOG.md "Out of scope" section).

---

## Plan 01 — Runner refactor + Pitfall 7 fix

- [ ] `git diff main -- src/lib/agents/engine/v4-production-runner.ts | wc -l` shows the expected ~+60/-8 LOC delta.
- [ ] `git diff main -- src/lib/agents/somnio-v4/somnio-v4-agent.ts | wc -l` shows the expected ~+10 LOC delta (Pitfall 7 mapper fix).
- [ ] `grep -c "while (shouldRestart)" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
- [ ] `grep -c "restart_iteration:" src/lib/agents/engine/v4-production-runner.ts` ≥ 8 (Pitfall 3 — 4 sites × 2 events each).
- [ ] `grep -c "totalTokensAcrossRestarts" src/lib/agents/engine/v4-production-runner.ts` ≥ 4 (declaration + accumulator + ≥ 2 return-site references — Pitfall 2).
- [ ] `grep -c "tokensUsed: output.totalTokens" src/lib/agents/engine/v4-production-runner.ts` == 0 (no leftover non-accumulator references).
- [ ] `grep -c "output.errorMessage.startsWith('interrupted_at_ckpt_')" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 (R-04 detector).
- [ ] `grep -c "outcome.reason.startsWith('interrupted_at_ckpt_')" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 1 (Pitfall 7 fix in mapper).

Commits: `e5ead607` (Pitfall 7 mapper fix) + `21b47276` (runner restart loop) + `3289c486` (SUMMARY).

- Result: <pass / fail>

---

## Plan 02 — Unit tests S1..S5

- [ ] `npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` exits 0 with ≥ 5 passing tests.
- [ ] S1 (happy path) green — single iteration, no `restart_iteration` field in any event payload, tokens = single iter.
- [ ] S2 (Path A restart 1x) green — asserts `tokensUsed === sum of iters` + iter 2 `input.message` combined.
- [ ] S3 (Path A restart 2x cascading) green — asserts TWO `restart_iteration` events + final 3-part combined message.
- [ ] S4 (Path B no-restart) green — `msg_aborted_path_b_solo` emitted, pending list NOT drained, NO restart_iteration field.
- [ ] S5a (Regla 6 static gate) green — zero `interruption-system-v2` imports in non-v4 paths.
- [ ] S5b (Regla 6 behavioral) green — V3ProductionRunner emits zero lock-related events during a turn.
- [ ] `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 — full module suite green (46/46 across 6 suites).

Commits: `f0f80f0d` (test suite) + `30f97a2b` (SUMMARY).

- Result: <pass / fail>

---

## Plan 03 — Integration test (real `mapOutcomeToAgentOutput`)

- [ ] `npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` exits 0 with ≥ 2 passing tests.
- [ ] CKPT-3 isolated test asserts `output.requiresHuman ?? false === false` AND `output.errorMessage === 'interrupted_at_ckpt_3_post_tooling'`.
- [ ] CKPT-4 isolated test asserts same shape for `interrupted_at_ckpt_4_post_generation`.
- [ ] CKPT-5 isolated test asserts same shape for `interrupted_at_ckpt_5_post_compliance`.
- [ ] Regression-guard test asserts genuine `no_match` (NOT interrupt) still produces `newMode: 'handoff'` + `requiresHuman: true`.
- [ ] Full runner integration test asserts real agent + sub-loop interrupt iter 1 → success iter 2 → restart triggers (`msg_aborted_path_a_combined` with `at_step` payload, `restart_iteration: 1`), iter 2 input.message = `"msg2\nmsg1"` (combined), single lock lifetime (`lock_released_normal` exactly once), output.success = true.
- [ ] Scope reduction (if applied) documented in 03-SUMMARY.md (it was: 3 in-isolation + 1 regression + 1 integration = 5 tests total, reshape of original mega-test).
- [ ] `npx vitest run src/lib/agents/interruption-system-v2/__tests__/ src/lib/agents/engine/__tests__/` exits 0 — full corpora green (51/51 across 7 suites).

Commits: `eb068154` (integration test) + `caa7776b` (SUMMARY).

- Result: <pass / fail>

---

## Regla 6 byte-identity gates (CRITICAL — global)

- [ ] `git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts | wc -l` == 0
- [ ] `git diff --stat main -- src/lib/agents/somnio-v3/ | wc -l` == 0
- [ ] `git diff --stat main -- src/lib/agents/godentist/ | wc -l` == 0
- [ ] `git diff --stat main -- src/lib/agents/godentist-fb-ig/ | wc -l` == 0
- [ ] `git diff --stat main -- src/lib/agents/somnio-recompra/ | wc -l` == 0
- [ ] `git diff --stat main -- src/lib/agents/somnio-pw-confirmation/ | wc -l` == 0
- [ ] `grep -rn "while.*shouldRestart\|restart_iteration\|interrupted_at_ckpt_" src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ | wc -l` == 0

The Plan 02 S5a + S5b vitest tests enforce this on every PR. The CLI greps above are a
manual one-off backup check.

- Result: <pass / fail>

---

## Sub-loop + types.ts zero-touch gates (R-04)

- [ ] `git diff --stat main -- src/lib/agents/somnio-v4/sub-loop/index.ts | wc -l` == 0
- [ ] `git diff --stat main -- src/lib/agents/somnio-v4/types.ts | wc -l` == 0

The sub-loop already emitted the correct shape (`LoopOutcome.reason = 'interrupted_at_ckpt_*'`).
Only the agent's `mapOutcomeToAgentOutput` consumer needed fixing (Pitfall 7). Sub-loop
internals UNCHANGED — R-04 byte-identity invariant.

- Result: <pass / fail>

---

## Production code surface

- [ ] `git diff --stat main -- 'src/**'` shows ONLY 2 production files changed:
  - `src/lib/agents/engine/v4-production-runner.ts` (~+60/-8)
  - `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (~+10)
- [ ] `git diff --stat main -- 'src/lib/agents/interruption-system-v2/__tests__/'` shows ONLY the NEW `restart-loop.test.ts` (no edits to existing test files).
- [ ] `git diff --stat main -- 'src/lib/agents/engine/__tests__/'` shows ONLY the NEW `v4-production-runner-restart.test.ts`.

- Result: <pass / fail>

---

## Module Scope doc updated (.claude/rules/agent-scope.md)

- [ ] `### Module Scope: interruption-system-v2` block contains a note referencing this standalone shipping the in-lambda restart semantics for Path A.
- [ ] `grep -c "debounce-v2-interrupt-reprocess" .claude/rules/agent-scope.md` ≥ 1.
- [ ] No new top-level heading added — the bullet sits inside the existing Module Scope block.

- Result: <pass / fail>

---

## Production safety (Regla 6 + D-06 + D-07)

- [ ] v4 still DORMANT in prod (zero workspaces flipped to `conversational_agent_id='somnio-sales-v4'`).
- [ ] No feature flag introduced (D-07 — v4 dormant, flag would be pure ceremony).
- [ ] No DB migration (D-08 — pure control-flow change).
- [ ] All 5 non-v4 agents byte-identical to main (verified via Regla 6 gates above).
- [ ] `wasInterruptedWithZeroSends` legacy block preserved for CKPT-7.1 first-byte abort edge case (Pitfall 5).
- [ ] Heartbeat start/stop remains OUTSIDE the while loop (Pitfall 6 — verified at L104 vs while at L139).
- [ ] No `step.run` wrap around `processMessage` (Pitfall 9 — replay-multiply-iterations hazard avoided).

- Result: <pass / fail>

---

## Manual smoke deferral acknowledgment

- [ ] User acknowledges manual WhatsApp smoke is DEFERRED to sibling standalone
      `debounce-v2-sandbox-integration` (per DISCUSSION-LOG.md "Out of scope" section).
      Confidence is HIGH that the fix works — covered by:
      - 6 unit vitest scenarios (S1, S2, S3, S4, S5a, S5b — Plan 02)
      - 5 integration vitest scenarios (3 in-isolation + 1 regression + 1 full runner integration — Plan 03)
      - Regla 6 multi-modal gates (static grep + behavioral + git-diff)
      Manual reproduction will happen when the sibling resumes after this ship lands
      (the sibling consumes the same observability events: `msg_aborted_path_a_combined`
      + `pending_list_combined` with `restart_iteration` field, and renders them in the
      sandbox `/sandbox` Interruption tab).

- Result: <ack / not-ack>

---

## Pre-merge audit

- [ ] No `FORCE_V4_FOR_PHONE` or similar test-only env-var overrides shipped.
- [ ] No diagnostic routes or temporary debug logging shipped.
- [ ] No `console.log` debugging in the modified production files.
- [ ] `git log --oneline caa7776b..HEAD` shows exactly 4 new commits (3 task commits + 1 SUMMARY).

- Result: <pass / fail>

---

## Sign-off

Once all checklist items above are ticked, type "approved" + date below:

```
<user types "approved" + date here>
```

Example: `approved 2026-05-26 — joseromerorincon041100@gmail.com`
