---
phase: standalone/whatsapp-performance
plan: 01
subsystem: ui
tags: [supabase-realtime, react-hooks, whatsapp, performance, surgical-updates]

# Dependency graph
requires:
  - phase: none
    provides: existing use-conversations.ts and conversations.ts server actions
provides:
  - Consolidated 1-channel realtime subscription for conversation list
  - Surgical state updates replacing full refetches on conversation changes
  - Lighter getConversations() query (no address/city, explicit tag fields)
  - Debounced safety-net refetch for eventual consistency
affects: [standalone/whatsapp-performance plans 02-04, any future WhatsApp inbox changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Surgical state updates: spread payload.new onto existing state, preserving join data"
    - "Ref-based closure avoidance: conversationsRef, contactIdsRef for realtime callbacks"
    - "Consolidated channel: single supabase.channel() with multiple .on() listeners"
    - "Safety-net debounced refetch: 30s timer as eventual consistency backup"

key-files:
  created: []
  modified:
    - src/app/actions/conversations.ts
    - src/hooks/use-conversations.ts

key-decisions:
  - "Contact tag changes trigger debounced full refetch (rare event, simpler than targeted fetch)"
  - "Orders loading only fires on initial load transition, not every conversation update"
  - "refreshOrders uses contactIdsRef to avoid stale closures"
  - "Dependency array is [workspaceId, scheduleSafetyRefetch] — channel resubscribes on filter change"

patterns-established:
  - "Surgical realtime updates: use setConversations(prev => ...) with payload.new spread"
  - "Consolidated Supabase channels: inbox:${workspaceId} pattern for multi-table listeners"
  - "Ref-based stale closure prevention in realtime callbacks"

# Metrics
duration: 31min
completed: 2026-02-17
---

# Standalone Plan 01: Realtime Channel Consolidation and Surgical Updates Summary

**Consolidated 4 Supabase realtime channels into 1, replaced full refetches with surgical state updates for conversation list, and lightened the getConversations() query payload**

## Performance

- **Duration:** 31 min
- **Started:** 2026-02-17T03:05:43Z
- **Completed:** 2026-02-17T03:36:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Reduced conversation list realtime channels from 4 to 1 (`inbox:${workspaceId}`)
- Eliminated full `getConversations()` refetch on every conversation UPDATE (surgical spread of payload.new preserving join data)
- Tag changes now fetch only the affected conversation's tags via `getConversationTags()` instead of refetching all conversations
- Query payload lightened by removing `address` and `city` from list query and specifying only `id, name, color` for tags
- Fixed orders loading to only fire on initial load (not on every conversation state change)
- Added debounced safety-net full refetch (30s) for eventual consistency

## Task Commits

Each task was committed atomically:

1. **Task 1: Lighten getConversations() query** - `11a0fa6` (perf)
2. **Task 2: Consolidate channels + surgical updates** - `4ab0a6e` (perf)

## Files Created/Modified
- `src/app/actions/conversations.ts` - Lighter list query: removed address/city from contact join, explicit tag field selection (id, name, color), added !left join hint
- `src/hooks/use-conversations.ts` - 1 consolidated realtime channel with surgical state updates, refs for stale closure prevention, debounced safety-net refetch, optimized orders loading

## Decisions Made
- **Contact tag changes use debounced full refetch:** Contact tag changes are rare (editing CRM contact while WhatsApp is open) — a full refetch is simpler and acceptable for this infrequent event, versus building a targeted contact_tags fetch.
- **Orders load only on initial transition:** Orders are independent data that don't change when conversations update. Loading them on every conversation change was wasteful.
- **Dependency array includes scheduleSafetyRefetch:** The channel re-subscribes when filters change (since the safety-net timer needs the latest fetchConversations). This is correct behavior — same channel, different timer callback.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `git stash` during build verification reverted the working file (WSL filesystem interaction). Resolved by re-writing the file and confirming changes were applied.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 (Chat message channel consolidation) can proceed independently
- Plan 03 (Panel lazy-loading) can proceed independently
- Plan 04 (Message input optimizations) can proceed independently
- All plans in this phase are independent (wave 1)

---
*Phase: standalone/whatsapp-performance*
*Completed: 2026-02-17*
