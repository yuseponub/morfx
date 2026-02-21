---
phase: 24-chat-de-comandos-ui
plan: 02
subsystem: api
tags: [server-actions, inngest, supabase-realtime, coordinadora, robot-jobs]

requires:
  - phase: 24-01
    provides: "robot_jobs domain functions (createRobotJob, getActiveJob, getJobHistory, getJobWithItems), getDispatchStage, getOrdersByStage"
  - phase: 22
    provides: "Robot Coordinadora service for Playwright portal automation"
  - phase: 23
    provides: "Inngest orchestrator handling robot/job.submitted events"
  - phase: 21
    provides: "carrier_configs, carrier_coverage tables and domain modules"
provides:
  - "Server action executeSubirOrdenesCoord orchestrating full dispatch flow"
  - "Server actions for job status, command history, and job item queries"
  - "Realtime hook useRobotJobProgress for live progress display"
  - "buildPedidoInputFromOrder helper with sensible defaults"
affects:
  - "24-03 (Chat UI components consume these actions and hook)"
  - "25 (Pipeline integration may extend command actions)"

tech-stack:
  added: []
  patterns:
    - "Server action composing multiple domain calls in sequence with early-return error handling"
    - "Supabase Realtime hook with initial fetch + live subscription overlay"
    - "Functional state updaters for surgical Realtime item updates"

key-files:
  created:
    - "src/app/actions/comandos.ts"
    - "src/hooks/use-robot-job-progress.ts"
  modified: []

key-decisions:
  - "buildPedidoInputFromOrder uses hardcoded defaults: peso=1, dimensions=10x10x10, COD=false (configurable later)"
  - "Invalid city reasons include specific messages: empty city/dept, unrecognized department, city not in coverage"
  - "getJobStatus returns GetJobWithItemsResult | null (full job + items for reconnect scenario)"
  - "Realtime hook uses two separate useEffects: one for initial fetch, one for subscription (clean separation of concerns)"

patterns-established:
  - "CommandResult<T> pattern: { success, data?, error? } for all command server actions"
  - "Dual Realtime listeners on single channel: items for per-order progress, job for status changes"

duration: 5min
completed: 2026-02-21
---

# Phase 24 Plan 02: Server Actions + Realtime Hook Summary

**Server actions orchestrating credentials -> orders -> city validation -> robot job -> Inngest dispatch, with Supabase Realtime hook for live per-order progress**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T20:46:39Z
- **Completed:** 2026-02-21T20:52:14Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Full `subir ordenes coord` flow in `executeSubirOrdenesCoord`: validates credentials, fetches dispatch stage, checks for active jobs, gets orders, validates cities, creates robot job, builds PedidoInput per order, dispatches to Inngest
- Query actions `getJobStatus`, `getCommandHistory`, `getJobItemsForHistory` for UI consumption
- `useRobotJobProgress` hook: initial fetch for reconnect, dual Realtime subscription (items + job status), computed counters

## Task Commits

Each task was committed atomically:

1. **Task 1: Server actions for command execution and queries** - `bc11f50` (feat)
2. **Task 2: Supabase Realtime hook for live job progress** - `fa25da9` (feat)

## Files Created/Modified
- `src/app/actions/comandos.ts` - Server actions for command execution (executeSubirOrdenesCoord), job status, history, and item queries
- `src/hooks/use-robot-job-progress.ts` - Supabase Realtime hook subscribing to robot_job_items and robot_jobs changes

## Decisions Made
- `buildPedidoInputFromOrder` uses hardcoded defaults (peso=1, 10x10x10, COD=false) -- these are reasonable carrier defaults that can be made configurable later
- Invalid city error messages are specific to help users understand what went wrong (empty fields, unrecognized department, city not in coverage)
- Realtime hook uses separate useEffects for initial fetch vs subscription for clean separation of lifecycle concerns
- CommandResult<T> generic type used for all server action return types (consistent with DomainResult pattern)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server actions and Realtime hook are ready for consumption by Plan 24-03 (Chat UI components)
- The command execution flow is complete end-to-end pending Inngest and robot service being configured
- No blockers for proceeding to UI layer

---
*Phase: 24-chat-de-comandos-ui*
*Completed: 2026-02-21*
