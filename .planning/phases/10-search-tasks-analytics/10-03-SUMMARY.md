---
phase: 10
plan: 03
subsystem: tasks
tags: [tasks, contextual-creation, sidebar-badge, task-types, dnd-kit]

dependency-graph:
  requires:
    - "10-01 (task schema and types)"
    - "10-02 (task CRUD and main UI)"
  provides:
    - "Contextual task creation from contacts, orders, conversations"
    - "Sidebar badge showing pending tasks"
    - "Task types configuration page"
  affects:
    - "10-04+ (task notifications, analytics)"

tech-stack:
  added: []
  patterns:
    - "Contextual entity linking (CreateTaskButton with entity props)"
    - "Badge hook pattern (useTaskBadge with auto-refresh)"
    - "Drag-to-reorder with dnd-kit (TaskTypesManager)"

key-files:
  created:
    - src/components/tasks/create-task-button.tsx
    - src/app/(dashboard)/crm/contactos/[id]/components/contact-tasks.tsx
    - src/hooks/use-task-badge.ts
    - src/app/(dashboard)/configuracion/tareas/page.tsx
    - src/app/(dashboard)/configuracion/tareas/components/task-types-manager.tsx
  modified:
    - src/app/(dashboard)/crm/contactos/[id]/page.tsx
    - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
    - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
    - src/components/layout/sidebar.tsx
    - src/app/actions/tasks.ts

decisions:
  - id: task-badge-count
    choice: "Badge shows overdue + dueSoon count"
    rationale: "Most urgent tasks users need attention on"
  - id: entity-button-pattern
    choice: "CreateTaskButton with entity props pre-fills form"
    rationale: "Single reusable component for all contexts"
  - id: task-types-colors
    choice: "Reused TAG_COLORS from tag system"
    rationale: "Consistent color palette across app"

metrics:
  duration: ~8 minutes
  completed: 2026-02-04
---

# Phase 10 Plan 03: Task Integration Summary

**One-liner:** Contextual task creation from contacts/orders/conversations with sidebar badge and task types settings.

## What Was Built

### 1. CreateTaskButton Component
Reusable button that opens a task creation form with pre-filled entity context:
- Accepts contactId/Name, orderId/Info, or conversationId/Phone
- Shows linked entity badge in form header
- Fetches task types and workspace members dynamically
- Uses `getWorkspaceMembersForTasks` helper to avoid workspace ID issues in client components

### 2. ContactTasks Component
New component for contact detail page showing tasks linked to that contact:
- Filters tasks by contact_id
- Toggle complete/reopen functionality
- Priority badges and overdue indicators
- Empty state with create button

### 3. Sidebar Badge
- Added "Tareas" nav item after WhatsApp, before Equipo
- useTaskBadge hook fetches summary every 5 minutes
- Red badge shows count when badgeCount (overdue + dueSoon) > 0
- Matches styling of other notification badges

### 4. Task Settings Page
`/configuracion/tareas` with TaskTypesManager:
- List task types with drag-to-reorder (dnd-kit)
- Create/edit/delete task types
- Color picker using TAG_COLORS palette
- Future placeholder for reminder settings

## Integration Points

| Location | Integration | How It Works |
|----------|-------------|--------------|
| Contact detail page | "Tareas" tab | Shows ContactTasks component with filter by contact |
| Order sheet | Task button in header | Opens CreateTaskButton with orderId |
| WhatsApp contact panel | Task button near CRM link | Opens CreateTaskButton with conversationId |
| Sidebar | Badge on Tareas link | useTaskBadge shows overdue+dueSoon count |

## Key Implementation Details

### Server Action Helper
Added `getWorkspaceMembersForTasks()` in tasks.ts to fetch workspace members using cookie-based workspace ID - designed for client component use where we can't pass workspaceId as prop.

### Badge Update Strategy
- Auto-refresh every 5 minutes via useEffect interval
- Badge count = summary.overdue + summary.dueSoon
- Shows nothing when count is 0

## Deviations from Plan

None - plan executed exactly as written.

## Verification

All success criteria met:
- [x] CreateTaskButton works from all three entity contexts
- [x] Tasks created are properly linked to entities
- [x] Sidebar shows Tareas with badge
- [x] Badge count reflects overdue + dueSoon
- [x] Task types settings page functional
- [x] Task types can be created, edited, deleted, reordered

## Commits

1. `5e269a4` - feat(10-03): add contextual task creation components
2. `f0e62fa` - feat(10-03): add sidebar badge and task settings
