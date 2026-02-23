---
phase: 29-inngest-migration-character-delays
plan: 04
subsystem: agents
tags: [whatsapp, messaging, delay, typing-simulation, char-delay]

# Dependency graph
requires:
  - phase: 29-01
    provides: calculateCharDelay pure function (char-delay.ts)
provides:
  - ProductionMessagingAdapter with character-based typing delays
  - Human-like first-message delay (no more instant first response)
affects: [30-message-classification-silence-timer, 31-pre-send-check]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Character-based delay: calculateCharDelay(content.length) * responseSpeed replaces fixed delaySeconds"
    - "First message delay: all messages in sequence get typing delay, not just subsequent ones"

key-files:
  created: []
  modified:
    - src/lib/agents/engine-adapters/production/messaging.ts

key-decisions:
  - "template.delaySeconds preserved in type but ignored in delay calculation"
  - "First message gets delay too (removed i > 0 guard) for more human-like behavior"

patterns-established:
  - "Delay pattern: calculateCharDelay(charCount) * responseSpeed for all bot messages"

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 29 Plan 04: Character-Based Delays in Messaging Adapter Summary

**ProductionMessagingAdapter now uses logarithmic character-count delays (2s-12s) instead of fixed delaySeconds, with first-message delay for human-like typing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T23:02:39Z
- **Completed:** 2026-02-23T23:07:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced fixed `template.delaySeconds` with `calculateCharDelay(content.length)` in the messaging adapter
- First message in a sequence now gets a typing delay (removed `i > 0` guard)
- responseSpeed multiplier preserved: 0=instant, 0.2=fast, 1.0=real
- template.delaySeconds field preserved in type for backward compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace fixed delay with calculateCharDelay in messaging adapter** - `7df3ef2` (feat)

## Files Created/Modified
- `src/lib/agents/engine-adapters/production/messaging.ts` - Updated delay logic to use character-based calculation, added import of calculateCharDelay, updated file header comment

## Decisions Made
- Preserved `delaySeconds` in the template type definition (line 75) since it exists in the database and may be referenced by other code. Simply no longer used for delay calculation.
- Removed the `i > 0` condition so the first message also gets a delay, simulating the bot "reading" the customer's message before responding.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Character delay system complete (29-01 pure function + 29-04 adapter integration)
- Ready for Phase 30 (message classification + silence timer) which builds on the Inngest migration
- The adapter will work with the existing direct-call path and the new Inngest path once 29-03 is deployed

---
*Phase: 29-inngest-migration-character-delays*
*Completed: 2026-02-23*
