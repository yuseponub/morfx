---
phase: 17-crm-automations-engine
plan: 01
subsystem: database
tags: [supabase, rls, jsonb, typescript, automations, triggers, conditions, actions]

# Dependency graph
requires:
  - phase: 06-orders-foundation
    provides: orders table, workspaces FK, is_workspace_member() function, update_updated_at_column() trigger function
provides:
  - automations table with trigger_type, conditions JSONB, actions JSONB
  - automation_executions table with execution history and cascade tracking
  - source_order_id column on orders for connected orders (1-to-many)
  - TriggerType, ActionType, ConditionGroup, AutomationAction TypeScript types
  - TRIGGER_CATALOG, ACTION_CATALOG, VARIABLE_CATALOG constants for Phase 18 AI Builder
  - Limits constants (MAX_CASCADE_DEPTH, MAX_ACTIONS_PER_AUTOMATION, etc.)
affects: [17-02 condition-evaluator, 17-03 variable-resolver, 17-04 inngest-runner, 17-05 wizard-ui, 17-10 connected-orders, 18-ai-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSONB columns for flexible automation config (trigger_config, conditions, actions)"
    - "Recursive ConditionGroup type (AND/OR with nested groups)"
    - "Discriminated catalog pattern (TRIGGER_CATALOG, ACTION_CATALOG with as const)"
    - "Zero-import constants file for circular dep prevention"

key-files:
  created:
    - supabase/migrations/20260213_automations.sql
    - src/lib/automations/types.ts
    - src/lib/automations/constants.ts
  modified: []

key-decisions:
  - "10 trigger types covering CRM, WhatsApp, and Tasks domains"
  - "11 action types including duplicate_order with source_order_id tracking"
  - "Recursive ConditionGroup for nested AND/OR condition trees"
  - "constants.ts has ZERO imports — Phase 18 AI Builder reads catalogs programmatically"
  - "MAX_CASCADE_DEPTH=3, MAX_ACTIONS=10, MAX_AUTOMATIONS=50 as starting limits"
  - "source_order_id on orders is distinct from linked_order_id (returns vs automation-created)"

patterns-established:
  - "JSONB storage for automation definitions: trigger_config, conditions, actions columns"
  - "Execution history with per-action log (actions_log JSONB array)"
  - "Partial index on status='failed' for failure monitoring queries"
  - "Variable catalog keyed by trigger type for context-aware variable picker"

# Metrics
duration: 5min
completed: 2026-02-12
---

# Phase 17 Plan 01: Foundation Summary

**DB schema (automations + executions tables with RLS), TypeScript type system (10 triggers, 11 actions, recursive conditions), and self-contained constants catalog for Phase 18 AI Builder**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T02:11:26Z
- **Completed:** 2026-02-13T02:16:00Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Two Supabase tables (automations, automation_executions) with full RLS, indexes, and updated_at trigger
- Complete TypeScript type system: 10 TriggerTypes, 11 ActionTypes, recursive ConditionGroup, DB row types, TriggerContext
- Self-contained constants catalog with TRIGGER_CATALOG (10), ACTION_CATALOG (11), VARIABLE_CATALOG (per trigger), and all limits
- source_order_id column on orders table for automation-created connected orders (distinct from linked_order_id for returns)

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration** - `d648b7a` (feat)
2. **Task 2: TypeScript types and constants catalog** - `415a2a5` (feat)

## Files Created/Modified
- `supabase/migrations/20260213_automations.sql` - Automations + execution_history tables, RLS, indexes, updated_at trigger, source_order_id on orders
- `src/lib/automations/types.ts` - Full type system: TriggerType, ActionType, ConditionGroup, Automation, AutomationExecution, TriggerContext
- `src/lib/automations/constants.ts` - Catalogs (triggers, actions, variables), limits, delayToMs helper — zero imports

## Decisions Made
- Used the same RLS pattern as orders_foundation (is_workspace_member for automations CRUD, SELECT-only for executions)
- Execution history is SELECT-only via RLS because executions are created by the system (Inngest functions), not users
- source_order_id uses IF NOT EXISTS for safe re-running of migration
- constants.ts maintains zero imports from project files per Phase 15.8 pattern to prevent circular deps
- Variable catalog indexed by trigger type so the wizard can show only relevant variables per trigger

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Git index.lock file from a previous process blocked the first commit; removed manually and re-committed successfully.

## User Setup Required

None - no external service configuration required. Migration must be applied to Supabase when deploying.

## Next Phase Readiness
- Types and constants ready for Plan 02 (condition-evaluator) and Plan 03 (variable-resolver)
- DB schema ready for Plan 04 (Inngest automation runner)
- Catalogs ready for Plan 05 (wizard UI) to render trigger/action/variable options
- All 10 plans in Phase 17 can proceed; no blockers

---
*Phase: 17-crm-automations-engine*
*Completed: 2026-02-12*
