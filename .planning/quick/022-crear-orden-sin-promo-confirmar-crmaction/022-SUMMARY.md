---
phase: quick-022
plan: 01
subsystem: agent-v3-state-machine
tags: [somnio-v3, timer, order-creation, templates, crm-action]
completed: 2026-03-11
duration: ~5min
tech-stack:
  added: []
  patterns: [crm-action-flag, create-order-action-set]
key-files:
  created:
    - supabase/migrations/20260311000000_pendiente_templates.sql
  modified:
    - src/lib/agents/somnio-v3/types.ts
    - src/lib/agents/somnio-v3/constants.ts
    - src/lib/agents/somnio-v3/transitions.ts
    - src/lib/agents/somnio-v3/response-track.ts
    - src/lib/agents/somnio-v3/phase.ts
    - src/lib/agents/somnio-v3/somnio-v3-agent.ts
---

# Quick 022: crear_orden_sin_promo/sin_confirmar + crmAction flag

**One-liner:** Timer L3/L4 now create orders with pending-template messages (not confirmacion_orden), plus crmAction flag on AccionRegistrada for CRM-touching actions.

## What Changed

### Task 1: State Machine Types + Transitions
- **TipoAccion**: Added `crear_orden_sin_promo` and `crear_orden_sin_confirmar` variants
- **AccionRegistrada**: Added optional `crmAction` boolean flag
- **Transitions**: L3 -> `crear_orden_sin_promo`, L4 -> `crear_orden_sin_confirmar` (confirmar intent unchanged)
- **Response track**: New actions map to `pendiente_promo` / `pendiente_confirmacion` intents (no resumen context)
- **Phase derivation**: All 3 crear_orden variants -> `order_created`
- **Constants**: `CRM_ACTIONS`, `CREATE_ORDER_ACTIONS` sets, `SIGNIFICANT_ACTIONS` updated, `V3_TO_V1_INTENT_MAP` entries added

### Task 2: Agent Pipeline + DB Migration
- **shouldCreateOrder**: System event path now dynamically checks `CREATE_ORDER_ACTIONS` (was hardcoded `false` -- critical bug fix)
- **orderData**: Included in system event return when creating order
- **isCreateOrder**: User message path uses `CREATE_ORDER_ACTIONS.has()` for all 3 variants
- **computeMode**: Checks all crear_orden variants for `orden_creada` mode
- **crmAction flag**: Set on both timer and bot action registration points
- **Migration**: Inserts `pendiente_promo` and `pendiente_confirmacion` templates with proper Spanish accents and emojis

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | 15b924e | feat(quick-022): add crear_orden_sin_promo/sin_confirmar variants + crmAction flag |
| 2 | 601a646 | feat(quick-022): update agent pipeline + DB migration for pendiente templates |

## Deviations from Plan

None -- plan executed exactly as written.

## Critical Bug Fixed

**shouldCreateOrder was hardcoded `false` in processSystemEvent.** This meant timer L3/L4 transitions that fired `crear_orden` never actually triggered order creation in the engine. Now all crear_orden variants properly set `shouldCreateOrder: true` with orderData.

## Migration Note

Migration `20260311000000_pendiente_templates.sql` must be applied in production BEFORE pushing code (Rule 5).
