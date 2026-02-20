---
phase: 21-db-domain-foundation
plan: 02
subsystem: database
tags: [supabase, postgres, rls, carrier, robot, logistics, migration]

# Dependency graph
requires:
  - phase: 21-01
    provides: DANE codes reference table for city validation
provides:
  - carrier_configs table for per-workspace carrier portal credentials
  - robot_jobs table for batch-level robot execution tracking
  - robot_job_items table for per-order tracking with error categorization
affects:
  - 21-03 (TypeScript types and domain functions for these tables)
  - 21-04 (domain layer mutations using these tables)
  - 22 (Robot Coordinadora Service reads carrier_configs, writes robot_job_items)
  - 23 (Inngest Orchestrator creates robot_jobs, updates status)
  - 24 (Chat de Comandos subscribes to robot_job_items via Realtime)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parent-child RLS: child table (robot_job_items) checks workspace via parent join"
    - "Idempotency key with partial unique index for duplicate batch prevention"
    - "Status state machine via CHECK constraint (no enum type)"
    - "JSONB audit trail column (value_sent) for debugging robot inputs"

key-files:
  created:
    - supabase/migrations/20260222000002_carrier_configs.sql
    - supabase/migrations/20260222000003_robot_jobs.sql
  modified: []

key-decisions:
  - "Portal password stored plaintext in v3.0 (not payment data, encryption deferred to v4.0+)"
  - "tracking_number is Coordinadora pedido number (not guia number)"
  - "error_type enum: validation, portal, timeout, unknown (covers all robot failure modes)"
  - "robot_job_items uses parent-join RLS (no workspace_id column on child table)"
  - "Supabase Realtime enabled on robot_job_items only (not robot_jobs) for Chat de Comandos progress"

patterns-established:
  - "Parent-child RLS via EXISTS subquery joining to parent table for workspace check"
  - "Idempotency key as nullable with partial unique index (WHERE key IS NOT NULL)"
  - "Status CHECK constraint with string values instead of Postgres ENUM type"

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 21 Plan 02: Carrier Configs + Robot Job Tracking Tables Summary

**Three workspace-scoped tables (carrier_configs, robot_jobs, robot_job_items) with RLS, idempotency protection, and Supabase Realtime for per-order robot tracking**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T21:29:04Z
- **Completed:** 2026-02-20T21:30:49Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- carrier_configs table for per-workspace carrier portal credentials with admin-only write access
- robot_jobs batch tracking with status state machine (pending/processing/completed/failed) and idempotency_key deduplication
- robot_job_items per-order tracking with independent status, tracking_number, error categorization (validation/portal/timeout/unknown), retry_count, and JSONB audit trail
- Parent-child RLS pattern: robot_job_items checks workspace via EXISTS join to robot_jobs
- robot_job_items enabled for Supabase Realtime (Chat de Comandos will subscribe for live progress)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create carrier_configs table** - `a294b99` (feat)
2. **Task 2: Create robot_jobs and robot_job_items tracking tables** - `07f676e` (feat)

## Files Created/Modified
- `supabase/migrations/20260222000002_carrier_configs.sql` - Workspace-scoped carrier portal credentials table with RLS and admin policies
- `supabase/migrations/20260222000003_robot_jobs.sql` - Robot batch jobs + per-order items with RLS, indexes, triggers, and Realtime

## Decisions Made
- Portal password stored in plaintext for v3.0 (not payment credentials, encryption deferred to v4.0+)
- tracking_number stores Coordinadora pedido number (not guia/tracking code)
- error_type uses CHECK constraint with 4 categories: validation, portal, timeout, unknown
- robot_job_items RLS via parent-join pattern (no workspace_id column on child table)
- Only robot_job_items added to Supabase Realtime (robot_jobs not needed for real-time UI)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Migrations must be applied to Supabase when ready (tracked in pending todos).

## Next Phase Readiness
- Tables ready for Plan 03 (TypeScript types) and Plan 04 (domain functions)
- carrier_configs ready for Phase 22 (Robot Service credential retrieval)
- robot_jobs/robot_job_items ready for Phase 23 (Inngest Orchestrator job management)
- robot_job_items Realtime ready for Phase 24 (Chat de Comandos live progress)

---
*Phase: 21-db-domain-foundation*
*Completed: 2026-02-20*
