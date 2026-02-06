---
phase: 14-agente-ventas-somnio
plan: 05
subsystem: agents
tags: [orchestrator, transition-validator, flow-control, somnio, state-machine]

# Dependency graph
requires:
  - phase: 14-01
    provides: somnioAgentConfig, SOMNIO_TRANSITIONS, intent definitions
  - phase: 14-02
    provides: DataExtractor for customer data extraction
  - phase: 14-03
    provides: TemplateManager for template selection and processing
  - phase: 14-04
    provides: MessageSequencer, InterruptionHandler
provides:
  - SomnioOrchestrator extending base Orchestrator with Somnio-specific flow logic
  - TransitionValidator for intent transition rules enforcement
  - Auto-trigger detection for ofrecer_promos at 8 fields
  - shouldCreateOrder flag for OrderCreator integration
affects: [14-06-somnio-engine, 16-whatsapp-agent-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Transition rules as declarative configuration (TRANSITION_RULES)
    - Auto-trigger pattern for state machine events
    - Pack detection via regex patterns
    - shouldCreateOrder flag pattern for downstream order creation

key-files:
  created:
    - src/lib/agents/somnio/transition-validator.ts
    - src/lib/agents/somnio/somnio-orchestrator.ts
  modified:
    - src/lib/agents/somnio/index.ts

key-decisions:
  - "resumen_* intents require ofrecer_promos seen first (CONTEXT.md rule)"
  - "compra_confirmada requires resumen_* seen first (CONTEXT.md rule)"
  - "ofrecer_promos auto-triggers when 8 fields complete (5 critical + 3 additional)"
  - "ofrecer_promos via timer when 5 critical fields + 2min inactive (Inngest)"
  - "shouldCreateOrder flag signals SomnioEngine to invoke OrderCreator (separation of concerns)"
  - "Pack detection via regex patterns supports natural language (quiero el de 2, dame el 3x, etc.)"

patterns-established:
  - "TransitionRule interface for declarative transition validation"
  - "TransitionResult with allowed/reason/suggestedIntent for user-friendly blocking"
  - "SomnioOrchestratorResult with shouldCreateOrder for cross-component signaling"
  - "PACK_PATTERNS array for extensible pack detection"

# Metrics
duration: 5min
completed: 2026-02-06
---

# Phase 14 Plan 05: Somnio Orchestrator Summary

**SomnioOrchestrator implementing Somnio-specific flow logic with TransitionValidator enforcing CONTEXT.md rules and auto-trigger detection**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-06T17:06:45Z
- **Completed:** 2026-02-06T17:11:05Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created TransitionValidator with declarative TRANSITION_RULES from CONTEXT.md
- Implemented resumen_* blocking without ofrecer_promos prerequisite
- Implemented compra_confirmada blocking without resumen prerequisite
- Auto-trigger detection for ofrecer_promos at 8 fields complete
- Timer-based promo trigger check for 5 critical fields (used by Inngest)
- Created SomnioOrchestrator integrating DataExtractor, TemplateManager, TransitionValidator
- Pack detection from message patterns (regex) and intent names
- shouldCreateOrder flag on compra_confirmada for OrderCreator integration
- Blocked transition responses with helpful user messages
- Mode determination following SOMNIO_TRANSITIONS state machine
- Tool call generation for crm.contact.update with extracted data
- State updates builder for intents, templates, datos, pack selection

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TransitionValidator** - `68f8727` (feat)
2. **Task 2: Create SomnioOrchestrator** - `991e2c9` (feat)

## Files Created/Modified

- `src/lib/agents/somnio/transition-validator.ts` - TransitionValidator class, TRANSITION_RULES, validateTransition
- `src/lib/agents/somnio/somnio-orchestrator.ts` - SomnioOrchestrator class, SomnioOrchestratorResult, pack detection
- `src/lib/agents/somnio/index.ts` - Export TransitionValidator, SomnioOrchestrator and types

## Decisions Made

1. **Transition validation before processing:** Validate intent transitions BEFORE processing to fail fast with helpful messages
2. **shouldCreateOrder flag:** Instead of building crm.order.create tool call directly, set a flag for SomnioEngine to handle via OrderCreator - cleaner separation of concerns
3. **Pack detection patterns:** Comprehensive regex patterns for natural language pack selection (quiero el de 2, dame el 3x, etc.)
4. **Auto-trigger precedence:** Auto-triggers (like ofrecer_promos at 8 fields) override the detected intent to ensure flow correctness
5. **Blocked transition responses:** User-friendly messages that guide customer to correct next step

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - execution proceeded smoothly.

## User Setup Required

None - components are pure code with no external dependencies.

## Next Phase Readiness

- SomnioOrchestrator ready for SomnioEngine to use as main orchestration logic
- TransitionValidator enforces CONTEXT.md rules at runtime
- Auto-trigger detection ready for Inngest timer workflows to use
- shouldCreateOrder flag pattern ready for OrderCreator integration
- Ready for Plan 14-06: SomnioEngine integration (final agent assembly)

---
*Phase: 14-agente-ventas-somnio*
*Completed: 2026-02-06*
