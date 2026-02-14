---
phase: 19-ai-automation-builder
plan: 07
subsystem: ui
tags: [react-flow, ai-sdk-v6, dynamic-import, diagram, preview, chat]

# Dependency graph
requires:
  - phase: 19-04
    provides: diagram-generator and validation modules
  - phase: 19-05
    provides: builder chat UI with AI SDK v6 patterns
  - phase: 19-06
    provides: React Flow preview nodes and confirmation buttons
provides:
  - End-to-end preview-confirm-create flow wired into chat
  - generatePreview tool produces real diagrams with validation
  - Inline React Flow diagrams in chat messages
  - Confirm/Modify buttons connected to chat actions
affects: [19-09, 19-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import for React Flow SSR safety"
    - "React 19 ref-as-prop pattern for input focus control"
    - "Programmatic sendMessage for confirmation flow"

key-files:
  modified:
    - src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx
    - src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx
    - src/lib/builder/tools.ts

key-decisions:
  - "Inline diagram rendering inside chat message bubble for seamless UX"
  - "Confirmation sends literal text message 'Confirmo. Crea la automatizacion.' that agent interprets"
  - "Removed 260 lines of duplicated validation/cycle-detection code from tools.ts in favor of validation module"

patterns-established:
  - "Dynamic tool result rendering: switch on toolName for custom result components"
  - "Confirm flow: button -> sendMessage -> agent sees text -> calls createAutomation"

# Metrics
duration: 8min
completed: 2026-02-14
---

# Phase 19 Plan 07: Preview-Confirm-Create Flow Summary

**React Flow diagrams render inline in chat from generatePreview, with confirm/modify buttons wired to programmatic message append and input focus**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-14T00:46:47Z
- **Completed:** 2026-02-14T00:54:56Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- generatePreview tool results render as React Flow diagrams inline in chat messages
- Confirm button sends programmatic message triggering createAutomation tool call
- Modify button focuses the input textarea for user to describe changes
- createAutomation/updateAutomation results show success indicators with navigation link
- Removed 260 lines of duplicated code from tools.ts (inline validateResources + detectCycles)
- generatePreview now uses real diagram-generator with validation error mapping to nodes

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire diagram preview into message rendering** - `8c9b8e4` (feat)
2. **Task 2: Wire generatePreview tool to use diagram generator** - `df2f7d4` (feat)

## Files Created/Modified
- `src/app/(dashboard)/automatizaciones/builder/components/builder-message.tsx` - Dynamic AutomationPreview import, CreateAutomationResult/UpdateAutomationResult components, onConfirmPreview/onModifyRequest callbacks
- `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx` - handleConfirmPreview (sendMessage), handleModifyRequest (focus input), inputRef, passes callbacks to BuilderMessage
- `src/lib/builder/tools.ts` - Replaced inline validation/cycle-detection with imports from validation module, generatePreview uses automationToDiagram for real diagrams

## Decisions Made
- Confirmation sends literal Spanish text "Confirmo. Crea la automatizacion." that the agent interprets naturally, rather than a structured command
- Used dynamic import with SSR:false for AutomationPreview to avoid React Flow SSR crashes
- Increased assistant message max-width from 80% to 90% to give diagrams more space
- Removed inline duplicate code in tools.ts rather than keeping both copies

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- End-to-end builder flow is wired: describe -> preview diagram -> confirm -> create automation
- Ready for Plan 09 (final integration/polish) and Plan 10 (testing)
- Session persistence (Plan 08) already exists for history

---
*Phase: 19-ai-automation-builder*
*Completed: 2026-02-14*
