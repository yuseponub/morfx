---
phase: quick-025
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260315150000_v3_independent_templates.sql
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio-v3/response-track.ts
autonomous: false

must_haves:
  truths:
    - "v3 agent loads templates from agent_id='somnio-sales-v3' without any fallback to v1"
    - "V3_TO_V1_INTENT_MAP no longer exists in the codebase"
    - "When saludo + sales action coexist, saludo message appears BEFORE sales message"
    - "v1 agent in production is completely unaffected"
  artifacts:
    - path: "supabase/migrations/20260315150000_v3_independent_templates.sql"
      provides: "All v3 templates in agent_templates table"
      contains: "somnio-sales-v3"
    - path: "src/lib/agents/somnio-v3/constants.ts"
      provides: "Constants without V3_TO_V1_INTENT_MAP"
    - path: "src/lib/agents/somnio-v3/response-track.ts"
      provides: "Response track without v1 fallback, with saludo ordering fix"
  key_links:
    - from: "response-track.ts"
      to: "template-manager.ts"
      via: "getTemplatesForIntents with v3 intent names directly"
      pattern: "getTemplatesForIntents.*SOMNIO_V3_AGENT_ID.*allIntents"
---

<objective>
Independizar templates del agente v3 del v1. Crear templates propios en la DB con agent_id='somnio-sales-v3', eliminar V3_TO_V1_INTENT_MAP y el fallback a v1, y corregir el orden saludo-primero.

Purpose: El v3 actualmente tiene 0 templates propios y siempre cae al fallback del v1. Esto acopla ambos agentes innecesariamente y causa un bug de ordenamiento donde el saludo aparece despues de la accion de venta.

Output: Migration SQL con ~50 templates, constants.ts y response-track.ts limpios de dependencia v1.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-template-independence/CONTEXT.md
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/response-track.ts
@src/lib/agents/somnio/template-manager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SQL migration with v3 templates</name>
  <files>supabase/migrations/20260315150000_v3_independent_templates.sql</files>
  <action>
    Create migration file that INSERTs all templates for agent_id='somnio-sales-v3'.

    CRITICAL: You MUST query the production DB first to get EXACT content. Run this query via supabase CLI or the app's admin client to extract v1 templates:

    ```sql
    SELECT intent, priority, orden, content_type, content, delay_s, visit_type
    FROM agent_templates
    WHERE agent_id = 'somnio-sales-v1'
      AND visit_type = 'primera_vez'
    ORDER BY intent, orden;
    ```

    Then create the migration with INSERTs. For each v1 template row:
    - id: gen_random_uuid()
    - agent_id: 'somnio-sales-v3'
    - workspace_id: NULL
    - visit_type: 'primera_vez'
    - priority, orden, content_type, content, delay_s: COPY EXACTLY from v1
    - intent: Use the v3 name, mapped as follows:
      - hola → saludo
      - contenido_envase → contenido
      - modopago → pago
      - invima → registro_sanitario
      - contraindicaciones → efectos
      - sisirve → efectividad
      - captura_datos_si_compra → pedir_datos
      - compra_confirmada → confirmacion_orden
      - no_confirmado → rechazar
      - ofrecer_promos → promociones (ONLY the informational ones; the ofrecer_promos action template keeps its name)
      - fallback → fallback (same name)
      - All other intents (precio, como_se_toma, envio, ubicacion, resumen_1x/2x/3x, retoma_*, pendiente_*, ask_ofi_inter, confirmar_ofi_inter, confirmar_cambio_ofi_inter, pedir_datos_quiero_comprar_implicito, retoma_datos_implicito, no_interesa): same name in v3

    IMPORTANT about ofrecer_promos/promociones:
    - The v1 intent "ofrecer_promos" is used for BOTH informational ("que promociones tienen?") AND sales action ("ofrecer_promos" accion).
    - In v3, the informational intent is "promociones" and the sales action template is "ofrecer_promos" (via ACTION_TEMPLATE_MAP).
    - Since both map to the SAME v1 content, insert TWO sets of rows: one with intent='promociones' and one with intent='ofrecer_promos', both with the same content from v1's ofrecer_promos.

    The migration should be idempotent: wrap in a DO block that checks if templates already exist for somnio-sales-v3 before inserting.

    Template count expectation: approximately 50 rows (29 intent groups, some with multiple priority levels).
  </action>
  <verify>
    - File exists at supabase/migrations/20260315150000_v3_independent_templates.sql
    - SQL syntax is valid (no obvious errors)
    - All 29+ intent groups from CONTEXT.md are covered
    - No references to somnio-sales-v1 as agent_id in INSERTs
    - gen_random_uuid() used for all IDs
    - workspace_id is NULL for all rows
  </verify>
  <done>Migration file created with all v3 templates using exact content from v1 DB query. Ready for user to apply in production.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Apply migration in production (Regla 5)</name>
  <what-built>SQL migration with all v3 templates</what-built>
  <how-to-verify>
    1. Review the migration file at supabase/migrations/20260315150000_v3_independent_templates.sql
    2. Apply the migration in Supabase production dashboard (SQL Editor) or via CLI
    3. Verify templates exist:
       ```sql
       SELECT COUNT(*) FROM agent_templates WHERE agent_id = 'somnio-sales-v3';
       ```
       Expected: ~50 rows
    4. Verify v1 templates are untouched:
       ```sql
       SELECT COUNT(*) FROM agent_templates WHERE agent_id = 'somnio-sales-v1';
       ```
       Should be same count as before
  </how-to-verify>
  <resume-signal>Type "migration applied" to continue with code changes</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Remove v1 dependencies from code + fix saludo ordering</name>
  <files>
    src/lib/agents/somnio-v3/constants.ts
    src/lib/agents/somnio-v3/response-track.ts
  </files>
  <action>
    **constants.ts changes:**
    - Delete the entire V3_TO_V1_INTENT_MAP export (lines 145-182) and its section header comment (lines 142-144).
    - Do NOT touch any other exports (V3_INTENTS, ESCAPE_INTENTS, INFORMATIONAL_INTENTS, ACTION_TEMPLATE_MAP, etc.)

    **response-track.ts changes:**

    1. Remove V3_TO_V1_INTENT_MAP from the import on line 17. The import should become:
       ```typescript
       import {
         INFORMATIONAL_INTENTS,
         ACTION_TEMPLATE_MAP,
       } from './constants'
       ```

    2. Delete lines 88-97 (the v3→v1 mapping loop). The `allIntents` array already has v3 intent names, and now the DB has templates with those exact names. So pass `allIntents` directly to `getTemplatesForIntents` instead of `v1Intents`.

    3. Delete lines 115-124 (the fallback to somnio-sales-v1). The v3 should ONLY load from SOMNIO_V3_AGENT_ID. If no templates found, that's a data issue, not a fallback case.

    4. Fix saludo ordering (line 78): When 'saludo' is present in infoTemplateIntents, put infoTemplateIntents BEFORE salesTemplateIntents. Change:
       ```typescript
       const allIntents = [...salesTemplateIntents, ...infoTemplateIntents]
       ```
       To:
       ```typescript
       // Saludo should appear before sales action in the conversation
       const saludoFirst = infoTemplateIntents.includes('saludo')
       const allIntents = saludoFirst
         ? [...infoTemplateIntents, ...salesTemplateIntents]
         : [...salesTemplateIntents, ...infoTemplateIntents]
       ```

    5. After removing the mapping and fallback, the code around line 99-113 should simplify to:
       ```typescript
       const templateManager = new TemplateManager(workspaceId)

       const intentsVistos: IntentRecord[] = state.intentsVistos.map((intentName, i) => ({
         intent: intentName,
         orden: i,
         timestamp: new Date().toISOString(),
       }))

       const selectionMap = await templateManager.getTemplatesForIntents(
         SOMNIO_V3_AGENT_ID,
         allIntents,
         intentsVistos,
         state.templatesMostrados,
       )
       ```
       Note: `selectionMap` is now `const` (not `let`), and uses `allIntents` directly (not `v1Intents`).
  </action>
  <verify>
    Run: `npx tsc --noEmit` — must pass with zero errors.
    Grep: No remaining references to `V3_TO_V1_INTENT_MAP` anywhere in the codebase.
    Grep: No remaining references to `somnio-sales-v1` in response-track.ts.
    Review: The saludo ordering logic is correct (infoTemplateIntents first when saludo present).
  </verify>
  <done>
    - V3_TO_V1_INTENT_MAP deleted from constants.ts
    - response-track.ts uses v3 intent names directly with SOMNIO_V3_AGENT_ID only
    - Saludo ordering fixed: info intents go first when saludo is present
    - TypeScript compiles cleanly
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes
2. `grep -r "V3_TO_V1_INTENT_MAP" src/` returns nothing
3. `grep "somnio-sales-v1" src/lib/agents/somnio-v3/response-track.ts` returns nothing
4. Code review confirms saludo ordering logic is correct
5. v1 files completely untouched
</verification>

<success_criteria>
- Migration file exists with ~50 template INSERTs for agent_id='somnio-sales-v3'
- V3_TO_V1_INTENT_MAP eliminated from codebase
- No fallback to somnio-sales-v1 in response-track.ts
- Saludo appears before sales action when both are present
- TypeScript compiles without errors
- v1 agent completely unaffected
</success_criteria>

<output>
After completion, create `.planning/quick/025-independizar-templates-v3-de-v1/025-SUMMARY.md`
</output>
