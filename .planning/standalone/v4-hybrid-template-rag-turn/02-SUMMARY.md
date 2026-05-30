---
phase: v4-hybrid-template-rag-turn
plan: "02"
subsystem: somnio-v4
tags: [tdd, pure-function, slots, coverage-classifier, v4-only]
dependency_graph:
  requires: [v4-hybrid-template-rag-turn/01]
  provides: [slots.ts computeSlots]
  affects: [somnio-v4/slots.ts, somnio-v4/__tests__/slots.test.ts]
tech_stack:
  added: []
  patterns: [pure-function, decideSubLoopReason-reuse, TDD-RED-GREEN]
key_files:
  created:
    - src/lib/agents/somnio-v4/slots.ts
    - src/lib/agents/somnio-v4/__tests__/slots.test.ts
  modified: []
decisions:
  - "computeSlots reuses decideSubLoopReason(isCrmMutation:false, casReject:false) — canonical rule, no duplication"
  - "T-2: low primary uses rawMessage; low secondary uses secondaryQuery ?? rawMessage (defensive fallback)"
  - "secondaryConfidence null + intent != ninguno treated as 0 (defensive — forces low)"
  - "SlotDecision.reason narrowed to 'low_confidence' | 'razonamiento_libre' | null (crm_mutation/cas_reject excluded by construction)"
metrics:
  duration: "~15 min"
  completed: "2026-05-30"
  tasks_completed: 1
  files_count: 2
---

# Phase v4-hybrid-template-rag-turn Plan 02: computeSlots Coverage Classifier Summary

**One-liner:** Pure per-intent coverage classifier (covered|low) + T-2 RAG sub-query selection, TDD RED→GREEN, reusing `decideSubLoopReason` from escalation.ts with zero impure imports.

## What Was Built

`src/lib/agents/somnio-v4/slots.ts` — leaf module with no async, no DB, no LLM.

Exports:
- `SlotCoverage = 'covered' | 'low'`
- `SlotDecision { intent, coverage, reason, ragQuery }`
- `SlotPlan { primary: SlotDecision; secondary: SlotDecision | null }`
- `computeSlots(args: ComputeSlotsArgs): SlotPlan`

### D-02/D-03 Matrix

| Case | primary | secondary | primary.ragQuery | secondary.ragQuery |
|------|---------|-----------|-----------------|-------------------|
| covered+covered | template | template | null | null |
| covered+low | template | RAG | null | secondaryQuery ?? rawMessage |
| low+covered | RAG | template | rawMessage | null |
| low+low | RAG | RAG | rawMessage | secondaryQuery ?? rawMessage |

### T-2 Sub-query Selection

- **Low primary** → `ragQuery = rawMessage` (full unpartitioned message, behavior unchanged)
- **Low secondary** → `ragQuery = secondaryQuery` (D-04 segmented sub-query from comprehension); fallback to `rawMessage` if null

### Edge Cases Handled

- `secondaryIntent === 'ninguno'` → `secondary: null`
- `intent === 'razonamiento_libre' || intent === 'otro'` → `coverage = 'low'`, `reason = 'razonamiento_libre'` (D-69) even at high confidence
- `secondaryConfidence === null` + intent not ninguno → treated as confidence 0 → `low` (defensive)

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `e4aec756` | Test suite failed: "Failed to load url ../slots (Does the file exist?)" |
| GREEN | `ae18b9e4` | 33/33 tests pass, `npx vitest run` exits 0 |

## Test Results

```
✓ src/lib/agents/somnio-v4/__tests__/slots.test.ts  (33 tests) 10ms
Test Files  1 passed (1)
Tests  33 passed (33)
```

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| computeSlots returns correct SlotPlan for all 4 matrix cells + none + razonamiento_libre + null-confidence edge | PASS |
| ragQuery selection matches T-2 (raw for low primary, secondary_query for low secondary) | PASS |
| `grep -c "from './escalation'" slots.ts` returns 1 | PASS (1) |
| `grep -cE "createAdminClient|generateText|from '@/lib/domain" slots.ts` returns 0 | PASS (0) |
| `npx tsc --noEmit` exits 0 | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing `beforeAll` import in test**
- **Found during:** First GREEN run after implementation
- **Issue:** Test used `beforeAll` from vitest but only imported `describe`, `it`, `expect`
- **Fix:** Added `beforeAll` to the vitest import line
- **Files modified:** `src/lib/agents/somnio-v4/__tests__/slots.test.ts`
- **Commit:** `ae18b9e4` (included in GREEN commit with implementation)

Note: This was a test authoring bug in the RED commit (the test itself failed at module collection, not at test execution, which is still a valid RED — the test couldn't even run against the missing module). After the import fix, all 33 tests ran and correctly reflect the D-02/D-03/T-2 requirements.

## Regla 6 Verification

`git diff --name-only 9fd422f0..HEAD` across all sibling agent paths: 0 lines.
Siblings (somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation), v3-runner, interruption-system-v2, messaging adapter, and handoff-handler are all byte-identical to baseline.

## Known Stubs

None — this is a pure function module with no data sources to wire.

## Threat Flags

None — pure function, no network endpoints, no DB access, no auth paths.

## Self-Check

- [x] `src/lib/agents/somnio-v4/slots.ts` exists
- [x] `src/lib/agents/somnio-v4/__tests__/slots.test.ts` exists
- [x] RED commit `e4aec756` exists in git log
- [x] GREEN commit `ae18b9e4` exists in git log
- [x] 33/33 tests pass

## Self-Check: PASSED
