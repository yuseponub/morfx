---
phase: standalone/debug-panel-v4
plan: 01
subsystem: debug-panel
tags: [debug-adapter, debug-turn, sandbox, typescript-types, agent-pipeline]

# Dependency graph
requires:
  - phase: 16.1 Engine Unification
    provides: DebugAdapter interface, SandboxDebugAdapter, ProductionDebugAdapter, DebugTurn type
  - phase: 30 Message Classification
    provides: classifyMessage(), HANDOFF_INTENTS, LOW_CONFIDENCE_THRESHOLD, ACKNOWLEDGMENT_PATTERNS
  - phase: 35 Flujo Ofi Inter
    provides: detectOfiInterMention(), isRemoteMunicipality(), isCollectingDataMode()
provides:
  - Extended DebugTurn type with 11 new optional v4.0 fields
  - Extended DebugAdapter interface with 11 new record methods
  - SandboxDebugAdapter implementing all 15 record methods
  - ProductionDebugAdapter with 15 no-op stubs
  - SomnioAgentOutput with 7 debug fields populated at each pipeline gate
  - DebugPanelTabId updated (pipeline, classify, bloques added; intent removed)
  - 11 new debug sub-types exported from sandbox/types.ts
affects:
  - dp4-02 (engine instrumentation — calls the new record methods)
  - dp4-03 (tab infrastructure — uses new DebugPanelTabId values)
  - dp4-04 (pipeline tab — reads new DebugTurn fields)
  - dp4-05 (classify and bloques tabs — reads new DebugTurn fields)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Debug data flows through SomnioAgentOutput (not separate channels)"
    - "All debug fields optional for backward compatibility with saved sessions"
    - "rulesChecked object reconstructs classifier logic for debug visibility"

key-files:
  created: []
  modified:
    - src/lib/sandbox/types.ts
    - src/lib/agents/engine/types.ts
    - src/lib/agents/engine-adapters/sandbox/debug.ts
    - src/lib/agents/engine-adapters/production/debug.ts
    - src/lib/agents/somnio/somnio-agent.ts

key-decisions:
  - "Debug data flows through agentOutput, not via separate channels (architectural pattern from RESEARCH.md)"
  - "All new DebugTurn fields are optional for backward compatibility with saved sessions"
  - "rulesChecked object re-evaluates all 4 classifier rules for full debug visibility"
  - "Template selection info reconstructed from orchestrator result (orchestrator doesnt expose selection internals)"
  - "Transition validation inferred from orchestrator result (orchestrator doesnt expose validation result)"
  - "Ofi Inter Route 2 captured in handleIngestMode earlyReturn (ask_ofi_inter action)"
  - "Paraphrasing debug DEFERRED (no recordParaphrasing method or engine capture exists yet)"

patterns-established:
  - "Debug tracking variables initialized at processMessage start, populated at each gate"
  - "Early returns attach available debug data before returning"
  - "Internal result types (IngestModeResult, ImplicitYesResult) extended with debug fields"

# Metrics
duration: 12min
completed: 2026-02-26
---

# Debug Panel v4.0 Plan 01: Data Pipeline Foundation Summary

**Extended DebugTurn with 11 optional fields, DebugAdapter with 11 new record methods, SomnioAgentOutput with 7 debug fields populated at each pipeline gate (classification, ofiInter, ingestDetails, templateSelection, transitionValidation, orchestration, disambiguationLog)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-26T01:18:04Z
- **Completed:** 2026-02-26T01:30:36Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Complete data pipeline foundation: types defined, adapters ready, agent produces debug data
- 11 new debug sub-types exported (DebugClassification, DebugBlockComposition, DebugNoRepetition, DebugOfiInter, DebugPreSendCheck, DebugTemplateSelection, DebugTransitionValidation, DebugOrchestration, DebugIngestDetails, DebugDisambiguationLog)
- SomnioAgent populates 7 debug fields at correct pipeline points, including early returns (SILENCIOSO, HANDOFF, ofi inter, ingest silent)
- DebugPanelTabId updated with 3 new tabs (pipeline, classify, bloques) replacing intent

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend DebugTurn type + DebugPanelTabId + new debug sub-types** - `f9c0eb2` (feat)
2. **Task 2: Extend DebugAdapter interface + both adapter implementations** - `4abd247` (feat)
3. **Task 3: Extend SomnioAgentOutput with debug fields and populate them** - `4e1ad53` (feat)

## Files Created/Modified
- `src/lib/sandbox/types.ts` - Extended DebugTurn with 11 v4.0 fields, updated DebugPanelTabId, added 11 debug sub-types
- `src/lib/agents/engine/types.ts` - Extended DebugAdapter interface with 11 new record methods
- `src/lib/agents/engine-adapters/sandbox/debug.ts` - Implemented all 11 new record methods with fields, getDebugTurn(), reset()
- `src/lib/agents/engine-adapters/production/debug.ts` - Added 11 no-op stubs
- `src/lib/agents/somnio/somnio-agent.ts` - Extended SomnioAgentOutput with 7 debug fields, populated at each pipeline gate

## Decisions Made
- Debug data flows through SomnioAgentOutput (not via separate channels) per RESEARCH.md architectural insight
- All new DebugTurn fields are optional (`?:`) for backward compatibility with saved localStorage sessions
- `rulesChecked` object re-evaluates all 4 classifier rules (rule1 HANDOFF_INTENTS, rule1_5 LOW_CONFIDENCE, rule2 ACKNOWLEDGMENT, rule3 default) for full debug visibility in the classify tab
- Template selection info reconstructed from orchestrator result since the orchestrator doesn't expose internal selection details directly
- Transition validation inferred from orchestrator result (allowed = has response or templates)
- Ofi Inter Route 2 captured in handleIngestMode's ask_ofi_inter early return path
- DebugParaphrasing DEFERRED because no recordParaphrasing() method or engine capture exists yet

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Expected TypeScript errors in debug-tabs.tsx, panel-container.tsx, and tab-bar.tsx due to removed 'intent' tab ID. These are planned to be fixed in Plan 03 (tab infrastructure).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data pipeline foundation complete: types, adapters, and agent output are ready
- Plan 02 (engine instrumentation) can now call the new record methods at correct pipeline points
- Plans 03-05 (frontend tabs) can read the new DebugTurn fields
- 3 expected TS errors in tab UI files will be resolved in Plan 03

---
*Phase: standalone/debug-panel-v4*
*Completed: 2026-02-26*
