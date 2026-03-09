---
phase: quick-013
plan: 01
subsystem: sandbox-timer
tags: [timer, sandbox, systemEvent, v3-pipeline, refactor]
dependency-graph:
  requires: [quick-012]
  provides: [pure-countdown-timer, systemEvent-pipeline-integration]
  affects: [v3-agent, sandbox-ui]
tech-stack:
  added: []
  patterns: [systemEvent-driven-timer, pipeline-decides-actions]
key-files:
  created:
    - src/lib/sandbox/timer-levels-legacy.ts
  modified:
    - src/lib/sandbox/ingest-timer.ts
    - src/lib/sandbox/types.ts
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/transitions.ts
    - src/lib/agents/somnio-v3/somnio-v3-agent.ts
    - src/lib/agents/somnio-v3/engine-v3.ts
    - src/app/api/sandbox/process/route.ts
    - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
    - src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
    - src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx
    - src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
    - src/app/(dashboard)/sandbox/components/debug-panel/ingest-tab.tsx
    - src/app/(dashboard)/sandbox/components/debug-panel/config-tab.tsx
    - src/inngest/functions/agent-timers.ts
decisions:
  - id: timer-countdown-only
    choice: "Timer only counts down, pipeline handles all decisions"
  - id: silence-unified
    choice: "Silence detection reuses main countdown at L0"
  - id: legacy-timer-levels
    choice: "Extracted TIMER_LEVELS to timer-levels-legacy.ts for production agent-timers.ts"
metrics:
  duration: ~19 minutes
  completed: 2026-03-09
---

# Quick-013: Refactor Sandbox Timer to Countdown-Only

Pure countdown timer for sandbox -- pipeline decides what to do and say on timer expiry via systemEvent.

## What Changed

### IngestTimerSimulator (448 -> 148 lines)
- Removed: TIMER_LEVELS array, evaluateLevel(), reevaluateLevel(), setContextProvider(), buildAction logic
- Kept: start/stop/pause/resume/getState/destroy, TIMER_DEFAULTS, TIMER_PRESETS
- onExpire callback simplified: `(level: number)` instead of `(level: number, action: TimerAction)`
- LEVEL_NAMES map for display only

### SystemEvent + Transitions
- SystemEvent timer_expired level expanded: `0 | 1 | 2 | 3 | 4` (was `2 | 3 | 4`)
- timer_expired:0 -> pedir_datos (retoma sin datos, restarts L0)
- timer_expired:1 -> pedir_datos (retoma datos parciales with campos_faltantes)

### Sandbox Layout (725 -> ~390 lines)
- handleTimerExpire: sends `systemEvent: { type: 'timer_expired', level }` to pipeline
- processTimerSignal: parses pipeline timerSignal.level (e.g., 'L0', 'L3')
- Silence timer removed entirely: silenceDetected starts countdown at L0 via main timer
- Removed: silence refs, callbacks, retake template fetch, SILENCE_RETAKE_* constants
- Removed: TimerEvalContext construction, evaluateLevel/reevaluateLevel calls

### V3 Pipeline Cleanup
- forceIntent removed from V3AgentInput, V3EngineInput, route.ts v3 path
- somnio-v3-agent.ts: removed forceIntent->systemEvent adapter block
- systemEvent is the only way to communicate timer/system events

### Debug Panel
- Removed SilenceTimerState, silenceDurationMs, onSilenceDurationChange from all debug components
- Removed SilenceTimerDisplay component from ingest-tab
- Removed silence duration slider from config-tab
- config-tab: TIMER_LEVELS replaced with static TIMER_LEVEL_INFO array

### Production Compatibility
- timer-levels-legacy.ts: TIMER_LEVELS + TIMER_ALL_FIELDS extracted for production agent-timers.ts
- TimerAction, TimerEvalContext, TimerLevelConfig marked @deprecated in types.ts (still exported for production)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Production agent-timers.ts imports TIMER_LEVELS**
- **Found during:** Task 3
- **Issue:** agent-timers.ts (Inngest production) imports TIMER_LEVELS and types from ingest-timer.ts
- **Fix:** Created timer-levels-legacy.ts with the old TIMER_LEVELS, updated agent-timers.ts import
- **Files:** src/lib/sandbox/timer-levels-legacy.ts, src/inngest/functions/agent-timers.ts

**2. [Rule 3 - Blocking] config-tab.tsx imports TIMER_LEVELS**
- **Found during:** Task 3
- **Issue:** config-tab used TIMER_LEVELS.map() for slider rendering
- **Fix:** Replaced with static TIMER_LEVEL_INFO array (no evaluate/buildAction needed for UI)
- **Files:** src/app/(dashboard)/sandbox/components/debug-panel/config-tab.tsx

**3. [Rule 3 - Blocking] TimerAction/TimerEvalContext still needed by production**
- **Found during:** Task 3
- **Issue:** Production agent-timers.ts imports TimerAction and TimerEvalContext
- **Fix:** Kept types in sandbox/types.ts marked @deprecated instead of removing entirely

## Verification

1. `npx tsc --noEmit` -- zero errors (excluding vitest test files)
2. `npm run build` -- successful
3. No `forceIntent` in v3 agent code -- verified
4. No `TIMER_LEVELS` in sandbox app code -- verified
5. No `buildAction` in ingest-timer.ts (only in comment) -- verified
6. No `SILENCE_RETAKE` in sandbox app code -- verified
