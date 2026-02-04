---
phase: 10-search-tasks-analytics
plan: 02
subsystem: tasks
tags: [tasks, server-actions, crud, ui, filters]
dependency-graph:
  requires: [10-01]
  provides: ["Task CRUD Server Actions", "Tasks page with list and filters", "Task form component", "TaskItem reusable component"]
  affects: [10-03, 10-04]
tech-stack:
  added: []
  patterns: ["Server Actions for CRUD", "Task grouping by due date proximity", "Reusable TaskItem component"]
key-files:
  created:
    - src/app/actions/tasks.ts
    - src/app/(dashboard)/tareas/page.tsx
    - src/app/(dashboard)/tareas/components/task-list.tsx
    - src/app/(dashboard)/tareas/components/task-form.tsx
    - src/app/(dashboard)/tareas/components/task-filters.tsx
    - src/components/tasks/task-item.tsx
  modified: []
decisions:
  - id: 10-02-01
    decision: "Client-side task grouping by due date proximity"
    rationale: "Provides intuitive organization: Vencidas, Hoy, Manana, Esta semana, Proximas, Sin fecha"
  - id: 10-02-02
    decision: "Reusable TaskItem component in src/components/tasks"
    rationale: "Can be reused in contact detail, order detail, conversation panels"
metrics:
  duration: ~11 minutes
  completed: 2026-02-04
---

# Phase 10 Plan 02: Task CRUD and Main UI Summary

**One-liner:** Server Actions for task CRUD with page at /tareas featuring grouped task list, filters, and Sheet-based create/edit forms.

## What Was Built

### Task Server Actions (`src/app/actions/tasks.ts`)

Complete CRUD operations for tasks:

1. **getTasks(filters?)** - Fetch tasks with optional filters
   - Joins: task_type, contact, order, conversation, assigned_user
   - Filters: status, priority, assigned_to, entity_type, due dates, search
   - Ordering: overdue first, then by due_date ASC, created_at DESC

2. **getTask(id)** - Single task with all relations

3. **createTask(input)** - Create task with exclusive arc validation
   - Validates at most one entity_id provided

4. **updateTask(id, input)** - Update with completed_at handling
   - Auto-sets completed_at when status changes to 'completed'
   - Clears completed_at when reopened

5. **deleteTask(id)** - Delete by ID

6. **completeTask(id)** / **reopenTask(id)** - Convenience methods

7. **getTaskSummary()** - Counts for pending, overdue, dueSoon

8. **Task Type CRUD** - getTaskTypes, createTaskType, updateTaskType, deleteTaskType, reorderTaskTypes

### Tasks Page (`/tareas`)

Server component that fetches:
- Tasks with status 'all'
- Task types for workspace
- Workspace members for assignment dropdown
- Task summary for header display

### TaskList Component

Client component with:
- Task grouping by due date proximity:
  - **Vencidas** (red) - Past due, pending
  - **Hoy** (yellow) - Due today
  - **Manana** - Due tomorrow
  - **Esta semana** - Due this week
  - **Proximas** - Future dates
  - **Sin fecha** - No due date
- Empty state with create button
- Create/Edit Sheet dialog
- Delete confirmation dialog

### TaskFilters Component

Filter bar with:
- Status toggle: Todas | Pendientes | Completadas
- Priority filter dropdown
- Assignment filter: Todas | Mis tareas | Sin asignar | [members]
- Clear filters button

### TaskForm Component

Sheet-based form for create/edit:
- Title (required)
- Description (textarea)
- Due date (Calendar picker with clear option)
- Priority (select with color indicators)
- Task type (select from workspace types)
- Assigned to (select from workspace members)
- Entity link display (read-only when editing linked task)

### TaskItem Component

Reusable task item with:
- Checkbox for completion toggle
- Title with strikethrough when completed
- Description preview (2 lines)
- Task type badge (colored border)
- Due date badge with urgency styling:
  - Red background = overdue
  - Yellow background = today
  - Blue background = tomorrow
  - Gray = other
- Priority indicator dot (red/yellow/gray)
- Assigned user badge
- Entity link badge (contact/order/conversation) with navigation
- Actions dropdown (Complete/Reopen, Edit, Delete)

## Technical Decisions

1. **Task grouping logic** - Groups tasks by due date proximity on client-side for responsiveness. Completed tasks are placed in their time group but not in "Vencidas".

2. **Reusable TaskItem** - Placed in `src/components/tasks/` for reuse in contact detail, order detail, and conversation panels (planned in 10-03).

3. **No Zod validation** - Following project convention from order-form.tsx, using react-hook-form without Zod schemas.

4. **Server-side summary counts** - `getTaskSummary()` fetches pending tasks and calculates counts client-side since Supabase doesn't support CASE WHEN in select.

## Commits

| Hash | Message |
|------|---------|
| 1f1289d | feat(10-02): create task Server Actions |
| 7f03ec4 | feat(10-02): create tasks page and components |

## Verification Checklist

- [x] TypeScript compiles without errors
- [x] Build succeeds with /tareas as dynamic route
- [x] Server Actions exported and typed correctly
- [x] Page renders task list with groups
- [x] Create task form works
- [x] Edit task form works
- [x] Delete task with confirmation
- [x] Complete/reopen toggle works
- [x] Filters update list correctly

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Ready for 10-03 (Entity Task Integration):
- TaskItem component ready for embedding
- Server Actions support entity_type and entity_id filters
- createTask accepts contact_id, order_id, conversation_id
