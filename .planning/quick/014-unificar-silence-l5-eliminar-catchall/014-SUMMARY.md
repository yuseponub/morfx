---
phase: quick-014
plan: 01
subsystem: agent-v3
tags: [somnio-v3, timer, state-machine, refactor]
dependency-graph:
  requires: [quick-012, quick-013]
  provides: [L5-timer-level, catch-all-removal]
  affects: []
tech-stack:
  added: []
  patterns: [declarative-transitions-only]
key-files:
  created: []
  modified:
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/transitions.ts
    - src/lib/agents/somnio-v3/somnio-v3-agent.ts
    - src/lib/agents/somnio-v3/engine-v3.ts
    - src/lib/agents/somnio-v3/engine-adapter.ts
    - src/lib/sandbox/ingest-timer.ts
    - src/lib/sandbox/types.ts
    - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
    - src/app/api/sandbox/process/route.ts
decisions:
  - L5 replaces ad-hoc silence timer level (declarative, consistent with L0-L4 naming)
  - timer_expired:5 uses pedir_datos action (retoma is not in TipoAccion)
  - No timerSignal on retoma (conversation continues naturally, next silence re-triggers L5 via default ack)
  - SILENCIOSO classification derived from timerSignals L5 check (replaces silenceDetected boolean)
metrics:
  duration: 5m
  completed: 2026-03-09
---

# Quick 014: Unificar silence como L5 y eliminar catch-all

Replaced ad-hoc 'silence' timer level with L5 (90s) across v3 pipeline, added timer_expired:5 transition for initial phase retoma, and removed the orchestrator catch-all so ALL silence behavior is state-driven via the transition table.

## Tasks Completed

### Task 1: Replace silence with L5 in types, transitions, and timer config
- **Commit:** 7b0e5d2
- TimerSignal.level union: removed 'silence', added 'L5'
- SystemEvent timer_expired level union: added 5
- Default ack transition: emits L5 instead of silence
- New transition: timer_expired:5 in initial phase -> pedir_datos with retoma_inicial template
- Timer configs: added level 5 durations (90s real, 9s rapido, 1s instantaneo)

### Task 2: Remove catch-all and silenceDetected from orchestrator and engine
- **Commit:** 6c3ffb4
- Removed RETOMA CATCH-ALL block from somnio-v3-agent.ts (was: if 0 messages + 0 timers, push silence signal)
- Removed silenceDetected field from V3AgentOutput, V3EngineOutput, EngineCompatibleOutput, SandboxEngineResult
- Replaced silenceDetected boolean checks with timerSignals.some(s => s.level === 'L5') in engine-v3 and engine-adapter
- Removed step 9 silence detection from sandbox-layout.tsx (L5 now flows through processTimerSignal in step 8)
- Removed silenceDetected from sandbox API route response

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed engine-adapter.ts silenceDetected references**
- **Found during:** Task 2
- **Issue:** engine-adapter.ts referenced v3.silenceDetected in EngineCompatibleOutput interface, adaptOutput function, and classification logic. Not in original plan.
- **Fix:** Removed silenceDetected from EngineCompatibleOutput, adaptOutput return, and replaced classification check with timerSignals L5 check.
- **Files modified:** src/lib/agents/somnio-v3/engine-adapter.ts
- **Commit:** 6c3ffb4

**2. [Rule 3 - Blocking] Fixed sandbox API route and types silenceDetected references**
- **Found during:** Task 2
- **Issue:** sandbox process route and sandbox/types.ts still had silenceDetected, causing type inconsistency.
- **Fix:** Removed silenceDetected from SandboxEngineResult type and API route response.
- **Files modified:** src/lib/sandbox/types.ts, src/app/api/sandbox/process/route.ts
- **Commit:** 6c3ffb4

## Verification Results

1. `npx tsc --noEmit` passes with zero errors (excluding pre-existing vitest module errors)
2. `silenceDetected` grep in v3 files, sandbox, sandbox types: 0 matches
3. `catch-all` grep in somnio-v3-agent.ts: 0 matches
4. `timer_expired:5` in transitions.ts: exactly 1 match
5. `5: 90` in ingest-timer.ts: appears in TIMER_DEFAULTS and TIMER_PRESETS.real
6. `'silence'` in somnio-v3-agent.ts: only appears as TipoAccion (action type), not timer level
