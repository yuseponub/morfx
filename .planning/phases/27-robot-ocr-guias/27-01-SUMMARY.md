---
phase: 27-robot-ocr-guias
plan: 01
subsystem: automations
tags: [inngest, automation-trigger, ocr, robot, supabase-migration]

# Dependency graph
requires:
  - phase: 23-inngest-orchestrator
    provides: automation runner factory, robot trigger pattern, trigger-emitter pattern
  - phase: 26-robot-lector-guias
    provides: robot_job_items table, guide_lookup job type, carrier_guide_number column
provides:
  - "'robot.ocr.completed' trigger type registered end-to-end in automation system"
  - "robot/ocr-guide.submitted Inngest event type for OCR orchestrator"
  - "automation/robot.ocr.completed Inngest event type for automation runner"
  - "emitRobotOcrCompleted emitter function"
  - "robotOcrCompletedRunner registered in automationFunctions"
  - "DB migration making robot_job_items.order_id nullable"
  - "carrierGuideNumber -> orden.carrier_guide_number variable mapping"
affects: [27-02, 27-03, 27-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partial unique index pattern for nullable FK columns (WHERE order_id IS NOT NULL)"
    - "OCR robot events carry image URLs instead of order data (different from shipment robots)"

key-files:
  created:
    - supabase/migrations/20260223000000_ocr_nullable_order_id.sql
  modified:
    - src/lib/automations/types.ts
    - src/lib/automations/constants.ts
    - src/lib/automations/trigger-emitter.ts
    - src/lib/automations/variable-resolver.ts
    - src/inngest/events.ts
    - src/inngest/functions/automation-runner.ts

key-decisions:
  - "Partial unique index replaces UNIQUE constraint to allow multiple NULL order_id OCR items"
  - "carrierGuideNumber maps to orden.carrier_guide_number (distinct from trackingNumber -> orden.tracking_number)"
  - "robot/ocr-guide.submitted carries items with imageUrl/mimeType/fileName (not order data)"

patterns-established:
  - "Nullable FK with partial unique index for multi-purpose child tables"

# Metrics
duration: 9min
completed: 2026-02-23
---

# Phase 27 Plan 01: Automation Trigger + Inngest Events Summary

**robot.ocr.completed trigger type registered end-to-end with emitter, runner, Inngest events, variable mappings, and DB migration for nullable order_id on robot_job_items**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-23T15:55:49Z
- **Completed:** 2026-02-23T16:04:47Z
- **Tasks:** 3
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments
- Registered `robot.ocr.completed` as a valid TriggerType with full catalog entries (trigger + variable)
- Created `emitRobotOcrCompleted` emitter function and `robotOcrCompletedRunner` automation runner
- Defined `robot/ocr-guide.submitted` Inngest event for OCR orchestrator with image-based payload
- Made `robot_job_items.order_id` nullable with partial unique index for OCR items
- Added `carrierGuideNumber` -> `orden.carrier_guide_number` variable mapping

## Task Commits

Each task was committed atomically:

1. **Task 0: DB migration -- make robot_job_items.order_id nullable** - `7db3c22` (feat)
2. **Task 1: Add trigger type, catalog entries, and variable catalog** - `de31017` (feat)
3. **Task 2: Add emitter, automation runner, and Inngest event types** - `22b3a07` (feat)

## Files Created/Modified
- `supabase/migrations/20260223000000_ocr_nullable_order_id.sql` - Nullable order_id + partial unique index
- `src/lib/automations/types.ts` - Added `robot.ocr.completed` to TriggerType union
- `src/lib/automations/constants.ts` - TRIGGER_CATALOG + VARIABLE_CATALOG entries for OCR trigger
- `src/lib/automations/trigger-emitter.ts` - `emitRobotOcrCompleted` function (14 total emitters)
- `src/lib/automations/variable-resolver.ts` - `carrierGuideNumber` -> `orden.carrier_guide_number` mapping
- `src/inngest/events.ts` - `robot/ocr-guide.submitted` and `automation/robot.ocr.completed` event types
- `src/inngest/functions/automation-runner.ts` - `robotOcrCompletedRunner` (14 total runners)

## Decisions Made
- Partial unique index `WHERE order_id IS NOT NULL` replaces full UNIQUE constraint to allow multiple NULL rows for OCR image items
- `carrierGuideNumber` uses a separate variable path (`orden.carrier_guide_number`) from `trackingNumber` (`orden.tracking_number`) since these are distinct identifiers
- `robot/ocr-guide.submitted` event carries image URLs (imageUrl, mimeType, fileName) instead of order data, reflecting that OCR runs inside MorfX, not an external service

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added carrierGuideNumber mapping to variable-resolver.ts**
- **Found during:** Task 2 (emitter + runner implementation)
- **Issue:** The VARIABLE_CATALOG references `orden.carrier_guide_number` but `buildTriggerContext` in variable-resolver.ts had no mapping for `carrierGuideNumber` -> `orden.carrier_guide_number`
- **Fix:** Added mapping line in the orden section of buildTriggerContext
- **Files modified:** `src/lib/automations/variable-resolver.ts`
- **Verification:** TypeScript compiles, grep confirms mapping exists
- **Committed in:** `22b3a07` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for variable resolution correctness. Without this mapping, `{{orden.carrier_guide_number}}` would never resolve in automation templates. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All automation wiring is complete for `robot.ocr.completed`
- Plans 02-04 can now build the OCR orchestrator, matching engine, and Chat de Comandos integration
- The `robot/ocr-guide.submitted` event type is ready for the orchestrator Inngest function
- DB migration needs to be applied to Supabase (pending with other migrations)

---
*Phase: 27-robot-ocr-guias*
*Completed: 2026-02-23*
