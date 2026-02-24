---
phase: robot-coordinadora-hardening
plan: 02
subsystem: inngest-orchestrator
tags: [fetch-timeout, abort-signal, settle-sleep, error-reporting, onFailure, robot-coordinadora]
dependency-graph:
  requires: [hardening-01]
  provides: [fetch-timeout-protection, improved-error-reporting, waitForEvent-race-mitigation]
  affects: [hardening-03, hardening-04]
tech-stack:
  patterns: [AbortSignal.timeout, Inngest onFailure error propagation to job items]
key-files:
  modified:
    - src/inngest/functions/robot-orchestrator.ts
decisions:
  - id: fetch-timeout-formula
    decision: "Use 60s per order + 10min base margin for both fetch and waitForEvent timeouts"
    reason: "Consistent formula avoids confusion; generous enough for slow portal sessions"
  - id: error-to-pending-item
    decision: "Write orchestrator errors to a pending robot_job_item (status=error) instead of adding a column to robot_jobs"
    reason: "No schema migration needed; UI already renders job items with error_message"
metrics:
  duration: ~7 minutes
  completed: 2026-02-24
---

# Phase hardening Plan 02: Fetch Timeouts + Error Reporting Summary

**One-liner:** AbortSignal.timeout on external fetch calls (60s/order+10min), 5s settle sleep, and descriptive error messages written to job items for UI display.

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~7 minutes |
| Start | 2026-02-24T15:47:27Z |
| End | 2026-02-24T15:55:00Z |
| Tasks | 2/2 |
| Files modified | 1 |

## Accomplishments

1. **Fetch timeout protection (P1 Bug #9):** Both `robotOrchestrator` and `guideLookupOrchestrator` fetch calls now have `AbortSignal.timeout` set to `(N * 60s) + 10min`. A hung robot service will be aborted instead of consuming Inngest execution time indefinitely.

2. **Settle sleep increase (P0 Bug #4):** Increased from 2s to 5s in both external-service orchestrators, reducing the probability of the Inngest waitForEvent race condition (issue #1433) where the callback arrives before waitForEvent is registered.

3. **Timeout formula update (P2 Bug #12):** Changed from the previous per-orchestrator formulas (30s/order+5min for robot, 10s/pedido+3min for guide lookup) to a unified 60s/order+10min formula for both fetch timeouts and waitForEvent timeouts.

4. **Error reporting to UI (P0 Bug #3):** onFailure handlers now write the error message to a pending `robot_job_items` row (status=error, error_message="Error del orquestador: ..."). Timeout failures write "Tiempo de espera agotado. El servicio del robot no respondio a tiempo." Users see these messages in the chat UI instead of a generic "Job failed".

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Add AbortSignal.timeout + update timeout formula | f1282a2 | AbortSignal.timeout on 2 fetch calls, settle 2s->5s, timeout formula unified |
| 2 | Improve onFailure error reporting | 429f970 | onFailure writes error to pending item, timeout step writes timeout error |

## Files Modified

| File | Changes |
|------|---------|
| src/inngest/functions/robot-orchestrator.ts | +117/-16 lines across both tasks |

## Decisions Made

1. **Fetch timeout formula: 60s/order + 10min** -- Same formula for both orchestrators and both fetch/waitForEvent. Generous enough for slow Coordinadora portal sessions.

2. **Error propagation via job items** -- Instead of adding an `error_message` column to `robot_jobs`, we write the error to a pending `robot_job_items` row. This avoids schema migration and leverages the existing UI rendering of item error messages.

## Deviations from Plan

**1. [Rule 1 - Bug] Updated outdated JSDoc comment for guideLookupOrchestrator**
- **Found during:** Task 2
- **Issue:** JSDoc still referenced "10s vs 30s" timeout per pedido from old formula
- **Fix:** Updated to reflect new unified 60s/order + 10min formula
- **Files:** src/inngest/functions/robot-orchestrator.ts

## Issues Encountered

None -- plan executed cleanly.

## Bugs Fixed

- **P0 Bug #3:** Poor error reporting -- users now see descriptive error messages
- **P0 Bug #4:** Settle sleep too short (2s->5s) -- reduces waitForEvent race condition
- **P1 Bug #9:** No fetch timeout -- AbortSignal.timeout prevents indefinite hangs
- **P2 Bug #12:** Timeout calculation too aggressive -- unified to 60s/order + 10min

## Next Phase Readiness

- hardening-03 (retry logic) can proceed -- no blockers
- hardening-04 (callback validation) can proceed -- no blockers
- No schema changes needed for this plan
