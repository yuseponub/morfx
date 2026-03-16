---
phase: standalone
plan: 028
subsystem: agent-v3-production
tags: [inngest, timers, v3, production, whatsapp]
dependency_graph:
  requires: [027]
  provides: [v3-timer-system, v3-production-timer-adapter]
  affects: [v3-production-integration-fase-3]
tech_stack:
  added: []
  patterns: [fire-and-forget-inngest, signal-to-event-translation, generic-timer-function]
key_files:
  created:
    - src/lib/agents/engine-adapters/production/v3-timer.ts
    - src/inngest/functions/agent-timers-v3.ts
  modified:
    - src/inngest/events.ts
    - src/lib/agents/somnio-v3/constants.ts
    - src/lib/agents/engine-adapters/production/index.ts
    - src/lib/agents/engine/v3-production-runner.ts
    - src/app/api/inngest/route.ts
decisions:
  - V3ProductionTimerAdapter uses fire-and-forget pattern for async inngest.send inside sync signal() method
  - sessionId set via setSessionId() after session resolution in runner (adapter constructed before session exists)
  - onCustomerMessage reuses agent/customer.message (shared v1/v3 cancellation)
  - V3 lifecycle hooks (onModeTransition, onIngestStarted, etc.) left undefined — v3 uses signals only
  - WhatsApp helpers copied to agent-timers-v3.ts (independent of v1, zero coupling)
  - Single generic v3Timer function for all L0-L8 (vs v1's 5 specialized functions)
  - Concurrency 1 per sessionId prevents parallel timers for same session
  - Type bridging: SandboxTimerSignal for interface, cast to V3TimerSignal internally
metrics:
  duration: ~15 min
  completed: 2026-03-16
---

# Quick-028: V3 Production Timer System Summary

V3 timer adapter translating sales-track signals to Inngest events, plus generic v3Timer function that calls processMessage with systemEvent on timeout.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Registrar V3 timer events + V3_TIMER_DURATIONS | b1e1716 | events.ts, constants.ts |
| 2 | V3ProductionTimerAdapter + factory wiring | fcf26da | v3-timer.ts, index.ts, v3-production-runner.ts |
| 3 | agent-timers-v3.ts + route registration | 0ada8b0 | agent-timers-v3.ts, route.ts |

## What Was Built

### V3 Timer Event Types (events.ts)
- `agent/v3.timer.started` — carries sessionId, conversationId, workspaceId, level, timerDurationMs, phoneNumber, contactId
- `agent/v3.timer.cancelled` — carries sessionId, reason (for logging only)
- Added `V3TimerEvents` to `AllAgentEvents` union type

### V3_TIMER_DURATIONS (constants.ts)
- 3 presets (real, rapido, instantaneo) x 9 levels (L0-L8)
- Values identical to sandbox `TIMER_PRESETS` for parity
- Zero imports (constants.ts project rule maintained)

### V3ProductionTimerAdapter (v3-timer.ts)
- `signal()` translates V3 TimerSignal to `agent/v3.timer.started` Inngest event
- Uses fire-and-forget pattern: async inngest.send inside sync signal() method
- `onCustomerMessage()` reuses `agent/customer.message` (shared with v1)
- Lifecycle hooks (onModeTransition, etc.) not implemented — v3 uses signals only
- `setSessionId()` called by runner after session resolution

### Factory Routing (index.ts)
- `agentId: 'somnio-sales-v3'` routes to V3ProductionTimerAdapter
- Default (no agentId or v1) routes to ProductionTimerAdapter
- Added `contactId` and `agentId` to CreateProductionAdaptersParams

### v3Timer Inngest Function (agent-timers-v3.ts)
- Single generic function for all L0-L8 (vs v1's 5 specialized functions)
- Flow: settle 5s -> waitForEvent(customer.message, timerDurationMs) -> v3 processMessage
- systemEvent `{ type: 'timer_expired', level }` drives v3 pipeline decisions
- Sends templates via WhatsApp with character delay
- Persists state updates (datos, templates, mode, acciones_ejecutadas)
- Creates order via ProductionOrdersAdapter if shouldCreateOrder=true
- Concurrency 1 per sessionId

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Type mismatch between sandbox and v3 TimerSignal**
- **Found during:** Task 2
- **Issue:** TimerAdapter interface expects `TimerSignal` from sandbox/types, but v3 runner sends V3TimerSignal with `level?: string` instead of `suggestedLevel?: number`
- **Fix:** Import both types, use sandbox type for interface compliance, cast to v3 type internally
- **Files:** v3-timer.ts

**2. [Rule 3 - Blocking] sessionId not available at adapter construction time**
- **Found during:** Task 2
- **Issue:** V3ProductionTimerAdapter needs sessionId for Inngest events but adapter is constructed before session is resolved
- **Fix:** Added `setSessionId()` method called by V3ProductionRunner after getSession/getOrCreateSession
- **Files:** v3-timer.ts, v3-production-runner.ts

## V1 Impact Assessment

Zero regression on v1 system:
- agent-timers.ts: untouched
- timer.ts (ProductionTimerAdapter): untouched
- unified-engine.ts: untouched
- Factory default path: still returns ProductionTimerAdapter
