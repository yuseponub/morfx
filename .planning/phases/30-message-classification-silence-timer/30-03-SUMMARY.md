---
phase: 30-message-classification-silence-timer
plan: 03
subsystem: agents
tags: [inngest, timer, whatsapp, silence-detection, retake]

# Dependency graph
requires:
  - phase: 30-01
    provides: "agent/silence.detected event definition, ACKNOWLEDGMENT_PATTERNS constants"
  - phase: 29
    provides: "Inngest migration with USE_INNGEST_PROCESSING, character delays"
provides:
  - "silenceTimer Inngest function with 90s wait + retake message"
  - "ProductionTimerAdapter.onSilenceDetected hook emitting agent/silence.detected"
affects: [31-pre-send-check, 30-02-classifier-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Silence retake timer: settle 5s + waitForEvent 90s + sendWhatsAppMessage"
    - "is_agent_enabled guard before timer-triggered messages"

key-files:
  created: []
  modified:
    - src/inngest/functions/agent-timers.ts
    - src/lib/agents/engine-adapters/production/timer.ts

key-decisions:
  - "Retake message is a constant (not AI-generated) for predictability"
  - "90s timeout hardcoded (not configurable via workspace preset)"
  - "is_agent_enabled checked before sending to prevent retake after HANDOFF"
  - "Non-blocking onSilenceDetected: log failure but don't crash request"

patterns-established:
  - "Silence retake pattern: identical settle+waitForEvent+timeout as existing timers"
  - "Timer guard: always check is_agent_enabled before sending timer-triggered messages"

# Metrics
duration: 6min
completed: 2026-02-24
---

# Phase 30 Plan 03: Silence Retake Timer Summary

**90-second silence retake timer via Inngest with production adapter hook emitting agent/silence.detected**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-24T01:51:02Z
- **Completed:** 2026-02-24T01:57:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created silenceTimer Inngest function with proven settle+waitForEvent+timeout pattern
- Timer cancels on customer reply within 90s, sends warm retake message on timeout
- Added is_agent_enabled guard to prevent retake messages after HANDOFF
- Implemented onSilenceDetected hook in ProductionTimerAdapter emitting agent/silence.detected event
- Auto-registered via agentTimerFunctions array (no route.ts changes needed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create silenceTimer Inngest function** - `8edf0b2` (feat)
2. **Task 2: Implement onSilenceDetected hook in production timer adapter** - `7028b08` (feat)

## Files Created/Modified
- `src/inngest/functions/agent-timers.ts` - Added SILENCE_RETAKE_MESSAGE constant, silenceTimer function, registered in agentTimerFunctions array
- `src/lib/agents/engine-adapters/production/timer.ts` - Added onSilenceDetected method emitting agent/silence.detected event via Inngest

## Decisions Made
- **Constant retake message:** Used a warm promotional redirect constant rather than AI-generated text for predictability and zero-latency sending
- **90s hardcoded timeout:** Not configurable via workspace preset; the CONTEXT.md doesn't mention configurability and 90s is the designed value
- **is_agent_enabled guard:** Checks before sending retake to handle race condition where HANDOFF occurs after silence timer starts but before it fires
- **(inngest.send as any) assertion:** Per established codebase pattern for custom event types that Inngest's type system doesn't resolve

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Silence retake timer is fully wired: classifier (Plan 02) -> engine -> onSilenceDetected -> Inngest event -> silenceTimer function -> 90s wait -> retake message
- Plan 02 provides the classifier that sets silenceDetected=true, triggering this timer
- Ready for Phase 31 (Pre-Send Check + Interruption + Pending Merge)

---
*Phase: 30-message-classification-silence-timer*
*Completed: 2026-02-24*
