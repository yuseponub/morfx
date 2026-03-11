---
phase: quick-021
plan: 01
subsystem: agent-v3-state-machine
tags: [gates, state-machine, semantic-rename, data-validation]
completed: 2026-03-11
duration: ~8min
tech-stack:
  patterns: [two-level-gates, just-completed-detection]
key-files:
  modified:
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/state.ts
    - src/lib/agents/somnio-v3/sales-track.ts
    - src/lib/agents/somnio-v3/transitions.ts
    - src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
decisions:
  - extrasOk is private (not exported) — only used inside state.ts
  - correo added to extrasOk and camposFaltantes for datosCompletos consistency
  - ofiInter mode skips extras entirely (extrasOk returns true)
  - datosCriticosJustCompleted starts L2 timer only when completos NOT also just completed
  - datosCompletosJustCompleted fires auto:datos_completos immediately
---

# Quick 021: Consistencia datosCriticos/datosCompletos Summary

Renamed and corrected data gate semantics in v3 agent: two clear levels (datosCriticos = 6 min fields, datosCompletos = criticos + correo + barrio), split criticalComplete into two just-completed signals for correct timer/auto-trigger behavior.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Rename types + rewrite state.ts | c26cb67 | Gates.datosOk->datosCriticos, StateChanges split, extrasOk private with correo, mergeAnalysis pre/post detection |
| 2 | Update sales-track, transitions, debug | 30c7738 | All datosOk->datosCriticos in transitions, sales-track uses split signals, debug label updated |

## What Changed

### Gates (types.ts)
- `Gates.datosOk` renamed to `Gates.datosCriticos` (6 critical fields)
- `Gates.datosCompletos` semantics corrected (now includes correo via extrasOk)

### State Management (state.ts)
- `StateChanges.criticalComplete` replaced by `datosCriticosJustCompleted` + `datosCompletosJustCompleted`
- `datosExtrasOk()` (exported) replaced by `extrasOk()` (private, now checks correo + barrio)
- `mergeAnalysis()` captures pre/post merge gate state for accurate just-completed detection
- `camposFaltantes()` now includes correo in missing fields list
- `computeGates()` uses `extrasOk` for datosCompletos

### Sales Track (sales-track.ts)
- L2 timer: fires on `datosCriticosJustCompleted && !datosCompletosJustCompleted`
- L1 timer: fires on partial data without criticos just completing
- Auto-trigger: `datosCompletosJustCompleted` fires `auto:datos_completos`

### Transitions (transitions.ts)
- All `gates.datosOk` references renamed to `gates.datosCriticos` (8 conditions, 12 comments/reasons)

### Debug Panel (debug-v3.tsx)
- Local variable and badge label renamed from `datosOk` to `datosCriticos`

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

1. `npx tsc --noEmit` -- zero errors (excluding pre-existing vitest module errors)
2. `grep -rn "datosOk\b" src/lib/agents/somnio-v3/` -- zero matches
3. `grep -rn "datosExtrasOk" src/` -- zero matches
4. `grep -rn "criticalComplete" src/` -- zero matches
5. `grep -rn "datosCriticos" src/lib/agents/somnio-v3/` -- 33 matches across 4 files
6. `grep -rn "datosCompletosJustCompleted" src/lib/agents/somnio-v3/` -- 4 matches in state.ts and sales-track.ts
