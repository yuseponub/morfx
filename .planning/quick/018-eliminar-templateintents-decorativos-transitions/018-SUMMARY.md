---
phase: quick-018
plan: 01
subsystem: somnio-v3-agent
tags: [refactor, dead-code, transitions]
completed: 2026-03-10
duration: ~3min
---

# Quick 018: Eliminar templateIntents decorativos de transitions.ts

Clean TransitionOutput interface removing dead templateIntents[] and extraContext fields that were never consumed from transition output (response-track has its own independent template resolution via resolveSalesActionTemplates).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove dead templateIntents/extraContext from transitions.ts | a8a3208 | src/lib/agents/somnio-v3/transitions.ts |

## Changes Made

1. **TransitionOutput interface**: Removed `templateIntents: string[]` and `extraContext?: Record<string, string>`. Kept `reason`, `timerSignal?`, `enterCaptura?`.
2. **getResumenIntent helper**: Deleted entirely (was only used in templateIntents values).
3. **Import cleanup**: Removed `buildResumenContext`, kept `camposFaltantes` (used in reason string on seleccion_pack + !datosOk transition).
4. **25 resolve functions**: Stripped all templateIntents and extraContext lines from every TRANSITIONS entry.
5. **Timer L1 resolve**: Removed `const missing = camposFaltantes(state)` variable that was only used in extraContext. Simplified resolve to arrow function.
6. **Several resolve functions**: Simplified from `(state) =>` to `() =>` where state was only used for removed fields.

## Verification

- `npx tsc --noEmit`: Zero new errors (only pre-existing vitest type errors)
- `grep -c templateIntents transitions.ts` = 0
- `grep -c extraContext transitions.ts` = 0
- `grep -c getResumenIntent transitions.ts` = 0
- `grep -c buildResumenContext transitions.ts` = 0
- `camposFaltantes` import and usage in reason string preserved

## Deviations from Plan

None - plan executed exactly as written.

## Notes

- response-track.ts has its own `resolveSalesActionTemplates()` function that independently produces `intents[]` and `extraContext` for template variable substitution. This is completely separate from TransitionOutput and was NOT touched.
- Net reduction: 60 lines removed, 13 added (interface + simplified resolves).
