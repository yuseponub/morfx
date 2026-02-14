---
phase: 19-ai-automation-builder
plan: 06
subsystem: ui
tags: [react-flow, xyflow, diagram, preview, custom-nodes, automation-builder]

# Dependency graph
requires:
  - phase: 19-01
    provides: "@xyflow/react package, DiagramNodeData types, builder types"
  - phase: 19-04
    provides: "diagram-generator.ts that produces DiagramData for preview"
provides:
  - "customNodeTypes: 3 React Flow node components (trigger, condition, action)"
  - "AutomationPreview: read-only diagram wrapper with validation warnings"
  - "ConfirmationButtons: Crear/Modificar action buttons"
affects: ["19-07 builder-message.tsx wires these components", "19-08+ automation creation flow"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import pattern for React Flow (SSR-safe via next/dynamic in consumer)"
    - "Custom React Flow node types with typed data payloads"
    - "Color-coded node categories: violet=trigger, amber=condition, blue=action"

key-files:
  created:
    - src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx
    - src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx
    - src/app/(dashboard)/automatizaciones/builder/components/confirmation-buttons.tsx
  modified:
    - src/lib/builder/types.ts

key-decisions:
  - "Index signature added to DiagramNodeData for @xyflow/react Node<T> constraint compatibility"
  - "Nodes export as named customNodeTypes object rather than individual components"
  - "SSR safety delegated to consumer (dynamic import in builder-message.tsx) not in preview itself"

patterns-established:
  - "React Flow read-only mode: 8 props to disable all interaction"
  - "Error state convention: red border + AlertTriangle icon for invalid resource nodes"

# Metrics
duration: 8min
completed: 2026-02-14
---

# Phase 19 Plan 06: Automation Preview Diagram Summary

**React Flow preview diagram with custom violet/amber/blue node types, read-only mode, validation warnings, and confirmation buttons**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-14T00:37:17Z
- **Completed:** 2026-02-14T00:45:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Three custom React Flow node types with distinct color-coded styling (TriggerNode=violet, ConditionNode=amber, ActionNode=blue)
- Read-only automation preview diagram with fitView, no drag/connect/select/zoom
- Validation warning system: resource warnings (amber), cycle detection (red, blocks creation), duplicate warnings
- Confirmation buttons (Crear/Guardar + Modificar) with disabled state for cycle detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Create custom React Flow node components** - `c55ef44` (feat)
2. **Task 2: Create automation preview and confirmation buttons** - `081b254` (feat)

## Files Created/Modified
- `src/app/(dashboard)/automatizaciones/builder/components/preview-nodes.tsx` - TriggerNode, ConditionNode, ActionNode custom components with Handle connections
- `src/app/(dashboard)/automatizaciones/builder/components/automation-preview.tsx` - ReactFlow wrapper with read-only config, warnings, and dynamic height
- `src/app/(dashboard)/automatizaciones/builder/components/confirmation-buttons.tsx` - Crear/Modificar action buttons with disabled state
- `src/lib/builder/types.ts` - Added index signature to DiagramNodeData for React Flow compatibility

## Decisions Made
- Added `[key: string]: unknown` index signature to `DiagramNodeData` interface because `@xyflow/react` v12 `Node<T>` requires `T extends Record<string, unknown>`. TypeScript interfaces without index signatures don't satisfy this constraint.
- SSR safety handled by consumer (builder-message.tsx will use `next/dynamic({ ssr: false })`) rather than wrapping inside automation-preview.tsx itself. This keeps the component testable and avoids unnecessary abstraction layers.
- Node display limits: max 3 config entries for trigger, max 3 params for action nodes to prevent overly tall cards.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added index signature to DiagramNodeData**
- **Found during:** Task 1 (custom node components)
- **Issue:** `DiagramNodeData` interface did not have an index signature, causing TS2344 error with `Node<DiagramNodeData>` since `@xyflow/react` requires `Record<string, unknown>`
- **Fix:** Added `[key: string]: unknown` index signature to the interface
- **Files modified:** `src/lib/builder/types.ts`
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** c55ef44 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary type fix for React Flow v12 compatibility. No scope creep.

## Issues Encountered
None beyond the type fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Preview components ready for Plan 07 (builder-message.tsx integration)
- AutomationPreview must be imported with `dynamic({ ssr: false })` by consumer
- customNodeTypes exported and matches the node types generated by diagram-generator.ts

---
*Phase: 19-ai-automation-builder*
*Completed: 2026-02-14*
