---
phase: 30-message-classification-silence-timer
plan: 02
subsystem: agents
tags: [classification, somnio, message-routing, silence-detection, handoff]

# Dependency graph
requires:
  - phase: 30-01
    provides: "HANDOFF_INTENTS, CONFIRMATORY_MODES, ACKNOWLEDGMENT_PATTERNS constants"
  - phase: 16-engine-unification
    provides: "SomnioAgent processMessage pipeline, UnifiedEngine adapter pattern, TimerAdapter interface"
provides:
  - "classifyMessage() pure function: (intent, confidence, mode, message) -> RESPONDIBLE | SILENCIOSO | HANDOFF"
  - "Step 5.5 in SomnioAgent pipeline: classification after IntentDetector, before orchestrator"
  - "SILENCIOSO early return: messages=[], silenceDetected=true"
  - "HANDOFF early return: newMode='handoff', timerSignals=[cancel]"
  - "onSilenceDetected hook on TimerAdapter interface"
  - "UnifiedEngine silence detection wiring via timer adapter"
affects:
  - 30-03 (silence timer Inngest function implements onSilenceDetected adapter)
  - 31 (pre-send check may use classification categories)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure function classifier with deterministic rule ordering (HANDOFF > SILENCIOSO > RESPONDIBLE)"
    - "Early return pattern at step 5.5 to skip orchestrator for non-respondible messages"
    - "silenceDetected flag propagation: agent -> engine -> timer adapter hook"

key-files:
  created:
    - src/lib/agents/somnio/message-category-classifier.ts
  modified:
    - src/lib/agents/somnio/somnio-agent.ts
    - src/lib/agents/engine/unified-engine.ts
    - src/lib/agents/engine/types.ts

key-decisions:
  - "Rule 2 (SILENCIOSO) checks raw message text, not intent name -- IntentDetector maps 'ok' to varying intents by context"
  - "Rule 2 does not check confidence -- CONFIRMATORY_MODES guard is sufficient"
  - "Step 5.5 placed after step 6 (intentsVistos update) to use newIntentsVistos in early returns"
  - "Existing step 7 handoff preserved as safety net for low-confidence fallback path"
  - "HANDOFF early return includes timerSignals=[cancel:handoff] to stop any active timers"

patterns-established:
  - "Classification at step 5.5: post-intent, pre-orchestrator gate"
  - "silenceDetected boolean flag on agent output for engine-level hook dispatch"
  - "Optional adapter methods with guard pattern: if (flag && adapter.method) await adapter.method()"

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 30 Plan 02: Message Category Classifier Summary

**Pure classifyMessage() function with 3-rule deterministic logic (HANDOFF/SILENCIOSO/RESPONDIBLE) integrated at SomnioAgent step 5.5, plus UnifiedEngine onSilenceDetected timer adapter hook**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-24T01:50:37Z
- **Completed:** 2026-02-24T01:58:25Z
- **Tasks:** 2/2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Created message-category-classifier.ts with pure classifyMessage() function implementing 3-rule deterministic classification
- Integrated classifier at step 5.5 in SomnioAgent processMessage pipeline (after IntentDetector, before orchestrator)
- SILENCIOSO messages return early with empty messages and silenceDetected=true (no bot response)
- HANDOFF messages return early with newMode='handoff' and cancel timer signal
- Added onSilenceDetected hook to TimerAdapter interface for production Inngest event emission
- Wired UnifiedEngine to call onSilenceDetected when agentOutput.silenceDetected is true

## Task Commits

Each task was committed atomically:

1. **Task 1: Create message-category-classifier.ts** - `dd855ef` (feat)
2. **Task 2: Integrate classifier into SomnioAgent pipeline + wire engine** - `2391d3f` (feat)

## Files Created/Modified

- `src/lib/agents/somnio/message-category-classifier.ts` - New pure function classifier with HANDOFF/SILENCIOSO/RESPONDIBLE rules
- `src/lib/agents/somnio/somnio-agent.ts` - Added classifyMessage import, silenceDetected field, step 5.5 classification with SILENCIOSO and HANDOFF early returns
- `src/lib/agents/engine/types.ts` - Added onSilenceDetected method to TimerAdapter interface
- `src/lib/agents/engine/unified-engine.ts` - Added silence detection hook call after timer lifecycle hooks

## Decisions Made

- **Rule 2 checks raw message text, not intent:** IntentDetector classifies "ok" as various intents depending on context (compra_confirmada, fallback, etc.). Using the raw message text catches bare acknowledgments regardless of intent classification. The CONFIRMATORY_MODES guard ensures "ok" in resumen/collecting_data/confirmado still reaches the orchestrator.
- **Step 5.5 after step 6:** The classifier needs newIntentsVistos (declared in step 6) for state updates in early returns. Placing it after step 6 ensures the early return outputs have correct intentsVistos.
- **Step 7 handoff preserved:** Step 5.5 handles HANDOFF_INTENTS by intent name. Step 7 handles low-confidence fallback (action='handoff' from IntentDetector). Non-overlapping paths, both produce newMode='handoff'.
- **HANDOFF early return sends cancel timer signal:** When transferring to human, any active silence/ingest timer should stop.
- **_confidence parameter reserved:** The confidence parameter is accepted but unused (prefixed with underscore). Rule 2 intentionally does not use confidence. Reserved for potential future Rule 2.5 (confidence-based routing).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Classifier is in place and integrated into the agent pipeline
- onSilenceDetected hook is defined but not yet implemented by any adapter (Plan 03 will implement the Inngest production adapter)
- Sandbox TimerAdapter does not need onSilenceDetected (optional method, gracefully skipped)
- The SILENCIOSO early return produces messages=[] which the engine correctly skips for messaging (existing guard at line 235)

---
*Phase: 30-message-classification-silence-timer*
*Completed: 2026-02-24*
