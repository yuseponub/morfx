---
phase: somnio-recompra
plan: 04
status: complete
started: 2026-03-25T01:52:52Z
completed: 2026-03-25T02:08:09Z
duration: ~15min
subsystem: agent-integration
tags: [recompra, webhook-routing, timer, sandbox, production-runner, data-preloading]

dependency-graph:
  requires: [somnio-recompra-03]
  provides: [full-production-integration, sandbox-testing, timer-routing, data-preloading]
  affects: [webhook-processor, v3-production-runner, agent-timers-v3, sandbox-process]

tech-stack:
  patterns:
    - "Contact-level routing via _v3:agent_module in session state"
    - "Data preloading from orders table into session datos_capturados"
    - "3-way processMessage dispatch: somnio-v3 / godentist / somnio-recompra"

key-files:
  modified:
    - src/lib/agents/engine/types.ts
    - src/lib/agents/engine/v3-production-runner.ts
    - src/lib/agents/production/webhook-processor.ts
    - src/inngest/functions/agent-timers-v3.ts
    - src/app/api/sandbox/process/route.ts
    - src/lib/agents/somnio-recompra/engine-recompra.ts

decisions:
  - id: preloaded-data-via-config
    decision: "Preloaded data flows through EngineConfig.preloadedData, injected into session on first creation"
    rationale: "Clean separation — webhook loads data, runner injects it, agent consumes it without knowing the source"
  - id: agent-module-in-session-state
    decision: "Store _v3:agent_module in session state for timer routing (contact-level, not workspace-level)"
    rationale: "Recompra routing is per-contact, not per-workspace. Timers need to know which agent to call."
  - id: cast-recompra-types
    decision: "Use 'as any' casts for cross-module type boundaries (V3AgentInput, AccionRegistrada)"
    rationale: "Recompra types are structural forks of somnio-v3 types — compatible at runtime but distinct at type level"
---

# Somnio Recompra Plan 04: Integracion Produccion + Sandbox

Full production and sandbox integration for the recompra agent across 5 files.

## One-liner

Routing completo de is_client a recompra: webhook, production runner, timers, sandbox, y precarga de datos del ultimo pedido.

## Tasks Completed

### Task 1: Webhook Routing + Production Runner + Engine Types
- **Commit:** `4ddadcd`
- Added `'somnio-recompra'` to agentModule union type in EngineConfig
- Added `preloadedData?: Record<string, string>` to EngineConfig
- V3ProductionRunner: 3-way branch (godentist / somnio-recompra / somnio-v3)
- V3ProductionRunner: saves `_v3:agent_module` to session state for timer routing
- V3ProductionRunner: injects preloadedData into datos_capturados on new sessions
- webhook-processor: is_client contacts now route to recompra agent (was skip)
- webhook-processor: `loadLastOrderData()` loads shipping details from most recent order
- Full post-processing: typing indicators, sent_by_agent marking, processed_by_agent marking

### Task 2: Timer Routing + Sandbox Dispatch
- **Commit:** `ccafba4`
- agent-timers-v3: reads `_v3:agent_module` from session state BEFORE workspace config
- agent-timers-v3: 3-way dispatch branch for processMessage
- sandbox process route: handles `somnio-recompra-v1` agentId via SomnioRecompraEngine

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing AccionRegistrada type mismatch in engine-recompra.ts**
- **Found during:** Final build verification
- **Issue:** SandboxState.accionesEjecutadas uses somnio-v3's AccionRegistrada type, but engine-recompra.ts expects its local recompra AccionRegistrada type. The TipoAccion unions differ (v3 has 'ask_ofi_inter' which recompra doesn't).
- **Fix:** Added `as any` casts at the type boundary (input → processMessage and output → SandboxState)
- **Commit:** `c3f77bb`

## Verification

- [x] All 5 modified files compile with `npx tsc --noEmit` (0 src errors)
- [x] `npm run build` succeeds (full Next.js build)
- [x] webhook-processor routes is_client contacts to recompra (not skip)
- [x] V3ProductionRunner has 3-way routing: godentist / somnio-recompra / somnio-v3
- [x] Timer function reads agent_module from session state
- [x] Sandbox handles somnio-recompra-v1 agentId
- [x] V3 agent behavior UNCHANGED for non-client contacts
- [x] GoDentist agent behavior UNCHANGED

## Routing Summary

| Contact Type | Route | Agent |
|---|---|---|
| has WPP/P/W/RECO tag | skip (step 1b) | none |
| is_client = true | webhook-processor recompra block | somnio-recompra |
| godentist workspace | agentId=godentist | godentist |
| default | agentId=somnio-sales-v3 | somnio-v3 |

## Next Steps

Recompra agent is fully wired. Ready for:
- Testing in sandbox via somnio-recompra-v1 agentId
- Production testing with a known is_client contact
- Template content finalization
