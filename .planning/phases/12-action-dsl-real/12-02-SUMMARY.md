---
phase: 12-action-dsl-real
plan: 02
subsystem: api
tags: [typescript, supabase, crm, tool-handlers, workspace-isolation]

# Dependency graph
requires:
  - phase: 12-01
    provides: ToolResult<T> types, ToolErrorType, createAdminClient pattern, ExecutionContext
  - phase: 03-action-dsl-core
    provides: Tool registry, ToolHandler type, crmHandlers export contract
provides:
  - 9 real CRM tool handlers (contact CRUD, tag add/remove, order create/updateStatus)
  - Workspace-isolated Supabase operations via createAdminClient
  - Structured ToolResult<T> responses for all operations
  - Phone normalization and duplicate detection
affects: [12-04-PLAN, 13-agent-engine-core, 14-agente-ventas-somnio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admin client + manual workspace_id filter for all tool handler DB operations"
    - "Find-or-create pattern for tags by name within workspace"
    - "Manual rollback for order creation if products insert fails"
    - "UUID regex detection for stage lookup (name vs ID input)"

key-files:
  created: []
  modified:
    - src/lib/tools/handlers/crm/index.ts

key-decisions:
  - "All handlers use createAdminClient (not cookie-based createClient) for execution outside React context"
  - "No revalidatePath or cookies calls -- handlers are context-agnostic"
  - "Tag operations use tag NAME (not ID) for agent-friendly interface"
  - "Order create auto-resolves default pipeline and first stage"
  - "Order updateStatus accepts both stage UUID and stage name (ilike match)"
  - "Contact list supports ALL-match tag filtering via contact_tags aggregation"

patterns-established:
  - "ToolResult<T> return for every handler path (never throw)"
  - "Workspace isolation: every query has .eq('workspace_id', context.workspaceId)"
  - "Duplicate phone (23505) returns structured error with type 'duplicate' and recovery suggestion"
  - "dryRun mode: returns preview with _dry_run: true, no DB mutations"
  - "Contact create with tags: find-or-create each tag, then link via contact_tags"

# Metrics
duration: 7min
completed: 2026-02-05
---

# Phase 12 Plan 02: Real CRM Tool Handlers Summary

**9 real CRM tool handlers replacing placeholders: contact CRUD, tag add/remove, order create/updateStatus -- all using createAdminClient with workspace isolation and ToolResult<T> responses**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T19:48:22Z
- **Completed:** 2026-02-05T19:55:42Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Replaced all 9 placeholder CRM handlers with real Supabase implementations (1407 lines)
- Contact create normalizes phone to E.164 via normalizePhone(), handles duplicate phone (23505) with structured error and recovery suggestion, optionally assigns tags with find-or-create pattern
- Contact update builds partial update from only provided fields, tracks changedFields array in response
- Contact read joins contact_tags to return full tag information
- Contact list supports paginated results with search (name/phone/email ilike), ALL-match tag filtering, configurable sort, and total count
- Contact delete verifies existence before deletion for proper not_found error
- Tag add/remove operates by tag NAME (not ID) -- agent-friendly. Creates tag if not exists with default color #6366f1
- Order create verifies contact, auto-resolves default pipeline + first stage, inserts products atomically with manual rollback on failure, re-queries for calculated total_value
- Order updateStatus accepts both stage UUID and stage name (ilike), shows available stages in error suggestion if not found

## Task Commits

Each task was committed atomically:

1. **Task 1: Contact handlers + tag handlers + order handlers** - `7b2825a` (feat)
   - All 9 handlers implemented in single file write since they share the same file

## Files Modified

- `src/lib/tools/handlers/crm/index.ts` - Complete rewrite: 112 lines of placeholders replaced with 1407 lines of real implementations

## Handler Inventory

| Handler | Lines | Key Behavior |
|---------|-------|-------------|
| crm.contact.create | ~100 | Phone normalization, duplicate detection, optional tag assignment |
| crm.contact.update | ~90 | Partial update, changedFields tracking, phone re-normalization |
| crm.contact.read | ~50 | Contact + tags join |
| crm.contact.list | ~100 | Paginated, search, ALL-match tag filter, sort |
| crm.contact.delete | ~50 | Existence check before delete |
| crm.tag.add | ~80 | Find-or-create tag, duplicate = alreadyHadTag: true |
| crm.tag.remove | ~60 | Tag lookup by name, hadTag tracking |
| crm.order.create | ~140 | Pipeline auto-resolve, atomic products, manual rollback |
| crm.order.updateStatus | ~110 | UUID or name stage lookup, available stages in error |

## Decisions Made

- **All handlers use createAdminClient:** Tool handlers execute outside React Server Component context (no cookies, no user session). Admin client bypasses RLS, so every query must manually filter by workspace_id.
- **Tag operations use tag NAME (not ID):** Agents think in terms of tag names ("VIP", "Nuevo"), not UUIDs. The handler resolves names to IDs internally.
- **Order create auto-resolves pipeline:** Finds the default pipeline (is_default=true), or falls back to any pipeline. Gets the first stage (lowest position) automatically.
- **Order updateStatus accepts UUID or name:** UUID regex detection determines lookup strategy. If name, uses ilike for case-insensitive match. On failure, lists available stage names.
- **Contact list ALL-match tag filter:** When filtering by tags, contacts must have ALL specified tags (not ANY). Uses in-memory aggregation of contact_tags counts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation passed with zero errors in the CRM handler file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 9 CRM handlers are real and ready for agent invocation
- ToolResult<T> response contract enforced on every code path
- Workspace isolation verified (21 workspace_id filter usages)
- Ready for executor integration in plan 04 and agent engine in phase 13

---
*Phase: 12-action-dsl-real*
*Completed: 2026-02-05*
