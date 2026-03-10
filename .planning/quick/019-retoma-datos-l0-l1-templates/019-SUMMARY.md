---
phase: quick-019
plan: 01
subsystem: agent-v3-timers
tags: [somnio-v3, timers, templates, retoma]
dependency-graph:
  requires: [standalone/v3-state-machine]
  provides: [L0/L1 timer retoma with dedicated templates]
  affects: []
tech-stack:
  added: []
  patterns: [dedicated-action-per-timer-level]
key-files:
  created:
    - supabase/migrations/20260310000001_retoma_datos_templates.sql
  modified:
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/constants.ts
    - src/lib/agents/somnio-v3/transitions.ts
    - src/lib/agents/somnio-v3/response-track.ts
decisions:
  - id: q019-d1
    title: Separate actions instead of reusing pedir_datos
    choice: New TipoAccion values retoma_datos and retoma_datos_parciales
    reason: No-repetition filter was blocking pedir_datos on timer because it shared intent with the original quiero_comprar flow
metrics:
  duration: ~5min
  completed: 2026-03-10
---

# Quick 019: Retoma Datos L0/L1 Templates Summary

Timer L0 and L1 in capturing_data now use dedicated retoma_datos/retoma_datos_parciales actions with their own DB templates, bypassing the no-repetition filter that was blocking the reused pedir_datos intent.

## What Was Done

### Task 1: Migration
Created `20260310000001_retoma_datos_templates.sql` with two template intents:
- `retoma_datos` (L0): Static message asking for data or questions
- `retoma_datos_parciales` (L1): Dynamic message with `{{campos_faltantes}}` listing missing fields with human-readable labels

### Task 2: Code Wiring
- **types.ts**: Added `retoma_datos` and `retoma_datos_parciales` to `TipoAccion` union
- **constants.ts**: Added entries to `ACTION_TEMPLATE_MAP` and `V3_TO_V1_INTENT_MAP`
- **transitions.ts**: Changed L0 from `pedir_datos` to `retoma_datos`, L1 from `pedir_datos` to `retoma_datos_parciales`
- **response-track.ts**: Added `FIELD_LABELS` map and `retoma_datos_parciales` case that renders campos faltantes as bulleted human-readable labels

## Key Design Decisions

1. **Not added to SIGNIFICANT_ACTIONS**: These retomas must NOT change phase -- agent stays in capturing_data
2. **retoma_datos falls through to default**: Uses ACTION_TEMPLATE_MAP lookup (static template, no variables needed)
3. **retoma_datos_parciales has explicit case**: Needs to compute campos_faltantes with FIELD_LABELS for readability

## Deviations from Plan

None - plan executed exactly as written.
