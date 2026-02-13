---
phase: 17-crm-automations-engine
plan: 06
subsystem: api
tags: [inngest, durable-functions, automation-engine, event-driven]

# Dependency graph
requires:
  - phase: 17-02
    provides: "Condition evaluator and variable resolver for automation logic"
  - phase: 17-04
    provides: "Action executor for executing automation actions"
provides:
  - "Inngest automation runner functions for all 10 trigger types"
  - "AutomationEvents type with full typed event schema"
  - "Route registration for automation functions in serve()"
affects: [17-07-trigger-emitter-integration, 17-08-monitoring, 17-09-e2e-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory pattern for Inngest function creation (createAutomationRunner)"
    - "Mid-execution disable check before each action step"
    - "Cascade depth guard at runner entry point"
    - "Durable sequential action execution with step.run() and step.sleep()"

key-files:
  created:
    - "src/inngest/functions/automation-runner.ts"
  modified:
    - "src/inngest/events.ts"
    - "src/app/api/inngest/route.ts"

key-decisions:
  - "Factory pattern creates all 10 runners from single createAutomationRunner function"
  - "Mid-execution disable check reads is_enabled from DB before each action (not just at start)"
  - "Actions stop on first failure with remaining actions marked as skipped"
  - "Concurrency limited to 5 per workspace via Inngest concurrency key"
  - "Cascade depth checked at runner entry AND via trigger-emitter (defense in depth)"
  - "Execution record created before actions, updated after completion"

patterns-established:
  - "automation-{trigger_type} Inngest function ID naming convention"
  - "step.run() wraps each action for durable execution guarantees"
  - "step.sleep() with human-readable durations (5m, 2h, 1d) for action delays"
  - "matchesTriggerConfig as centralized filter for trigger-specific config"

# Metrics
duration: 7min
completed: 2026-02-13
---

# Phase 17 Plan 06: Inngest Automation Runner Summary

**10 Inngest durable functions via factory pattern — trigger event listeners with condition evaluation, sequential action execution, delays via step.sleep(), and per-action execution logging**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-13T02:52:44Z
- **Completed:** 2026-02-13T03:00:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- AutomationEvents type added with all 10 trigger event schemas, integrated into AllAgentEvents
- 10 automation runner Inngest functions created via factory pattern with durable execution
- matchesTriggerConfig handles pipeline, stage, tag, field, keyword filters per trigger type
- Mid-execution disable check before each action prevents stale automations from completing
- Execution logged to automation_executions table with per-action results and timing

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Inngest events and client with automation event types** - `bbc22b7` (feat)
2. **Task 2: Automation runner Inngest functions and route registration** - `0fddaa6` (feat)

## Files Created/Modified
- `src/inngest/events.ts` - Added AutomationEvents type (10 event types), updated AllAgentEvents union
- `src/inngest/functions/automation-runner.ts` - Factory-created 10 runners with condition eval, action exec, logging
- `src/app/api/inngest/route.ts` - Registered automationFunctions in Inngest serve()

## Decisions Made
- Factory pattern reuses a single `createAutomationRunner` function for all 10 trigger types, reducing code duplication
- Mid-execution disable check queries is_enabled before EACH action (not just at start), so disabling an automation stops it between steps
- Actions stop on first failure; remaining actions are marked as `skipped` in the log
- Concurrency limited to 5 per workspace via `event.data.workspaceId` key for backpressure
- Cascade depth double-checked: once in trigger-emitter before event emission, once in runner at entry point
- Execution record created BEFORE actions start (status: running), updated AFTER completion with results

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Automation runners are ready to process events from trigger-emitter.ts
- Next plans (17-07 through 17-10) can wire trigger emitters into server actions, add monitoring, and test end-to-end
- The `(inngest.send as any)` cast in trigger-emitter.ts can now be removed since AutomationEvents are properly typed in AllAgentEvents

---
*Phase: 17-crm-automations-engine*
*Completed: 2026-02-13*
