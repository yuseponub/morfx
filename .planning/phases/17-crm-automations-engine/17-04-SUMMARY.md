---
phase: 17-crm-automations-engine
plan: 04
subsystem: api
tags: [inngest, supabase, whatsapp, 360dialog, automation, cascade]

# Dependency graph
requires:
  - phase: 17-01
    provides: "Type system, constants, migration with automations + execution_history tables"
  - phase: 17-02
    provides: "Condition evaluator, variable resolver with buildTriggerContext"
  - phase: 12
    provides: "Tool registry, executeToolFromWebhook, WhatsApp/CRM handlers"
provides:
  - "executeAction function that runs all 11 automation action types"
  - "10 trigger emitter functions with cascade protection and fire-and-forget pattern"
affects: [17-05, 17-06, 17-07, 17-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy dynamic import for circular dependency avoidance (trigger-emitter in action-executor)"
    - "Fire-and-forget Inngest events via .catch() error logging (no await)"
    - "Cascade depth tracking with MAX_CASCADE_DEPTH suppression"
    - "createAdminClient for all CRM DB operations in Inngest context (RLS bypass)"

key-files:
  created:
    - src/lib/automations/action-executor.ts
    - src/lib/automations/trigger-emitter.ts
  modified: []

key-decisions:
  - "WhatsApp media uses direct 360dialog sendMediaMessage API (no tool handler exists for media)"
  - "Lazy import of trigger-emitter from action-executor to avoid circular dependency"
  - "Inngest send cast via (inngest.send as any) to bypass typed event schema until Plan 06"
  - "CRM state-modifying actions (tag, stage, order, field) emit cascade events; WhatsApp/webhook/task do not"
  - "Custom fields merged into JSONB via read-modify-write on custom_fields column"

patterns-established:
  - "Fire-and-forget: emitter functions return void, Inngest.send errors caught and logged"
  - "Action executor: switch on ActionType with exhaustive check (never type for default)"
  - "Cascade events use depth + 1 to track recursion across automation chains"
  - "AUTOMATION_REQUEST_META: { ip: 'inngest', userAgent: 'automation-engine' } for tool forensics"

# Metrics
duration: 9min
completed: 2026-02-13
---

# Phase 17 Plan 04: Action Executor & Trigger Emitter Summary

**Action executor for 11 CRM/WhatsApp/webhook action types with cascade-protected trigger emitters using fire-and-forget Inngest events**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-13T02:28:28Z
- **Completed:** 2026-02-13T02:37:06Z
- **Tasks:** 2/2
- **Files created:** 2

## Accomplishments
- Action executor handles all 11 action types: assign_tag, remove_tag, change_stage, update_field, create_order, duplicate_order, send_whatsapp_template, send_whatsapp_text, send_whatsapp_media, create_task, webhook
- 10 trigger emitter functions with MAX_CASCADE_DEPTH (3) protection
- Reuses existing tool handlers for WhatsApp (executeToolFromWebhook) and direct DB for CRM (createAdminClient)
- Fire-and-forget pattern on all emitters prevents blocking server actions

## Task Commits

Each task was committed atomically:

1. **Task 1: Action executor using existing tool handlers** - `f969c6f` (feat)
2. **Task 2: Trigger emitter with cascade protection** - `49e5c93` (feat)

## Files Created/Modified
- `src/lib/automations/action-executor.ts` - Executes all 11 automation action types with variable resolution, RLS bypass, and cascade event emission
- `src/lib/automations/trigger-emitter.ts` - 10 fire-and-forget emitter functions with cascade depth checking

## Decisions Made
- **WhatsApp media via direct API:** No tool handler exists for media messages, so send_whatsapp_media uses `sendMediaMessage` from `@/lib/whatsapp/api` directly (with manual 24h window check, API key lookup, and DB message storage)
- **Lazy import for circular deps:** action-executor dynamically imports trigger-emitter to avoid circular dependency (action-executor calls emitters, emitters could be imported by action-executor)
- **Inngest type bypass:** Used `(inngest.send as any)` since automation event types (automation/order.stage_changed etc.) are not yet registered in the Inngest client schema. Plan 06 will add proper types.
- **Cascade scope:** Only CRM state-modifying actions (tag, stage, order create/duplicate, field update) emit cascade events. WhatsApp sends, webhook calls, and task creation do NOT cascade (they don't modify CRM state that other automations could trigger on).
- **Custom fields JSONB merge:** update_field action reads existing custom_fields, merges the new field, then writes back. Standard columns are updated directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Double-cast for Supabase select result**
- **Found during:** Task 1 (update_field standard field read)
- **Issue:** TypeScript error: Supabase `.single()` return type cannot be directly cast to `Record<string, unknown>`. Required intermediate cast through `unknown`.
- **Fix:** Changed `(current as Record<string, unknown>)` to `(current as unknown as Record<string, unknown>)`
- **Files modified:** src/lib/automations/action-executor.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** f969c6f (Task 1 commit)

**2. [Rule 1 - Bug] Inngest typed event data parameter bypass**
- **Found during:** Task 2 (trigger emitter Inngest.send call)
- **Issue:** `inngest.send({ name: eventName as any, data })` still failed because the `data` parameter was type-checked against known event schemas. The `as any` on name alone was insufficient.
- **Fix:** Changed to `(inngest.send as any)({ name: eventName, data })` to bypass both name and data type checking
- **Files modified:** src/lib/automations/trigger-emitter.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 49e5c93 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs — TypeScript type issues)
**Impact on plan:** Both auto-fixes were necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed type issues above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Action executor and trigger emitter are ready for Plan 05 (Inngest runner function) and Plan 06 (Inngest event type registration)
- Server actions from Plan 03 can now call trigger emitters when CRM state changes
- The `automation/` event name prefix is established for all 10 trigger types

---
*Phase: 17-crm-automations-engine*
*Plan: 04*
*Completed: 2026-02-13*
