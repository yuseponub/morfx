---
phase: v4-hybrid-template-rag-turn
plan: "03"
subsystem: somnio-v4
tags: [orchestrator, slot-resolver, partial-handoff, rag, hybrid, v4-only, THE-CORE]
dependency_graph:
  requires:
    - v4-hybrid-template-rag-turn/01 (secondary_confidence + secondary_query)
    - v4-hybrid-template-rag-turn/02 (computeSlots)
  provides:
    - End-of-pipeline per-intent slot resolver (replaces binary early-return)
    - Partial handoff (resolved slot SENT + newMode=handoff) without dropping messages
    - Synthetic RAG ProcessedMessage injection (rag:<topic> CORE) ordered primary->secondary
    - Combined single-commitTurn ledger atendido[] (template_intent + kb_topic + handoff)
  affects:
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (core refactor)
    - src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts (matrix tests)
tech_stack:
  added: []
  patterns:
    - "slot resolver at END of pipeline (T-1=(b)) — deterministic track resolves covered intents, resolver injects RAG only for low slots"
    - "partial handoff via existing send-before-handoff (no new field/column — R1-A)"
    - "interrupt-as-errorMessage (Path A restart) NOT handoff (R1-B/R6-A)"
    - "sequential RAG per low slot (T-4) reusing existing CKPT-3/4/5 (R6-B no new CheckpointId)"
    - "FIFO queue mock for runSubLoop to drive distinct primary/secondary outcomes in one turn"
key_files:
  created: []
  modified:
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts
decisions:
  - "Inlined the RAG-mapping logic into the slot resolver (resolveLowSlot + combiner) rather than reusing mapOutcomeToAgentOutput; the latter is now dead code but KEPT per plan instruction"
  - "D-11 ordering: primaryLow ? [...rag, ...templates] : [...templates, ...rag] — documented V1 choice"
  - "A status='template' outcome reaching the slot resolver (never produced by runRagSubLoop) is defensively escalated to handoff"
  - "subLoopReason on combined output = primary.reason ?? secondary.reason when anyLowSlot (informational, debug panel)"
metrics:
  duration: "~40 min"
  completed: "2026-05-30"
  tasks_completed: 3
  files_count: 2
---

# Phase v4-hybrid-template-rag-turn Plan 03: Slot Resolver (THE CORE REFACTOR) Summary

**One-liner:** Replaced the binary early-return (escalate the WHOLE turn to RAG based on the primary intent alone) with an end-of-pipeline per-intent slot resolver that runs sequential RAG only for low slots, combines them with deterministic templates in intent order (D-11), and handles partial handoff without ever dropping the resolved slot's messages.

## What Was Built

The orchestrator `processUserMessage` now:
1. Computes a `SlotPlan` (Plan 02 `computeSlots`) right after the threshold lookup, using the Plan 01 fields `secondary_confidence` / `secondary_query`.
2. Removes the exclusive early-return at 243-314. The flow ALWAYS proceeds through guards → CKPT-2 → sales-track → gate CRM → response-track → slot resolver.
3. At the END (post-everything), `resolveLowSlot(...)` runs RAG **sequentially** (T-4, no parallel) — primary first (raw message, T-2), then secondary (`secondary_query`, T-2) — one `runSubLoop` invocation per low slot (D-08).
4. Injects each `generated` outcome as a synthetic `ProcessedMessage { templateId: 'rag:<topic>', content, contentType:'texto', delayMs:0, priority:'CORE' }` (R4 + D-05).
5. Combines `responseResult.messages` (covered) + `ragMessages` in intent order (D-11).
6. Builds a single combined ledger `atendido[]` (sales_action/template_intent + kb_topic per generated + handoff per escalated) with one `commitTurn`.

### The 4-case matrix (D-02/D-03)

| Case | runSubLoop calls | output.templates order |
|------|------------------|------------------------|
| covered+covered | 0 | [covered, covered] |
| covered+low | 1 (secondary_query) | [covered, rag:topic] |
| low+covered | 1 (raw message) | [rag:topic, covered] |
| low+low | 2 (sequential) | [rag:topic1, rag:topic2] |

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Compute slot plan early; remove exclusive early-return (T-1) | `4af2a9e6` | somnio-v4-agent.ts |
| 2 | Resolve LOW slots via sequential RAG + combine output (single commitTurn) | `43ca0a25` | somnio-v4-agent.ts |
| 3 | Unit tests for the 4-case matrix, partial handoff, interrupt-not-handoff | `30fbefde` | somnio-v4-agent.test.ts |

## Acceptance Criteria Status

### Task 1
| Criterion | Status |
|-----------|--------|
| `computeSlots` count >= 1 | PASS (3) |
| early-return `if (earlyReason === ...)` count = 0 | PASS (0) |
| `return mapOutcomeToAgentOutput` count = 0 | PASS (0) |
| `scaledToSubLoop: anyLowSlot` count = 1 | PASS (1) |
| `npx tsc --noEmit` exits 0 (no new errors) | PASS |

### Task 2
| Criterion | Status |
|-----------|--------|
| `rag:${outcome.sourceTopic}` literal count = 1 | PASS (1) |
| `priority: 'CORE'` in RAG message >= 1 | PASS (1) |
| `interrupted_at_ckpt_` in resolver >= 1 | PASS (7) |
| `handoffSlots` count >= 3 | PASS (4) |
| `await runSubLoop(` >= 1 (sequential) | PASS (1) |
| `Promise.all` count = 0 (T-4) | PASS (0) |
| one `commitTurn` on user happy path | PASS (combined return path commits once) |
| `npx tsc --noEmit` exits 0 | PASS |

### Task 3
| Criterion | Status |
|-----------|--------|
| `hybrid slot resolver` describe = 1 | PASS (1) |
| >= 6 new `it(` cases | PASS (7) |
| asserts `errorMessage === 'interrupted_at_ckpt_3_post_tooling'` + newMode not handoff | PASS |
| partial-handoff: templates.length > 0 AND newMode === 'handoff' | PASS |
| `npx vitest run somnio-v4-agent.test.ts` exits 0 | PASS (16/16) |

## Critical Constraints Verification

- **R1-A** (partial handoff never drops resolved-slot messages): when `combinedMessages.length > 0` the output keeps `messages`/`templates` populated AND sets `newMode='handoff'` + `requiresHuman:true`. Test `partial handoff (covered+low, RAG no_match)` asserts `templates=['precio']`, `messages=['precio']`, `newMode='handoff'`, `requiresHuman=true`. **HELD.**
- **R1-B / R6-A** (interrupt → errorMessage not handoff): the resolver detects `outcome.reason.startsWith('interrupted_at_ckpt_')` and returns the interrupt-discriminator output (success:false + errorMessage), discarding the turn for Path A restart. Test asserts `errorMessage='interrupted_at_ckpt_3_post_tooling'` with `newMode !== 'handoff'`. Primary interrupt short-circuits the secondary slot (only 1 invocation). **HELD.**
- **R6-B** (no new CheckpointId): interruption-system-v2/ untouched (0 lines diff vs baseline); CheckpointId still exactly 8. The 2 RAG invocations reuse the existing CKPT-3/4/5. **HELD.**
- **Parity** (runner ↔ engine-v4): only existing `V4AgentOutput` fields reused (templates/messages/newMode/requiresHuman/errorMessage). Both runners call the shared `processMessage` — no shape change, no runner edits. **HELD.**

## Regla 6 — v4-ONLY Verification (baseline `9fd422f0`)

| Check | Result |
|-------|--------|
| 5 siblings (somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation) | 0 files |
| v3-production-runner.ts | 0 files |
| interruption-system-v2/ | 0 files |
| engine-adapters/production/messaging.ts | 0 files |
| production/handoff-handler.ts | 0 files |
| CheckpointId values | 8/8 |
| Changes confined to somnio-v4/ (this plan) | only somnio-v4-agent.ts + its test |

v4 DORMANT in prod (0 workspaces) → Regla 6 satisfied by construction.

## TDD Gate Compliance

Task 3 is a `test`-typed task. Because the refactor of an existing orchestrator (Tasks 1-2) preceded the test authoring, the gate sequence here is `refactor`/`feat` → `test` (test-after-refactor), not classic RED→GREEN. This is the realistic pattern when restructuring existing production code: the new tests (the hybrid slot resolver describe) were authored to exercise the just-built resolver and all pass green. No RED commit exists for this plan's feature because the implementation was the refactor itself. The matrix tests are the canonical record of the 4 cells + partial handoff + interrupt-not-handoff.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing `ProcessedMessage` import**
- **Found during:** Task 2 (tsc after inserting the resolver)
- **Issue:** `ProcessedMessage` was used for `ragMessages`/`combinedMessages` typing but not imported in somnio-v4-agent.ts.
- **Fix:** Added `ProcessedMessage` to the type import block from `./types`.
- **Commit:** `43ca0a25`

**2. [Rule 1 - Bug] grep-sensitive comment wording (`Promise.all`)**
- **Found during:** Task 2 (acceptance grep)
- **Issue:** A clarifying comment literally contained "NO Promise.all", tripping the `grep -c "Promise.all" == 0` acceptance gate.
- **Fix:** Reworded to "no parallel fan-out".
- **Commit:** `43ca0a25`

**3. [Rule 1 - Bug] Test intent enum + obsolete R6 test**
- **Found during:** Task 3 (tsc on tests)
- **Issue:** (a) `primary: 'razonamiento_libre'` is not a valid intent enum value (the sumidero intent is `'otro'`, which `decideSubLoopReason` maps to `razonamiento_libre`). (b) The pre-existing `template ledger (R6)` test exercised the now-dead `mapOutcomeToAgentOutput` template branch — in the RAG-generative architecture `runRagSubLoop` never emits `status='template'`.
- **Fix:** (a) Changed low-primary test cases to `primary: 'otro'` + ledger assertion `intent: 'otro'`. (b) Repurposed the R6 test to assert that a `template` status reaching the slot resolver is defensively escalated to handoff.
- **Commit:** `30fbefde`

### Note on `mapOutcomeToAgentOutput`

The function is now dead code (no caller). Per the plan's explicit instruction ("Do NOT delete mapOutcomeToAgentOutput yet"), it was KEPT. Its RAG-mapping logic (synthetic-message shape, interrupt discriminator, kb_topic ledger) was inlined into the new slot resolver. A follow-up cleanup plan may remove it.

## Out-of-Scope / Pre-existing Test Failures (NOT regressions)

The broad `vitest run src/lib/agents/somnio-v4/` suite (252 tests) reports 4 failures across 3 files. ALL are pre-existing/environmental and unrelated to this plan (confirmed by tracing code paths):

1. `sub-loop/__tests__/few-shots.test.ts > M1 probability framing` (1) — documented debt from the somnio-v4-rag-generative standalone (generation prompt refactored, assertion stale). Sub-loop unchanged since baseline.
2. `__tests__/smoke-rag-a.test.ts` (1) — `Test timed out in 120000ms` on a LIVE LLM call (727s total run). Environment/network flakiness.
3. `__tests__/smoke-rag-b.test.ts` (2) — `expected 'generated' to be 'no_match'` on `razonamiento_libre` cases. **These call `runSubLoop(...)` DIRECTLY** (smoke-rag-b.test.ts:333), NOT `processMessage`/`processUserMessage` — they never touch this plan's orchestrator change. The failure is live-LLM nondeterminism in the sub-loop (which I did not modify).

These are smoke/integration tests against live models — their validation is **Plan 05's** scope, not Plan 03. The plan's Plan-03 verification target — `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` (16/16) + `npx tsc --noEmit` — is fully green. Logged to `deferred-items.md`.

## Known Stubs

None. The slot resolver is fully wired: covered intents resolve via the existing deterministic response-track, low intents via real `runSubLoop`. No mock/placeholder data flows to output.

Note: response-track does NOT yet filter the LOW intent's template (T-8) — that is **Plan 04's** job (gate the low template at the response-track). In this plan the slot resolver correctly injects RAG for low slots regardless, but the canonical "no duplicate template for a low intent" guarantee depends on Plan 04. Tracked, intentional, resolved by Plan 04.

## Threat Flags

None. No new network endpoints, auth paths, file access, or schema changes. The two trust-boundary threats in the plan's register (T-v4hy-03 combineSlots output, T-v4hy-05 interrupt→handoff confusion) are mitigated by the R1-A guard and the R1-B errorMessage propagation respectively (both verified by tests).

## Self-Check

### Files exist
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — FOUND
- `src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` — FOUND

### Commits exist
- `4af2a9e6` — FOUND (Task 1)
- `43ca0a25` — FOUND (Task 2)
- `30fbefde` — FOUND (Task 3)

## Self-Check: PASSED
