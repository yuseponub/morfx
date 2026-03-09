---
phase: quick-015
plan: 01
subsystem: agent-v3-pipeline
tags: [cleanup, dead-code, rename, state-machine]
completed: 2026-03-09
duration: ~8 min
tasks_completed: 2/2

tech-stack:
  patterns:
    - "SystemEvent uses 'auto' type (not 'ingest_complete')"
    - "Transition table is sole source of truth for system event routing (no fallbacks in sales-track)"

key-files:
  deleted:
    - src/lib/agents/somnio-v3/decision.ts (166 lines)
    - src/lib/agents/somnio-v3/response.ts (152 lines)
    - src/lib/agents/somnio-v3/engine-adapter.ts (198 lines)
  modified:
    - src/lib/agents/somnio-v3/constants.ts
    - src/lib/agents/somnio-v3/state.ts
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/transitions.ts
    - src/lib/agents/somnio-v3/sales-track.ts
    - src/lib/agents/somnio-v3/engine-v3.ts
    - src/lib/agents/somnio-v3/somnio-v3-agent.ts
    - src/lib/agents/somnio-v3/config.ts
---

# Quick 015: Cleanup v3 Pipeline - Dead Code and Legacy Naming

Clean v3 pipeline with no dead files, no unused exports, ingest_complete renamed to auto, readiness_check fully removed, and no orphan fallbacks.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b462f40 | Delete 3 dead files + remove 8 unused exports/functions from constants.ts and state.ts |
| 2 | 6b71677 | Rename ingest_complete->auto, remove readiness_check, clean fallbacks and ingestInfo |

## What Changed

### Task 1: Dead files + unused exports
- **Deleted** decision.ts (166 lines), response.ts (152 lines), engine-adapter.ts (198 lines) -- all replaced by two-track architecture
- **Removed from constants.ts**: V3Intent type, NEVER_SILENCE_INTENTS, ALL_DATA_FIELDS, ACK_PATTERNS, OFI_INTER_PATTERNS, TIPO_ACCION (6 exports)
- **Removed from state.ts**: tieneDatosParciales(), camposLlenos() (2 functions)
- **Updated config.ts**: reference from "decision.ts" to "sales-track.ts + response-track.ts"

### Task 2: Rename + remove legacy
- **SystemEvent type**: ingest_complete renamed to auto, readiness_check variant removed entirely
- **Transitions table**: 3 event keys renamed (ingest_complete:* -> auto:*), 2 readiness_check transitions deleted, timerSignal L4 added to auto:datos_completos+pack transition
- **systemEventToKey()**: ingest_complete case renamed to auto, readiness_check case removed
- **sales-track.ts**: ingest_complete->auto in 2 system event calls, hardcoded ask_ofi_inter fallback removed, timerSignal ?? cancel fallback removed
- **types.ts**: ingestInfo removed from V3AgentOutput, 'ingest' removed from AccionRegistrada.origen, TransitionResult interface removed
- **engine-v3.ts**: DebugIngestDetails import removed, ingestDetails debug mapping removed
- **Comments cleaned**: all "absorbe logica de ingest" / "decision overrides ingest" references removed

## Lines Impact

- ~686 lines deleted (3 dead files + unused code)
- ~19 lines added (timerSignal on mostrar_confirmacion transition)
- Net: ~667 lines removed

## Deviations from Plan

None -- plan executed exactly as written. The duplicate promos_shown block (step 2c.5) did not exist in the current code (already removed in a prior quick task).

## Verification

- TypeScript compiles with zero errors (excluding pre-existing vitest module errors)
- No references to deleted files, ingest_complete, readiness_check, or ingestInfo in somnio-v3/
- Both auto:datos_completos transitions have timerSignal defined
- AccionRegistrada.origen is 'bot' | 'timer' | 'auto_trigger' (no 'ingest')
