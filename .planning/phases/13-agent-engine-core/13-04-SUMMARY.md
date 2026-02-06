---
phase: 13-agent-engine-core
plan: 04
subsystem: api
tags: [claude, intent-detection, orchestration, state-machine, confidence-routing]

# Dependency graph
requires:
  - phase: 13-02
    provides: SessionManager for session state access
  - phase: 13-03
    provides: ClaudeClient for detectIntent and orchestrate calls
provides:
  - IntentDetector class with detect method and confidence routing
  - Orchestrator class with state transition validation
  - DEFAULT_INTENT_PROMPT for sales agent intent classification
  - DEFAULT_ORCHESTRATOR_PROMPT for sales flow orchestration
affects: [13-05-agent-engine, 13-06-tests, 14-agente-ventas-somnio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Confidence-based action routing (85/60/40 thresholds)
    - State machine transition validation
    - Automatic handoff/clarify responses without Claude call

key-files:
  created:
    - src/lib/agents/intent-detector.ts
    - src/lib/agents/orchestrator.ts
  modified:
    - src/lib/agents/types.ts
    - src/lib/agents/errors.ts
    - src/lib/agents/index.ts

key-decisions:
  - "ConfidenceAction type and DEFAULT_CONFIDENCE_THRESHOLDS added to types.ts"
  - "IntentDetectionError added to errors.ts for intent-specific failures"
  - "Handoff and clarify actions handled locally without Claude call to save tokens"
  - "Clarification response includes intent alternatives when available"

patterns-established:
  - "Confidence routing: >= 85 proceed, 60-84 reanalyze, 40-59 clarify, < 40 handoff"
  - "State transitions: conversacion -> collecting_data -> ofrecer_promos -> resumen -> compra_confirmada"
  - "Minimum data validation: nombre, telefono, ciudad, direccion required before ofrecer_promos"

# Metrics
duration: 7min
completed: 2026-02-06
---

# Phase 13 Plan 04: Intent Detector & Orchestrator Summary

**IntentDetector with Spanish sales prompts and Orchestrator with state machine validation for sales flow control**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-06T03:09:57Z
- **Completed:** 2026-02-06T03:16:19Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- IntentDetector classifies customer messages with confidence scores (0-100%)
- Confidence thresholds route to correct action: proceed (85+), reanalyze (60-84), clarify (40-59), handoff (<40)
- Orchestrator validates state transitions and enforces sales flow rules
- Automatic handoff/clarify responses without Claude call to save tokens
- Spanish prompts tailored for sales agent use case

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Intent Detector component** - `e03c07d` (feat)
2. **Task 2: Create Orchestrator component** - `4d05bf3` (feat)

## Files Created/Modified
- `src/lib/agents/intent-detector.ts` - IntentDetector class with detect method and DEFAULT_INTENT_PROMPT
- `src/lib/agents/orchestrator.ts` - Orchestrator class with state validation and DEFAULT_ORCHESTRATOR_PROMPT
- `src/lib/agents/types.ts` - Added ConfidenceAction type and DEFAULT_CONFIDENCE_THRESHOLDS constant
- `src/lib/agents/errors.ts` - Added IntentDetectionError class
- `src/lib/agents/index.ts` - Added exports for IntentDetector, Orchestrator, and related types

## Decisions Made
- Added ConfidenceAction type and DEFAULT_CONFIDENCE_THRESHOLDS to types.ts (missing types needed by IntentDetector)
- Added IntentDetectionError to errors.ts (specific error class for intent detection failures)
- Handoff and clarify actions are handled locally without calling Claude to save tokens (low confidence doesn't need AI reasoning)
- Clarification response includes intent alternatives when available for better user guidance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing types to types.ts**
- **Found during:** Task 1 (Intent Detector implementation)
- **Issue:** Plan referenced ConfidenceAction and DEFAULT_CONFIDENCE_THRESHOLDS which didn't exist
- **Fix:** Added ConfidenceAction type and DEFAULT_CONFIDENCE_THRESHOLDS constant to types.ts, exported from index.ts
- **Files modified:** src/lib/agents/types.ts, src/lib/agents/index.ts
- **Verification:** TypeScript compiles, imports work correctly
- **Committed in:** e03c07d (Task 1 commit)

**2. [Rule 3 - Blocking] Added IntentDetectionError to errors.ts**
- **Found during:** Task 1 (Intent Detector implementation)
- **Issue:** Plan referenced IntentDetectionError which didn't exist in errors.ts
- **Fix:** Added IntentDetectionError class extending ClaudeApiError, exported from index.ts
- **Files modified:** src/lib/agents/errors.ts, src/lib/agents/index.ts
- **Verification:** TypeScript compiles, error class usable in intent-detector.ts
- **Committed in:** e03c07d (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes were missing types/errors that the plan assumed existed. No scope creep - just completing the necessary infrastructure.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- IntentDetector and Orchestrator components ready for integration
- AgentEngine (Plan 05) can now combine SessionManager, ClaudeClient, IntentDetector, and Orchestrator
- All types and errors in place for the full agent pipeline

---
*Phase: 13-agent-engine-core*
*Completed: 2026-02-06*
