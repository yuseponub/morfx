---
phase: 29-inngest-migration-character-delays
plan: 03
subsystem: api, whatsapp, agents
tags: [inngest, feature-flag, webhook, async-processing, agent-production]

# Dependency graph
requires:
  - phase: 29-02
    provides: processed_by_agent column on messages table + domain insert with false
  - phase: 16
    provides: webhook-handler agent routing + processMessageWithAgent + Inngest function
provides:
  - Feature-flagged webhook handler (USE_INNGEST_PROCESSING) for async agent processing
  - processed_by_agent lifecycle (false on insert, true after processing)
  - Inngest error visibility (error messages written to conversation)
  - Inline fallback safety net when Inngest is unreachable
affects: [29-04, 30, 31]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Feature flag pattern: USE_INNGEST_PROCESSING env var for instant rollback"
    - "Inngest send fallback: try/catch with inline processing as safety net"
    - "processAgentInline helper: DRY extraction for shared inline/fallback path"

key-files:
  modified:
    - src/lib/whatsapp/webhook-handler.ts
    - src/lib/agents/production/webhook-processor.ts
    - src/inngest/functions/agent-production.ts

key-decisions:
  - "Extracted processAgentInline helper for DRY between inline and fallback paths"
  - "Reused existing contactId variable (line 216) instead of redundant convData query"
  - "processed_by_agent marks ALL unprocessed inbound messages (batch case)"

patterns-established:
  - "Feature flag env var for async/sync switching: process.env.USE_INNGEST_PROCESSING === 'true'"
  - "Inngest send with fallback: always wrap in try/catch with inline fallback"

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 29 Plan 03: Inngest Webhook Processor + Feature Flag Summary

**Feature-flagged webhook handler emitting Inngest events for async agent processing with inline fallback safety net and processed_by_agent lifecycle**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T23:02:22Z
- **Completed:** 2026-02-23T23:05:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Webhook handler branches between Inngest async path (~200ms return) and inline processing via USE_INNGEST_PROCESSING feature flag
- Inngest send failure automatically falls back to inline processing (no message goes unprocessed)
- processMessageWithAgent marks all unprocessed inbound messages as processed_by_agent=true after completion
- Inngest function writes [ERROR AGENTE] messages to conversation for error visibility (parity with inline path)

## Task Commits

Each task was committed atomically:

1. **Task 1: Feature-flag webhook handler for Inngest emission** - `1f20604` (feat)
2. **Task 2: Update processMessageWithAgent + Inngest function for processed_by_agent** - `3e6dbe8` (feat)

## Files Created/Modified
- `src/lib/whatsapp/webhook-handler.ts` - Feature-flagged agent routing (Inngest async vs inline), extracted processAgentInline helper
- `src/lib/agents/production/webhook-processor.ts` - Added processed_by_agent=true update after agent processing
- `src/inngest/functions/agent-production.ts` - Added write-error-message step for error visibility

## Decisions Made
- Extracted `processAgentInline` helper function to share code between the inline path (flag off) and the Inngest-send-failure fallback path, eliminating duplication
- Reused the existing `contactId` variable (already queried at line 216) instead of the redundant `convData` query that was in the original inline path
- `processed_by_agent` update marks ALL unprocessed inbound messages in the conversation (not just the triggering one), handling the batch case where multiple messages arrive before agent starts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Environment variable for production activation:**
- Set `USE_INNGEST_PROCESSING=true` in Vercel to enable async processing
- Omit or set to `false` to keep inline processing (safe default)

## Next Phase Readiness
- Webhook handler ready for async agent processing when USE_INNGEST_PROCESSING=true
- processed_by_agent lifecycle complete: false on insert (Plan 02), true after processing (this plan)
- Ready for Plan 04: character delay integration into WhatsApp send adapter

---
*Phase: 29-inngest-migration-character-delays*
*Completed: 2026-02-23*
