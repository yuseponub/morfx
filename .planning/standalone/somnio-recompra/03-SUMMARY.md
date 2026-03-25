---
phase: somnio-recompra
plan: 03
subsystem: agent-pipeline
tags: [agent, recompra, pipeline, sandbox, registry]
completed: 2026-03-24
duration: ~4min
dependency_graph:
  requires: [somnio-recompra-01, somnio-recompra-02]
  provides: [processMessage, SomnioRecompraEngine, agent-registry-entry]
  affects: [somnio-recompra-04]
tech_stack:
  patterns: [two-track-decision, state-machine, sandbox-engine, self-registration]
key_files:
  created:
    - src/lib/agents/somnio-recompra/somnio-recompra-agent.ts
    - src/lib/agents/somnio-recompra/config.ts
    - src/lib/agents/somnio-recompra/index.ts
    - src/lib/agents/somnio-recompra/engine-recompra.ts
---

# Somnio Recompra Plan 03: Agent Pipeline, Config, y Sandbox Engine

Pipeline principal del agente recompra con processMessage de dos rutas (user message y timer event), auto-registro en agentRegistry, y sandbox engine para testing.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Main Agent Pipeline and Config/Index | f92622a | somnio-recompra-agent.ts, config.ts, index.ts |
| 2 | Sandbox Engine | 5bfbf30 | engine-recompra.ts |

## What Was Built

### somnio-recompra-agent.ts
- `processMessage()` routes to `processSystemEvent()` or `processUserMessage()` based on `systemEvent`
- System event path: deserialize state, derive phase, compute gates, sales track, response track (no comprehension)
- User message path: full pipeline (comprehension, merge, gates, guards, sales track, response track)
- `computeMode()` maps state to engine-compatible modes (nuevo, promos, confirmacion, orden_creada, conversacion)
- Key difference from v3: no `enCapturaSilenciosa` logic, no `auto:datos_completos` event, no `secondarySalesAction` pass-through

### config.ts
- Agent ID: `somnio-recompra-v1`
- 5 states: nuevo, promos, confirmacion, orden_creada, handoff
- Confidence threshold: 80 (proceed)
- Tools: contact CRUD + order create + WhatsApp send

### index.ts
- Self-registers `somnioRecompraConfig` in `agentRegistry` on import
- Re-exports: `SOMNIO_RECOMPRA_AGENT_ID`, `processMessage`, `V3AgentInput`, `V3AgentOutput`

### engine-recompra.ts
- `SomnioRecompraEngine` class with `processMessage(V3EngineInput): Promise<V3EngineOutput>`
- Maps SandboxState to V3AgentInput (currentMode, intentsVistos, templatesEnviados, datosCapturados, packSeleccionado, accionesEjecutadas)
- Maps V3AgentOutput to V3EngineOutput (messages, newState, debugTurn, timerSignal)
- DebugTurn includes classification, orchestration, salesTrack, responseTrack, timerSignals

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Removed secondarySalesAction from processUserMessage call | Recompra has no ofi inter secondary action logic; response-track signature doesn't accept it |
| computeMode has no enCapturaSilenciosa branch | Recompra has no silent capture mode (datos come preloaded) |
| AccionRegistrada check uses .crmAction directly (no typeof guard) | Recompra types only use object format (no legacy string format) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed secondarySalesAction type error**
- **Found during:** Task 1
- **Issue:** `resolveResponseTrack()` in recompra does not accept `secondarySalesAction` parameter (unlike v3)
- **Fix:** Removed `secondarySalesAction: salesResult.secondarySalesAction` from the call in processUserMessage
- **Files modified:** somnio-recompra-agent.ts
- **Commit:** f92622a

## Module Status

Total files in `src/lib/agents/somnio-recompra/`: **15**
- Foundation (Plan 01): constants, types, comprehension-schema, comprehension-prompt
- Business Logic (Plan 02): state, phase, guards, comprehension, transitions, sales-track, response-track
- Pipeline + Integration (Plan 03): somnio-recompra-agent, config, index, engine-recompra

## Next Phase Readiness

Plan 04 (system integration) can proceed. The module is self-contained and self-registering. Integration points:
- Sandbox process route needs to import `SomnioRecompraEngine`
- Production runner needs to import `processMessage` from index
- Timer config needs `RECOMPRA_TIMER_DURATIONS`
