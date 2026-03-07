---
phase: quick-009
plan: 01
subsystem: sandbox-v3-agent
tags: [sandbox, state-management, debug-panel, somnio-v3]
completed: 2026-03-07
duration: ~7min
requires: [sm-01, sm-03]
provides: [accionesEjecutadas-first-class-field]
affects: [sm-04-testing]
tech-stack:
  patterns: [first-class-field-pipeline, backward-compat-deserialization]
key-files:
  modified:
    - src/lib/sandbox/types.ts
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/state.ts
    - src/lib/agents/somnio-v3/somnio-v3-agent.ts
    - src/lib/agents/somnio-v3/engine-v3.ts
    - src/lib/agents/somnio-v2/engine-v2.ts
    - src/lib/sandbox/sandbox-engine.ts
    - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
    - src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
    - src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx
decisions:
  - accionesEjecutadas optional in V3AgentInput (engine-adapter backward compat)
  - deserializeState 5th param default [] with fallback to _v3:accionesEjecutadas in datosCapturados
  - engine-v3 cleans stale _v3:accionesEjecutadas and _v3:templatesMostrados from datosCapturados
  - DebugIngestDetails.systemEvent typed properly, removed type assertion hack
  - SandboxState.accionesEjecutadas required (not optional) since all constructors provide it
---

# Quick Task 009: accionesEjecutadas como campo propio en Sandbox v3

Migrated accionesEjecutadas from JSON-serialized _v3: prefix hack inside datosCapturados to a proper first-class field flowing through the entire sandbox pipeline, matching the intentsVistos pattern.

## Tasks Completed

| # | Name | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Pipeline types + serialization | 4f9db58 | SandboxState/V3AgentInput/Output types, serializeState/deserializeState, all return paths |
| 2 | Debug panel UI + engine cleanup | 263fca8 | StateSection acciones display, State tab section, systemEvent in Pipeline/Ingest |

## What Changed

### Data Flow (before)
```
SandboxState.datosCapturados["_v3:accionesEjecutadas"] = JSON.stringify(...)
```

### Data Flow (after)
```
SandboxState.accionesEjecutadas: AccionRegistrada[]
  -> V3AgentInput.accionesEjecutadas (optional, backward compat)
  -> deserializeState 5th param
  -> AgentState.accionesEjecutadas
  -> serializeState returns .accionesEjecutadas
  -> V3AgentOutput.accionesEjecutadas
  -> SandboxState.accionesEjecutadas
```

### Backward Compatibility
- engine-adapter.ts: ZERO changes. Production uses datosCapturados for persistence. V3AgentInput.accionesEjecutadas is optional (defaults to []). deserializeState falls back to parsing _v3:accionesEjecutadas from datosCapturados when param is empty.
- engine-v3 cleans stale _v3: keys from datosCapturados after migration.

### Debug Panel
- Estado section: shows acciones count + detail badges with tipo/turno/origen
- State tab: dedicated "Acciones Ejecutadas" section with formatted badges
- Pipeline C4: displays systemEvent.type instead of deprecated autoTrigger
- Ingest section: displays systemEvent badge instead of autoTrigger

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SandboxState constructors in v2 engine, sandbox-engine, sandbox-layout**
- **Found during:** Task 1 tsc verification
- **Issue:** Adding required `accionesEjecutadas` to SandboxState broke 4 other files that construct the type
- **Fix:** Added `accionesEjecutadas: []` to all SandboxState constructors (engine-v2, sandbox-engine initial + newState, sandbox-layout INITIAL_STATE)
- **Files modified:** src/lib/agents/somnio-v2/engine-v2.ts, src/lib/sandbox/sandbox-engine.ts, src/app/(dashboard)/sandbox/components/sandbox-layout.tsx

## Verification

- TypeScript compiles cleanly (npx tsc --noEmit)
- engine-adapter.ts unchanged (git diff confirms)
- All 5 return paths in processMessage include accionesEjecutadas
- Backward compat: deserializeState falls back to datosCapturados parsing when param empty
