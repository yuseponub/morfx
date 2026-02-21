---
phase: 23-inngest-orchestrator-callback-api
plan: 02
subsystem: api
tags: [inngest, orchestrator, robot, durable-function, webhook, batch]

# Dependency graph
requires:
  - phase: 23-01
    provides: "robot/job.batch_completed event type and robot.coord.completed trigger registration"
  - phase: 21
    provides: "updateJobStatus domain function for robot job lifecycle"
provides:
  - "robotOrchestrator Inngest function that dispatches jobs to robot-coordinadora and waits for batch completion"
  - "robotOrchestratorFunctions registered in Inngest serve()"
affects: [23-03, 24]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inngest onFailure handler for cleanup on unhandled errors"
    - "step.waitForEvent with dynamic timeout (N*30s + 5min)"
    - "2s settle sleep to prevent waitForEvent race on tiny batches"
    - "retries: 0 fail-fast for idempotency-critical external calls"

key-files:
  created:
    - "src/inngest/functions/robot-orchestrator.ts"
  modified:
    - "src/app/api/inngest/route.ts"

key-decisions:
  - "retries: 0 (fail-fast) to prevent duplicate Coordinadora portal submissions"
  - "onFailure handler instead of try/catch around step.run (idiomatic Inngest pattern, avoids replay issues)"
  - "Dynamic timeout formula: (N orders x 30s) + 5 min margin"
  - "2s settle sleep before waitForEvent to handle tiny batches where callback arrives first"
  - "callbackSecret passed in HTTP payload so robot service can forward it in callback headers"

patterns-established:
  - "onFailure for cleanup: Inngest onFailure callback for guaranteed job status updates on failure"
  - "Dynamic timeout: scale wait time with batch size for external service calls"

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 23 Plan 02: Inngest Robot Orchestrator Summary

**Inngest durable function dispatching robot jobs via HTTP with dynamic timeout waitForEvent and onFailure cleanup**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T01:19:33Z
- **Completed:** 2026-02-21T01:26:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created robot-orchestrator Inngest function with 5-step durable workflow: mark-processing, dispatch-to-robot, settle, wait-for-batch, handle-result
- Implemented fail-fast pattern (retries: 0) to prevent duplicate portal submissions
- Added onFailure handler for guaranteed job failure marking on any unhandled error
- Registered robotOrchestratorFunctions in Inngest serve() alongside existing functions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create robot-orchestrator Inngest function** - `5b012c2` (feat)
2. **Task 2: Register orchestrator in Inngest serve()** - `858ef96` (feat)

## Files Created/Modified
- `src/inngest/functions/robot-orchestrator.ts` - Durable Inngest function: dispatches robot jobs via HTTP to robot-coordinadora, waits for batch_completed event with dynamic timeout, marks job failed on timeout or error
- `src/app/api/inngest/route.ts` - Added robotOrchestratorFunctions import and spread into serve() functions array

## Decisions Made
- **retries: 0 (fail-fast):** A retry would re-submit the same orders to the Coordinadora portal, creating duplicate shipments. The onFailure handler catches all errors instead.
- **onFailure over try/catch:** Inngest onFailure callback runs as a separate guaranteed step, avoiding the anti-pattern of wrapping step.run() in try/catch which breaks on function replay.
- **Dynamic timeout:** `(N orders x 30s) + 5 min margin` scales with batch size. 30s per order accounts for Playwright portal interaction time.
- **2s settle sleep:** Prevents race condition where tiny batches complete before waitForEvent is registered.
- **callbackSecret in payload:** Robot service needs the secret to include in callback headers for HMAC verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added explicit type annotation for orders.map parameter**
- **Found during:** Task 1 (Create robot-orchestrator)
- **Issue:** TypeScript TS7006 error -- parameter `o` implicitly has `any` type because `event` uses `as any` type assertion
- **Fix:** Added explicit type `(o: { itemId: string; orderId: string; pedidoInput: unknown })` to map callback
- **Files modified:** src/inngest/functions/robot-orchestrator.ts
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 5b012c2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type annotation fix required by strict TypeScript. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Environment variables (ROBOT_COORDINADORA_URL, ROBOT_CALLBACK_SECRET, NEXT_PUBLIC_APP_URL) are validated at runtime and will be documented in Phase 23-03 or deployment setup.

## Next Phase Readiness
- Orchestrator is ready to dispatch jobs when robot/job.submitted events are sent
- Plan 03 (Callback API) will create the webhook endpoint that receives robot results and emits robot/job.batch_completed events to unblock the orchestrator's waitForEvent
- The full event flow: job.submitted -> orchestrator dispatches -> robot processes -> callback API receives results -> batch_completed -> orchestrator unblocks

---
*Phase: 23-inngest-orchestrator-callback-api*
*Completed: 2026-02-21*
