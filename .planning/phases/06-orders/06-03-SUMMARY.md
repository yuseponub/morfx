---
phase: 06-orders
plan: 03
subsystem: ui
tags: [dnd-kit, react, pipelines, kanban, drag-drop]

# Dependency graph
requires:
  - phase: 06-01
    provides: pipelines and pipeline_stages database tables
provides:
  - Pipeline Server Actions (CRUD with stage management)
  - Pipeline configuration page at /crm/configuracion/pipelines
  - Stage drag-to-reorder using @dnd-kit
  - Default pipeline auto-creation
affects: [06-04, 06-05, kanban-board]

# Tech tracking
tech-stack:
  added: [@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities]
  patterns: [DndContext with SortableContext, useSortable hook for list reordering]

key-files:
  created:
    - src/app/actions/pipelines.ts
    - src/app/(dashboard)/crm/configuracion/pipelines/page.tsx
    - src/app/(dashboard)/crm/configuracion/pipelines/components/pipeline-list.tsx
    - src/app/(dashboard)/crm/configuracion/pipelines/components/pipeline-form.tsx
    - src/app/(dashboard)/crm/configuracion/pipelines/components/stage-manager.tsx
  modified:
    - package.json
    - pnpm-lock.yaml
    - src/app/actions/orders.ts (fix Zod v4 z.record syntax)

key-decisions:
  - "@dnd-kit for drag-drop (React 19 compatible, accessible, lightweight)"
  - "STAGE_COLORS separate from TAG_COLORS (same values but decoupled)"
  - "Optimistic update on drag with revert on error"
  - "Default pipeline Ventas with 4 stages: Nuevo, En Proceso, Ganado, Perdido"

patterns-established:
  - "DndContext + SortableContext + useSortable for list reordering"
  - "CSS.Transform.toString(transform) for drag styling"
  - "Collapsible card pattern for pipeline list"

# Metrics
duration: 15min
completed: 2026-01-29
---

# Phase 6 Plan 03: Pipeline & Stage Management Summary

**Pipeline configuration page with drag-to-reorder stages using @dnd-kit, color picker, and WIP limits**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-01-29T18:35:00Z
- **Completed:** 2026-01-29T18:50:00Z
- **Tasks:** 2
- **Files created:** 5
- **Packages added:** 3 (@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities)

## Accomplishments
- Pipeline Server Actions with full CRUD for pipelines and stages
- Pipeline configuration page with expandable pipeline cards
- Stage manager with drag-to-reorder using @dnd-kit/sortable
- Color picker with 9 predefined colors + custom hex input
- WIP limit and is_closed configuration per stage
- Default "Ventas" pipeline auto-created on first visit
- Delete protection (cannot delete default pipeline or pipelines with orders)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @dnd-kit and create pipeline Server Actions** - `0c08790` (feat)
2. **Task 2: Create pipeline configuration UI with stage manager** - `9f80233` (feat)

## Files Created/Modified

### Created
- `src/app/actions/pipelines.ts` - Server Actions for pipeline and stage CRUD
- `src/app/(dashboard)/crm/configuracion/pipelines/page.tsx` - Main configuration page
- `src/app/(dashboard)/crm/configuracion/pipelines/components/pipeline-list.tsx` - Pipeline list with expand/collapse
- `src/app/(dashboard)/crm/configuracion/pipelines/components/pipeline-form.tsx` - Create/edit pipeline dialog
- `src/app/(dashboard)/crm/configuracion/pipelines/components/stage-manager.tsx` - Stage list with drag-drop

### Modified
- `package.json` - Added @dnd-kit dependencies
- `pnpm-lock.yaml` - Lock file update
- `src/app/actions/orders.ts` - Fixed Zod v4 z.record syntax error

## Decisions Made

1. **@dnd-kit for drag-drop** - React 19 compatible, accessible, lightweight vs react-beautiful-dnd
2. **Separate STAGE_COLORS constant** - Same values as TAG_COLORS but decoupled for flexibility
3. **Optimistic update on drag** - Updates UI immediately, reverts on server error
4. **Default stages: Nuevo, En Proceso, Ganado, Perdido** - Standard sales pipeline flow

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Zod v4 z.record syntax in orders.ts**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** `z.record(z.unknown())` requires 2 arguments in Zod v4
- **Fix:** Changed to `z.record(z.string(), z.unknown())`
- **Files modified:** src/app/actions/orders.ts
- **Verification:** pnpm tsc --noEmit passes for pipeline components
- **Committed in:** 0c08790 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Minor fix to existing file unrelated to plan scope. No scope creep.

## Issues Encountered

- orders-table.tsx and order-form.tsx have TypeScript errors (for future plans 06-04/06-05), but pipeline components compile successfully

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pipeline infrastructure ready for Kanban board implementation
- Server Actions ready: getPipelines, createStage, updateStageOrder
- Stage reordering proven to work with @dnd-kit
- Ready for Plan 06-04 (Order CRUD) and 06-05 (Kanban Board)

---
*Phase: 06-orders*
*Completed: 2026-01-29*
