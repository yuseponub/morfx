---
phase: quick-005
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/automations/constants.ts
  - src/lib/automations/trigger-emitter.ts
  - src/lib/domain/orders.ts
autonomous: true

must_haves:
  truths:
    - "Automations using order.stage_changed can reference {{orden.carrier}} and {{orden.tracking_number}}"
    - "Automations using order.created can reference {{orden.carrier}} and {{orden.tracking_number}}"
    - "Variable picker in automation builder shows carrier and tracking_number for both order triggers"
  artifacts:
    - path: "src/lib/automations/constants.ts"
      provides: "TRIGGER_CATALOG + VARIABLE_CATALOG entries for carrier/tracking on order triggers"
      contains: "orden.tracking_number"
    - path: "src/lib/automations/trigger-emitter.ts"
      provides: "carrier and trackingNumber params on emitOrderStageChanged and emitOrderCreated"
    - path: "src/lib/domain/orders.ts"
      provides: "carrier/tracking_number fetched and passed to emitters"
  key_links:
    - from: "src/lib/domain/orders.ts"
      to: "src/lib/automations/trigger-emitter.ts"
      via: "emitOrderStageChanged and emitOrderCreated calls pass carrier/trackingNumber"
    - from: "src/lib/automations/trigger-emitter.ts"
      to: "src/lib/automations/variable-resolver.ts"
      via: "event data flows through buildTriggerContext which already maps trackingNumber->orden.tracking_number and carrier->orden.carrier"
---

<objective>
Add `orden.carrier` (transportadora) and `orden.tracking_number` (numero de guia) variables to the `order.stage_changed` and `order.created` automation triggers.

Purpose: These fields already exist in the DB and are resolved by variable-resolver.ts for `robot.coord.completed`, but order triggers don't expose them. Users need these variables to build automations that send tracking info via WhatsApp when orders move stages or are created.

Output: Both order triggers emit carrier/tracking_number data and expose the variables in catalogs.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/automations/constants.ts
@src/lib/automations/trigger-emitter.ts
@src/lib/domain/orders.ts
@src/lib/automations/variable-resolver.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add carrier/tracking variables to catalogs</name>
  <files>src/lib/automations/constants.ts</files>
  <action>
    In TRIGGER_CATALOG:
    1. `order.stage_changed` variables array (line 33): Add `'orden.tracking_number'` and `'orden.carrier'` after `'orden.descripcion'` (before contacto entries).
    2. `order.created` variables array (line 72): Add `'orden.tracking_number'` and `'orden.carrier'` after `'orden.descripcion'` (before contacto entries).

    In VARIABLE_CATALOG:
    3. `order.stage_changed` section (after line 322 `orden.descripcion`): Add two entries:
       `{ path: 'orden.tracking_number', label: 'Numero de guia' },`
       `{ path: 'orden.carrier', label: 'Transportadora' },`
    4. `order.created` section (after line 370 `orden.descripcion`): Add same two entries:
       `{ path: 'orden.tracking_number', label: 'Numero de guia' },`
       `{ path: 'orden.carrier', label: 'Transportadora' },`

    Keep the same labels used in the robot.coord.completed catalog entries for consistency.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep constants.ts for `orden.tracking_number` and confirm it appears in order.stage_changed, order.created, and robot.coord.completed (3 occurrences in TRIGGER_CATALOG, 3 in VARIABLE_CATALOG).</verify>
  <done>TRIGGER_CATALOG and VARIABLE_CATALOG expose orden.tracking_number and orden.carrier for order.stage_changed and order.created triggers.</done>
</task>

<task type="auto">
  <name>Task 2: Add carrier/trackingNumber to emitter types and wire domain callers</name>
  <files>src/lib/automations/trigger-emitter.ts, src/lib/domain/orders.ts</files>
  <action>
    **trigger-emitter.ts:**
    1. In `emitOrderStageChanged` params type (line 66-88): Add two optional fields after `orderDescription`:
       ```
       trackingNumber?: string | null
       carrier?: string | null
       ```
    2. In `emitOrderCreated` params type (line 185-204): Add two optional fields after `orderDescription`:
       ```
       trackingNumber?: string | null
       carrier?: string | null
       ```
    No changes needed to the function bodies because they already spread `...data` into sendEvent.

    **orders.ts — moveOrderToStage (line 494-597):**
    3. In the SELECT query (line 504), add `carrier, tracking_number` to the selected fields:
       ```
       .select('stage_id, pipeline_id, contact_id, total_value, description, name, shipping_address, shipping_city, shipping_department, carrier, tracking_number')
       ```
    4. In the `emitOrderStageChanged` call (lines 560-582), add after `orderDescription`:
       ```
       trackingNumber: currentOrder.tracking_number,
       carrier: currentOrder.carrier,
       ```

    **orders.ts — createOrder (line 149-303):**
    5. In the `emitOrderCreated` call (lines 275-293), add after `orderDescription`:
       ```
       trackingNumber: params.trackingNumber ?? null,
       carrier: params.carrier ?? null,
       ```

    **orders.ts — duplicateOrder (line 657-869):**
    6. In BOTH `emitOrderCreated` calls (first around line 807, second around line 837), add after `orderDescription`:
       ```
       trackingNumber: sourceOrder.tracking_number ?? null,
       carrier: sourceOrder.carrier ?? null,
       ```
    The sourceOrder already uses `select('*')` so carrier and tracking_number are already fetched.

    **variable-resolver.ts:** No changes needed — lines 178-179 already map `trackingNumber` -> `orden.tracking_number` and `carrier` -> `orden.carrier`.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep orders.ts for `trackingNumber:` and `carrier:` in emitOrderStageChanged and emitOrderCreated calls to confirm they are passed. Grep trigger-emitter.ts for `trackingNumber` to confirm it appears in all three emitter functions (emitOrderStageChanged, emitOrderCreated, emitRobotCoordCompleted).</verify>
  <done>Domain layer passes carrier and trackingNumber to both order trigger emitters. The full data flow is: DB select -> domain function -> trigger emitter -> Inngest event -> variable-resolver (already wired) -> template resolution.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. Grep `orden.tracking_number` in constants.ts shows 3 TRIGGER_CATALOG entries and 3 VARIABLE_CATALOG entries
3. Grep `trackingNumber` in trigger-emitter.ts shows the field in emitOrderStageChanged, emitOrderCreated, and emitRobotCoordCompleted
4. Grep `trackingNumber:` in orders.ts shows it passed in moveOrderToStage, createOrder, and duplicateOrder emitter calls
</verification>

<success_criteria>
- TypeScript compiles without errors
- orden.tracking_number and orden.carrier are available as variables in order.stage_changed and order.created triggers (visible in TRIGGER_CATALOG, VARIABLE_CATALOG)
- Domain functions pass carrier/tracking_number data through the full trigger pipeline
- No changes needed to variable-resolver.ts (already handles mapping)
</success_criteria>

<output>
After completion, create `.planning/quick/005-add-carrier-tracking-to-order-triggers/005-SUMMARY.md`
</output>
