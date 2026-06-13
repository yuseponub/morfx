---
phase: v4-observability-completeness
verified: 2026-06-13T14:21:00Z
status: passed
score: 4/4 decisions verified (D-01..D-04) + all anti-regression gates green
re_verification: No — initial verification
---

# Phase v4-observability-completeness Verification Report

**Phase Goal:** Make ANY `somnio-sales-v4` turn — including any failure — 100% reconstructible from `agent_observability_events` (no dependence on Vercel `console.error`), for the NEW subsystems (restart/interruption loop, CRM gate, RAG sub-loop, error path). PURELY ADDITIVE (Regla 6); data-layer only (D-04).
**Verified:** 2026-06-13T14:21:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Decision Verdicts (D-01..D-04 = the "requirements" for this standalone)

| # | Decision | Status | Evidence (file:line) |
|---|----------|--------|----------------------|
| D-01 | Error path reconstructible | ✓ VERIFIED | `engine_error` emit + truncated stack + stage + restart_iteration; output carries `errorStage`; runner builds clean stack-less message keeping `code` identical |
| D-02 | Uniform spine coverage | ✓ VERIFIED | Pre-existing `*_result` + 4 crm-gate events preserved; new `crm_gate_skipped/completed`, `subloop_tooling/generation_completed`, `subloop_error` reaches DB |
| D-03 | restart_iteration threading | ✓ VERIFIED | `restartIteration?` on V4AgentInput + threaded from core builder + into RunCrmGateArgs + SubLoopContext; snake_case `restart_iteration` on every touched event |
| D-04 | Data-layer only | ✓ VERIFIED | Only `somnio-v4/**` + `engine/v4-production-runner.ts` + tests touched; zero sandbox/debug-panel UI files |

**Score:** 4/4 decisions verified.

## Detailed Evidence

### D-01 — Error path (closes the black hole)

(a) **NEW `engine_error` event** — `somnio-v4-agent.ts:1058-1063`: `recordV4Event('engine_error', { stage: currentStage, errorMessage: bodyTruncate(errMsg, 200), stackFrames: errStack ?? null, agent: SOMNIO_V4_AGENT_ID }, { restartIteration })`. Stack truncated to **5 frames** at `:1047` (`.slice(0, 5)`, D-01 says 3-5 ✓). PII-truncated errorMessage (`bodyTruncate(...,200)`); raw stack only in `stackFrames` (DB).

(b) **`V4AgentOutput.errorStage`** — declared `types.ts:236` (`errorStage?: string`); set at `somnio-v4-agent.ts:1072` (`errorStage: currentStage`).

(c) **Runner no longer hardcodes** — `v4-production-runner.ts:616-617`: `code: 'V4_AGENT_ERROR'` (UNCHANGED — Pitfall 4) + `message: buildCleanErrorMessage(output)`. Helper `:68-75` strips stack via `raw.split(' :: ')[0]`, formats `V4_AGENT_ERROR @ {stage}: {reason}`. The string `'V4 agent processing failed'` survives ONLY as a defensive fallback inside the helper (`:69`), never as the emitted message when output exists. Runner diff deletions confirm the old `message: 'V4 agent processing failed'` line was removed.

(d) **Pitfall 2 — interrupts EXCLUDED:** Interrupt early-returns (`interrupted_at_ckpt_*`, e.g. `:378`, `:556`) are `return` statements INSIDE the try block (try opens `:159`, catch `:1045`) → never reach the catch → never emit `engine_error`. Confirmed by source structure.

### D-02 — Uniform spine

- **Pre-existing PRESERVED (not renamed):** 4 crm-gate events `crm_gate_createOrder_skipped` (x3, `crm-gate.ts:192/201/224`) + `crm_gate_move_blocked` (`:268`) — all now carry `restart_iteration`. The 4 agent `*_result` events (`comprehension_completed_v4`, guard blocked/passed, `sales_track_result`, `response_track_result`) preserved + `restart_iteration` added (`somnio-v4-agent.ts:445/464/527/595/662`).
- **Newly covered (previously silent):** orchestrator `crm_gate_skipped` (`crm-gate.ts:337`) / `crm_gate_completed` (`:395`, orderId redacted via `idSuffix`); sub-loop `subloop_tooling_completed` (`sub-loop/index.ts:296`, with topicSelected + kbHits[{topic,similarity}]) + `subloop_generation_completed` (`:415`, with responseConfidence + threshold 0.70) + `subloop_error` (`:747`, inside `emitRagError` BEFORE the throw — previously onDebug+throw only, now reaches DB). Terminal `subloop_completed` events intact.

### D-03 — restart_iteration threading

- `V4AgentInput.restartIteration?` declared `types.ts:213`; consumed `somnio-v4-agent.ts:156` (`const restartIteration = input.restartIteration ?? 0`).
- Core builder threads it: `turn-orchestrator.ts:177` (`restartIteration: ctx.restartIteration`) + `agent_routed` event `:229` (`restart_iteration: ctx.restartIteration`).
- Propagated into `runCrmGate` call (`somnio-v4-agent.ts:214`) and both `runSubLoop` calls (`:636` slot, `:741` vision); consumed in gate (`crm-gate.ts:181/324`, `args.restartIteration ?? 0`) and sub-loop (`args.ctx.restartIteration ?? 0`). Snake_case `restart_iteration` injected uniformly by the helper (`observability.ts:30`).

### D-04 — Data-layer only

`git diff --stat` for the 5 feat commits (`d1d6ef86..635d6b00`) touches ONLY: `observability.ts` (new), `types.ts`, `crm-gate.ts`, `sub-loop/index.ts`, `core/turn-orchestrator.ts`, `somnio-v4-agent.ts`, `engine/v4-production-runner.ts`, and 5 test files. ZERO sandbox / debug-panel UI files. Sandbox debug-panel extension correctly deferred.

## Anti-Regression / Quality Gates

| Check | Status | Evidence |
|-------|--------|----------|
| Regla 6 — additive only | ✓ PASS | Agent diff has exactly ONE deletion (stack slice 4→5 frames, in-spec); runner diff deletes only the hardcoded `message:` line. No decision logic / control flow removed. |
| Drain discriminator unchanged | ✓ PASS | `turn-orchestrator.ts:207` still uses `output.errorMessage.startsWith('interrupted_at_ckpt_')`; agent catch preserves `errorMessage: errStack ? \`${errMsg} :: ${errStack}\` : errMsg` (`:1069`). drain.ts/checkpoint-gate.ts/restart-context.ts untouched. |
| Regla 3 — no new admin client | ✓ PASS | `grep createAdminClient\|@supabase/supabase-js src/lib/agents/somnio-v4/observability.ts` → 0 matches; helper uses only `getCollector()?.recordEvent`. |
| LockEventLabel parity | ✓ PASS | New labels are FREE STRINGS; none leaked into `interruption-system-v2/observability.ts` union. `toHaveLength(11)` test passes (6/6). |
| PII redaction | ✓ PASS | `bodyTruncate(errMsg, 200)` on engine_error + subloop_error; `idSuffix(orderId)` on crm_gate_completed. |
| `npx tsc --noEmit` | ✓ PASS | exit 0. |

## Behavioral Spot-Checks (deterministic test suites)

| Suite | Result | Status |
|-------|--------|--------|
| observability.test.ts | 5/5 | ✓ PASS |
| somnio-v4-error-path.test.ts | 6/6 | ✓ PASS |
| crm-gate-observability.test.ts | (in 45 total) | ✓ PASS |
| subloop-observability.test.ts | (in 45 total) | ✓ PASS |
| v4-runner-error-message.test.ts | 6/6 | ✓ PASS |
| engine-v4-lock.test.ts (filter-based asserts) | ✓ | ✓ PASS |
| interruption-system-v2 observability.test.ts (toHaveLength 11) | 6/6 | ✓ PASS |
| **Combined new+parity** | **45/45** | ✓ PASS |
| somnio-v4-agent.test.ts + crm-gate.test.ts (pre-existing, Regla 6) | 23/23 | ✓ PASS |

Console output during the suite confirmed events emit with `restart_iteration` in payload (`[v4-spine] subloop_tooling_completed {... restart_iteration: 0 }`, `subloop_generation_completed {... threshold: 0.7 ...}`).

**Known flaky (NOT a phase failure):** live-LLM `smoke-rag-b.test.ts` is the PRE-EXISTING nondeterministic instability this phase was built to OBSERVE, not fix (deferred per CONTEXT). Excluded from the verification basis per instruction; goal assessed on deterministic evidence + source inspection.

## Human Verification Required

None required for goal achievement. The phase is purely instrumentation (data-layer); observable behavior verified by tests + source. Note: Plan 04 documents a pending operator `git push` (Regla 1) before the new error message reaches the live operator chat — that is a deploy step, not a goal-achievement gap.

## Gaps Summary

No gaps. All four locked decisions (D-01..D-04) are implemented in the actual source with file:line evidence, all anti-regression gates are green, tsc=0, and the deterministic test corpus (45 new+parity / 23 pre-existing) passes.

---

_Verified: 2026-06-13T14:21:00Z_
_Verifier: Claude (gsd-verifier)_
