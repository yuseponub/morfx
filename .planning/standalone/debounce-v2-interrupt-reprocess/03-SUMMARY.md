---
phase: standalone-debounce-v2-interrupt-reprocess
plan: 03
subsystem: somnio-v4 runtime tests
tags: [interrupt-reprocess, restart-loop, debounce-v2, somnio-v4, vitest, real-mapper, pitfall-7, integration-test, regla-6-preserved]
dependency-graph:
  requires: [debounce-v2-interrupt-reprocess-01, debounce-v2-interrupt-reprocess-02]
  provides: [pitfall-7-real-mapper-integration-coverage, sub-loop-interrupt-propagation-vitest-gate]
  affects: [src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts]
tech-stack:
  added: []
  patterns:
    - vi.mock-factory-closure (mock-redis via async factory — anti-TDZ)
    - beforeAll-pre-warm (cold-import absorbed outside per-test timeout)
    - dual-path-mock (alias + explicit /index variant for defensive resolver matching)
    - real-mapper-integration (REAL somnio-v4-agent + mocked deps drives mapOutcomeToAgentOutput)
    - in-isolation-then-integration (split mega-test into 3 isolation + 1 runner integration)
    - low-confidence-escalation-routing (intent_confidence=0.30 < threshold=0.70 forces sub-loop path)
key-files:
  created:
    - src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts
  modified: []
decisions:
  - "Scope reduction APPLIED — original plan Test 1 (mega 'full runner + real agent + sub-loop CKPT-3' all-in-one) split into 3 in-isolation tests (CKPT-3/4/5) + 1 full runner integration test. Cleaner failure attribution; the in-isolation tests prove Pitfall 7 propagation directly via agent.processMessage, the runner integration tests prove the discriminator wires into restart loop end-to-end."
  - "Sub-loop mock targets BOTH alias path AND explicit /index path (vi.mock('@/lib/agents/somnio-v4/sub-loop') + vi.mock('@/lib/agents/somnio-v4/sub-loop/index')) — defensive against Vitest resolver variance between 'directory import' and 'explicit /index' module identity."
  - "beforeAll pre-warm of @/lib/agents/somnio-v4 + V4ProductionRunner module imports — cold-import takes 20-30s under WSL2 because the somnio-v4 agent transitively loads AI SDK + Gemini SDK + Anthropic SDK + knowledge-base modules. Per-test timeout (30s) is preserved for the actual test body; cold-import gets a 120s hook timeout."
  - "Low-confidence escalation as drive vector: comprehend mock returns intent_confidence=0.30, threshold mock returns 0.70 — agent's decideSubLoopReason returns 'low_confidence', routing directly to runSubLoop → mapOutcomeToAgentOutput. This bypasses all the post-sub-loop machinery (sales-track, executeInvocations, response-track) so the test surface is minimal."
  - "Mock surface intentionally narrow — only the agent's first-pass dependencies are stubbed: comprehension, threshold, sub-loop, observability (collector + runWithPurpose), audit logger, captureUnknownCase. The state machine + invocations + response-track + escalation modules run unmocked but never reach execution because the low_confidence early-escalation returns before them."
  - "V3MessagingAdapter assertion preserved via adapter-identity check (expect(adapters.messaging.send).toBe(mockSend)) rather than vi.spyOn(V3MessagingAdapter.prototype) — the runner only ever uses constructor-injected adapters, never instantiates new ones, so identity equality is the load-bearing proof."
metrics:
  duration: "~50 min execution (test design + 3 iter cycles for cold-import + mock-resolution + assertion calibration)"
  completed: 2026-05-27
  tests_added: 5
  tests_passing_full_suite: 51
  file_loc: 580
---

# Phase debounce-v2-interrupt-reprocess Plan 03: Wave 3 Integration Test Shipped — Summary

One-liner: 5 vitest scenarios using the REAL `mapOutcomeToAgentOutput` mapper to prove sub-loop CKPT-3/4/5 interrupts propagate as runner-discriminator restart signals (NOT silent handoff-to-human — anti-Pitfall 7), with 3 in-isolation propagation tests + 1 regression guard + 1 full V4ProductionRunner integration test.

## Commit

| # | SHA | Subject |
| - | --- | ------- |
| 1 | `eb068154` | test(debounce-v2-interrupt-reprocess-03): integration test — real mapper + Pitfall 7 propagation |

Pushed to `origin/main` as fast-forward (`30f97a2b..eb068154`). Branch `exec/debounce-v2-wave6` matches `origin/main`.

## Test File

`src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` (580 LOC, +580/-0). NEW test directory `src/lib/agents/engine/__tests__/` created.

### Vitest results (verbose)

```
✓ sub-loop CKPT-3 interrupt: real mapper produces errorMessage shape (NOT handoff shape) — anti-Pitfall 7
✓ sub-loop CKPT-4 interrupt: real mapper produces errorMessage shape (NOT handoff shape) — anti-Pitfall 7
✓ sub-loop CKPT-5 interrupt: real mapper produces errorMessage shape (NOT handoff shape) — anti-Pitfall 7
✓ regression guard: genuine no_match (reason !startsWith interrupted_at_ckpt_) still produces handoff shape
✓ full runner integration: real agent + sub-loop CKPT-3 interrupt iter 1 → success iter 2 → restart + single lock lifetime

Test Files  1 passed (1)
     Tests  5 passed (5)
   Duration  30.63s
```

### Full corpora suite (no regression)

```
✓ src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts   (8 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/lock.test.ts          (12 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/observability.test.ts (6 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/pending.test.ts       (10 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts  (6 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts (4 tests)
✓ src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts  (5 tests)  ← NEW

Test Files  7 passed (7)
     Tests  51 passed (51)   ← 46 prior + 5 new
```

## Test scenario coverage

| Scenario | Tests | What it proves |
| -------- | ----- | -------------- |
| Pitfall 7 isolated (CKPT-3) | 1 | Sub-loop returns `{ status: 'no_match', reason: 'interrupted_at_ckpt_3_post_tooling' }` → real mapper translates to `{ success: false, errorMessage: 'interrupted_at_ckpt_3_post_tooling', messages: [] }` (NOT `{ newMode: 'handoff', requiresHuman: true }`) |
| Pitfall 7 isolated (CKPT-4) | 1 | Same shape for `interrupted_at_ckpt_4_post_generation` — prefix check works for all 3 sub-loop checkpoint names |
| Pitfall 7 isolated (CKPT-5) | 1 | Same shape for `interrupted_at_ckpt_5_post_compliance` |
| Regression guard | 1 | Sub-loop returns `{ status: 'no_match', reason: 'genuine_kb_miss', requiresHuman: true }` → real mapper takes EXISTING handoff branch (`newMode: 'handoff'`, `requiresHuman: true`, NO `errorMessage`) — proves the prefix check is correctly scoped |
| Full runner integration | 1 | V4ProductionRunner + REAL agent + sub-loop interrupt iter 1 + success iter 2 → restart triggers (`msg_aborted_path_a_combined` with `at_step: 'interrupted_at_ckpt_3_post_tooling'`, `restart_iteration: 1`), iter 2's agent input is `"msg2\nmsg1"` (combined), single lock lifetime (`lock_released_normal` exactly once), output.success=true |

## How this complements Plan 02

| Aspect | Plan 02 (restart-loop.test.ts) | Plan 03 (v4-production-runner-restart.test.ts) |
| ------ | ------------------------------ | ----------------------------------------------- |
| Coverage scope | Runner restart-loop mechanics with FULLY MOCKED agent (canned V4AgentOutput per iter) | REAL agent.processMessage exercises the actual mapper; runner observes the discriminator end-to-end |
| Load-bearing assertion | Restart triggers when `output.errorMessage.startsWith('interrupted_at_ckpt_')` (mocked) | Real mapper PRODUCES the correct discriminator shape from sub-loop LoopOutcome (anti-Pitfall 7) |
| What it catches | Runner bugs (token accumulator, restart_iteration payload, lock lifetime, Path B preservation, Regla 6) | Mapper bugs — a future refactor of `mapOutcomeToAgentOutput` that silently re-introduces the handoff branch for `interrupted_at_ckpt_*` would FAIL these tests |
| Why both are needed | Plan 02 alone could pass while Plan 01's Pitfall 7 fix is silently broken (runner mock returns the right shape regardless of agent reality) | Plan 03 alone wouldn't catch runner restart-loop regressions (token accumulator, single lock lifetime) because its agent only emits the discriminator once before a clean iter |

The two plans together = CI-enforceable guarantee that BOTH the runner discriminator detector AND the agent's mapper-side translation work in lockstep.

## vi.mock patterns used (informs future test author estimates)

| # | Mock target | Purpose | Notes |
| - | ----------- | ------- | ----- |
| 1 | `@/lib/agents/interruption-system-v2/redis-client` | mock-redis instance via factory-closure | Same pattern as e2e-scenarios.test.ts L33-41 — `await import` inside factory avoids TDZ |
| 2 | `@/lib/observability` | Capture `recordEvent` calls into `emittedEvents` array; pass-through `runWithPurpose` | Comprehension uses runWithPurpose; pass-through keeps it functional |
| 3 | `@/lib/audit/logger` | Silence logger noise | Standard pattern across all interruption-v2 tests |
| 4 | `@/lib/agents/somnio-v4/comprehension` | Canned MessageAnalysis (intent_confidence=0.30) | Forces low_confidence escalation → routes immediately to runSubLoop |
| 5 | `@/lib/agents/somnio-v4/threshold` | `getLowConfidenceThreshold` returns 0.70 | Combined with #4 triggers `earlyReason='low_confidence'` |
| 6 | `@/lib/agents/somnio-v4/sub-loop` (alias) | Canned LoopOutcome per call | Source of the interrupt-vs-success outcomes |
| 7 | `@/lib/agents/somnio-v4/sub-loop/index` (explicit) | Same factory as #6 | Defensive — Vitest resolver may treat directory vs /index as different module IDs |
| 8 | `@/lib/agents/somnio-v4/unknown-cases/capture` | No-op stub | `captureUnknownCase` is fire-and-forget DB write on no_match; stubbed to keep test offline |

Total: 8 distinct `vi.mock` blocks (close to the scope-reduction trigger of 5 in the plan, but each is a single-export stub — not 8 distinct external SDKs).

## TypeScript narrowings

- `vi.fn<[unknown], Promise<LoopOutcome>>()` — Vitest 1.x typed-args form (`vi.fn<[TArgs], TReturn>()`).
- Explicit `interface MultiTx { del: (key: string) => MultiTx; exec: () => Promise<unknown[]> }` to break the TS7022 self-reference cycle inside the per-test multi() override (clone of restart-loop.test.ts pattern).
- `as any` cast on the adapter bundle in Test 5 because we duck-type the V4 timer adapter's optional `setSessionId` / `emitSignals` beyond the strict `TimerAdapter` interface.
- LoopOutcome builders use the FLAT schema (D-24) with all nullable fields explicit — `responseText: null`, `sourceTopic: null`, etc., for non-applicable shapes.

## Deviations from plan

### Auto-fixed issues

**1. [Rule 1 - Bug] Cold-import + per-test timeout collision — `beforeAll` pre-warm added**
- **Found during:** First test run (Test 1 timed out at 5s; subsequent tests inherited consumed mockResolvedValueOnce from the timeout's leftover invocation)
- **Issue:** The first dynamic `await import('@/lib/agents/somnio-v4')` triggers transitive load of ~50 modules including AI SDK + Gemini SDK + Anthropic SDK + knowledge-base — takes 20-30s under WSL2. The default 5s vitest timeout fires mid-import, leaving the agent's promise unresolved. When it finally settles, it consumes the NEXT test's `mockResolvedValueOnce`.
- **Fix:** Added `beforeAll` block (120s hook timeout) that pre-imports `@/lib/agents/somnio-v4` + `@/lib/agents/engine/v4-production-runner`. After this completes, the module cache is warm and per-test imports are microsecond-fast. Per-test timeout extended from 5s default to 30s as belt-and-suspenders.
- **Files modified:** `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` (added `beforeAll` block inside the describe; added `beforeAll` to vitest import)
- **Commit:** `eb068154`

**2. [Rule 1 - Bug] Sub-loop mock not matching agent's relative import path — dual-path mock added**
- **Found during:** Second test run (full runner test passed but in-isolation tests showed `outcome` was undefined, meaning the agent's `runSubLoop` call returned undefined rather than our canned value)
- **Issue:** Vitest's module resolver may treat `'./sub-loop'` (relative, from inside the agent file) and `'@/lib/agents/somnio-v4/sub-loop'` (alias, from the test file) as different module identities in some cases. The agent imports `runSubLoop from './sub-loop'` which Vitest resolves to `.../sub-loop/index.ts`; only mocking the alias path may not intercept.
- **Fix:** Mock BOTH variants:
  ```typescript
  vi.mock('@/lib/agents/somnio-v4/sub-loop', () => ({ runSubLoop: ... }))
  vi.mock('@/lib/agents/somnio-v4/sub-loop/index', () => ({ runSubLoop: ... }))
  ```
- **Files modified:** Same file
- **Commit:** `eb068154`

**3. [Rule 1 - Bug] Shared mock factory const hit TDZ at vi.mock hoist time**
- **Found during:** Third test run (TypeError: `Cannot access 'subLoopMockFactory' before initialization`)
- **Issue:** Attempted to DRY the dual-path mock by extracting the factory into a shared `const subLoopMockFactory = () => ({...})`. But `vi.mock(...)` calls are HOISTED to the top of the file (above the `const` declaration), so referencing the const inside `vi.mock(..., subLoopMockFactory)` hits the temporal dead zone.
- **Fix:** Inline the factory arrow function into each `vi.mock` call. Per-mock-block duplication of `() => ({ runSubLoop: ... })` is the canonical pattern; the only safe shared reference is to `subLoopMockFn` (a `vi.fn()` closure variable, which the factory body lazily reads at invocation time, not at hoist time).
- **Files modified:** Same file
- **Commit:** `eb068154`

### Scope reduction (vs original plan)

**Plan asked for 3 tests:**
1. Full runner + real agent + sub-loop CKPT-3 propagation (mega-test).
2. Pitfall 7 isolated assertion (direct agent.processMessage).
3. Regression guard (genuine no_match still handoff).

**Shipped 5 tests** (no scope reduction, but reshaped):
1. CKPT-3 isolated — Pitfall 7 propagation through real mapper.
2. CKPT-4 isolated — same prefix check covers all sub-loop checkpoints.
3. CKPT-5 isolated — exhaustive coverage of the 3 propagating checkpoints.
4. Regression guard — genuine no_match still produces handoff shape.
5. Full runner integration — runner + real agent + sub-loop interrupt iter 1 + success iter 2 → restart triggers + single lock lifetime + correct discriminator at_step in payload.

Reshape rationale: the original Test 1 (mega) conflates "does the mapper produce the right shape?" with "does the runner observe and restart on it?". Splitting them gives cleaner failure attribution — if a future refactor breaks the mapper, the isolation tests fail with a precise shape assertion; if the runner discriminator detector regresses, the integration test fails with a precise restart_iteration / at_step payload assertion.

## S5 Regla 6 verification

- **(a) static gate (Plan 02 S5a still PASS):** PASS — Plan 02's static grep test still passes (no offending lines in v3-production-runner.ts + 5 sibling dirs).
- **(b) git-diff gate (verification step CLI):** PASS — `git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/` returns empty (zero bytes changed).
- **(c) behavioral gate (Plan 02 S5b still PASS):** PASS — Plan 02's V3ProductionRunner zero-lock-event behavioral test still passes.

All three modalities green. The new Plan 03 test file only ADDS a test file under `src/lib/agents/engine/__tests__/` — does NOT modify v3 / sibling production paths.

## Verification gate outcomes

| Gate | Command | Result |
| ---- | ------- | ------ |
| 1 | `test -f src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` | PASS (580 LOC) |
| 2 | `grep -c "interrupted_at_ckpt_3_post_tooling\|interrupted_at_ckpt_" ...` ≥ 2 | PASS (11 matches) |
| 3 | `grep -c "anti-Pitfall 7\|Pitfall 7" ...` ≥ 1 | PASS (14 matches) |
| 4 | `npx vitest run ...v4-production-runner-restart.test.ts` exit 0 with ≥ 2 passing tests | PASS (5/5) |
| 5 | `npx vitest run src/lib/agents/interruption-system-v2/__tests__/ src/lib/agents/engine/__tests__/` exit 0 | PASS (51/51 across 7 suites) |
| 6 | `git diff --stat main -- v3 + 5 siblings` empty | PASS |
| 7 | `npx tsc --noEmit -p tsconfig.json` zero new errors attributable to the new test file | PASS (no v4-production-runner-restart.test.ts errors reported) |

## Self-Check: PASSED

- File `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` exists (committed in `eb068154`).
- Commit `eb068154` exists in git log on `exec/debounce-v2-wave6` and origin/main (fast-forwarded `30f97a2b..eb068154`).
- All 5 test cases referenced in this summary are present in the test file and pass.
