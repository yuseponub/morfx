---
phase: 33-confidence-routing-disambiguation-log
plan: 02
subsystem: agents
tags: [somnio, disambiguation, logging, fire-and-forget, timer-fix]

# Dependency graph
requires:
  - phase: 33-confidence-routing-disambiguation-log-01
    provides: disambiguation_log table, Rule 1.5 with low_confidence reason string
provides:
  - logDisambiguation async helper with DisambiguationLogInput type
  - Fire-and-forget disambiguation logging in somnio-agent step 5.5 HANDOFF path
  - Step 7 timer cancel fix (phantom timer prevention)
affects:
  - 34-no-repetition-system (somnio-agent pipeline unchanged for high-confidence flow)
  - Future disambiguation training (human reviewers fill correct_intent/action/guidance)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget logging: logFn({...}).catch(err => console.warn(...)) for non-blocking audit writes"
    - "Admin client direct write for diagnostic tables (not domain layer)"

key-files:
  created:
    - src/lib/agents/somnio/log-disambiguation.ts
  modified:
    - src/lib/agents/somnio/somnio-agent.ts

key-decisions:
  - "Fire-and-forget pattern: .catch() ensures handoff proceeds regardless of log failure"
  - "Only low-confidence handoffs logged (reason.startsWith('low_confidence:'))"
  - "Admin client direct write (not domain layer) for audit/diagnostic data"
  - "Last 10 conversation turns captured (input.history.slice(-10))"
  - "Step 7 timer cancel fix: empty array -> [{type: 'cancel', reason: 'handoff'}]"

patterns-established:
  - "Fire-and-forget audit logging: async fn with .catch() for non-blocking writes"
  - "Timer cancel on all handoff paths (step 5.5 and step 7)"

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 33 Plan 02: Disambiguation Logging + Timer Fix Summary

**logDisambiguation fire-and-forget helper wired into somnio-agent step 5.5 HANDOFF path for low-confidence training data, plus step 7 phantom timer bug fix**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T18:58:47Z
- **Completed:** 2026-02-24T19:04:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created logDisambiguation helper that inserts all 13 context fields into disambiguation_log
- Wired fire-and-forget call in somnio-agent step 5.5 for low-confidence HANDOFF only
- Fixed step 7 phantom timer bug: handoff now sends cancel signal (was empty array)
- Human reviewers can now fill correct_intent, correct_action, guidance_notes in Supabase dashboard

## Task Commits

Each task was committed atomically:

1. **Task 1: Create logDisambiguation helper** - `8947b1c` (feat)
2. **Task 2: Wire disambiguation log into step 5.5 + fix step 7 timer** - `1d638cd` (feat)

## Files Created/Modified
- `src/lib/agents/somnio/log-disambiguation.ts` - DisambiguationLogInput type + async insert helper
- `src/lib/agents/somnio/somnio-agent.ts` - Import + fire-and-forget call in step 5.5, timer cancel in step 7

## Decisions Made
- Fire-and-forget pattern: .catch() ensures handoff proceeds regardless of Supabase insert failure
- Only low-confidence handoffs trigger logging (reason.startsWith('low_confidence:')), not intent-based handoffs (asesor/queja)
- Admin client direct write for disambiguation_log (audit/diagnostic table, same pattern as production/storage.ts)
- Conversation history captured as raw last 10 turns (input.history.slice(-10)), no LLM summarization
- pending_templates accessed via double cast (as unknown as Record<string, unknown>) since it's a dynamic Phase 31 field
- Step 7 timer fix: was `timerSignals: []`, now `timerSignals: [{ type: 'cancel', reason: 'handoff' }]`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript cast for pending_templates access**
- **Found during:** Task 2 (wiring logDisambiguation call)
- **Issue:** Plan specified `(input.session.state as Record<string, unknown>)` but SessionState type doesn't overlap with Record<string, unknown>, causing TS2352
- **Fix:** Changed to double cast `(input.session.state as unknown as Record<string, unknown>)`
- **Files modified:** src/lib/agents/somnio/somnio-agent.ts
- **Verification:** `npx tsc --noEmit` passes with no errors in somnio-agent.ts
- **Committed in:** 1d638cd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type cast adjustment for TypeScript correctness. No scope creep.

## Issues Encountered
None

## User Setup Required

**Migration must be applied to production before pushing these code changes** (Regla 5).

The migration from Plan 01 (`supabase/migrations/20260302000000_disambiguation_log.sql`) creates the `disambiguation_log` table that this code writes to.

## Next Phase Readiness
- Phase 33 complete: confidence routing + disambiguation logging fully operational
- Low-confidence handoffs (<80%) now logged with full context for human review
- All handoff paths (step 5.5 and step 7) cancel active timers
- Ready for Phase 34: No-Repetition System

---
*Phase: 33-confidence-routing-disambiguation-log*
*Completed: 2026-02-24*
