---
phase: robot-coordinadora-hardening
plan: 01
subsystem: robot-jobs-domain
tags: [sql, rpc, atomic-counters, race-condition, idempotency]
requires: []
provides:
  - increment_robot_job_counter RPC function
  - batch_completed_emitted column on robot_jobs
  - Atomic counter updates in domain layer
  - Improved idempotency guard for retry scenarios
affects:
  - hardening-02 (error classification)
  - hardening-04 (batch_completed idempotent emission)
tech-stack:
  added: []
  patterns:
    - "Supabase RPC for atomic SQL operations"
    - "UPDATE...RETURNING for race-free counter increments"
    - "SECURITY DEFINER function for admin-level operations"
key-files:
  created:
    - supabase/migrations/20260227000000_robot_job_atomic_counters.sql
  modified:
    - src/lib/domain/robot-jobs.ts
decisions:
  - id: h01-d1
    description: "Used SECURITY DEFINER on RPC to ensure function executes with definer privileges regardless of caller"
  - id: h01-d2
    description: "Error items are now re-processable (not terminal) to support retry scenarios; only success is terminal"
  - id: h01-d3
    description: "RPC auto-completes job atomically rather than relying on application-level status update"
metrics:
  duration: ~8 min
  completed: 2026-02-24
---

# Hardening Plan 01: Atomic Counter RPC + Idempotency Guard Summary

**One-liner:** Atomic SQL counter increment via RPC replacing buggy read-then-write, plus batch_completed_emitted column and improved idempotency for retries.

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 minutes |
| Start | 2026-02-24T15:46:34Z |
| End | 2026-02-24T15:54:09Z |
| Tasks | 2/2 |
| Files created | 1 |
| Files modified | 1 |

## Accomplishments

1. **P0 Bug #1 FIXED -- Counter Race Condition:** Created `increment_robot_job_counter` RPC function that uses a single `UPDATE...RETURNING` statement to atomically increment success_count or error_count. Two concurrent callbacks can never lose an increment because the increment happens in a single SQL statement, not a read-compute-write sequence.

2. **P1 Bug #5 PREPARED -- batch_completed_emitted Column:** Added the boolean column with `DEFAULT false` that Plan 04 will use to ensure the `batch_completed` event is emitted exactly once, even if multiple workers detect job completion simultaneously.

3. **P2 Bug #13 FIXED -- Idempotency for Retries:** Changed the idempotency guard so that items in `error` status can be re-processed (retry scenario), while items in `success` status remain terminal. Previously, both success and error were treated as terminal, which prevented retries.

4. **Auto-completion Logic Moved to SQL:** The job auto-completes within the same RPC call when `success_count + error_count >= total_items`, with an idempotent guard (`status NOT IN ('completed', 'failed')`) preventing double transitions.

## Task Commits

| # | Task | Commit | Type | Key Change |
|---|------|--------|------|------------|
| 1 | SQL migration -- atomic counter RPC + batch_completed_emitted | a0b6c98 | feat | increment_robot_job_counter function + column |
| 2 | Refactor updateJobItemResult to use atomic RPC | 3ca0ab2 | fix | Replace read-then-write with .rpc() call |

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260227000000_robot_job_atomic_counters.sql` | Atomic counter RPC + batch_completed_emitted column |

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/domain/robot-jobs.ts` | Replaced lines 324-357 (read-then-write) with RPC call; updated idempotency guard to allow error item reprocessing |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| h01-d1 | SECURITY DEFINER on RPC | Ensures function runs with owner privileges, bypassing RLS for the counter update |
| h01-d2 | Error items re-processable | Retry scenarios require error items to be updatable again; only success is truly terminal |
| h01-d3 | Auto-completion in SQL | Moving completion logic into the RPC eliminates a second application-level race (two workers both detect completion and both update status) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript type assertion for RPC result**
- **Found during:** Task 2
- **Issue:** Supabase JS client returns `{}` type for custom RPC functions since the project uses hand-managed types (not auto-generated)
- **Fix:** Added explicit type cast: `counterRaw as unknown as { new_success_count, new_error_count, total_items, is_now_complete } | null`
- **Files modified:** src/lib/domain/robot-jobs.ts
- **Commit:** 3ca0ab2

## Issues Encountered

None. Both tasks executed cleanly.

## Next Phase Readiness

- **Plan 02 (Error Classification):** Ready. No dependencies from this plan block Plan 02.
- **Plan 04 (Idempotent Emission):** The `batch_completed_emitted` column now exists, providing the DB foundation needed.
- **Migration Note:** The migration must be applied to production before deploying the code changes (Regla 5).
