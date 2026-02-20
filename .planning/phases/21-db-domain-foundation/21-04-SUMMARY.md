---
phase: 21-db-domain-foundation
plan: 04
subsystem: logistics-domain
tags: [robot-jobs, domain-layer, inngest-events, batch-processing]
depends_on: ["21-02", "21-03"]
provides:
  - robot-jobs domain module (createRobotJob, updateJobItemResult, updateJobStatus, getJobWithItems, retryFailedItems)
  - RobotEvents Inngest type (robot/job.submitted, robot/item.completed, robot/job.completed)
  - Updated domain barrel exports for carrier-coverage, carrier-configs, robot-jobs, client-activation
affects:
  - "Phase 23: Inngest Orchestrator (consumes RobotEvents, calls robot-jobs domain functions)"
  - "Phase 24: Chat de Comandos (reads job progress via getJobWithItems)"
tech-stack:
  added: []
  patterns:
    - "Parent-join workspace verification (robot_job_items -> robot_jobs.workspace_id)"
    - "Cross-module domain call (updateJobItemResult -> updateOrder for tracking_number)"
    - "Read-then-write counters (Supabase JS lacks atomic increment)"
    - "Manual rollback (delete job if items insert fails)"
key-files:
  created:
    - src/lib/domain/robot-jobs.ts
  modified:
    - src/inngest/events.ts
    - src/lib/domain/index.ts
decisions:
  - "Job auto-completes when success_count + error_count >= total_items"
  - "Idempotency check rejects only against active jobs (pending/processing), not completed/failed"
  - "retryFailedItems resets job status to pending if job was completed/failed"
  - "Error type defaults to 'unknown' when status is error but no errorType provided"
metrics:
  duration: "7m"
  completed: "2026-02-20"
---

# Phase 21 Plan 04: Robot Jobs Domain Module Summary

**Robot job lifecycle domain module with 5 functions, Inngest event types for robot orchestration, and barrel export consolidation.**

## Tasks Completed

### Task 1: Create robot-jobs domain module
**Commit:** `6dd9e2d`

Created `src/lib/domain/robot-jobs.ts` with 5 exported domain functions following the established domain layer pattern:

1. **createRobotJob** -- Creates a job row + N item rows from order IDs. Validates workspace ownership of all orders, checks idempotency key against active jobs, and does manual rollback of the job if items insert fails.

2. **updateJobItemResult** -- Updates a single item with success/error result. On success with tracking number, calls `updateOrder` from the orders domain module to set tracking_number (which triggers automation field.changed events). Auto-increments job counters and auto-completes job when all items are processed.

3. **updateJobStatus** -- Explicit job status transition (pending -> processing -> completed/failed) with appropriate timestamp (started_at or completed_at).

4. **getJobWithItems** -- Reads a job + all items with workspace verification. Used by Chat de Comandos for progress display.

5. **retryFailedItems** -- Resets failed items to pending, increments retry_count, clears error fields. Optionally targets specific items or all failed items. Resets job status if it was completed/failed.

All functions: verify workspace ownership, use createAdminClient(), return DomainResult<T>.

### Task 2: Add RobotEvents and update barrel exports
**Commit:** `a421cb4`

**events.ts changes:**
- Added `import type { PedidoInput }` from logistics/constants
- Added `RobotEvents` type with 3 events:
  - `robot/job.submitted` -- carries jobId, credentials, and orders array with PedidoInput per order
  - `robot/item.completed` -- per-order result callback with tracking/error info
  - `robot/job.completed` -- aggregate job completion notification
- Updated `AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents & RobotEvents`

**domain/index.ts changes:**
- Added barrel exports for `carrier-coverage`, `carrier-configs`, `robot-jobs`, `client-activation`

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

| # | Criterion | Status |
|---|-----------|--------|
| 1 | robot-jobs.ts has 5 exported functions | PASS |
| 2 | updateJobItemResult calls updateOrder on success | PASS |
| 3 | createRobotJob checks idempotency_key + workspace ownership | PASS |
| 4 | retryFailedItems resets status + increments retry_count | PASS |
| 5 | events.ts has RobotEvents with PedidoInput import | PASS |
| 6 | AllAgentEvents includes RobotEvents | PASS |
| 7 | domain/index.ts re-exports all 3 new domain modules | PASS |
| 8 | npx tsc --noEmit passes | PASS |

## Next Phase Readiness

Phase 21 (DB + Domain Foundation) is now COMPLETE. All 4 plans executed:
- Plan 01: Database migration (tables, RLS, indexes)
- Plan 02: DANE municipalities seeder
- Plan 03: Logistics constants + carrier domain modules
- Plan 04: Robot jobs domain module + Inngest events

**Ready for Phase 22:** Robot Coordinadora Service (Docker/Playwright on Railway). The domain layer is fully prepared to receive robot results via `updateJobItemResult` and emit them as Inngest events.
