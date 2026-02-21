---
phase: 23-inngest-orchestrator-callback-api
plan: 03
subsystem: api
tags: [inngest, callback, webhook, robot, coordinadora, idempotency, crypto]

# Dependency graph
requires:
  - phase: 23-01
    provides: "Event types (robot/job.batch_completed) and trigger emitter (emitRobotCoordCompleted)"
  - phase: 21
    provides: "Domain layer robot-jobs.ts with updateJobItemResult, orders.ts with updateOrder"
  - phase: 22
    provides: "Robot-coordinadora service with reportResult and BatchRequest types"
provides:
  - "Callback API route at /api/webhooks/robot-callback for robot per-order results"
  - "Idempotency guard in updateJobItemResult (skips terminal items)"
  - "Carrier update (COORDINADORA) on successful order results"
  - "Robot service forwards X-Callback-Secret header in all callbacks"
affects: [23-02, 24]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Timing-safe secret comparison (crypto.timingSafeEqual) for webhook auth"
    - "Idempotency guard pattern: check terminal state before update"
    - "Domain-first callback processing: webhook -> domain -> trigger -> Inngest"

key-files:
  created:
    - "src/app/api/webhooks/robot-callback/route.ts"
  modified:
    - "src/lib/domain/robot-jobs.ts"
    - "robot-coordinadora/src/api/server.ts"
    - "robot-coordinadora/src/types/index.ts"

key-decisions:
  - "Batch completion check reads job.status='completed' rather than doing arithmetic (avoids spurious duplicate events)"
  - "Trigger emission errors are caught and logged, never fail the callback (domain update already succeeded)"
  - "Callback secret flows through all 7 reportResult call sites in robot service"

patterns-established:
  - "Webhook auth via shared secret header with timing-safe comparison"
  - "Domain-first processing: all CRM mutations through domain layer even in webhooks"

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 23 Plan 03: Callback API Route + Domain Idempotency Summary

**Callback API receives robot per-order results via authenticated webhook, routes through domain layer with idempotency guard, fires automation triggers on success, and signals batch completion to Inngest orchestrator**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T01:21:10Z
- **Completed:** 2026-02-21T01:27:10Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created POST /api/webhooks/robot-callback with timing-safe shared secret authentication
- Added idempotency guard to updateJobItemResult (skips items already in terminal state success/error)
- Added carrier: 'COORDINADORA' to updateOrder call on successful robot results
- Patched robot-coordinadora to forward X-Callback-Secret header in all 7 reportResult call sites
- Callback fires robot.coord.completed automation trigger (per-order) and robot/job.batch_completed Inngest event (per-batch)
- Order + contact data enriched for rich trigger context in automations

## Task Commits

Each task was committed atomically:

1. **Task 1: Add idempotency guard and carrier update** - `49fb21c` (feat)
2. **Task 2: Create callback API route** - `3d24fb4` (feat)
3. **Task 3: Patch robot service to forward callback secret** - `fd61473` (feat)

## Files Created/Modified

- `src/app/api/webhooks/robot-callback/route.ts` - POST handler for per-order callback results from robot
- `src/lib/domain/robot-jobs.ts` - Idempotency guard in updateJobItemResult + carrier update on success
- `robot-coordinadora/src/api/server.ts` - reportResult forwards X-Callback-Secret header
- `robot-coordinadora/src/types/index.ts` - callbackSecret optional field in BatchRequest

## Decisions Made

- Batch completion check reads `job.status === 'completed'` (set atomically by domain) rather than doing `success_count + error_count >= total_items` arithmetic in the callback route -- prevents spurious duplicate batch_completed events from concurrent final callbacks
- Trigger emission failures are caught and logged but never fail the callback (the domain update already succeeded, the CRM data is consistent)
- Callback secret is forwarded through all 7 reportResult call sites (login failure, per-order lock skip, successful result, per-order error, fatal batch error, city pre-validation, plus the function signature itself)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Environment variable needed:** `ROBOT_CALLBACK_SECRET` must be set in Vercel and in the robot-coordinadora Railway service environment. Both services must share the same secret value.

## Next Phase Readiness

- Callback API is the "return path" -- robot sends results here, MorfX translates them into CRM updates and automation triggers
- Plan 23-02 (Inngest Orchestrator) can use this callback URL when dispatching batches to the robot service
- Phase 24 (Chat de Comandos UI) will subscribe to robot_job_items Realtime changes that these callbacks trigger

---
*Phase: 23-inngest-orchestrator-callback-api*
*Completed: 2026-02-21*
