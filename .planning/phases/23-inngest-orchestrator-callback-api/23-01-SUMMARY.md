---
phase: 23-inngest-orchestrator-callback-api
plan: 01
subsystem: automations
tags: [inngest, automation-triggers, robot, coordinadora, event-types]

# Dependency graph
requires:
  - phase: 21-db-domain-foundation
    provides: RobotEvents type with robot/job.submitted and robot/item.completed
  - phase: 17-crm-automations-engine
    provides: Automation runner factory, trigger emitter pattern, variable resolver
provides:
  - robot.coord.completed TriggerType for automation creation
  - automation/robot.coord.completed Inngest event type
  - robot/job.batch_completed Inngest event type for orchestrator waitForEvent
  - emitRobotCoordCompleted trigger emitter function
  - robotCoordCompletedRunner automation runner registered in Inngest serve
  - orden.tracking_number and orden.carrier variable resolver mappings
affects:
  - 23-02 (orchestrator uses robot/job.batch_completed for waitForEvent)
  - 23-03 (callback API calls emitRobotCoordCompleted per successful item)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Robot trigger follows same createAutomationRunner factory as all 13 prior triggers"
    - "robot/job.batch_completed separate from robot/job.completed for orchestrator signaling"

key-files:
  modified:
    - src/inngest/events.ts
    - src/lib/automations/types.ts
    - src/lib/automations/constants.ts
    - src/lib/automations/trigger-emitter.ts
    - src/lib/automations/variable-resolver.ts
    - src/inngest/functions/automation-runner.ts
    - src/app/api/inngest/route.ts

key-decisions:
  - "robot/job.batch_completed is a separate event from robot/job.completed -- batch_completed is for orchestrator step.waitForEvent unblocking"
  - "robot.coord.completed fires per-order (not per-batch) so automations run individually per order"
  - "Order enrichment enabled for robot.coord.completed so full order+contact data is available to actions"

patterns-established:
  - "Logistica category in TRIGGER_CATALOG for robot/logistics triggers"
  - "Robot emitter follows same cascade depth + sendEvent pattern as all other emitters"

# Metrics
duration: 9min
completed: 2026-02-21
---

# Phase 23 Plan 01: Event Types & Trigger Registration Summary

**robot.coord.completed trigger type registered across automation engine with batch_completed event for orchestrator signaling**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-21T01:07:43Z
- **Completed:** 2026-02-21T01:16:23Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Registered robot.coord.completed as the 14th automation trigger type across all system files
- Added robot/job.batch_completed event type for orchestrator step.waitForEvent() in Plan 02
- Added emitRobotCoordCompleted emitter with cascade depth check following established pattern
- Mapped trackingNumber and carrier to orden namespace for {{orden.tracking_number}} and {{orden.carrier}} template variables
- Added robotCoordCompletedRunner to automationFunctions (auto-registered in Inngest serve)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add event types and trigger type registration** - `39805c1` (feat)
2. **Task 2: Add trigger emitter, variable resolver mapping, and automation runner** - `2449b8b` (feat)

## Files Modified
- `src/inngest/events.ts` - Added robot/job.batch_completed to RobotEvents and automation/robot.coord.completed to AutomationEvents
- `src/lib/automations/types.ts` - Added robot.coord.completed to TriggerType union
- `src/lib/automations/constants.ts` - Added TRIGGER_CATALOG entry (Logistica category) and VARIABLE_CATALOG entry with 11 variables
- `src/lib/automations/trigger-emitter.ts` - Added emitRobotCoordCompleted function
- `src/lib/automations/variable-resolver.ts` - Added trackingNumber and carrier to orden namespace in buildTriggerContext
- `src/inngest/functions/automation-runner.ts` - Added EVENT_TO_TRIGGER mapping, matchesTriggerConfig case, order enrichment, runner instance, and export
- `src/app/api/inngest/route.ts` - Added TODO placeholder for Phase 23-02 orchestrator import

## Decisions Made
- robot/job.batch_completed is kept separate from robot/job.completed: batch_completed signals the orchestrator's step.waitForEvent, while job.completed is for general notifications
- robot.coord.completed fires per-order (emitRobotCoordCompleted called per successful order) so automations run individually
- Order enrichment (full order + contact DB lookup) enabled for robot.coord.completed so actions have complete context

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All event types and trigger registrations ready for Plan 02 (Inngest Orchestrator)
- robot/job.batch_completed event type available for orchestrator step.waitForEvent()
- emitRobotCoordCompleted ready to be called from callback API (Plan 03)
- robotCoordCompletedRunner already served via automationFunctions export

---
*Phase: 23-inngest-orchestrator-callback-api*
*Plan: 01*
*Completed: 2026-02-21*
