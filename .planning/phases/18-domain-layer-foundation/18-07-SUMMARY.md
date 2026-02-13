---
phase: 18-domain-layer-foundation
plan: 07
subsystem: domain
tags: [tasks, domain-layer, tool-handlers, trigger-emission, crm]

# Dependency graph
requires:
  - phase: 18-01
    provides: DomainContext/DomainResult types, mutation_audit SQL
provides:
  - 4 task domain functions (createTask, updateTask, completeTask, deleteTask)
  - 4 new task tool handlers (task.create, task.update, task.complete, task.list)
  - Action executor create_task trigger gap fixed
affects: [18-08, 18-09, 18-10]

# Tech tracking
tech-stack:
  added: []
  patterns: [domain-function-with-trigger-emission, tool-handler-delegation]

key-files:
  created:
    - src/lib/domain/tasks.ts
  modified:
    - src/lib/domain/index.ts
    - src/app/actions/tasks.ts
    - src/lib/automations/action-executor.ts
    - src/lib/tools/handlers/crm/index.ts
    - src/lib/tools/schemas/crm.tools.ts

key-decisions:
  - "No task.created trigger emitted (not in TRIGGER_CATALOG); only task.completed"
  - "task_type_id and created_by are server-action adapter concerns (not in domain params)"
  - "Task tool permissions mapped to contacts.* (no tasks.* Permission type exists)"
  - "completeTask is idempotent: already-completed tasks return success without re-emitting trigger"

patterns-established:
  - "Domain tasks follow same pattern as orders/contacts: adminClient + workspace filter + trigger emission"
  - "completed_at uses Colombia timezone via toLocaleString('sv-SE', { timeZone: 'America/Bogota' })"

# Metrics
duration: 11min
completed: 2026-02-13
---

# Phase 18 Plan 07: Tasks Domain + Tool Handlers Summary

**4 task domain functions with trigger emission, all callers wired, and 4 new bot task capabilities (create/update/complete/list)**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-13T18:18:02Z
- **Completed:** 2026-02-13T18:29:28Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created `src/lib/domain/tasks.ts` with 4 domain functions: createTask, updateTask, completeTask, deleteTask
- Fixed the action executor's create_task trigger gap (now goes through domain, emits task.completed if applicable)
- Wired server actions to delegate all task mutations to domain (removed inline emitTaskCompleted)
- Added 4 new task tool handlers + schemas so the bot can manage tasks

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tasks domain functions + wire callers** - `5fd8da8` (feat)
2. **Task 2: Create 4 new task tool handlers** - `ba6eeb6` (feat)

## Files Created/Modified
- `src/lib/domain/tasks.ts` - 4 task domain functions (createTask, updateTask, completeTask, deleteTask)
- `src/lib/domain/index.ts` - Barrel export updated to include tasks
- `src/app/actions/tasks.ts` - Refactored to delegate to domain; removed inline emitTaskCompleted
- `src/lib/automations/action-executor.ts` - create_task now uses domainCreateTask with cascadeDepth
- `src/lib/tools/handlers/crm/index.ts` - 4 new task handlers (taskCreate, taskUpdate, taskComplete, taskList)
- `src/lib/tools/schemas/crm.tools.ts` - 4 new task tool schemas (crm.task.create/update/complete/list)

## Decisions Made
- **No task.created trigger:** TRIGGER_CATALOG only has task.completed and task.overdue. createTask does NOT emit any trigger (unless created with status='completed').
- **task_type_id as adapter concern:** The domain doesn't manage task types. The server action handles task_type_id and created_by as adapter concerns after the domain call.
- **Permissions mapping:** Used contacts.view/create/edit for task tool permissions since no tasks.* Permission type exists. Adding tasks.* would be an architectural change deferred for later.
- **completeTask idempotent:** If task is already completed, returns success without re-emitting trigger (prevents duplicate automation runs).
- **Colombia timezone for completed_at:** Uses `toLocaleString('sv-SE', { timeZone: 'America/Bogota' })` per CLAUDE.md Regla 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript comparison error in updateTask**
- **Found during:** Task 1
- **Issue:** Redundant `params.status !== 'completed'` comparison in else-branch after TypeScript had already narrowed the type
- **Fix:** Simplified to just `current.status === 'completed'` check (TS already knows status is not 'completed' in else-branch)
- **Files modified:** src/lib/domain/tasks.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 5fd8da8 (Task 1 commit)

**2. [Rule 1 - Bug] Permission type mismatch for task tool schemas**
- **Found during:** Task 2
- **Issue:** Used `tasks.create/edit/view` but Permission type doesn't include tasks.* variants
- **Fix:** Mapped to `contacts.create/edit/view` (same role level manages tasks and contacts)
- **Files modified:** src/lib/tools/schemas/crm.tools.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** ba6eeb6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes were TypeScript compilation issues. No scope creep.

## Issues Encountered
None beyond the TypeScript fixes documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tasks fully domain-powered: all task mutations go through domain/tasks.ts
- Bot has task management capabilities (create/update/complete/list)
- Ready for Plan 08 (notes + custom fields domain)
- Remaining direct DB in action-executor: webhooks only

---
*Phase: 18-domain-layer-foundation*
*Completed: 2026-02-13*
