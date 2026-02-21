---
phase: quick-005
plan: 01
subsystem: automations
tags: [triggers, variables, carrier, tracking, orders]
dependency-graph:
  requires: [phase-17, phase-23]
  provides: [carrier-tracking-on-order-triggers]
  affects: [phase-24, phase-25]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - src/lib/automations/constants.ts
    - src/lib/automations/trigger-emitter.ts
    - src/lib/domain/orders.ts
decisions:
  - id: qk005-d1
    decision: "Use same labels as robot.coord.completed for carrier/tracking entries (Numero de guia, Transportadora)"
    rationale: "Consistency across all triggers that expose the same fields"
metrics:
  duration: "6 minutes"
  completed: "2026-02-21"
---

# Quick Task 005: Add Carrier/Tracking to Order Triggers Summary

**One-liner:** Expose orden.carrier and orden.tracking_number variables on order.stage_changed and order.created triggers, wired end-to-end from DB select through domain emitters to variable resolver.

## What Was Done

### Task 1: Add carrier/tracking variables to catalogs (641de45)

Added `orden.tracking_number` and `orden.carrier` to both order triggers in:

- **TRIGGER_CATALOG**: `order.stage_changed` and `order.created` variables arrays
- **VARIABLE_CATALOG**: `order.stage_changed` and `order.created` sections with labels "Numero de guia" and "Transportadora"

Result: Both triggers now expose these variables in the automation builder variable picker, matching the existing robot.coord.completed entries.

### Task 2: Wire carrier/trackingNumber through emitters and domain callers (9ff300e)

**trigger-emitter.ts:**
- Added `trackingNumber?: string | null` and `carrier?: string | null` to `emitOrderStageChanged` params type
- Added `trackingNumber?: string | null` and `carrier?: string | null` to `emitOrderCreated` params type

**orders.ts:**
- `moveOrderToStage`: Added `carrier, tracking_number` to SELECT query and passed both to `emitOrderStageChanged`
- `createOrder`: Passed `params.trackingNumber` and `params.carrier` to `emitOrderCreated`
- `duplicateOrder`: Passed `sourceOrder.tracking_number` and `sourceOrder.carrier` in both emit paths (with-products and without-products branches)

**variable-resolver.ts:** No changes needed -- lines 178-179 already map `trackingNumber` -> `orden.tracking_number` and `carrier` -> `orden.carrier` for all trigger types.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

1. `npx tsc --noEmit` passes with zero errors
2. `orden.tracking_number` in constants.ts: 3 TRIGGER_CATALOG entries (order.stage_changed, order.created, robot.coord.completed) + 3 VARIABLE_CATALOG entries
3. `trackingNumber` in trigger-emitter.ts: appears in emitOrderStageChanged, emitOrderCreated, and emitRobotCoordCompleted
4. `trackingNumber:` in orders.ts: appears in moveOrderToStage, createOrder, and duplicateOrder (2 calls) emitter invocations

## Data Flow

```
DB (carrier, tracking_number columns)
  -> domain function (createOrder / moveOrderToStage / duplicateOrder)
    -> trigger emitter (emitOrderCreated / emitOrderStageChanged)
      -> Inngest event (automation/order.created / automation/order.stage_changed)
        -> variable-resolver buildTriggerContext (already wired)
          -> template resolution ({{orden.carrier}}, {{orden.tracking_number}})
```
