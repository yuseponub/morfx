---
phase: v3-state-machine
plan: 02
subsystem: agent-decision-engine
tags: [state-machine, decision-engine, ingest, response, refactor]
depends_on: [sm-01]
provides: [decision-engine-rewrite, system-event-ingest, clean-response]
affects: [sm-03]
tech-stack:
  patterns: [guard-phase-transition, system-events, transition-table-lookup]
key-files:
  modified:
    - src/lib/agents/somnio-v3/decision.ts
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/ingest.ts
    - src/lib/agents/somnio-v3/response.ts
metrics:
  duration: ~10min
  completed: 2026-03-06
---

# Phase v3-state-machine Plan 02: Decision Engine Rewrite Summary

**One-liner:** R0-R9 waterfall replaced with guards + derivePhase + resolveTransition pipeline; ingest emits SystemEvent objects instead of autoTrigger strings; response drops mostradoUpdates tracking.

## What Was Done

### Task 1: Rewrite decision.ts and update IngestResult type (856039d)

**decision.ts** completely rewritten from R0-R9 waterfall (230 lines) to state machine flow (130 lines):

1. System event from ingest -> transition table lookup
2. Guards (checkGuards) -> block if matched
3. Derive phase from accionesEjecutadas
4. Acknowledgment sub-type routing (positive in confirming, promos_shown exception)
5. Intent -> transition table lookup
6. Fallback R9 -> respond with intent templates

Exported `transitionToDecision()` helper that maps TipoAccion to DecisionAction (only 4 values: respond, silence, handoff, create_order).

**types.ts** updated:
- `IngestResult.autoTrigger` replaced with `IngestResult.systemEvent`
- `IngestAction` removed `'ask_ofi_inter'` value
- `ResponseResult.mostradoUpdates` removed
- `V3AgentOutput.ingestInfo.autoTrigger` replaced with `systemEvent`

### Task 2: Refactor ingest.ts and response.ts (32c17d7)

**ingest.ts:**
- Two separate autoTrigger cases (ofrecer_promos, mostrar_confirmacion) collapsed into ONE `ingest_complete` system event with `result: 'datos_completos'`
- The transition table handles pack/no-pack distinction via conditions
- `ask_ofi_inter` action replaced with `ingest_complete` system event with `result: 'ciudad_sin_direccion'`

**response.ts:**
- Removed entire mostradoUpdates tracking section (lines 137-149)
- emptyResult() simplified to just messages + templateIdsSent

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Collapse two autoTrigger cases into one system event | Transition table conditions handle the pack/no-pack branching |
| 2 | Keep isPositiveAck in decision.ts | Needed for ack sub-type detection in confirming phase |
| 3 | Export transitionToDecision | Plan 03 needs it for system event second-pass in agent orchestrator |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- decision.ts imports from guards.ts, phase.ts, transitions.ts
- decision.ts has NO R0-R9 code -- only guard check, phase derivation, transition lookup, fallback
- ingest.ts returns SystemEvent, not autoTrigger strings
- response.ts returns only messages + templateIdsSent
- `npx tsc --noEmit` shows errors ONLY in expected files (somnio-v3-agent.ts, engine-v3.ts, engine-adapter.ts) -- these are fixed in Plan 03

## Expected Compile Errors (for Plan 03)

These files still reference old interfaces:
- `engine-adapter.ts:163` - references `autoTrigger` in ingestInfo
- `engine-v3.ts:108` - references `autoTrigger` in debug output
- `somnio-v3-agent.ts:234` - references `mostradoUpdates`
- `somnio-v3-agent.ts:285` - references `autoTrigger` in ingestInfo

## Next Plan Readiness

Plan 03 (sm-03) can proceed immediately. It will:
1. Wire decision.ts into somnio-v3-agent.ts
2. Fix engine-v3.ts and engine-adapter.ts references
3. Add single-point action registration (replacing mostradoUpdates)
