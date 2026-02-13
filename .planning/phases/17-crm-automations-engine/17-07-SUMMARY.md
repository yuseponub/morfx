---
phase: 17-crm-automations-engine
plan: 07
subsystem: api
tags: [inngest, automations, triggers, server-actions, whatsapp, crm]

# Dependency graph
requires:
  - phase: 17-04
    provides: "Trigger emitter functions (fire-and-forget Inngest event emission)"
provides:
  - "All CRM server actions wired with automation trigger emissions"
  - "WhatsApp webhook handler emits automation events alongside agent routing"
  - "Task completion emits automation events"
  - "Field change detection on contacts and orders"
affects: [17-08, 17-09, 17-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget emission pattern: call emitter after successful operation without await"
    - "Previous state capture: query entity BEFORE update to detect field changes"
    - "Dynamic import for trigger-emitter in webhook handler to avoid circular dependency"

key-files:
  created: []
  modified:
    - "src/app/actions/orders.ts"
    - "src/app/actions/contacts.ts"
    - "src/app/actions/tasks.ts"
    - "src/lib/whatsapp/webhook-handler.ts"

key-decisions:
  - "Tag emissions require extra queries for tag name and workspace_id (not available in function params)"
  - "Bulk tag operations emit per-contact events (not batched) for accurate automation triggering"
  - "updateOrder emits both field.changed AND order.stage_changed when stage changes"
  - "WhatsApp automation emission fires for ALL message types (not just text) using preview as content fallback"
  - "Dynamic import of trigger-emitter in webhook handler to avoid circular dependency with inngest client"

patterns-established:
  - "Previous state capture: always query entity state BEFORE update for accurate change detection"
  - "Fire-and-forget: never await emitter calls, never wrap in try/catch (emitter handles its own errors)"
  - "Tag name lookup: emit after operation with parallel Promise.all for entity+tag data"

# Metrics
duration: 7min
completed: 2026-02-13
---

# Phase 17 Plan 07: Trigger Emission Wiring Summary

**Fire-and-forget automation trigger emissions wired into all CRM server actions, task completion, and WhatsApp webhook handler with previous-state capture for field change detection**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-13T03:02:21Z
- **Completed:** 2026-02-13T03:09:31Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- All CRM operations (orders, contacts, tags) emit automation trigger events
- Field change detection captures previous state before updates and emits per-field events
- Task completion emits task.completed event through existing updateTask flow
- WhatsApp webhook emits automation event alongside existing agent routing (not replacing)
- All emissions are fire-and-forget - zero impact on existing operation latency

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire CRM triggers (orders, tags, contacts)** - `f1d552c` (feat)
2. **Task 2: Wire task and WhatsApp triggers** - `1aaef53` (feat)

## Files Created/Modified
- `src/app/actions/orders.ts` - Added emitOrderCreated, emitOrderStageChanged, emitFieldChanged, emitTagAssigned, emitTagRemoved
- `src/app/actions/contacts.ts` - Added emitContactCreated, emitFieldChanged, emitTagAssigned, emitTagRemoved (including bulk operations)
- `src/app/actions/tasks.ts` - Added emitTaskCompleted on status change to 'completed'
- `src/lib/whatsapp/webhook-handler.ts` - Added emitWhatsAppMessageReceived for all incoming messages

## Decisions Made
- **Tag emissions require extra queries:** Tag operations receive only tagId, so we need to query tag name and workspace_id after the operation. Used Promise.all for parallel lookups to minimize latency.
- **Bulk tag operations emit per-contact:** bulkAddTag/bulkRemoveTag emit one event per contact rather than a single batch event, ensuring each contact gets its own automation evaluation.
- **Dual emission on stage change:** updateOrder emits both field.changed (for field-level automation rules) AND order.stage_changed (for stage-specific automation rules) when the stage_id changes.
- **WhatsApp emission for ALL message types:** Not just text messages - all incoming messages trigger automation evaluation. For non-text messages, buildMessagePreview provides the content fallback.
- **Dynamic import in webhook handler:** Used `await import('@/lib/automations/trigger-emitter')` instead of static import to avoid circular dependency with inngest client in the webhook context.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All trigger emissions are wired and TypeScript compiles cleanly
- Ready for Plan 08 (Automation UI integration page) - emissions will flow through the runner (Plan 06) when automations are created via the UI (Plan 05/08)
- The automation pipeline is now complete: server action -> trigger emitter -> Inngest event -> automation runner -> action executor

---
*Phase: 17-crm-automations-engine*
*Completed: 2026-02-13*
