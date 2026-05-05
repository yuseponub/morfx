---
phase: agent-godentist-fb-ig
plan: 02
subsystem: src/lib/agents/godentist-fb-ig
tags:
  - clone-verbatim
  - state-machine
  - skeleton
  - wave-1
dependency_graph:
  requires:
    - agent-godentist-fb-ig 01 (Wave 0 — GO verdict, Q1/Q2/Q3 resolved)
    - src/lib/agents/godentist/{types,comprehension-schema,guards,phase,constants,state,transitions,dentos-availability}.ts (clone source)
  provides:
    - src/lib/agents/godentist-fb-ig/types.ts (AgentState, V3AgentInput, V3AgentOutput, TipoAccion, Phase, Gates, TimerSignal)
    - src/lib/agents/godentist-fb-ig/comprehension-schema.ts (MessageAnalysisSchema zod)
    - src/lib/agents/godentist-fb-ig/guards.ts (checkGuards R0/R1)
    - src/lib/agents/godentist-fb-ig/phase.ts (derivePhase)
    - src/lib/agents/godentist-fb-ig/constants.ts (GD_INTENTS, INFORMATIONAL_INTENTS, ESCAPE_INTENTS, CRITICAL_FIELDS, SEDES, SEDE_ALIASES, ACTION_TEMPLATE_MAP, SIGNIFICANT_ACTIONS, HORARIOS_GENERALES_SEDE, FESTIVOS_COLOMBIA_2026, GD_TIMER_DURATIONS, isNonWorkingDay)
    - src/lib/agents/godentist-fb-ig/state.ts (createInitialState, mergeAnalysis, computeGates, camposFaltantes, serializeState, deserializeState, hasAction, buildResumenContext)
    - src/lib/agents/godentist-fb-ig/transitions.ts (TRANSITIONS array + resolveTransition)
    - src/lib/agents/godentist-fb-ig/dentos-availability.ts (checkDentosAvailability — robot Railway POST con workspaceId='godentist-valoraciones' literal)
  affects:
    - Wave 1 Plan 03 (adapted files: config.ts, comprehension.ts, response-track.ts, sales-track.ts, godentist-fb-ig-agent.ts) — importara estos 8 archivos via paths relativos `./`
    - Wave 2 Plan 04 (lead-capture helper) — importara `camposFaltantes` y `Gates` del sibling
tech-stack:
  added: []
  patterns:
    - clone-verbatim-with-cabecera (2-line header + cat) garantiza diff vacio modulo cabecera
    - sibling-isolation (D-04 + D-08) — sibling no comparte modulos con godentist source
key-files:
  created:
    - path: src/lib/agents/godentist-fb-ig/types.ts
      role: Type definitions verbatim — 244 LOC (242 source + 2 cabecera)
    - path: src/lib/agents/godentist-fb-ig/comprehension-schema.ts
      role: Zod schema verbatim — 79 LOC (77 source + 2 cabecera)
    - path: src/lib/agents/godentist-fb-ig/guards.ts
      role: R0/R1 guards verbatim — 43 LOC (41 source + 2 cabecera)
    - path: src/lib/agents/godentist-fb-ig/phase.ts
      role: derivePhase verbatim — 35 LOC (33 source + 2 cabecera)
    - path: src/lib/agents/godentist-fb-ig/constants.ts
      role: GD_INTENTS / SEDES / ACTION_TEMPLATE_MAP / etc verbatim — 259 LOC (257 source + 2 cabecera)
    - path: src/lib/agents/godentist-fb-ig/state.ts
      role: State helpers (camposFaltantes, computeGates, etc) verbatim — 389 LOC (387 source + 2 cabecera)
    - path: src/lib/agents/godentist-fb-ig/transitions.ts
      role: TRANSITIONS table + resolveTransition verbatim — 976 LOC (974 source + 2 cabecera)
    - path: src/lib/agents/godentist-fb-ig/dentos-availability.ts
      role: Robot Railway POST con workspaceId 'godentist-valoraciones' literal — 164 LOC (162 source + 2 cabecera)
  modified: []
decisions:
  - id: D-04-honored
    summary: Cero modificacion al godentist source — verificado via `git diff --name-only HEAD~2 HEAD src/lib/agents/godentist/` retorna vacio
  - id: D-08-honored
    summary: Sibling tiene su propia copia de los 8 archivos; cualquier cambio futuro al godentist NO se filtrara
  - id: Q3-honored
    summary: dentos-availability.ts clonado verbatim sin ajustes — workspaceId 'godentist-valoraciones' literal preservado en linea 52 (50 source + 2 cabecera)
metrics:
  duration: 4 minutes 43 seconds (started 2026-05-05T21:00:46Z, ended 2026-05-05T21:05:29Z)
  tasks_completed: 2/2
  files_created: 8
  files_modified: 0
  total_loc: 2189
  commits: 2
completed: 2026-05-05
---

# Phase agent-godentist-fb-ig Plan 02: Wave 1 Verbatim Clone Summary

Sibling skeleton bootstrapped — 8 agent-agnostic files cloned byte-identicamente (modulo cabecera de 2 lineas) desde `src/lib/agents/godentist/` a `src/lib/agents/godentist-fb-ig/`, estableciendo la base para que Plan 03 (adapted files) y Plan 04 (lead-capture) importen via paths relativos.

## What Was Built

**Modulo skeleton:** `src/lib/agents/godentist-fb-ig/` ahora contiene 8 archivos verbatim (2189 LOC totales) que conforman la base agent-agnostic del sibling. Cada archivo tiene una cabecera de 2 lineas que lo identifica como clone y prohibe edits divergentes (D-04, D-08).

**Cobertura por archivo:**
- `types.ts` — todos los tipos del agent: AgentState, V3AgentInput/Output, TipoAccion, Phase, Gates, TimerSignal, Decision, ProcessedMessage, ResponseResult, SystemEvent, SalesEvent, GuardResult.
- `comprehension-schema.ts` — `MessageAnalysisSchema` (zod) que define input/output del Haiku call.
- `guards.ts` — `checkGuards` R0/R1 (low confidence + escape intents).
- `phase.ts` — `derivePhase` (scanea acciones recientes y mapea a Phase enum).
- `constants.ts` — GD_INTENTS (23), INFORMATIONAL_INTENTS (11), ESCAPE_INTENTS (4), CRITICAL_FIELDS, SEDES (4 sucursales), SEDE_ALIASES, ACTION_TEMPLATE_MAP, SIGNIFICANT_ACTIONS, HORARIOS_GENERALES_SEDE, FESTIVOS_COLOMBIA_2026, GD_TIMER_DURATIONS, helper `isNonWorkingDay`.
- `state.ts` — createInitialState, mergeAnalysis, computeGates, camposFaltantes (linea 217), serializeState, deserializeState, hasAction, buildResumenContext.
- `transitions.ts` — `TRANSITIONS` array (declarativa por phase × intent, exportado en linea 54) + `resolveTransition` function (linea 944).
- `dentos-availability.ts` — `checkDentosAvailability` POST a `https://godentist-production.up.railway.app/api/check-availability` con `workspaceId: 'godentist-valoraciones'` literal en linea 52 (Q3 RESUELTA en Wave 0: el robot Railway acepta esta string para AMBOS agentes — godentist Y godentist-fb-ig).

## Files Created

| Path | LOC | Source LOC | Cabecera Overhead |
|------|-----|-----------|-------------------|
| src/lib/agents/godentist-fb-ig/types.ts | 244 | 242 | +2 |
| src/lib/agents/godentist-fb-ig/comprehension-schema.ts | 79 | 77 | +2 |
| src/lib/agents/godentist-fb-ig/guards.ts | 43 | 41 | +2 |
| src/lib/agents/godentist-fb-ig/phase.ts | 35 | 33 | +2 |
| src/lib/agents/godentist-fb-ig/constants.ts | 259 | 257 | +2 |
| src/lib/agents/godentist-fb-ig/state.ts | 389 | 387 | +2 |
| src/lib/agents/godentist-fb-ig/transitions.ts | 976 | 974 | +2 |
| src/lib/agents/godentist-fb-ig/dentos-availability.ts | 164 | 162 | +2 |
| **Total** | **2189** | **2173** | **+16** |

## Files Modified

Ninguno. Plan 02 es puramente aditivo — ni un solo archivo bajo `src/lib/agents/godentist/**` fue tocado (D-04 strict).

## Commits

| Task | Hash | Message | Files |
|------|------|---------|-------|
| Task 1 | `1f76a4d` | feat(agent-godentist-fb-ig): clone verbatim types.ts, comprehension-schema.ts, guards.ts, phase.ts (Plan 02 Task 1) | 4 (small files: types, schema, guards, phase) |
| Task 2 | `e8eea57` | feat(agent-godentist-fb-ig): clone verbatim constants.ts, state.ts, transitions.ts, dentos-availability.ts (Plan 02 Task 2) | 4 (large files: constants, state, transitions, dentos) |

NO push remoto — Wave 1 queda local hasta Wave 6 Plan 08 push collective (per plan instruction).

## Verification Results

### Acceptance Criteria

- 8 archivos existen en `src/lib/agents/godentist-fb-ig/` — PASS (verificado via `ls`)
- Cada archivo tiene cabecera "Cloned verbatim from src/lib/agents/godentist/<file>.ts (Standalone: agent-godentist-fb-ig, Wave 1 Plan 02)" — PASS (verificado via `head -2`)
- `diff <(tail -n +3 sibling) godentist-source` retorna vacio para los 8 archivos — PASS (byte-identico modulo cabecera)
- `constants.ts` exporta GD_INTENTS, INFORMATIONAL_INTENTS, ESCAPE_INTENTS, CRITICAL_FIELDS, SEDES, SEDE_ALIASES, ACTION_TEMPLATE_MAP, SIGNIFICANT_ACTIONS, HORARIOS_GENERALES_SEDE, FESTIVOS_COLOMBIA_2026, GD_TIMER_DURATIONS — PASS (11/11 simbolos confirmados via grep)
- `state.ts` exporta `camposFaltantes` (linea 217) — PASS
- `transitions.ts` exporta `TRANSITIONS` (linea 54) — PASS
- `dentos-availability.ts` contiene literal `'godentist-valoraciones'` (linea 52) — PASS (Q3 sin ajuste)
- 0 referencias a `createAdminClient` o `@supabase/supabase-js` en TODO `src/lib/agents/godentist-fb-ig/` (Regla 3) — PASS
- 0 modificaciones a `src/lib/agents/godentist/**` (D-04 strict) — PASS (`git diff --name-only HEAD~2 HEAD src/lib/agents/godentist/` retorna vacio)
- `npx tsc --noEmit` no genera errores especificos al sibling directory — PASS (exit 0, 0 lineas con "godentist-fb-ig" en el output)
- 2 commits atomicos en git local (sin push) — PASS

### Diff Verification (verbatim modulo cabecera)

```
=== diff modulo header for 8 files ===
types.ts:                  DIFF: empty (verbatim)
comprehension-schema.ts:   DIFF: empty (verbatim)
guards.ts:                 DIFF: empty (verbatim)
phase.ts:                  DIFF: empty (verbatim)
constants.ts:              DIFF: empty (verbatim)
state.ts:                  DIFF: empty (verbatim)
transitions.ts:            DIFF: empty (verbatim)
dentos-availability.ts:    DIFF: empty (verbatim)
```

## Deviations from Plan

None — plan ejecutado exactamente como escrito. No se aplicaron Reglas 1/2/3 deviation rules. Cero auto-fixes.

## Auth Gates

None.

## Decisions Made

Ninguna decision nueva durante ejecucion — el plan ya estaba completamente especificado por Wave 0 (D-01..D-20 + Q1/Q2/Q3 resueltos en 01-SNAPSHOT.md).

## Status / Next Steps

**Modulo `src/lib/agents/godentist-fb-ig/` skeleton listo:** 8 archivos verbatim conforman la base agent-agnostic. Pendiente:

- **Wave 1 Plan 03** (parallel — bypassed by sequential executor): Adapted files (config.ts, comprehension.ts, response-track.ts, sales-track.ts, godentist-fb-ig-agent.ts) que importaran de los 8 archivos clonados aqui. Estos archivos requieren cambios minimos vs godentist (agent-id literal `'godentist-fb-ig'`, system prompt si aplica, etc.).
- **Wave 2 Plan 04**: Lead-capture helper que importara `camposFaltantes` y `Gates` del sibling.

Cuando Wave 1 Plan 03 termine, el TS compile final pasara end-to-end. En este momento, los archivos verbatim podrian generar errores de "cannot find module ./config" si Plan 03 aun no ha corrido — eso es esperado y no bloquea el merge de Plan 02.

## Self-Check: PASSED

**Files exist:**
- FOUND: src/lib/agents/godentist-fb-ig/types.ts
- FOUND: src/lib/agents/godentist-fb-ig/comprehension-schema.ts
- FOUND: src/lib/agents/godentist-fb-ig/guards.ts
- FOUND: src/lib/agents/godentist-fb-ig/phase.ts
- FOUND: src/lib/agents/godentist-fb-ig/constants.ts
- FOUND: src/lib/agents/godentist-fb-ig/state.ts
- FOUND: src/lib/agents/godentist-fb-ig/transitions.ts
- FOUND: src/lib/agents/godentist-fb-ig/dentos-availability.ts

**Commits exist:**
- FOUND: 1f76a4d (Task 1)
- FOUND: e8eea57 (Task 2)

**Regla 3:** PASS (0 createAdminClient / @supabase/supabase-js in sibling)
**D-04:** PASS (0 modifications to src/lib/agents/godentist/**)
**TS compile:** PASS (0 godentist-fb-ig-specific errors)
