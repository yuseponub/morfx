---
phase: 19-ai-automation-builder
plan: 01
subsystem: database, api
tags: [ai-sdk, anthropic, react-flow, xyflow, builder, types, migration, supabase]

# Dependency graph
requires:
  - phase: 17-crm-automations-engine
    provides: "TriggerType, ActionType, AutomationAction, ConditionGroup types"
provides:
  - "ai, @ai-sdk/anthropic, @xyflow/react packages installed"
  - "Builder type system: BuilderSession, DiagramNode, DiagramEdge, DiagramData, ValidationResult, ResourceValidation, BuilderToolContext, AutomationPreviewData"
  - "builder_sessions table with workspace isolation and RLS"
affects: [19-02, 19-03, 19-04, 19-05, 19-06, 19-07, 19-08]

# Tech tracking
tech-stack:
  added: [ai@6.0.86, "@ai-sdk/anthropic@3.0.43", "@xyflow/react@12.10.0"]
  patterns: ["Builder types import from automations/types only (zero cross-import)", "DiagramNodeData union via optional fields (trigger/condition/action)"]

key-files:
  created:
    - src/lib/builder/types.ts
    - supabase/migrations/20260214_builder_sessions.sql
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "UIMessage from ai package used at runtime; BuilderSession.messages typed as unknown[] for DB serialization"
  - "DiagramNodeData uses optional fields (not discriminated union) for simplicity with React Flow"
  - "RLS: workspace members can SELECT/INSERT, only session owner can UPDATE/DELETE"
  - "--legacy-peer-deps required for npm install due to React 19 peer dep conflict"

patterns-established:
  - "Builder types zero-import pattern: only imports from @/lib/automations/types"
  - "Re-export pattern: types.ts re-exports TriggerType, ActionType etc for builder consumers"

# Metrics
duration: 9min
completed: 2026-02-14
---

# Phase 19 Plan 01: Foundation Dependencies, Types & DB Summary

**AI SDK 6 + Anthropic provider + React Flow installed; builder type system (15 exports) and builder_sessions migration with workspace-isolated RLS**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-14T00:10:44Z
- **Completed:** 2026-02-14T00:19:44Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments
- Installed ai@6.0.86, @ai-sdk/anthropic@3.0.43, @xyflow/react@12.10.0
- Created comprehensive builder type system with 15 exports across 187 lines
- Created builder_sessions migration with workspace isolation, 4 RLS policies, 2 indexes, and updated_at trigger

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create builder types** - `abe01cc` (feat)
2. **Task 2: Create builder_sessions DB migration** - `eda0f0b` (feat)

## Files Created/Modified
- `package.json` - Added ai, @ai-sdk/anthropic, @xyflow/react dependencies
- `package-lock.json` - Lock file updated with new dependency tree
- `src/lib/builder/types.ts` - Complete builder type system (BuilderSession, DiagramNode, DiagramEdge, DiagramData, ValidationResult, ResourceValidation, BuilderToolContext, AutomationPreviewData, BuilderMessage, DiagramNodeType, DiagramNodeData, DiagramValidationError + re-exports + constants)
- `supabase/migrations/20260214_builder_sessions.sql` - builder_sessions table with RLS, indexes, trigger

## Decisions Made
- Used `unknown[]` for BuilderSession.messages instead of importing UIMessage directly (DB stores as JSONB, cast at usage site)
- DiagramNodeData uses optional fields for type-specific data instead of discriminated union (simpler React Flow integration)
- RLS policies split: workspace members for SELECT/INSERT, owner-only for UPDATE/DELETE (shared visibility, private editing)
- Required `--legacy-peer-deps` for npm install due to @webscopeio/react-textarea-autocomplete peer dep conflict with React 19

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npm peer dependency conflict with React 19**
- **Found during:** Task 1 (Install dependencies)
- **Issue:** @webscopeio/react-textarea-autocomplete requires React ^16/17/18, conflicting with React 19.2.3
- **Fix:** Used `--legacy-peer-deps` flag for npm install
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm ls ai @ai-sdk/anthropic @xyflow/react` shows all three installed correctly
- **Committed in:** abe01cc (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Standard npm peer dep workaround for React 19, no scope creep.

## Issues Encountered
- WSL ENOTDIR error on first npm install attempt (file system rename issue). Resolved by retrying after `npm cache clean --force`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Builder type system ready for all subsequent plans to import from `@/lib/builder/types`
- AI SDK ready for tool definitions (Plan 02) and streaming (Plan 05)
- React Flow ready for diagram visualization (Plan 06)
- builder_sessions migration ready to apply to Supabase (pending migration queue)
- Note: untracked `src/lib/builder/tools.ts` exists with TS errors; will be addressed in Plan 02

---
*Phase: 19-ai-automation-builder*
*Completed: 2026-02-14*
