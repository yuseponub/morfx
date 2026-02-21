---
phase: 24-chat-de-comandos-ui
plan: 03
subsystem: ui
tags: [react, allotment, supabase-realtime, command-ui, sidebar, split-panel]

requires:
  - phase: 24-02
    provides: "Server actions (executeSubirOrdenesCoord, getJobStatus, getCommandHistory, getJobItemsForHistory) and useRobotJobProgress hook"
  - phase: 24-01
    provides: "Domain functions and migration for dispatch stage, job queries, Realtime publication"
provides:
  - "/comandos page with split-panel layout, command interaction, live progress, and job history"
  - "Sidebar navigation entry between Tareas and Automatizaciones (adminOnly)"
  - "Command parsing for subir ordenes coord, estado, ayuda"
  - "Active job detection on page load for reconnect scenario"
affects:
  - "25 (Pipeline Integration may add pipeline-trigger commands)"

tech-stack:
  added: []
  patterns:
    - "Dynamic import Allotment with ssr:false (same as sandbox)"
    - "CommandMessage discriminated union type for typed message rendering"
    - "Progress message replacement (not accumulation) during job execution"
    - "Inline confirmation for destructive actions (chip buttons)"

key-files:
  created:
    - "src/app/(dashboard)/comandos/page.tsx"
    - "src/app/(dashboard)/comandos/components/comandos-layout.tsx"
    - "src/app/(dashboard)/comandos/components/comandos-split-panel.tsx"
    - "src/app/(dashboard)/comandos/components/command-panel.tsx"
    - "src/app/(dashboard)/comandos/components/command-input.tsx"
    - "src/app/(dashboard)/comandos/components/command-output.tsx"
    - "src/app/(dashboard)/comandos/components/history-panel.tsx"
    - "src/app/(dashboard)/comandos/components/progress-indicator.tsx"
  modified:
    - "src/components/layout/sidebar.tsx"

key-decisions:
  - "All UI components in one atomic commit (tightly coupled, no meaningful intermediate state)"
  - "adminOnly: true on sidebar entry (only owner/admin see Comandos)"
  - "Inline confirmation instead of modal for Subir ordenes chip (lighter UX)"
  - "Progress message replacement via findLastIndex to avoid message accumulation"

patterns-established:
  - "CommandMessage union type pattern for typed output rendering in command-style UIs"
  - "Split panel with Allotment for dashboard modules (sandbox, comandos)"

duration: 6min
completed: 2026-02-21
---

# Phase 24 Plan 03: Chat de Comandos UI Summary

**Complete /comandos page with split-panel layout, command interaction, live progress indicator, and job history panel**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T20:55:00Z
- **Completed:** 2026-02-21T21:01:00Z
- **Tasks:** 3 auto + 1 checkpoint (human-verified)
- **Files created:** 8, modified: 1

## Accomplishments
- Full /comandos page with server component + client layout (dynamic Allotment import)
- Command output rendering for 6 message types (command, system, error, progress, result, help)
- Quick-action chips with inline confirmation for destructive "Subir ordenes" command
- Live progress indicator with animated spinner, success/error badges, and progress bar
- Job history panel with expandable per-item detail rows
- Sidebar entry "Comandos" with Terminal icon (adminOnly)
- Active job detection on page mount for reconnect scenario
- Completion detection builds result summary from Realtime items

## Task Commits

1. **Tasks 1-3: Full UI module** - `625337a` (feat)
2. **Task 4: Human verification** - approved by user

## Files Created/Modified
- `src/app/(dashboard)/comandos/page.tsx` - Server component page wrapper
- `src/app/(dashboard)/comandos/components/comandos-layout.tsx` - Client root with state management
- `src/app/(dashboard)/comandos/components/comandos-split-panel.tsx` - Allotment wrapper
- `src/app/(dashboard)/comandos/components/command-panel.tsx` - Left panel container
- `src/app/(dashboard)/comandos/components/command-input.tsx` - Text input + chips
- `src/app/(dashboard)/comandos/components/command-output.tsx` - Scrollable message output
- `src/app/(dashboard)/comandos/components/history-panel.tsx` - Right panel with job list
- `src/app/(dashboard)/comandos/components/progress-indicator.tsx` - Live progress bar
- `src/components/layout/sidebar.tsx` - Added Comandos nav entry

## Decisions Made
- All components committed atomically (no meaningful intermediate state for 8 tightly coupled files)
- adminOnly: true ensures only admin/owner roles see Comandos in sidebar
- Inline confirmation chosen over modal for lighter UX on chip actions
- Progress messages are replaced (not accumulated) to keep output clean during long jobs

## Deviations from Plan
None - plan executed as written with human checkpoint passed.

## Issues Encountered
None.

## User Setup Required
None - UI is ready, backend integration requires carrier config + Inngest setup (Phase 25).

---
*Phase: 24-chat-de-comandos-ui*
*Completed: 2026-02-21*
