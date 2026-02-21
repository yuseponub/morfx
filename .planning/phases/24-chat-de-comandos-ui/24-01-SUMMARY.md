---
phase: 24-chat-de-comandos-ui
plan: 01
subsystem: database, api
tags: [supabase, realtime, domain-layer, carrier-configs, robot-jobs, orders]

# Dependency graph
requires:
  - phase: 21-db-domain-foundation
    provides: carrier_configs table, robot_jobs/robot_job_items tables, orders table
  - phase: 22-robot-coordinadora
    provides: robot job CRUD domain functions
provides:
  - dispatch_pipeline_id and dispatch_stage_id columns on carrier_configs
  - robot_jobs added to Supabase Realtime publication
  - getActiveJob, getJobHistory, getJobItemsWithOrderInfo domain queries
  - getDispatchStage convenience function for carrier dispatch config
  - getOrdersByStage domain query with contact + product data
affects:
  - 24-02 (server actions consume getDispatchStage, getOrdersByStage, getActiveJob)
  - 24-03 (Chat UI uses getJobHistory, getJobItemsWithOrderInfo, Realtime on robot_jobs)
  - 25-pipeline-integration (dispatch stage config in carrier settings UI)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "2-query batch-fetch for N+1 avoidance (getJobItemsWithOrderInfo)"
    - "Convenience wrapper over config read (getDispatchStage)"

key-files:
  created:
    - supabase/migrations/20260222000004_carrier_dispatch_stage.sql
  modified:
    - src/lib/domain/carrier-configs.ts
    - src/lib/domain/robot-jobs.ts
    - src/lib/domain/orders.ts

key-decisions:
  - "2-query approach for getJobItemsWithOrderInfo (items then batch orders+contacts) to avoid Supabase nested select FK issues"
  - "getActiveJob delegates to getJobWithItems for full data reuse"
  - "getOrdersByStage returns OrderForDispatch with flattened contact fields for direct server action consumption"

patterns-established:
  - "Batch-fetch pattern: query items, extract unique IDs, batch-query related entities, Map lookup for enrichment"

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 24 Plan 01: DB + Domain Foundation for Chat de Comandos Summary

**Dispatch stage config columns, robot_jobs Realtime, and 5 domain query functions for Chat de Comandos UI**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T20:38:14Z
- **Completed:** 2026-02-21T20:42:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Migration adds dispatch_pipeline_id + dispatch_stage_id to carrier_configs and robot_jobs to Realtime
- 3 new robot-jobs queries (getActiveJob, getJobHistory, getJobItemsWithOrderInfo) for Chat UI
- getDispatchStage convenience function for "subir ordenes coord" command
- getOrdersByStage query with contact + product data for dispatch server action

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration for dispatch stage columns + robot_jobs Realtime** - `cfb8c58` (feat)
2. **Task 2: Extend domain modules with dispatch stage support, job queries, and order-by-stage query** - `54f4e32` (feat)

## Files Created/Modified
- `supabase/migrations/20260222000004_carrier_dispatch_stage.sql` - Adds dispatch columns to carrier_configs + robot_jobs Realtime
- `src/lib/domain/carrier-configs.ts` - dispatch_pipeline_id/dispatch_stage_id in types + upsert + getDispatchStage()
- `src/lib/domain/robot-jobs.ts` - getActiveJob(), getJobHistory(), getJobItemsWithOrderInfo() + JobItemWithOrderInfo type
- `src/lib/domain/orders.ts` - getOrdersByStage() + OrderForDispatch interface

## Decisions Made
- Used 2-query approach for getJobItemsWithOrderInfo to avoid Supabase nested select FK issues between robot_job_items and orders
- getActiveJob reuses getJobWithItems for full data (DRY, returns items too for immediate UI reconnection)
- OrderForDispatch flattens contact fields (contact_name, contact_phone, contact_email) for direct consumption by server actions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All domain functions ready for Plan 24-02 (server actions + command execution)
- Migration ready to apply to Supabase (add to pending migrations list)
- No blockers for proceeding to Plan 24-02

---
*Phase: 24-chat-de-comandos-ui*
*Completed: 2026-02-21*
