---
phase: 30-message-classification-silence-timer
plan: 01
subsystem: agents
tags: [intents, classification, inngest, state-machine, somnio]

# Dependency graph
requires:
  - phase: 14-agente-ventas-somnio
    provides: "IntentDefinition type, SOMNIO_INTENTS array, SOMNIO_STATES, SOMNIO_TRANSITIONS"
  - phase: 29-inngest-migration-character-delays
    provides: "Inngest-based agent processing pipeline"
provides:
  - "3 new HANDOFF intents (asesor, queja, cancelar) in SOMNIO_INTENTS"
  - "HANDOFF_INTENTS, CONFIRMATORY_MODES, ACKNOWLEDGMENT_PATTERNS constants"
  - "agent/silence.detected event type in AgentEvents"
  - "bienvenida state in SOMNIO_STATES with handoff transition"
affects:
  - 30-02 (message-category-classifier imports constants)
  - 30-03 (silence timer uses agent/silence.detected event)
  - 31 (pre-send check uses classification categories)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Escape-category intents for handoff triggers (asesor, queja, cancelar)"
    - "Set-based constant lookups for O(1) classification checks"
    - "Regex patterns array for acknowledgment matching"

key-files:
  created: []
  modified:
    - src/lib/agents/somnio/intents.ts
    - src/lib/agents/somnio/constants.ts
    - src/inngest/events.ts
    - src/lib/agents/somnio/config.ts
    - src/lib/agents/somnio/interruption-handler.ts

key-decisions:
  - "no_gracias intent NOT created -- existing no_interesa covers polite refusals"
  - "fallback triggers emptied -- overlapping keywords moved to dedicated asesor intent"
  - "ACKNOWLEDGMENT_PATTERNS uses regex array (not Set) for pattern matching flexibility"
  - "bienvenida added to SOMNIO_STATES for explicit state machine correctness"

patterns-established:
  - "Handoff intents use category: escape (not flujo_compra)"
  - "Classification constants in constants.ts with zero imports (circular dep prevention)"

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 30 Plan 01: Foundation Definitions Summary

**3 HANDOFF intents (asesor/queja/cancelar), classification constants (HANDOFF_INTENTS/CONFIRMATORY_MODES/ACKNOWLEDGMENT_PATTERNS), agent/silence.detected event, and bienvenida state with transitions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-24T01:38:01Z
- **Completed:** 2026-02-24T01:46:00Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Added 3 new escape-category intents (asesor, queja, cancelar) to SOMNIO_INTENTS bringing total to 36
- Created HANDOFF_INTENTS, CONFIRMATORY_MODES, and ACKNOWLEDGMENT_PATTERNS constants for Plan 02 classifier
- Defined agent/silence.detected event type in AgentEvents for Plan 03 timer
- Added bienvenida state to SOMNIO_STATES/SOMNIO_TRANSITIONS with handoff as valid target
- De-duplicated fallback intent by removing triggers/examples that now belong to asesor
- Fixed no_gracias -> no_interesa in interruption-handler.ts (no_gracias intent does not exist)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 3 HANDOFF intents + classification constants** - `b02509f` (feat)
2. **Task 2: Add silence event type + update state transitions** - `1118982` (feat)

## Files Created/Modified

- `src/lib/agents/somnio/intents.ts` - Added INTENTS_HANDOFF array (asesor, queja, cancelar), de-duplicated fallback
- `src/lib/agents/somnio/constants.ts` - Added HANDOFF_INTENTS, CONFIRMATORY_MODES, ACKNOWLEDGMENT_PATTERNS
- `src/inngest/events.ts` - Added agent/silence.detected event to AgentEvents
- `src/lib/agents/somnio/config.ts` - Added bienvenida to SOMNIO_STATES and SOMNIO_TRANSITIONS
- `src/lib/agents/somnio/interruption-handler.ts` - Fixed no_gracias -> no_interesa

## Decisions Made

- **no_gracias NOT created:** The existing no_interesa intent already has examples "No gracias", "Gracias pero no", "No quiero nada" and is mapped to handoff in somnio-orchestrator.ts. Creating no_gracias would produce ambiguous overlap.
- **fallback de-duplicated:** Removed 'hablar con', 'llamar', 'asesor', 'humano' triggers and corresponding examples from fallback since they now belong to the dedicated asesor intent. Added neutral unclassifiable examples instead.
- **bienvenida state added explicitly:** Although agent code uses `currentMode ?? 'bienvenida'` as default, the state was not in SOMNIO_STATES. Added for state machine correctness and to ensure handoff transition is valid from first contact.
- **Intent count is 36 (not 34):** Plan miscounted base intents as 20; actual is 22 (13 informativos + 7 flujo_compra + 1 no_interesa + 1 fallback). Corrected comment to 22 base + 3 handoff + 11 combinations = 36.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed no_gracias reference in interruption-handler.ts**
- **Found during:** Task 1 (searching for existing references)
- **Issue:** interruption-handler.ts CONFLICTING_INTENTS set contained 'no_gracias' which is a non-existent intent name. Should be 'no_interesa'.
- **Fix:** Changed 'no_gracias' to 'no_interesa' in the Set
- **Files modified:** src/lib/agents/somnio/interruption-handler.ts
- **Verification:** grep confirms no remaining no_gracias references in intents system
- **Committed in:** b02509f (Task 1 commit)

**2. [Rule 1 - Bug] Fixed intent count in comments**
- **Found during:** Task 1 (counting actual intent definitions)
- **Issue:** Plan said "20 base + 3 handoff + 11 combinations = 34" but actual base is 22 (13+7+1+1), making total 36
- **Fix:** Updated file header and SOMNIO_INTENTS comment to reflect accurate count
- **Files modified:** src/lib/agents/somnio/intents.ts
- **Committed in:** b02509f (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All foundation definitions in place for Plan 02 (message-category-classifier)
- HANDOFF_INTENTS, CONFIRMATORY_MODES, ACKNOWLEDGMENT_PATTERNS ready to import
- agent/silence.detected event type ready for Plan 03 (silence timer Inngest function)
- bienvenida state ensures handoff is valid from any state including first contact

---
*Phase: 30-message-classification-silence-timer*
*Completed: 2026-02-24*
