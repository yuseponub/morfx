# State Machine Plan 03: Pipeline Integration Summary

**One-liner:** Single action registration, SystemEvent routing, backward-compatible AccionRegistrada[] serialization, engine file updates

## Completed Tasks

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Update AgentState type and backward-compatible serialization | d114d98 | types.ts, state.ts, ingest.ts |
| 2 | Refactor pipeline with SystemEvent routing | 2f6300d | somnio-v3-agent.ts |
| 3 | Single action registration + computeMode + engine files | 2a920fe | somnio-v3-agent.ts, engine-v3.ts, engine-adapter.ts, types.ts |

## What Was Done

### AgentState Type Change
- `accionesEjecutadas` changed from `string[]` to `AccionRegistrada[]` (typed objects with tipo, turno, origen)
- `V3AgentInput` gained optional `systemEvent` field
- Backward-compatible deserialization: old `string[]` format auto-migrates to `AccionRegistrada[]`
- `hasAction()` helper exported from state.ts for clean lookups

### SystemEvent Routing
- `forceIntent` translated to `SystemEvent` at pipeline entry (3 timer levels: ofrecer_promos->L2, timer_sinpack->L3, timer_pendiente->L4)
- System events skip comprehension and route directly through transition table
- Ingest system events handled by `decide()` internally
- Legacy forceIntent backward compat preserved for unmapped intent strings

### Single Action Registration
- Removed write point 1 (scattered string pushes after decision)
- Removed write point 3 (mostradoUpdates from response)
- Added single `determineAction()` helper that maps Decision -> TipoAccion
- One `.push()` call after response composition, recording AccionRegistrada with turno and origen

### Engine File Updates
- engine-v3.ts: debug output uses `systemEvent` instead of `autoTrigger`
- engine-adapter.ts: adapter mapping uses `systemEvent` instead of `autoTrigger`
- Zero `autoTrigger` references remain in v3 module
- Zero `mostradoUpdates` references remain in v3 module

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ingest.ts promosMostradas() used .includes() on AccionRegistrada[]**
- Found during: Task 1
- Issue: `state.accionesEjecutadas.includes('ofrecer_promos')` fails with AccionRegistrada[] type
- Fix: Imported `hasAction` from state.ts and replaced `.includes()` call
- Files modified: src/lib/agents/somnio-v3/ingest.ts
- Commit: d114d98

**2. [Rule 1 - Bug] TS2783: type specified twice in spread**
- Found during: Task 3
- Issue: `{ type: x.type, ...x }` causes TS error since spread overwrites the explicit property
- Fix: Changed to `{ ...ingestResult.systemEvent }` (spread already includes type)
- Files modified: src/lib/agents/somnio-v3/somnio-v3-agent.ts
- Commit: 2a920fe

**3. [Rule 1 - Bug] JSDoc comment still referenced autoTrigger**
- Found during: Task 3 verification
- Issue: Comment `/** System event emitted by ingest (replaces autoTrigger) */` in types.ts
- Fix: Removed autoTrigger reference from JSDoc
- Files modified: src/lib/agents/somnio-v3/types.ts
- Commit: 2a920fe

## Verification Results

- `npx tsc --noEmit`: 0 errors in v3 module (4 pre-existing vitest errors in test files)
- `grep autoTrigger`: 0 matches in v3 module
- `grep mostradoUpdates`: 0 matches in v3 module
- `grep -c accionesEjecutadas.push somnio-v3-agent.ts`: exactly 1 (single registration point)
- computeMode returns correct mode strings via hasAction helper

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Spread-only for systemEvent in ingestInfo | Avoids TS2783 duplicate property error |
| hasAction in ingest.ts promosMostradas | Required by AccionRegistrada[] type change |
| determineAction as module-level function | Clean separation, testable independently |

## Duration

~6 minutes
