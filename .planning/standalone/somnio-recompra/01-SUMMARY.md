---
phase: somnio-recompra
plan: 01
subsystem: agent-recompra
tags: [agent, fork, v3-architecture, state-machine, comprehension, types]
dependency_graph:
  requires: [somnio-v3]
  provides: [recompra-data-layer, recompra-types, recompra-state, recompra-guards]
  affects: [somnio-recompra-02, somnio-recompra-03]
tech_stack:
  added: []
  patterns: [v3-fork-pattern, zero-import-constants, preloaded-state]
key_files:
  created:
    - src/lib/agents/somnio-recompra/constants.ts
    - src/lib/agents/somnio-recompra/types.ts
    - src/lib/agents/somnio-recompra/comprehension-schema.ts
    - src/lib/agents/somnio-recompra/state.ts
    - src/lib/agents/somnio-recompra/phase.ts
    - src/lib/agents/somnio-recompra/guards.ts
  modified: []
decisions:
  - id: recompra-intents
    decision: "22 intents (v3's 25 minus contenido/formula/como_se_toma/efectividad plus confirmar_direccion)"
    reason: "Returning clients already know the product, no need for informational intents about content/formula/effectiveness"
  - id: recompra-timers
    decision: "Only L3/L4/L5 timers (3 levels vs v3's 9)"
    reason: "No data capture phase means no L0/L1/L2/L6 timers, no ofi inter means no L7/L8"
  - id: preloaded-state
    decision: "createPreloadedState() pre-populates 6 critical fields from last order"
    reason: "Returning clients have existing data, confirm don't capture"
  - id: no-ofi-inter
    decision: "Removed all ofi inter logic from state management"
    reason: "Ofi inter deferred for recompra, simplifies StateChanges and merge logic"
metrics:
  duration: "8 min"
  completed: "2026-03-24"
---

# Somnio Recompra Plan 01: Foundation Data Layer Summary

Complete data layer for the somnio-recompra agent: 22 intents (no product-info), 5-phase state machine, preloaded state from last order, L3/L4/L5 timers only.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Constants, Types, and Comprehension Schema | b671e1c | Done |
| 2 | State Management, Phase Derivation, and Guards | f3b64fa | Done |

## What Was Built

### constants.ts (zero imports)
- 22 RECOMPRA_INTENTS (removed contenido, formula, como_se_toma, efectividad; added confirmar_direccion)
- Simplified ACTION_TEMPLATE_MAP (no ofi inter, no retoma_datos variants)
- CRITICAL_FIELDS_NORMAL only (no ofi inter variant)
- RECOMPRA_TIMER_DURATIONS with only L3/L4/L5
- SIGNIFICANT_ACTIONS simplified (no pedir_datos, no ofi inter)

### types.ts
- RecompraPhase: 5 phases (initial, promos_shown, confirming, order_created, closed) — no capturing_data
- TipoAccion: 12 actions (removed pedir_datos, ofi inter actions, retoma_datos variants; added preguntar_direccion)
- AgentState: removed enCapturaSilenciosa, added direccionConfirmada
- TimerSignal/SystemEvent: only L3/L4/L5 levels
- V3AgentInput/V3AgentOutput: same shape for V3ProductionRunner compatibility

### comprehension-schema.ts
- Zod schema using RECOMPRA_INTENTS enum
- Same 12 extracted_fields (keeps entrega_oficina/menciona_inter for future)
- Same classification and negation shapes

### state.ts
- createPreloadedState(lastOrderData): pre-populates 6 critical fields from last order
- mergeAnalysis(): simplified — no ofi inter signals (ofiInterJustSet, mencionaInter removed from StateChanges)
- computeGates(): normal mode only (no ofi inter variant)
- serialize/deserialize: handles direccionConfirmada instead of enCapturaSilenciosa
- Imports normalizers from somnio/ (shared), not from somnio-v3/

### phase.ts
- derivePhase(): 5 phases from significant actions, no capturing_data

### guards.ts
- R0 (low confidence + otro) and R1 (escape intents) — same logic, local imports

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

Ready for Plan 02 (business logic layer: sales-track, response-track, transitions, comprehension prompt). All types and state management are in place.

## Verification Results

- All 6 files compile with zero type errors (verified with project tsconfig)
- constants.ts has zero import statements
- RECOMPRA_INTENTS has 22 entries (correct: v3's 25 - 4 removed + 1 added)
- RecompraPhase has exactly 5 variants
- RECOMPRA_TIMER_DURATIONS has only keys 3, 4, 5
- createPreloadedState() exists and accepts Partial<DatosCliente>
- No imports from somnio-v3/ (complete fork)
