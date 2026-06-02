---
phase: quick-022
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio-v3/transitions.ts
  - src/lib/agents/somnio-v3/response-track.ts
  - src/lib/agents/somnio-v3/phase.ts
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - supabase/migrations/YYYYMMDD_pendiente_templates.sql
autonomous: true

must_haves:
  truths:
    - "Timer L3 (promos_shown) creates order with pendiente_promo template instead of confirmacion_orden"
    - "Timer L4 (confirming) creates order with pendiente_confirmacion template instead of confirmacion_orden"
    - "Explicit confirmar intent still uses crear_orden with confirmacion_orden template (unchanged)"
    - "All crear_orden variants set shouldCreateOrder=true and trigger order creation"
    - "AccionRegistrada has crmAction flag, set to true for all crear_orden variants"
  artifacts:
    - path: "src/lib/agents/somnio-v3/types.ts"
      contains: "crear_orden_sin_promo"
    - path: "src/lib/agents/somnio-v3/types.ts"
      contains: "crmAction"
    - path: "supabase/migrations/"
      provides: "pendiente_promo and pendiente_confirmacion templates"
  key_links:
    - from: "transitions.ts L3"
      to: "response-track.ts"
      via: "action crear_orden_sin_promo -> intents ['pendiente_promo']"
    - from: "transitions.ts L4"
      to: "response-track.ts"
      via: "action crear_orden_sin_confirmar -> intents ['pendiente_confirmacion']"
    - from: "somnio-v3-agent.ts processSystemEvent"
      to: "shouldCreateOrder"
      via: "must be true for crear_orden* variants in system event path"
---

<objective>
Add two new TipoAccion variants (crear_orden_sin_promo, crear_orden_sin_confirmar) for timer-based order creation with pending-template messages instead of confirmacion_orden. Add crmAction flag to AccionRegistrada for CRM-touching actions.

Purpose: Timer L3/L4 currently send "confirmacion_orden" (which implies the customer confirmed), but the customer did NOT confirm -- the timer expired. New actions send appropriate "pending" templates. The crmAction flag enables future CRM edit agents to detect order-creating actions.

Output: Updated v3 state machine types, transitions, response track, phase derivation, agent pipeline, constants, and DB migration for new templates.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/response-track.ts
@src/lib/agents/somnio-v3/phase.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add new TipoAccion variants, crmAction flag, and update state machine</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/constants.ts
    src/lib/agents/somnio-v3/transitions.ts
    src/lib/agents/somnio-v3/response-track.ts
    src/lib/agents/somnio-v3/phase.ts
  </files>
  <action>
    **types.ts:**
    - Add `| 'crear_orden_sin_promo' | 'crear_orden_sin_confirmar'` to TipoAccion union (after `'crear_orden'`)
    - Add `crmAction?: boolean` to AccionRegistrada interface

    **constants.ts:**
    - Add to V3_TO_V1_INTENT_MAP:
      ```
      pendiente_promo: ['pendiente_promo'],
      pendiente_confirmacion: ['pendiente_confirmacion'],
      ```
    - Add to SIGNIFICANT_ACTIONS set: `'crear_orden_sin_promo'`, `'crear_orden_sin_confirmar'`
    - Add a new exported constant for CRM actions:
      ```ts
      export const CRM_ACTIONS: ReadonlySet<string> = new Set([
        'crear_orden', 'crear_orden_sin_promo', 'crear_orden_sin_confirmar',
      ])
      ```
    - Also add a helper constant for "any create order" checks:
      ```ts
      export const CREATE_ORDER_ACTIONS: ReadonlySet<string> = new Set([
        'crear_orden', 'crear_orden_sin_promo', 'crear_orden_sin_confirmar',
      ])
      ```
      (CRM_ACTIONS and CREATE_ORDER_ACTIONS are the same set today, but semantically different -- CRM_ACTIONS may grow to include other CRM mutations later)

    **transitions.ts:**
    - L3 transition (line 217-223): Change `action: 'crear_orden'` to `action: 'crear_orden_sin_promo'`. Update comment to `// Timer expired L3 -> crear_orden_sin_promo (pending promo selection)`. Update reason string to `'Timer L3 expired -> crear orden sin promo'`. Update timerSignal reason to `'timer L3 -> orden sin promo'`.
    - L4 transition (line 226-232): Change `action: 'crear_orden'` to `action: 'crear_orden_sin_confirmar'`. Update comment to `// Timer expired L4 -> crear_orden_sin_confirmar (pending confirmation)`. Update reason string to `'Timer L4 expired -> crear orden sin confirmar'`. Update timerSignal reason to `'timer L4 -> orden sin confirmar'`.
    - DO NOT touch the `confirmar` intent transition (line 134) -- it stays as `crear_orden`.

    **response-track.ts:**
    - In `resolveSalesActionTemplates` switch, add two new cases BEFORE the `default`:
      ```ts
      case 'crear_orden_sin_promo': {
        return {
          intents: ['pendiente_promo'],
        }
      }

      case 'crear_orden_sin_confirmar': {
        return {
          intents: ['pendiente_confirmacion'],
        }
      }
      ```
    - These do NOT include extraContext (no resumen needed -- just a short pending message).

    **phase.ts:**
    - In `derivePhase` switch, add after `case 'crear_orden':`:
      ```ts
      case 'crear_orden_sin_promo':
      case 'crear_orden_sin_confirmar':
      ```
      These fall through to `return 'order_created'` (same phase).
  </action>
  <verify>
    Run `npx tsc --noEmit` to verify no type errors. Grep for 'crear_orden' across all modified files to confirm no stale references (crear_orden itself should still exist for the confirmar intent path).
  </verify>
  <done>
    TipoAccion has 3 crear_orden variants. AccionRegistrada has crmAction field. Transitions L3->crear_orden_sin_promo, L4->crear_orden_sin_confirmar. Response track maps new actions to pendiente_promo/pendiente_confirmacion intents. Phase derivation handles all 3 variants. Constants updated with CRM_ACTIONS, CREATE_ORDER_ACTIONS sets, V3_TO_V1_INTENT_MAP entries, SIGNIFICANT_ACTIONS entries.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update agent pipeline (shouldCreateOrder + crmAction) and create DB migration</name>
  <files>
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
    supabase/migrations/20260311_pendiente_templates.sql
  </files>
  <action>
    **somnio-v3-agent.ts:**

    Import `CRM_ACTIONS` and `CREATE_ORDER_ACTIONS` from `./constants`.

    1. **isCreateOrder check (line 235):** Change from:
       ```ts
       const isCreateOrder = salesResult.accion === 'crear_orden'
       ```
       To:
       ```ts
       const isCreateOrder = !!salesResult.accion && CREATE_ORDER_ACTIONS.has(salesResult.accion)
       ```

    2. **computeMode function (line 387):** Change from:
       ```ts
       if (hasAction(state.accionesEjecutadas, 'crear_orden')) return 'orden_creada'
       ```
       To:
       ```ts
       if (state.accionesEjecutadas.some(a => {
         const tipo = typeof a === 'string' ? a : a.tipo
         return CREATE_ORDER_ACTIONS.has(tipo)
       })) return 'orden_creada'
       ```

    3. **Action registration in processSystemEvent (lines 87-93):** Add crmAction flag:
       ```ts
       if (salesResult.accion && salesResult.accion !== 'silence') {
         state.accionesEjecutadas.push({
           tipo: salesResult.accion,
           turno: state.turnCount,
           origen: 'timer',
           ...(CRM_ACTIONS.has(salesResult.accion) && { crmAction: true }),
         })
       }
       ```

    4. **Action registration in processUserMessage (lines 247-253):** Same pattern:
       ```ts
       if (salesResult.accion && salesResult.accion !== 'silence') {
         mergedState.accionesEjecutadas.push({
           tipo: salesResult.accion,
           turno: mergedState.turnCount,
           origen: 'bot',
           ...(CRM_ACTIONS.has(salesResult.accion) && { crmAction: true }),
         })
       }
       ```

    5. **CRITICAL FIX -- shouldCreateOrder in processSystemEvent (line 117):** Currently hardcoded `false`. Timer L3/L4 create orders but shouldCreateOrder was never set. Change from:
       ```ts
       shouldCreateOrder: false,
       ```
       To:
       ```ts
       shouldCreateOrder: !!salesResult.accion && CREATE_ORDER_ACTIONS.has(salesResult.accion),
       ```
       Also add orderData when shouldCreateOrder is true. After `shouldCreateOrder`, add:
       ```ts
       orderData: (!!salesResult.accion && CREATE_ORDER_ACTIONS.has(salesResult.accion))
         ? {
             datosCapturados: serialized.datosCapturados,
             packSeleccionado: serialized.packSeleccionado,
           }
         : undefined,
       ```
       (The serialized const is already computed at line 103 before the return.)

    **DB Migration:**
    Create `supabase/migrations/20260311_pendiente_templates.sql`:

    Need to find the workspace_id and agent_id for the templates. Query pattern from existing templates:
    ```sql
    -- Insert pendiente_promo and pendiente_confirmacion templates for somnio-v3 agent
    -- These are sent when timer L3/L4 creates an order without promo selection / confirmation

    INSERT INTO agent_templates (workspace_id, agent_id, intent, content, content_type, priority, is_active, orden)
    SELECT
      at.workspace_id,
      at.agent_id,
      'pendiente_promo',
      'Quedamos pendientes a la promocion que desees para poder despachar tu orden',
      'texto',
      'CORE',
      true,
      0
    FROM agent_templates at
    WHERE at.intent = 'compra_confirmada'
    GROUP BY at.workspace_id, at.agent_id
    ON CONFLICT DO NOTHING;

    INSERT INTO agent_templates (workspace_id, agent_id, intent, content, content_type, priority, is_active, orden)
    SELECT
      at.workspace_id,
      at.agent_id,
      'pendiente_confirmacion',
      'Quedamos pendientes a la confirmacion de tu compra para poder despachar tu orden',
      'texto',
      'CORE',
      true,
      0
    FROM agent_templates at
    WHERE at.intent = 'compra_confirmada'
    GROUP BY at.workspace_id, at.agent_id
    ON CONFLICT DO NOTHING;
    ```

    **IMPORTANT:** After creating the migration file, STOP and ask the user to apply it in production BEFORE pushing code (Rule 5: Migracion Antes de Deploy).
  </action>
  <verify>
    Run `npx tsc --noEmit` for type check. Verify the migration SQL is syntactically correct. Grep for `shouldCreateOrder: false` in processSystemEvent to confirm it was replaced. Grep for `CRM_ACTIONS` to confirm it's imported and used in both registration points.
  </verify>
  <done>
    isCreateOrder checks all 3 crear_orden variants. computeMode checks all 3 variants. Both action registration points add crmAction:true for CRM actions. System event path correctly sets shouldCreateOrder for crear_orden variants (fixes existing bug where timer orders never set shouldCreateOrder). Migration creates pendiente_promo and pendiente_confirmacion templates. Migration ready for user to apply before deploy.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. Grep confirms: L3 transition -> `crear_orden_sin_promo`, L4 transition -> `crear_orden_sin_confirmar`
3. Grep confirms: `confirmar` intent still maps to `crear_orden` (unchanged)
4. Grep confirms: `shouldCreateOrder` is no longer hardcoded `false` in processSystemEvent
5. Grep confirms: `crmAction` appears in both action registration blocks
6. Migration file exists and has correct SQL
</verification>

<success_criteria>
- TypeScript compiles without errors
- Timer L3 fires crear_orden_sin_promo (sends pendiente_promo template)
- Timer L4 fires crear_orden_sin_confirmar (sends pendiente_confirmacion template)
- Explicit confirmar still fires crear_orden (sends confirmacion_orden template, unchanged)
- All 3 crear_orden variants: shouldCreateOrder=true, crmAction=true, phase=order_created, mode=orden_creada
- DB templates exist for pendiente_promo and pendiente_confirmacion intents
- No dead code or stale references
</success_criteria>

<output>
After completion, create `.planning/quick/022-crear-orden-sin-promo-confirmar-crmaction/022-SUMMARY.md`
</output>
