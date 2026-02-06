---
phase: 14-agente-ventas-somnio
plan: 04
subsystem: agents
tags: [message-sequencer, interruption-handler, delays, somnio]

# Dependency graph
requires:
  - phase: 14-03
    provides: ProcessedTemplate with delaySeconds field
provides:
  - MessageSequencer class for delayed message sending with abort
  - InterruptionHandler for detecting and managing interruptions
  - PendingMessage storage in session state
affects: [14-05-conversation-handler, 14-06-agent-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Message sequence with configurable delays (0-5 seconds)
    - Interruption detection via session last_activity_at
    - Pending messages stored in datos_capturados with special keys
    - Complementary vs conflicting intent classification

key-files:
  created:
    - src/lib/agents/somnio/interruption-handler.ts
    - src/lib/agents/somnio/message-sequencer.ts
  modified:
    - src/lib/agents/somnio/index.ts

key-decisions:
  - "Pending messages stored in datos_capturados with __pending_messages key as JSON string"
  - "Interruption detected when last_activity_at is within 2 seconds of current time"
  - "Complementary intents (precio, pago, envio, etc.) append pending, conflicting intents (asesor, queja) discard"
  - "setTimeout for delays in non-Inngest context (Inngest uses step.sleep)"

patterns-established:
  - "PendingMessage interface for interrupted sequence storage"
  - "MessageToSend and MessageSequence for sequence execution"
  - "SequenceStatus union type for tracking sequence state"
  - "mergeWithPending for resuming interrupted sequences"

# Metrics
duration: 4min
completed: 2026-02-06
---

# Phase 14 Plan 04: Message Sequencer Summary

**Delayed message sending with interruption detection and abort capability for Somnio agent**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-06
- **Completed:** 2026-02-06
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 1

## Accomplishments

- Created InterruptionHandler for detecting customer interruptions during message sequences
- Implemented PendingMessage storage in session state using special keys in datos_capturados
- Added complementary vs conflicting intent classification for deciding whether to append pending
- Created MessageSequencer for executing sequences with configurable delays
- Implemented checkForInterruption based on session last_activity_at comparison
- Added buildSequence method to convert ProcessedTemplates to MessageSequence
- Implemented mergeWithPending for resuming interrupted sequences
- Exported all types and classes from somnio module index

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Interruption Handler component** - `5f52230` (feat)
2. **Task 2: Create Message Sequencer component** - `d45b7fc` (feat)

## Files Created/Modified

- `src/lib/agents/somnio/interruption-handler.ts` - InterruptionHandler class, PendingMessage, InterruptionResult types
- `src/lib/agents/somnio/message-sequencer.ts` - MessageSequencer class, MessageToSend, MessageSequence, SequenceResult types
- `src/lib/agents/somnio/index.ts` - Export new components and types

## Decisions Made

1. **Pending storage location:** Using datos_capturados with __pending_messages key - keeps related data together and uses existing session state mechanism
2. **Interruption detection threshold:** 2 seconds window - balances sensitivity vs false positives
3. **Intent classification:** Complementary intents append pending (helpful info), conflicting intents (asesor, queja) discard pending
4. **Delay mechanism:** setTimeout in non-Inngest context - Inngest functions will use step.sleep for durability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - execution proceeded smoothly.

## User Setup Required

None - components are pure code with no external dependencies.

## Next Phase Readiness

- MessageSequencer ready for ConversationHandler to use for sending responses
- InterruptionHandler ready for detecting customer interruptions
- Pending message merging ready for appending complementary info
- Ready for Plan 14-05: Conversation Handler implementation

---
*Phase: 14-agente-ventas-somnio*
*Completed: 2026-02-06*
