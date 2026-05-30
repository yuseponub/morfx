---
phase: v4-hybrid-template-rag-turn
plan: "04"
subsystem: somnio-v4
tags: [response-track, runner, rag-filter, coverage-gate, t-7, t-8, r4-b, v4-only]
dependency_graph:
  requires:
    - v4-hybrid-template-rag-turn/03 (slot resolver + per-intent coverage from slotPlan)
    - v4-hybrid-template-rag-turn/02 (computeSlots — produces slotPlan.primary.coverage / slotPlan.secondary?.coverage)
  provides:
    - Coverage-gated informational template selection (intentCoverage/secondaryCoverage params on resolveResponseTrack)
    - rag:* pseudo-id filter in v4-production-runner (sentIds single-point filter)
    - no-rep filter rag:* passthrough (R4-B order-preserving survivor filter)
    - response-track.test.ts (8 tests, GREEN)
  affects:
    - src/lib/agents/somnio-v4/response-track.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/engine/v4-production-runner.ts
    - src/lib/agents/somnio-v4/__tests__/response-track.test.ts (new)
tech_stack:
  added: []
  patterns:
    - "TDD RED→GREEN: test file created first (RED commit aee4c5fe), then fix committed (GREEN c79c3246)"
    - "Single-point rag:* filter on sentIds covers all 3 templatesEnviados persist sites (L724/L892/L1076)"
    - "Default-undefined coverage = covered (back-compat — callers that skip coverage args keep working)"
    - "Order-preserving no-rep survivor filter: t.startsWith('rag:') || survivingIds.has(t.templateId)"
key_files:
  created:
    - src/lib/agents/somnio-v4/__tests__/response-track.test.ts
  modified:
    - src/lib/agents/somnio-v4/response-track.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/engine/v4-production-runner.ts
decisions:
  - "Default-undefined intentCoverage/secondaryCoverage = 'covered' (not 'low') for back-compat — callers without slot plan still work"
  - "Single-point sentIds filter (not per persist-site) — actuallySentIds is the canonical accumulator for all three L724/L892/L1076 writes"
  - "Order-preserving R4-B one-liner (rag: || survivingIds.has) vs split-and-rejoin approach — avoids reordering D-11"
metrics:
  duration: "~10 min"
  completed: "2026-05-30"
  tasks_completed: 2
  files_count: 4
---

# Phase v4-hybrid-template-rag-turn Plan 04: Composition Pitfall Fixes (T-7, T-8, R4-B) Summary

**One-liner:** Coverage-gated informational template selection (T-8, fixes the L90-96 bug) + rag:* pseudo-id filter from templates_enviados (T-7 single-point) + no-rep filter RAG passthrough (R4-B), completing the deterministic/generative track isolation for the hybrid turn.

## What Was Built

### Task 1: Coverage-gated informational templates (T-8)

**The bug (response-track.ts:90-96):** `secondaryIntent` was pushed to `infoTemplateIntents` without any coverage check. In a `covered+low` scenario this caused BOTH a template AND a RAG response for the secondary intent — violating D-03 (a LOW intent must ONLY go to RAG).

**Fix:**
- Added `intentCoverage?: 'covered' | 'low'` and `secondaryCoverage?: 'covered' | 'low'` to the `resolveResponseTrack` input signature.
- Wrapped the primary informational push with `input.intentCoverage !== 'low'`.
- Wrapped the secondary informational push with `input.secondaryCoverage !== 'low'`.
- Default-undefined = 'covered' (back-compat: callers that don't pass coverage keep working).
- Sales-action templates are NOT affected — coverage gating applies only to KB-answerable informational intents.
- In `somnio-v4-agent.ts`, the `resolveResponseTrack` call site now passes `intentCoverage: slotPlan.primary.coverage` and `secondaryCoverage: slotPlan.secondary?.coverage` (Plan 03 left the slot plan computed; Plan 04 wires coverage into response-track).

### Task 2: rag:* pseudo-id filter in the runner (T-7) + no-rep passthrough (R4-B)

**T-7:** `rag:<topic>` is a synthetic pseudo-id assigned to RAG-generated messages. The canonical RAG record is the turn ledger (`atendido[{kind:'kb_topic'}]`), not `templates_enviados`. Persisting the pseudo-id would pollute the template-dedup store for future turns.

**Fix (single-point):** At the `sentIds` computation in the runner, added `.filter((id): id is string => id != null && id.length > 0 && !id.startsWith('rag:'))`. This single filter covers all three `templatesEnviados` persist sites (L724, L892, L1076) since they all consume `actuallySentIds`. The RAG message is still SENT — only its pseudo-id is excluded from the id accumulator.

**R4-B:** The no-repetition filter (`USE_NO_REPETITION_V4`, default OFF) filtered by `survivingIds.has(t.templateId)`. A `rag:*` message has no prior templateId in the registry, so it would be silently dropped if the flag were ON.

**Fix (order-preserving):** Changed the survivor filter line to `templatesToSend.filter(t => t.templateId.startsWith('rag:') || survivingIds.has(t.templateId))`. This passes RAG messages through regardless of the filter result, preserving D-11 order (primary→secondary).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for T-8 coverage gating | `aee4c5fe` | response-track.test.ts (new) |
| 1 (GREEN) | Implement coverage-gated informational templates | `c79c3246` | response-track.ts, somnio-v4-agent.ts |
| 2 | Filter rag:* pseudo-ids + R4-B no-rep passthrough | `db100a03` | v4-production-runner.ts |

## Acceptance Criteria Status

### Task 1

| Criterion | Status |
|-----------|--------|
| `grep -c "input.secondaryCoverage !== 'low'" response-track.ts` = 1 | PASS (1) |
| `grep -c "input.intentCoverage !== 'low'" response-track.ts` = 1 | PASS (1) |
| `grep -c "intentCoverage: slotPlan.primary.coverage" somnio-v4-agent.ts` = 1 | PASS (1) |
| `grep -c "secondaryCoverage: slotPlan.secondary?.coverage" somnio-v4-agent.ts` = 1 | PASS (1) |
| A response-track test asserts low secondary intent's template absent from infoTemplateIntents | PASS |
| `npx vitest run response-track.test.ts` exits 0 | PASS (8/8) |

### Task 2

| Criterion | Status |
|-----------|--------|
| `grep -c "!id.startsWith('rag:')" v4-production-runner.ts` = 1 (T-7 filter) | PASS (1) |
| `grep -c "t.templateId.startsWith('rag:') || survivingIds.has" v4-production-runner.ts` = 1 (R4-B) | PASS (1) |
| persist sites still consume actuallySentIds (unchanged) | PASS |
| `npx tsc --noEmit` exits 0 | PASS |

## Regla 6 — v4-ONLY Verification (baseline `9fd422f0`)

| Check | Result |
|-------|--------|
| 5 siblings (somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation) | 0 files |
| v3-production-runner.ts | 0 files |
| interruption-system-v2/ | 0 files |
| engine-adapters/production/messaging.ts | 0 files |
| production/handoff-handler.ts | 0 files |
| CheckpointId values | 8/8 |
| Changes confined to somnio-v4/ (Tasks 1-2) + v4-production-runner.ts (Task 2) | CONFIRMED |

v4 DORMANT in prod (0 workspaces) → Regla 6 satisfied by construction.

## TDD Gate Compliance

Task 1 followed strict RED→GREEN:
- RED commit `aee4c5fe`: `test(...)` — 8 tests created, 5 failing (the coverage-gate behaviors), 3 passing (back-compat behavior already works).
- GREEN commit `c79c3246`: `feat(...)` — implementation added, all 8 tests pass.
- No REFACTOR needed (implementation is minimal and clean).

Task 2 is `type="auto"` (not TDD), verified by `tsc --noEmit`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock ordering error in "does NOT emit the secondary intent template" test**
- **Found during:** Task 1 (first RED run)
- **Issue:** `mockSingleTemplate('precio', ...)` was placed AFTER the `resolveResponseTrack` call in the original test draft, so the mock had no effect during the actual call.
- **Fix:** Moved the mock setup before the `resolveResponseTrack` call and clarified the test's intent (primary covered needs a mock; secondary low is gated before TemplateManager is called).
- **Commit:** Test was fixed before the RED commit (`aee4c5fe`).

**2. [Rule 1 - Bug] Sales-action test used wrong mock setup**
- **Found during:** Task 1 (first RED run)
- **Issue:** The sales-action test called `mockSingleTemplate('pedir_datos', ...)` but `pedir_datos` is a sales action mapped via `ACTION_TEMPLATE_MAP`, not a direct intent in `INFORMATIONAL_INTENTS`. The mock needed to be set up with the full `Map` structure matching what `resolveSalesActionTemplates` looks up.
- **Fix:** Replaced `mockSingleTemplate` helper with an inline `getTemplatesForIntentsMock.mockResolvedValueOnce(new Map([...]))` that sets up the `pedir_datos` intent correctly.
- **Commit:** Fixed before the RED commit (`aee4c5fe`).

## Known Stubs

None. All four fixes (T-8 gate, T-7 filter, R4-B passthrough, call site coverage wiring) are fully wired. No mock/placeholder data flows to production output.

## Threat Flags

None. No new network endpoints, auth paths, file access, or schema changes. The two threat register items are mitigated:
- **T-v4hy-07** (Tampering — pseudo-id → session state): MITIGATED by T-7 filter at sentIds.
- **T-v4hy-08** (Information disclosure — duplicated answer): MITIGATED by T-8 gate (LOW intent's template suppressed, only RAG answers it).

## Self-Check

### Files exist
- `src/lib/agents/somnio-v4/response-track.ts` — FOUND
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — FOUND
- `src/lib/agents/engine/v4-production-runner.ts` — FOUND
- `src/lib/agents/somnio-v4/__tests__/response-track.test.ts` — FOUND

### Commits exist
- `aee4c5fe` — FOUND (Task 1 RED)
- `c79c3246` — FOUND (Task 1 GREEN)
- `db100a03` — FOUND (Task 2)

## Self-Check: PASSED
