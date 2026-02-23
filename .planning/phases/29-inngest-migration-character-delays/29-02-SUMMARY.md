---
phase: 29-inngest-migration-character-delays
plan: 02
subsystem: database, domain
tags: [supabase, migration, messages, processed_by_agent, partial-index]

# Dependency graph
requires:
  - phase: none (standalone infra addition)
    provides: existing messages table
provides:
  - processed_by_agent BOOLEAN column on messages table
  - partial index idx_messages_unprocessed_inbound for pre-send check queries
  - domain receiveMessage inserts inbound with processed_by_agent: false
affects:
  - 29-03 (webhook handler marks messages as processed)
  - 31 (pre-send check queries unprocessed inbound messages)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "processed_by_agent flag: DEFAULT true for existing rows, explicit false on new inbound insert"

key-files:
  created:
    - supabase/migrations/20260224100000_processed_by_agent.sql
  modified:
    - src/lib/domain/messages.ts

key-decisions:
  - "DEFAULT true for existing rows preserves correct semantics (already processed)"
  - "Partial index on (conversation_id, created_at) WHERE inbound AND not processed for efficient pre-send check"

patterns-established:
  - "Inbound message lifecycle: insert with processed_by_agent=false, agent marks true after processing"

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 29 Plan 02: Processed-by-Agent Column + Domain Insert Summary

**Added processed_by_agent BOOLEAN column to messages table with partial index for unprocessed inbound queries, domain receiveMessage inserts with false**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T22:56:11Z
- **Completed:** 2026-02-23T22:59:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- DB migration adds `processed_by_agent BOOLEAN NOT NULL DEFAULT true` with IF NOT EXISTS idempotency
- Partial index `idx_messages_unprocessed_inbound` on `(conversation_id, created_at)` WHERE direction='inbound' AND processed_by_agent=false
- Domain `receiveMessage` inserts inbound messages with `processed_by_agent: false`
- TypeScript compiles without new errors

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration for processed_by_agent column** - `d36a56e` (feat)
2. **Task 2: Domain layer insert with processed_by_agent: false** - `1fbbfe1` (feat)

## Files Created/Modified
- `supabase/migrations/20260224100000_processed_by_agent.sql` - Migration adding processed_by_agent column + partial index
- `src/lib/domain/messages.ts` - receiveMessage now sets processed_by_agent: false on inbound insert

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Migration must be applied to Supabase (tracked in pending todos).

## Next Phase Readiness
- Column exists, domain layer writes false on insert
- Ready for Plan 29-03 to wire webhook handler marking messages as processed (processed_by_agent = true)
- Ready for Phase 31 pre-send check to query unprocessed inbound messages via partial index

---
*Phase: 29-inngest-migration-character-delays*
*Completed: 2026-02-23*
