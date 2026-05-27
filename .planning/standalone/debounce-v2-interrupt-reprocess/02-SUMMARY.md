---
phase: standalone-debounce-v2-interrupt-reprocess
plan: 02
subsystem: somnio-v4 runtime tests
tags: [interrupt-reprocess, restart-loop, debounce-v2, somnio-v4, vitest, regla-6-preserved]
dependency-graph:
  requires: [debounce-v2-interrupt-reprocess-01, debounce-interruption-system-v2]
  provides: [restart-loop-vitest-coverage, regla-6-static-gate]
  affects: [src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts]
tech-stack:
  added: []
  patterns: [vi.mock-factory-closure, vi.fn-canned-outputs-per-iteration, multi-tx-clear-override, agent-discriminator-cascading]
key-files:
  created:
    - src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts
  modified: []
decisions:
  - "S3 cascading restart triggered via TWO agent-discriminator iterations (NOT CKPT-0 short-circuit on iter 2) — readAndClearPending does NOT delete the interrupt key, so an interrupt-key-staging approach would infinite-loop"
  - "Per-test override of mock-redis multi() to actually delete from lists Map — helper's standalone multi() is intentionally a no-op chain stub (pending.test.ts L224-228 documents this design choice; restart-loop runner needs real clear semantics)"
  - "Mock somnio-v3-agent.processMessage so S5b's V3ProductionRunner call doesn't hang on real DB / module loading — v3 doesn't import interruption-system-v2 regardless, so behavioral assertion (zero lock events emitted) still proves the invariant"
  - "vi.fn typed-args form for Vitest 1.x: vi.fn<[TArgs], TReturn>() (NOT vi.fn<(args: ...) => Promise<...>>) — second form is Vitest 2.x"
metrics:
  duration: "~30 min execution (test design + 3 iter cycles for S3 + 1 cycle for TS errors)"
  completed: 2026-05-26
  tests_added: 6
  tests_passing_full_suite: 46
---

# Phase debounce-v2-interrupt-reprocess Plan 02: Wave 2 Vitest S1..S5 Shipped — Summary

One-liner: 5 scenarios (S1..S5) / 6 vitest sub-tests covering the Plan 01 runner restart loop — happy path, Path A 1x restart, Path A 2x cascading restart, Path B preserved post-send, and Regla 6 byte-identity (static grep + behavioral V3 zero-lock-events).

## Commit

| # | SHA | Subject |
| - | --- | ------- |
| 1 | `f0f80f0d` | test(debounce-v2-interrupt-reprocess-02): restart-loop S1..S5 vitest scenarios |

Pushed to `origin/main` as fast-forward (`3289c486..f0f80f0d`). Branch `exec/debounce-v2-wave6` matches `origin/main`.

## Test File

`src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (703 LOC, +703/-0).

### Vitest results (verbose, single-fork pool)

```
✓ S1 happy path: single iteration, no restart_iteration in any event payload, tokens = single iter
✓ S2 Path A restart 1x: agent returns interrupted_at_ckpt_1 → drain pending + restart + success on iter 2
✓ S3 Path A restart 2x: cascading interrupts via agent-discriminator → 3 iterations, tokens sum, single lock lifetime
✓ S4 Path B post-send: pending-templates from prior turn sent → CKPT-6b interrupt → Path B solo, NO restart
✓ S5a static: zero interruption-system-v2 imports + zero shouldRestart/restart_iteration/interrupted_at_ckpt_ refs in non-v4 paths
✓ S5b behavioral: V3ProductionRunner emits zero lock/interrupt/restart events during a turn

Test Files  1 passed (1)
     Tests  6 passed (6)
```

### Full module suite (no regression)

```
✓ src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts  (4 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts  (8 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/pending.test.ts  (10 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/lock.test.ts  (12 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/observability.test.ts  (6 tests)
✓ src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts  (6 tests)  ← NEW

Test Files  6 passed (6)
     Tests  46 passed (46)   ← 40 prior + 6 new
```

## Scenario coverage summary

| Scenario | Tests | What it proves |
| -------- | ----- | -------------- |
| S1 | 1 | Happy path is byte-identical to pre-fix behavior (no restart event, no `restart_iteration` payload field, tokens = single-iter value) |
| S2 | 1 | Agent-discriminator branch detects `errorMessage.startsWith('interrupted_at_ckpt_')`, drains pending, restarts; iter 2 input.message = combined string; tokens accumulate (50+75=125); single lock lifetime |
| S3 | 1 | Cascading restart works (TWO `msg_aborted_path_a_combined` events with restart_iteration 1 then 2); tokens sum across 3 iters (50+40+80=170); final iter input.message = "msg3\\nmsg2\\nmsg1" (RPUSH order preserved); single lock lifetime (Pitfall 6) |
| S4 | 1 | Path B post-send preserved: pending-template send populates actuallySentIds, CKPT-6b detects interrupt with `hasSentAnything=true` → `msg_aborted_path_b_solo` (NOT `..._path_a_combined`), NO restart_iteration field, NO restart, pending list still has msg2 |
| S5a | 1 | Regla 6 static: zero `interruption-system-v2` / `shouldRestart` / `restart_iteration` / `interrupted_at_ckpt_` strings in v3-production-runner.ts + 5 sibling agent paths (somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation) — comment-only matches stripped via per-line filter |
| S5b | 1 | Regla 6 behavioral: instantiating V3ProductionRunner and processing a v3 EngineInput emits ZERO lock-related events into the captured emittedEvents array (v3 doesn't import the module at all) |

## vi.mock patterns used

1. **Factory closure pattern (e2e-scenarios.test.ts:33-41)** — `vi.mock('../redis-client', async () => { const { createMockRedis } = await import('./_helpers/mock-redis'); ... })` avoids the hoisting trap where a top-level `const mockRedis = createMockRedis()` would fail (vi.mock's factory cannot close over uninitialized bindings).
2. **Observability collector mock (e2e-scenarios.test.ts:45-51)** — captures `recordEvent` calls into shared `emittedEvents` array for assertion.
3. **Logger silencer (e2e-scenarios.test.ts:54-61)** — suppresses noise.
4. **vi.mock('@/lib/agents/somnio-v4')** — returns `{ processMessage: agentMockFn }` so canned `V4AgentOutput` per iteration is achievable via `agentMockFn.mockResolvedValueOnce` / `mockImplementationOnce`.
5. **vi.mock('@/lib/agents/somnio-v3/somnio-v3-agent')** — returns a no-op success processMessage so S5b's V3ProductionRunner doesn't hang on real DB / module loading. v3 doesn't import interruption-system-v2 anyway, so the behavioral assertion (zero lock events) is preserved.
6. **Per-test mockImplementation override of mock-redis multi()** — defined inside `beforeEach`, wires `tx.del(key) + tx.exec()` to actually delete the key from the lists/store/ttls Maps. Required because the helper's default multi() is an intentional no-op stub (helper docstring + pending.test.ts L224-228 verify call shape only).

## TypeScript narrowings

- `vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()` — Vitest 1.x typed-args form (NOT `vi.fn<(input: V4AgentInput) => Promise<V4AgentOutput>>()` which is 2.x syntax).
- Explicit `interface MultiTx { del: (key: string) => MultiTx; exec: () => Promise<unknown[]> }` to break the TS7022 self-reference cycle inside the multi() override (the `del` arrow returns `tx` from inside the same object literal).
- Adapter mocks cast via `as any` where the optional V4 extras (`setSessionId`, `emitSignals`) duck-type beyond the strict `TimerAdapter` interface.
- `EngineInput` test input correctly omits `lockHandle/lockChannel/lockIdentifier` for S5b's V3 path to mirror the production webhook contract (those fields are v4-only).

## Deviations from plan

### Auto-fixed issues

**1. [Rule 1 - Bug] S3 cascading-restart design adjusted to avoid mock-induced infinite loop**
- **Found during:** First test run (worker OOM after 136s)
- **Issue:** Original plan author's hint said "use CKPT-0 of iter 2 to catch interrupt via staging `interrupt:` key in iter 1's hook." But `readAndClearPending` only clears the pending LIST — it does NOT delete the `interrupt:` key (which only has a 60s TTL). After iter 1's drain, the interrupt key remains, so iter 2's CKPT-0 would re-fire restart forever.
- **Fix:** Redesigned S3 to trigger cascading restart via TWO agent-discriminator iterations (iter 1 returns `interrupted_at_ckpt_1`, iter 2 returns `interrupted_at_ckpt_2`, iter 3 returns success). The plan explicitly anticipated this fallback ("if for some reason iter 2's CKPT-0 doesn't catch...adjust the side-effect to instead trigger via the agent's discriminator on iter 2's agent call").
- **Files modified:** `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (S3 only)
- **Commit:** `f0f80f0d`

**2. [Rule 3 - Blocker] mock-redis multi() needed per-test override to actually clear lists**
- **Found during:** Second test run (S3 produced "msg2\\nmsg3\\nmsg2\\nmsg3\\nmsg1" instead of "msg2\\nmsg3\\nmsg1" — repeated entries)
- **Issue:** The shared `_helpers/mock-redis.ts` `multi()` is intentionally a no-op chain stub (per its docstring + pending.test.ts:224-228). `tx.del(key).exec()` doesn't actually delete from the lists Map. The restart-loop runner's `readAndClearPending` thus doesn't clear pending across iterations, causing cumulative re-drain.
- **Fix:** Per-test override of `mockRedis.multi.mockImplementation(...)` in `beforeEach`, wiring `tx.del(key) + tx.exec()` to delete from `allMaps.lists/store/ttls` directly via `__getAll()` access. Does NOT modify the shared helper (`_helpers/mock-redis.ts` untouched) — preserves existing 40 tests passing semantics.
- **Files modified:** `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (beforeEach only)
- **Commit:** `f0f80f0d`

**3. [Rule 3 - Blocker] S5b V3ProductionRunner timeout — somnio-v3-agent module mock**
- **Found during:** Third test run (S5b timed out at default 5s testTimeout because V3 runner tried to load somnio-v3-agent → real DB / module dependencies)
- **Fix:** Added `vi.mock('@/lib/agents/somnio-v3/somnio-v3-agent', ...)` returning a no-op success output. v3 doesn't import interruption-system-v2 regardless of agent module, so the behavioral assertion (zero lock events) is still load-bearing — the mock just unblocks the v3 runner enough to reach the `return` path.
- **Files modified:** `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (top of file, beside the somnio-v4 mock)
- **Commit:** `f0f80f0d`

**4. [Rule 1 - Bug] vi.fn typed-args syntax — Vitest 1.x vs 2.x**
- **Found during:** `npx tsc --noEmit` after initial test green
- **Issue:** Used `vi.fn<(input: V4AgentInput) => Promise<V4AgentOutput>>()` (Vitest 2.x form). Vitest 1.x expects `vi.fn<[Args], Return>()`.
- **Fix:** Changed signature to `vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()`.
- **Files modified:** `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (line 66)
- **Commit:** `f0f80f0d`

## S5 Regla 6 triple-check

- **(a) static grep gate (S5a in-test):** PASS — zero offending lines across v3-production-runner.ts + 5 sibling agent dirs.
- **(b) git-diff gate (verification step CLI):** PASS — `git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/` returns empty output (zero bytes changed).
- **(c) behavioral gate (S5b in-test):** PASS — instantiated V3ProductionRunner with a v3 EngineInput, ran processMessage, captured emittedEvents — zero events with labels starting with `lock_/interrupt_/msg_aborted_/heartbeat_renewed/zombie_lambda_exit/follower_woke/redis_unavailable_fallback_failed/pending_list_combined` and zero events with `restart_iteration` in payload.

All three modalities green. Regla 6 contract is CI-enforceable on every PR via S5a + S5b (vitest) and via the verification step diff (CLI / manual).

## Verification gate outcomes

| Gate | Command | Result |
| ---- | ------- | ------ |
| 1 | `test -f src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` | PASS (703 LOC) |
| 2 | `npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` exit 0 | PASS (6/6) |
| 3 | `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exit 0 | PASS (46/46 across 6 suites) |
| 4 | `grep -c "S1\|S2\|S3\|S4\|S5" ... restart-loop.test.ts` ≥ 5 | PASS (19 matches) |
| 5 | `git diff --stat main -- v3 + 5 siblings` empty | PASS |
| 6 | `npx tsc --noEmit -p tsconfig.json` zero errors in new file | PASS (zero restart-loop errors; pre-existing errors in other unrelated files unchanged) |

## Self-Check: PASSED

- File `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` exists (committed in `f0f80f0d`).
- Commit `f0f80f0d` exists in git log on `exec/debounce-v2-wave6` and origin/main (fast-forwarded).
