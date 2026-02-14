---
phase: 19-ai-automation-builder
plan: 02
subsystem: ai
tags: [ai-sdk, automation-builder, system-prompt, tool-definitions, zod, supabase]

# Dependency graph
requires:
  - phase: 17-crm-automations-engine
    provides: "TRIGGER_CATALOG, ACTION_CATALOG, VARIABLE_CATALOG in constants.ts"
  - phase: 19-ai-automation-builder (plan 01)
    provides: "BuilderToolContext, AutomationPreviewData, DiagramData types in builder/types.ts"
provides:
  - "Builder system prompt with dynamic catalog injection"
  - "9 AI SDK tool definitions for automation CRUD and resource lookup"
  - "Cycle detection algorithm for automation chain safety"
  - "Resource validation for pipelines, stages, tags, templates, and users"
affects: [19-ai-automation-builder plan 03, 19-ai-automation-builder plan 04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AI SDK tool() with inputSchema (not parameters) for zod v4 + AI SDK v6 type compatibility"
    - "Closure-based tool context: createBuilderTools(ctx) captures workspaceId/userId via closure"
    - "ACTION_TO_TRIGGER_MAP for static cycle detection between automation chains"
    - "Resource validation as pre-flight check before automation creation"

key-files:
  created:
    - "src/lib/builder/system-prompt.ts"
    - "src/lib/builder/tools.ts"
  modified: []

key-decisions:
  - "inputSchema over parameters: AI SDK v6 + zod v4 requires inputSchema property name for TypeScript type inference (parameters works at runtime but fails type checking)"
  - "ACTION_TO_TRIGGER_MAP: Static mapping from action types to trigger types they could produce (e.g., change_stage -> order.stage_changed) for DFS cycle detection"
  - "WhatsApp send actions mapped to whatsapp.message_received in cycle detection: conservative approach since replies could trigger message_received automations"
  - "generatePreview returns empty DiagramData: Real diagram generation deferred to Plan 04 as specified"
  - "Resource validation includes template approval status: Warns about non-APPROVED templates since only APPROVED can be sent"

patterns-established:
  - "AI SDK tool inputSchema pattern: Use inputSchema (not parameters) with zod v4 for type-safe tool definitions"
  - "Builder tool context closure: createBuilderTools(ctx) returns tool object with ctx.workspaceId captured"
  - "Cycle detection via DFS on automation adjacency graph"

# Metrics
duration: 11min
completed: 2026-02-13
---

# Phase 19 Plan 02: System Prompt & Tool Definitions Summary

**Dynamic system prompt with automation catalog injection and 9 AI SDK tools for resource lookup, preview validation, and CRUD**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-14T00:11:34Z
- **Completed:** 2026-02-14T00:22:45Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- System prompt dynamically incorporates all 10 trigger types, 11 action types, and variable catalog from constants.ts
- Behavioral rules enforce: no auto-create resources, no activate/deactivate, preview required before any CRUD
- 9 builder tools with workspace isolation via createAdminClient() and ctx.workspaceId filtering
- Cycle detection algorithm using DFS on automation adjacency graph with ACTION_TO_TRIGGER_MAP
- Resource validation checks pipelines, stages, tags, templates (including approval status), and workspace members

## Task Commits

Each task was committed atomically:

1. **Task 1: Create builder system prompt** - `a10b366` (feat)
2. **Task 2: Create builder tool definitions** - `ddd2c7c` (feat)

## Files Created/Modified
- `src/lib/builder/system-prompt.ts` - Exports `buildSystemPrompt(workspaceId)` returning Spanish system prompt with catalog knowledge and behavioral rules
- `src/lib/builder/tools.ts` - Exports `createBuilderTools(ctx)` returning 9 AI SDK tool definitions (listPipelines, listTags, listTemplates, listAutomations, getAutomation, listWorkspaceMembers, generatePreview, createAutomation, updateAutomation)

## Decisions Made
- **inputSchema vs parameters**: AI SDK v6 with zod v4 requires `inputSchema` property (not `parameters`) for correct TypeScript type inference. Runtime accepts both, but TypeScript compilation fails with `parameters`.
- **ACTION_TO_TRIGGER_MAP as static mapping**: Maps each action type to the trigger types it could produce (e.g., `change_stage` -> `['order.stage_changed']`). WhatsApp send actions conservatively mapped to `whatsapp.message_received` since replies could trigger automations.
- **Empty DiagramData in generatePreview**: As specified in the plan, real diagram generation is deferred to Plan 04. The preview returns validation results, cycle detection, and duplicate warnings now.
- **Template approval status validation**: Resource validation checks not just if templates exist but also their Meta approval status, warning about non-APPROVED templates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed `parameters` to `inputSchema` in tool definitions**
- **Found during:** Task 2 (Create builder tool definitions)
- **Issue:** AI SDK v6 `tool()` TypeScript types expect `inputSchema` property with zod v4 schemas. Using `parameters` caused 12 TypeScript errors (TS2769: No overload matches this call)
- **Fix:** Changed all `parameters: z.object(...)` to `inputSchema: z.object(...)` across all 9 tool definitions
- **Files modified:** src/lib/builder/tools.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** ddd2c7c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for TypeScript compilation. No scope creep.

## Issues Encountered
- Plan 01 running in parallel: types.ts was not available when Task 1 started, but was created by Plan 01 before Task 2 began. No workaround needed since system-prompt.ts doesn't import from builder/types.ts.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- System prompt and tools ready for the API route (Plan 03)
- generatePreview returns empty diagram data; Plan 04 will add real diagram generation
- All 9 tools compatible with AI SDK `streamText()` via the tool object pattern

---
*Phase: 19-ai-automation-builder*
*Completed: 2026-02-13*
