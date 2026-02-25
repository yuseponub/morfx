# Phase 35 Plan 02: Agent Pipeline Integration Summary

---
phase: 35
plan: 02
subsystem: somnio-agent
tags: [ofi-inter, agent-pipeline, ingest-manager, orchestrator, route-detection]
dependency-graph:
  requires: [35-01]
  provides: [ofi-inter-detection-routes, mode-aware-ingest, mode-aware-orchestrator]
  affects: [35-03]
tech-stack:
  added: []
  patterns: [mode-aware-dispatch, route-based-detection, ask-before-assume]
key-files:
  created: []
  modified:
    - src/lib/agents/somnio/somnio-agent.ts
    - src/lib/agents/somnio/somnio-orchestrator.ts
    - src/lib/agents/somnio/ingest-manager.ts
decisions:
  - "Route 1 transitions immediately to collecting_data_inter (direct mention dominates)"
  - "Route 3 saves city but does NOT change mode (waits for customer answer)"
  - "Route 2 only fires in collecting_data mode (not collecting_data_inter)"
  - "Implicit yes always uses normal mode hasCriticalData (ofi inter only via explicit Routes 1-3)"
  - "IngestResult action union extended with ask_ofi_inter for Route 2"
  - "checkAutoTriggersForMode replaces checkAutoTriggers in orchestrator for mode-aware auto-trigger"
metrics:
  duration: ~10min
  completed: 2026-02-25
---

**One-liner:** Three ofi inter detection routes wired into SomnioAgent, mode-aware completion in IngestManager, and mode-aware auto-trigger in SomnioOrchestrator.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | SomnioAgent -- Ofi Inter Detection and State Handling | 6352224 | Route 1 + Route 3 detection, isCollectingDataMode guards, ask_ofi_inter handling, timer signal for inter mode |
| 2 | IngestManager + Orchestrator -- Mode-Aware Completion and Data Extraction | 29b17d8 | Route 2 in handleDatos/handleMixto, isDataComplete mode-aware checks, checkAutoTriggersForMode |

## What Was Built

### somnio-agent.ts (Routes 1 + 3 + ask_ofi_inter handler)
- **Route 1 (Step 4.5):** `detectOfiInterMention()` checks raw message before intent detection. On match, immediately transitions to `collecting_data_inter` and sends confirmation question.
- **Route 3 (Step 4.5):** Regex captures "envian a X?" pattern, checks `isRemoteMunicipality()`. On match, saves city to datos and asks delivery preference WITHOUT changing mode.
- **Step 3:** `isCollectingDataMode(currentMode)` replaces hardcoded `collecting_data` check -- ingest runs for both modes.
- **Step 4:** `!isCollectingDataMode(currentMode)` replaces hardcoded check -- implicit yes skips both collecting modes.
- **handleIngestMode:** Passes `mode` to IngestManager, uses `isCollectingDataMode` for active flag, handles `ask_ofi_inter` action.
- **Step 11a:** Timer start check uses `isCollectingDataMode(newMode) && !isCollectingDataMode(currentMode)` for both modes.

### ingest-manager.ts (Route 2 + mode-aware completion)
- **HandleMessageInput:** Added optional `mode` field.
- **IngestResult action:** Extended union with `'ask_ofi_inter'`.
- **handleDatos Route 2:** After extraction, if ciudad was just extracted AND no direccion/barrio exists AND mode is `collecting_data`, returns `ask_ofi_inter`.
- **handleMixto Route 2:** Same Route 2 logic as handleDatos.
- **handleDatos/handleMixto completion:** `isDataComplete(mergedData, mode)` replaces `hasCriticalData(mergedData)` -- 6 fields for inter, 8 for normal.

### somnio-orchestrator.ts (mode-aware auto-trigger + extraction)
- **Step 1:** `checkAutoTriggersForMode(intents, datos, currentMode)` replaces `checkAutoTriggers(intents, datos)` -- 6 fields for inter auto-promo, 8 for normal.
- **Step 3:** `isCollectingDataMode(currentMode)` replaces `currentMode === 'collecting_data'` -- data extraction runs in both modes.

### message-category-classifier.ts (no changes needed)
- Already uses `CONFIRMATORY_MODES.has(currentMode)` which includes `collecting_data_inter` (from Plan 01).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Type definitions moved to Task 1 for compilation**
- **Found during:** Task 1
- **Issue:** The plan specified adding `mode` to HandleMessageInput and `ask_ofi_inter` to IngestResult in Task 2, but somnio-agent.ts references both in Task 1, causing TypeScript errors.
- **Fix:** Added the type changes (HandleMessageInput.mode, IngestResult.action union) in Task 1 alongside the somnio-agent.ts changes so TypeScript compiles after each task.
- **Files modified:** src/lib/agents/somnio/ingest-manager.ts (types only, behavioral changes in Task 2)

## Decisions Made

1. **Route 1 immediate transition:** When customer says "ofi inter", mode transitions immediately to `collecting_data_inter` and sends confirmation question. The "confirmation" is still asked, but mode already changed -- if customer says "no", the system switches back (bidirectional transitions from Plan 01).
2. **Route 3 preserves mode:** Remote municipality detection saves the city but does NOT change mode. The answer to "domicilio o oficina?" determines the mode switch.
3. **Route 2 only in normal mode:** `ask_ofi_inter` only triggers in `collecting_data` mode. If already in `collecting_data_inter`, the customer already chose office pickup.
4. **Implicit yes uses normal mode:** `checkImplicitYes` always uses `hasCriticalData` (8-field normal mode). Ofi inter is only triggered via explicit detection routes, never via implicit data arrival.
5. **ask_ofi_inter is a new IngestResult action:** Rather than overloading 'silent' or 'respond', a dedicated action type makes the intent explicit and allows SomnioAgent's handleIngestMode to return the delivery preference question.

## Verification Results

- [x] `npx tsc --noEmit` passes (no new type errors)
- [x] Route 1: detectOfiInterMention in somnio-agent.ts triggers confirmation question
- [x] Route 2: IngestManager ask_ofi_inter action triggers delivery preference question
- [x] Route 3: isRemoteMunicipality in somnio-agent.ts triggers delivery preference question
- [x] Mode-aware completion: isDataComplete dispatches to correct function per mode
- [x] Bidirectional mode switch: collecting_data_inter allowed by state machine (Plan 01)
- [x] CONFIRMATORY_MODES includes collecting_data_inter (from Plan 01)
- [x] checkAutoTriggersForMode wired in orchestrator for mode-aware auto-trigger

## Next Phase Readiness

Plan 03 (OrderCreator + Prompts + Integration) can proceed immediately. All behavioral wiring from this plan is in place:
- All three detection routes operational
- Mode-aware completion and auto-trigger wired
- No blockers.
