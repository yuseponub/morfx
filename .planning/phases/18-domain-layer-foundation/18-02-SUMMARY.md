---
phase: 18-domain-layer-foundation
plan: 02
subsystem: domain
tags: [orders, domain-layer, supabase, trigger-emitter, createAdminClient]

# Dependency graph
requires:
  - phase: 18-01
    provides: DomainContext, DomainResult types + domain barrel
  - phase: 17
    provides: trigger-emitter functions (emitOrderCreated, emitOrderStageChanged, etc.)
provides:
  - 7 order domain functions: createOrder, updateOrder, moveOrderToStage, deleteOrder, duplicateOrder, addOrderTag, removeOrderTag
  - Domain barrel now re-exports orders module
affects:
  - 18-03 (server action migration — will call domain functions instead of direct DB)
  - 18-04 (contacts/tags domain — follows same pattern established here)
  - 18-05 (tool handler migration — will call domain functions)
  - 18-06 (messages domain — follows same pattern)
  - 18-10 (action executor migration — will call domain functions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain function pattern: createAdminClient() + workspace_id filter + mutation + trigger emission"
    - "DomainContext/DomainResult contract for all domain functions"
    - "Stage resolution: resolve first stage by position if none provided"
    - "Product replacement: delete all + insert new (full replace, not merge)"
    - "Duplicate tag handling: 23505 error code = success (already assigned)"

key-files:
  created:
    - src/lib/domain/orders.ts
  modified:
    - src/lib/domain/index.ts

key-decisions:
  - "All 7 functions written in single file (not split across tasks) for consistency — barrel uncommitted until Task 2"
  - "stageId typed as string (not string|null) after resolution to avoid downstream narrowing issues"
  - "Tag functions lookup by name (error if not found) — no find-or-create unlike tool handlers"
  - "updateOrder emits per-field triggers including custom_fields as JSON-stringified comparison"
  - "duplicateOrder copies carrier, tracking_number, custom_fields in addition to shipping/description"
  - "total_value recalculated after product insert (sum of unitPrice * quantity) as DB trigger may also fire"

patterns-established:
  - "Domain function signature: (ctx: DomainContext, params: XxxParams) => Promise<DomainResult<XxxResult>>"
  - "Every mutating function (except delete where no trigger exists) emits fire-and-forget trigger"
  - "cascadeDepth passed through from DomainContext to trigger emitter"
  - "Product rollback: if products insertion fails, delete the parent order"

# Metrics
duration: 8min
completed: 2026-02-13
---

# Phase 18 Plan 02: Orders Domain Functions Summary

**7 order domain functions (create, update, move, delete, duplicate, addTag, removeTag) with createAdminClient, workspace isolation, and trigger emission — establishes the pattern for all entity domains**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-13T16:48:19Z
- **Completed:** 2026-02-13T16:55:55Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All 7 order domain functions implemented following DomainContext/DomainResult contract
- Every function uses createAdminClient (never createClient) and filters by workspace_id
- Trigger emissions match trigger-emitter.ts signatures exactly
- Business logic matches existing server actions (field change detection, product rollback, stage name resolution)
- Domain barrel re-exports all order functions and types
- Zero TypeScript compilation errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create orders domain — all 7 functions** - `bf059d3` (feat)
2. **Task 2: Enable orders barrel export** - `6028ea3` (feat)

## Files Created/Modified
- `src/lib/domain/orders.ts` - 7 order domain functions with param/result types
- `src/lib/domain/index.ts` - Uncommented orders re-export

## Decisions Made
- **Tag functions: lookup only, not find-or-create.** The domain layer errors if a tag name doesn't exist. This is different from tool handlers (which create tags) — domain functions should be explicit, and callers that need find-or-create can do it before calling the domain function.
- **stageId as string, not string|null.** After resolving the first stage (when none provided), the variable is guaranteed to be a string. Using `string` type (initialized to `''`) avoids TypeScript narrowing issues downstream without needing non-null assertions.
- **duplicateOrder copies more fields than action-executor.** Added carrier, tracking_number, custom_fields to the duplication — the action-executor only copies shipping_address and description. This is more correct since a duplicate should be a full copy.
- **total_value recalculated explicitly after product insert.** Even though a DB trigger may recalculate, we do a manual re-read to ensure the emitted trigger has the correct total.
- **custom_fields change emitted as single field.changed event.** JSON-stringified comparison of old vs new custom_fields object, emitted as fieldName 'custom_fields'.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stageId type narrowing**
- **Found during:** Task 1 (compilation verification)
- **Issue:** `stageId` typed as `string | null` from `params.stageId ?? null`, but after early-return validation, TypeScript still saw it as nullable — causing 3 compilation errors in emitOrderCreated and return types.
- **Fix:** Changed initialization from `params.stageId ?? null` to `params.stageId ?? ''` and typed explicitly as `string`. The falsy check (`!stageId`) still catches empty string, and after the check it's guaranteed to be a non-empty string.
- **Files modified:** src/lib/domain/orders.ts (createOrder and duplicateOrder)
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** bf059d3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type narrowing fix necessary for compilation. No scope creep.

## Issues Encountered
None — plan executed cleanly after the type narrowing fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Orders domain functions complete and ready to be consumed
- Next plan (18-03) can migrate server actions to call these domain functions
- Pattern established: future entity domains (contacts, tags, messages, tasks, notes, conversations) follow identical structure

---
*Phase: 18-domain-layer-foundation*
*Completed: 2026-02-13*
