---
phase: quick-027
plan: 01
subsystem: agents
tags: [v3, production, routing, migration, runner]
dependency-graph:
  requires: [quick-009, quick-025]
  provides: [v3-production-runner, agent-routing]
  affects: [v3-timer-system, v3-production-testing]
tech-stack:
  added: []
  patterns: [agent-routing-by-config, thin-io-runner]
key-files:
  created:
    - supabase/migrations/20260316000000_v3_acciones_ejecutadas_column.sql
    - src/lib/agents/engine/v3-production-runner.ts
  modified:
    - src/lib/agents/production/webhook-processor.ts
decisions:
  - id: D1
    decision: "acciones_ejecutadas as dedicated JSONB column on session_state"
    reason: "Cleaner than _v3: prefix in datos_capturados, supports direct queries"
  - id: D2
    decision: "IntentRecord[] mapped to string[] for v3 compatibility"
    reason: "V3 uses flat string arrays for intentsVistos, production stores IntentRecord objects"
  - id: D3
    decision: "Fallback to _v3:accionesEjecutadas in datos_capturados for backward compat"
    reason: "Existing sandbox sessions may have acciones stored in the old format"
metrics:
  duration: ~9min
  completed: 2026-03-16
---

# Quick-027: Integrar v3 a produccion - Fase 1 Foundation Summary

**One-liner:** V3ProductionRunner as thin I/O runner + webhook-processor routing by conversational_agent_id, v3 deployable but inactive by default.

## What Was Done

### Task 1: Migration SQL (acciones_ejecutadas column)
- Created idempotent migration adding `acciones_ejecutadas JSONB DEFAULT '[]'` to `session_state`
- Applied in production before code deployment (Regla 5)

### Task 2: V3ProductionRunner
- New class in `src/lib/agents/engine/v3-production-runner.ts` (270 lines)
- Maps session state (SessionState with IntentRecord[]) to V3AgentInput (flat string arrays)
- Reads acciones_ejecutadas from dedicated column with fallback to `_v3:accionesEjecutadas` in datos_capturados
- Full adapter integration: storage (state + mode + turns + intents + handoff), timer (lifecycle hooks + signals), messaging (with no-rep filter), orders (with ofiInter/cedulaRecoge), debug
- No-repetition filter applied when USE_NO_REPETITION=true (fail-open on error)
- Pre-send check and interruption handling via MessagingAdapter
- Version conflict retry (up to 3 retries, same pattern as UnifiedEngine)
- Assistant turn recording post-send

### Task 3: Webhook-processor routing
- Modified `processMessageWithAgent()` to read `conversational_agent_id` from workspace_agent_config
- Default: `'somnio-sales-v1'` (v1 path unchanged)
- When `'somnio-sales-v3'`: imports somnio-v3 barrel + V3ProductionRunner
- All post-processing (sent_by_agent, WPP tag, handoff, processed_by_agent) identical for both paths

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] IntentRecord[] to string[] mapping**
- **Found during:** Task 2, type-checking
- **Issue:** V3 expects `intentsVistos` as `string[]`, but production `SessionState.intents_vistos` is `IntentRecord[]` (objects with intent/orden/timestamp)
- **Fix:** Added `.map()` to extract just the intent string from each record, with fallback for string type
- **Files modified:** `src/lib/agents/engine/v3-production-runner.ts`

**2. [Rule 3 - Blocking] SessionState type lacks acciones_ejecutadas**
- **Found during:** Task 2, type-checking
- **Issue:** The `SessionState` interface doesn't include the new `acciones_ejecutadas` column yet (type definition not updated)
- **Fix:** Used `any` cast on rawState to access the column, with eslint-disable comment
- **Files modified:** `src/lib/agents/engine/v3-production-runner.ts`

## Authentication Gates

None.

## Verification

- `npx tsc --noEmit` passes clean (zero errors)
- Migration is idempotent (IF NOT EXISTS check)
- V1 default path unchanged (zero regression risk)
- V3 inactive by default (requires `conversational_agent_id='somnio-sales-v3'` in workspace_agent_config)

## Next Steps

- **Fase 2 (Timer System):** Create v3 Inngest timer functions (agent/v3.timer.started events, V3ProductionTimerAdapter)
- **Fase 3 (Deploy + Test):** Push to Vercel, set conversational_agent_id='somnio-sales-v3' for test workspace, verify full flow
- **Type cleanup:** Update SessionState interface to include `acciones_ejecutadas` field (removes any cast)
