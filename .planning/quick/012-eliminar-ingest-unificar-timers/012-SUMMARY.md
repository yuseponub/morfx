# Quick 012: Eliminar ingest.ts y unificar timers — Summary

**One-liner:** Elimino ingest.ts como middleman, absorbio toda su logica en sales track + mergeAnalysis StateChanges, y agrego catch-all de retoma.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | StateChanges en mergeAnalysis + limpiar tipos | b23c69d | state.ts, types.ts, decision.ts |
| 2 | Sales track absorbe ingest + pipeline simplificado | 1edea66 | sales-track.ts, somnio-v3-agent.ts |
| 3 | Eliminar ingest.ts + verificar | b354dc4 | ingest.ts (deleted) |

## What Changed

### Pipeline Before (6 steps)
C2 (Comprehension) -> C3 (mergeAnalysis) -> C5 (Gates) -> C4 (Ingest) -> Sales Track -> Response Track

### Pipeline After (5 steps)
C2 (Comprehension) -> C3 (mergeAnalysis + StateChanges) -> C5 (Gates) -> Guards -> Sales Track (ALL decisions) -> Response Track

### Key Changes

1. **mergeAnalysis** now returns `{ state, changes: StateChanges }` instead of just `AgentState`
   - StateChanges tracks: newFields, filled, criticalComplete, ciudadJustArrived, hasNewData
   - No more prevState comparison needed — changes computed inline during merge

2. **Sales track** absorbed all ingest logic:
   - Ofi inter detection (ciudad sin direccion)
   - Datos completos auto-trigger
   - L1/L2 timer signals during captura
   - `dataTimerSignal` as fallback in all returns without their own timer

3. **Pipeline catch-all**: when response track produces 0 messages AND timerSignals is empty, pushes a retoma/silence timer

4. **silenceDetected** now derived from `timerSignals.some(s => s.level === 'silence')` in all 3 return paths (was hardcoded false or condition-based)

5. **ingest.ts deleted** — 174 lines removed, 0 broken imports

### Bug Fixed
- **2 timers simultaneos**: In captura + datos parciales, ingest was emitting L1 timer AND pipeline was detecting silence (silenceDetected=true), producing both an L1 and a retoma timer. Now only sales track emits data timers, and catch-all only fires when 0 messages + 0 timers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] decision.ts import of IngestResult**
- **Found during:** Task 1
- **Issue:** decision.ts imported IngestResult from types.ts which was removed
- **Fix:** Replaced with inline deprecated interface (file is dead code, not imported anywhere)
- **Files modified:** decision.ts
- **Commit:** b23c69d

## Verification

- `npx tsc --noEmit`: 0 errors from our files (only pre-existing vitest test errors)
- No imports of `./ingest` in any v3 file
- `IngestResult`, `IngestAction`, `evaluateIngest` not in any active code
- `silenceDetected` present in V3AgentOutput (backward compat), derived from timerSignals
- mergeAnalysis returns `{state, changes}` with StateChanges
- Sales track has all data logic: ofi inter, datos completos, L1/L2
- Pipeline catch-all generates retoma timer when 0 messages + 0 timers

## Duration
~6 minutes
