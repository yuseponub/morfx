---
phase: 18-domain-layer-foundation
plan: 09
subsystem: domain
tags: [domain-layer, conversations, inngest, cron, trigger-emitter, webhook, supabase]

# Dependency graph
requires:
  - phase: 18-01
    provides: DomainContext/DomainResult types, createAdminClient pattern
  - phase: 18-04
    provides: Contact domain functions for cross-entity references
  - phase: 18-06
    provides: Message domain functions, keyword_match trigger activation
provides:
  - 4 conversation domain functions (assign, archive, linkContact, findOrCreate)
  - task.overdue Inngest cron (15-minute interval)
  - Both dead triggers now active (keyword_match + task.overdue)
  - All 7 entities fully migrated to domain layer
affects: [18-10, phase-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inngest cron function pattern with createFunction + cron schedule"
    - "24h window dedup for recurring cron task emission"

key-files:
  created:
    - src/lib/domain/conversations.ts
    - src/inngest/functions/task-overdue-cron.ts
  modified:
    - src/lib/domain/index.ts
    - src/app/actions/conversations.ts
    - src/app/actions/assignment.ts
    - src/lib/tools/handlers/whatsapp/index.ts
    - src/lib/whatsapp/webhook-handler.ts
    - src/app/api/inngest/route.ts

key-decisions:
  - "unarchiveConversation stays as direct DB (reverse of archive, not in domain spec)"
  - "findOrCreateConversation race condition handled via 23505 duplicate key retry"
  - "24h window dedup for task.overdue cron (tasks overdue >24h skipped)"
  - "200 task safety cap per cron run to prevent overload"
  - "Resolution text storage on conversation close stays as adapter concern in tool handler"

patterns-established:
  - "Inngest cron: createFunction with { cron: '*/15 * * * *' } schedule"
  - "Cron dedup via time window filter (gt 24h ago, lt now)"

# Metrics
duration: 9min
completed: 2026-02-13
---

# Phase 18 Plan 09: Conversations Domain + Task Overdue Cron Summary

**4 conversation domain functions wired to all callers + 15-minute Inngest cron activating the task.overdue dead trigger; all 7 entities now domain-powered**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-13T18:42:28Z
- **Completed:** 2026-02-13T18:52:02Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- All 7 CRM entities (orders, contacts, tags, messages, tasks, notes, custom-fields, conversations) now route through domain layer
- Webhook handler fully domain-powered (findOrCreateConversation + linkContactToConversation)
- Both previously dead triggers activated: keyword_match (Plan 06) and task.overdue (this plan)
- task.overdue Inngest cron runs every 15 minutes scanning all workspaces for overdue tasks

## Task Commits

Each task was committed atomically:

1. **Task 1: Create conversations domain + wire callers** - `ba15487` (feat)
2. **Task 2: Create task.overdue Inngest cron + register** - `0f0f235` (feat)

## Files Created/Modified
- `src/lib/domain/conversations.ts` - 4 conversation domain functions (assignConversation, archiveConversation, linkContactToConversation, findOrCreateConversation)
- `src/inngest/functions/task-overdue-cron.ts` - 15-minute cron function scanning overdue tasks and emitting triggers
- `src/lib/domain/index.ts` - Barrel export updated with conversations module
- `src/app/actions/conversations.ts` - Server actions delegate archive/assign/linkContact to domain
- `src/app/actions/assignment.ts` - assignConversation delegates to domain, assignToNextAvailable keeps round-robin read
- `src/lib/tools/handlers/whatsapp/index.ts` - conversation.assign and conversation.close use domain
- `src/lib/whatsapp/webhook-handler.ts` - Replaced findOrCreateConversation and linkConversationToContact with domain calls
- `src/app/api/inngest/route.ts` - Registered taskOverdueCron function

## Decisions Made
- **unarchiveConversation stays direct DB:** The domain only defines archiveConversation. Unarchive is a simple status='active' reverse that doesn't need domain encapsulation since no trigger or side-effect is needed.
- **24h window dedup for cron:** Only tasks overdue within the last 24 hours are emitted. Tasks overdue longer than 24h are considered already processed. This avoids re-emitting for ancient overdue tasks on every cron run.
- **200 task cap per cron run:** Safety limit to prevent massive batches. If a workspace has 200+ overdue tasks, they'll be picked up in subsequent runs.
- **Resolution text on close is adapter concern:** When tool handler closes a conversation, storing the resolution text in last_message_preview stays in the handler (adapter concern) after domain archives.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate ctx variable in webhook handler**
- **Found during:** Task 1 (wire webhook-handler.ts)
- **Issue:** After adding domain ctx at top of try block, the existing ctx declaration for domainReceiveMessage caused TS2451 "Cannot redeclare block-scoped variable"
- **Fix:** Removed the second ctx declaration since the first one (already in scope) works for both domain calls
- **Files modified:** src/lib/whatsapp/webhook-handler.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** ba15487 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial variable scope fix. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 7 entities fully migrated to domain layer
- All 10 triggers active (both previously dead triggers now have emitters)
- Ready for Plan 10 (final verification / cleanup)
- Domain barrel export complete at src/lib/domain/index.ts

---
*Phase: 18-domain-layer-foundation*
*Completed: 2026-02-13*
