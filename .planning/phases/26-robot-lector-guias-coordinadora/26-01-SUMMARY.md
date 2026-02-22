---
phase: 26-robot-lector-guias-coordinadora
plan: 01
subsystem: domain-layer
tags: [database, domain, orders, robot-jobs, inngest, guide-lookup]
depends_on:
  requires: [21, 22, 23, 24, 25]
  provides: [carrier_guide_number column, job_type column, getOrdersPendingGuide, guide-lookup.submitted event]
  affects: [26-02, 26-03]
tech_stack:
  added: []
  patterns: [job_type discriminator for robot_jobs, conditional order field routing in callbacks]
key_files:
  created:
    - supabase/migrations/20260222000005_guide_lookup_columns.sql
  modified:
    - src/lib/domain/orders.ts
    - src/lib/domain/robot-jobs.ts
    - src/inngest/events.ts
decisions:
  - Migration filename uses 20260222000005 (not 000004 as originally planned, since 000004 was already taken by carrier_dispatch_stage.sql)
  - Parent job type lookup added to updateJobItemResult to route guide numbers correctly
  - Pendiente orders (callback with trackingNumber=undefined) are NOT updated, preserving eligibility for future lookups
metrics:
  duration: ~6 minutes
  completed: 2026-02-22
---

# Phase 26 Plan 01: DB + Domain Foundation for Guide Lookup Summary

Database columns and domain layer extensions for guide number lookup functionality.

## One-Liner

Added carrier_guide_number column on orders, job_type discriminator on robot_jobs, getOrdersPendingGuide query, conditional callback routing, and guide-lookup.submitted Inngest event type.

## What Was Done

### Task 1: Database Migration (20260222000005_guide_lookup_columns.sql)
- Added `carrier_guide_number TEXT` column to orders table
- Added partial index `idx_orders_carrier_guide` for efficient lookups of orders with assigned guides
- Added `job_type TEXT NOT NULL DEFAULT 'create_shipment'` column to robot_jobs table
- Added composite index `idx_robot_jobs_type_status` on (workspace_id, job_type, status)
- All operations use `IF NOT EXISTS` for idempotent application

### Task 2: Domain Layer Extensions

**orders.ts:**
- Added `carrierGuideNumber?: string | null` to `UpdateOrderParams` interface
- Added `carrier_guide_number` to previousOrder SELECT query for field change detection
- Added `carrier_guide_number` mapping to updates object builder in `updateOrder()`
- Added `carrier_guide_number` to `fieldMappings` array for `emitFieldChanged` triggers
- Added `OrderPendingGuide` interface and `getOrdersPendingGuide(ctx, stageId)` function
  - Filters: `tracking_number IS NOT NULL` AND `carrier_guide_number IS NULL`
  - Returns order id, name, tracking_number, and contact_name

**robot-jobs.ts:**
- Added `job_type: string` to `RobotJob` interface
- Added `jobType?: string` to `CreateRobotJobParams` (defaults to 'create_shipment')
- Added `job_type` to `createRobotJob()` insert object
- Modified `getActiveJob()` to accept optional `jobType` parameter for type-scoped queries
- Modified `updateJobItemResult()` to look up parent job type and route updates:
  - `guide_lookup` jobs: writes `carrierGuideNumber` to order
  - `create_shipment` jobs: writes `trackingNumber` + `carrier` to order (existing behavior)
  - Pendiente callbacks (trackingNumber=undefined): skips update entirely

**events.ts:**
- Added `'robot/guide-lookup.submitted'` event type to `RobotEvents`
- Payload includes: jobId, workspaceId, credentials, pedidoNumbers array

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration filename conflict**
- **Found during:** Task 1
- **Issue:** Plan specified filename `20260222000004_guide_lookup_columns.sql` but `20260222000004_carrier_dispatch_stage.sql` already exists
- **Fix:** Used `20260222000005_guide_lookup_columns.sql` instead
- **Files modified:** supabase/migrations/20260222000005_guide_lookup_columns.sql
- **Commit:** 0351663

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Migration uses sequence 000005 instead of 000004 | 000004 already taken by carrier_dispatch_stage.sql |
| 2 | Parent job type lookup via separate query in updateJobItemResult | Cleanest way to determine which order field to update without changing callback contract |
| 3 | getActiveJob optional jobType param (not required) | Backward compatible -- existing callers without jobType still work |

## Commit Log

| # | Hash | Message |
|---|------|---------|
| 1 | 0351663 | feat(26-01): database migration for carrier_guide_number and job_type |
| 2 | a8db87f | feat(26-01): domain layer extensions for guide lookup |

## Next Phase Readiness

Plan 26-02 (Inngest Orchestrator + Robot Endpoint) can proceed immediately:
- `robot/guide-lookup.submitted` event type is defined
- `createRobotJob` accepts `jobType: 'guide_lookup'`
- `getActiveJob('guide_lookup')` works for independent job checking
- `updateJobItemResult` correctly routes guide results to `carrier_guide_number`

Plan 26-03 (Chat UI Command) can proceed after 26-02:
- `getOrdersPendingGuide` provides the preview data
- `OrderPendingGuide` type is available for UI consumption
