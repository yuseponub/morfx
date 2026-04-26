---
phase: agent-lifecycle-router
plan: 07
type: execute
wave: 5                                      # B-4 wave shift: was 4, now 5
depends_on: [04, 06]                          # Plan 04 (gate) + Plan 06 (admin form to create rules); transitively all earlier
files_modified:
  - .planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md
  - .planning/standalone/agent-lifecycle-router/07-DRY-RUN-RESULT.md
  - .planning/standalone/agent-lifecycle-router/07-FLIP-PLAN.md
  - docs/architecture/agent-lifecycle-router.md
  - docs/analysis/04-estado-actual-plataforma.md
autonomous: false  # multiple human checkpoints (apply migration, flip flag, watch prod)
requirements_addressed: [ROUTER-REQ-08, ROUTER-REQ-11, ROUTER-REQ-04]
user_setup:
  - service: supabase
    why: "Aplicar migracion `<ts>_agent_lifecycle_router.sql` en Supabase SQL Editor de produccion. Regla 5: ANTES del push de codigo de Plans 02-06."
    env_vars: []
    dashboard_config:
      - task: "Run el SQL completo del archivo creado en Plan 01 — verificar que se crearon las 3 tablas + columna lifecycle_routing_enabled + 10 facts en routing_facts_catalog"
        location: "Supabase Studio → SQL Editor (production project)"
      - task: "Despues de validacion parity OK, flip lifecycle_routing_enabled=true SOLO para workspace Somnio (a3843b3f-c337-4836-92b5-89c58bb98490) via SQL: UPDATE workspace_agent_config SET lifecycle_routing_enabled=true WHERE workspace_id='a3843b3f-...';"
        location: "Supabase Studio → SQL Editor"

must_haves:
  truths:
    - "Migracion aplicada en produccion (Regla 5 — checkpoint humano Task 1) ANTES del push de codigo. Verificacion via Supabase Studio: las 3 tablas existen + columna lifecycle_routing_enabled existe + 10 facts seedeados."
    - "B-1 fix Opcion B unconditional: Reglas Somnio creadas via admin form (Plan 06) que replican EXACTAMENTE el if/else de webhook-processor.ts:174-188. 3 reglas: forzar_humano kill-switch (priority 1000), legacy_parity_recompra_disabled_client_to_default (priority 900) que mirror el branch `is_client && !recompra_enabled` mediante el fact `recompraEnabled` de Plan 03 fact resolver, is_client_to_recompra (priority 800). Schema validation pasa para las 3. !is_client cae a `no_rule_matched` → fallback automatico a `conversational_agent_id` (Plan 04 mapping)."
    - "100% parity dry-run match against last 30 days inbound messages BEFORE flip flag ON. Zero divergence accepted (D-15 mandate). Validacion parity caso por caso: (a) is_client + recompra_enabled=true → candidate `somnio-recompra-v1` = current `recompra_routed`. (b) is_client + recompra_enabled=false → candidate routea al `conversational_agent_id` workspace value (Somnio: `somnio-sales-v1` per agent-config.ts:36, NO `somnio-sales-v3`) = legacy `recompra_disabled_client_skip` que tampoco respondia con sales agent — para parity la regla 900 retorna explicitamente al conversational_agent_id, evitando silencio. (c) !is_client → candidate `somnio-sales-v1` (workspace.conversational_agent_id) via reason=no_rule_matched fallback = current legacy default. `summary.changed_count` debe ser 0 para considerar PASS; documentado en `07-DRY-RUN-RESULT.md`."
    - "Push de codigo a main ejecutado DESPUES de aplicar migracion (Regla 1 + Regla 5). Vercel deployment confirmed green."
    - "Flag flippeada para Somnio (`UPDATE workspace_agent_config SET lifecycle_routing_enabled=true WHERE workspace_id='a3843b3f-...'`) — checkpoint humano explicito Task 4."
    - "Observability post-flip: por 24h, monitorear `routing_audit_log` rows + `pipeline_decision` events. Si `router_failed_fallback_legacy` aparece > 1% del trafico → KILL SWITCH (flag back a false)."
    - "Documentacion actualizada: `docs/architecture/agent-lifecycle-router.md` con arquitectura final + `docs/analysis/04-estado-actual-plataforma.md` con la nueva capacidad documentada (Regla 4)."
    - "Cleanup deferral documentado: archivo `07-FLIP-PLAN.md` deja explicito que el legacy if/else se queda en `webhook-processor.ts` durante v1, y que la fase v1.1 (`agent-lifecycle-router-cleanup`) lo borra ~1-2 semanas despues post-rollout exitoso (D-15)."
  artifacts:
    - path: ".planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md"
      provides: "Las 4+ reglas exactas creadas en Somnio workspace, en formato JSON copy-pasteable + screenshots del admin form post-creacion"
    - path: ".planning/standalone/agent-lifecycle-router/07-DRY-RUN-RESULT.md"
      provides: "Output literal de dryRunReplay contra Somnio 30d + verificacion 100% parity"
    - path: ".planning/standalone/agent-lifecycle-router/07-FLIP-PLAN.md"
      provides: "Procedure paso-a-paso del flip + observability checklist + KILL SWITCH instructions + v1.1 cleanup deferral"
    - path: "docs/architecture/agent-lifecycle-router.md"
      provides: "Arquitectura final del router (3-layer, LRU, JSON Schema) + integration en webhook-processor + v1.1 cleanup pendiente"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Modulo agentes/routing actualizado con la nueva capacidad (Regla 4)"
  key_links:
    - from: "Reglas Somnio creadas via admin form Plan 06"
      to: "tabla `routing_rules` WHERE workspace_id='a3843b3f-...'"
      via: "createOrUpdateRuleAction → upsertRule"
      pattern: "rule_type IN ('lifecycle_classifier', 'agent_router')"
    - from: "Flag flip via SQL Studio"
      to: "webhook-processor.ts:routerEnabled gate"
      via: "UPDATE workspace_agent_config SET lifecycle_routing_enabled=true"
      pattern: "lifecycle_routing_enabled=true"
    - from: "Regla 5 ordering"
      to: "Migracion aplicada PRE push"
      via: "checkpoint humano Task 1 BEFORE Task 2 (push)"
      pattern: "Regla 5"
---

<objective>
Wave 4 — Parity validation Somnio + production rollout. Esta fase combina 4 checkpoints humanos (apply migration, parity validation, push, flip) con tareas autonomas (crear reglas via admin form, ejecutar dry-run, escribir docs).

Purpose: (1) Aplicar la migracion en prod respetando Regla 5 (antes del push). (2) Crear las reglas Somnio que replican el if/else legacy via el admin form. (3) Ejecutar dry-run contra ultimos 30 dias y verificar 100% parity. (4) Pushear el codigo. (5) Flip flag para Somnio. (6) Monitorear 24h. (7) Documentar.

Output: 3 archivos en el phase dir (parity rules, dry-run result, flip plan) + 2 archivos de docs (architecture + estado plataforma) + reglas creadas en routing_rules + flag flippeada.

**CRITICAL — Regla 5:** Migracion APPLY antes de PUSH. Si se invierte el orden, codigo nuevo crashea contra DB sin schema. Checkpoints humanos respetan ese orden.

**CRITICAL — Regla 6:** Flag flip es EXPLICITO (checkpoint humano Task 4). Hasta ese punto, codigo en prod tiene flag=false default → comportamiento legacy intacto.

**CRITICAL — D-15 (parity 100%):** Dry-run debe mostrar parity 100% antes del flip. Cualquier discrepancia (changed_count > 0 en casos donde NO deberia haber cambio) es BLOCKER hasta investigar y corregir las reglas.

**CRITICAL — Plan v1.1 deferral:** Este plan NO borra el legacy if/else ni la columna feature flag. Eso es Phase v1.1 separada (`agent-lifecycle-router-cleanup`) — agendada ~1-2 semanas post-rollout.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-lifecycle-router/CONTEXT.md  # D-15 (parity validation), D-16 (3 outputs)
@CLAUDE.md  # Reglas 1, 4, 5, 6
@.planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md  # baseline pre-migracion (Plan 01 output) — referencia para parity
@src/lib/agents/production/webhook-processor.ts  # archivo de referencia para construir las parity rules (lineas 174-188 son el if/else a replicar)
@docs/architecture/  # patron de documentacion arquitectural existente
@docs/analysis/04-estado-actual-plataforma.md  # archivo a actualizar (Regla 4)

<interfaces>
<!-- Reglas Somnio que replican el if/else legacy de webhook-processor.ts:174-188:
     if (contactData?.is_client) {
       if (!recompraEnabled) return { success: true }  // human handoff
       // route to recompra
     } else {
       // route to v3 normal
     }

     Replicacion en routing_rules para workspace='a3843b3f-c337-4836-92b5-89c58bb98490': -->

<!-- Rule 1 (priority 1000) — agent_router — forzar_humano kill-switch (D-04) -->
{
  "schema_version": "v1",
  "rule_type": "agent_router",
  "name": "forzar_humano_kill_switch",
  "priority": 1000,
  "conditions": { "all": [{ "fact": "tags", "operator": "arrayContainsAny", "value": ["forzar_humano", "pausar_agente"] }] },
  "event": { "type": "route", "params": { "agent_id": null } },  // null = human_handoff
  "active": true
}

<!-- Rule 2 (priority 900) — agent_router — is_client without recompra_enabled = human handoff (replica del recompra_disabled_client_skip) -->
<!-- Esta regla requiere que routing_facts_catalog tenga un fact 'recompraEnabled' que lea de workspace_agent_config.recompra_enabled. -->
<!-- Si NO existe, el dry-run no podra simular este case → BLOCKER. Solucion: agregar fact 'recompraEnabled' al catalog en una migracion incremental antes de Task 2 si Plan 01 no lo incluyo. -->
<!-- Alternativa: usar tag 'recompra_disabled' como switch (admin tagea contactos manualmente). Decidir antes de empezar Task 2. -->

<!-- Rule 3 (priority 800) — agent_router — is_client → somnio-recompra-v1 -->
{
  "schema_version": "v1",
  "rule_type": "agent_router",
  "name": "is_client_to_recompra",
  "priority": 800,
  "conditions": { "all": [{ "fact": "isClient", "operator": "equal", "value": true }] },
  "event": { "type": "route", "params": { "agent_id": "somnio-recompra-v1" } },
  "active": true
}

<!-- Rule 4 (priority 100) — agent_router — DEFAULT (no_rule_matched fallback) → caera a conversational_agent_id automaticamente -->
<!-- En realidad NO necesitamos esta regla — el reason='no_rule_matched' ya emite fallback al conversational_agent_id en webhook-processor.ts (Plan 04). 
     Documentar este behavior en 07-FLIP-PLAN.md y NO crear la regla redundante. -->
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Aplicar migracion en produccion (Regla 5 — checkpoint humano)</name>
  <read_first>
    - supabase/migrations/<ts>_agent_lifecycle_router.sql (creado Plan 01 — copy completo a Studio)
    - .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md (baseline pre-migracion)
    - CLAUDE.md §Regla 5 textual
  </read_first>
  <what>
    Aplicar manualmente el SQL del archivo `supabase/migrations/<ts>_agent_lifecycle_router.sql` en el SQL Editor de Supabase production. ANTES de pushear el codigo (Regla 5 estrita).
  </what>
  <how-to-verify>
    1. Abrir Supabase Studio → SQL Editor (production project, NO staging).
    2. Copy el contenido completo del archivo `supabase/migrations/<ts>_agent_lifecycle_router.sql` y ejecutar en el editor.
    3. Verificar exit sin errores.
    4. Run las queries de validacion:
       ```sql
       SELECT COUNT(*) FROM routing_rules;            -- Esperado: 0 (recien creada)
       SELECT COUNT(*) FROM routing_facts_catalog;    -- Esperado: 10
       SELECT COUNT(*) FROM routing_audit_log;        -- Esperado: 0
       SELECT lifecycle_routing_enabled FROM workspace_agent_config WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
       -- Esperado: false
       ```
    5. Confirmar permisos:
       ```sql
       SELECT has_table_privilege('service_role', 'routing_rules', 'INSERT');  -- esperado true
       SELECT has_table_privilege('authenticated', 'routing_rules', 'SELECT'); -- esperado true
       ```
    6. Si todo pasa → continuar a Task 2.
    7. Si algo falla → ESCALAR, NO continuar (rollback no es necesario porque CREATE TABLE IF NOT EXISTS es idempotente; ejecutar el archivo de nuevo despues de fix).
  </how-to-verify>
  <resume-signal>
    Type "migracion aplicada — proceder a Task 2" o describir el error encontrado.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 2: Crear las reglas Somnio parity via admin form + documentar</name>
  <read_first>
    - src/lib/agents/production/webhook-processor.ts:170-200 (re-leer el if/else legacy exacto que replicamos)
    - "src/app/(dashboard)/agentes/routing/" (admin form Plan 06)
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Architecture Patterns Pattern 1 (semantica del routing pipeline)
  </read_first>
  <action>
    **Paso 1 — Verificar que el fact `recompraEnabled` esta disponible (B-1 fix Opcion B unconditional)**:

    D-15 mandata 100% parity. La opcion A (omitir el switch `recompra_enabled` y confiar en tags manuales) reduce silenciosamente la cobertura. Plan 01 + Plan 02 + Plan 03 ya implementaron la infraestructura para Opcion B:

    - Plan 01 seedeo el fact `recompraEnabled` en `routing_facts_catalog` con `valid_in_rule_types=ARRAY['agent_router']`.
    - Plan 02 creo `getWorkspaceRecompraEnabled` en `src/lib/domain/workspace-agent-config.ts`.
    - Plan 03 registro el resolver `recompraEnabled` en `facts.ts` que llama esa domain function.

    Verificacion (BLOCKER si falla):
    ```bash
    psql ... -c "SELECT 1 FROM routing_facts_catalog WHERE name='recompraEnabled'"  # production after Task 1 migration apply
    grep -q "engine.addFact('recompraEnabled'" src/lib/agents/routing/facts.ts
    grep -q "getWorkspaceRecompraEnabled" src/lib/domain/workspace-agent-config.ts
    ```

    Si todas pasan -> proceder. Si alguna falla -> Plans anteriores incompletos, ESCALAR.

    **Paso 2 — Crear las 3 reglas Somnio via admin form** (manualmente o via SQL — admin form preferido para validar el flow):

    Login como admin de Somnio workspace. Navegar a `/agentes/routing/editor?new=1`. Crear las siguientes reglas EN ESTE ORDEN (priority DESC):

    **Rule 1 — agent_router — forzar_humano kill-switch (priority 1000):**
    - name: `forzar_humano_kill_switch`
    - priority: `1000`
    - rule_type: `agent_router`
    - conditions: `all` → `[{ fact: 'tags', operator: 'arrayContainsAny', value: ['forzar_humano', 'pausar_agente'] }]`
    - event.params: `{ agent_id: null }` (input vacio en form = human_handoff)
    - active: true
    - Click "Simular cambio" → verificar
    - Click "Guardar"

    **Rule 2 — agent_router — legacy parity: is_client + !recompra_enabled (priority 900) — B-1 fix Opcion B:**

    Esta regla replica EXACTAMENTE el branch `if (contactData?.is_client) { if (!recompraEnabled) return ... }` de webhook-processor.ts:174-188. Cuando recompra esta desactivado para este workspace, el cliente debe ir al `conversational_agent_id` del workspace (NO silencio — preserva trafico hacia el agente conversacional default).

    El `agent_id` de esta regla es el VALOR LITERAL del `conversational_agent_id` del workspace al momento de crear la regla. Para Somnio: `'somnio-sales-v1'` (verificable en `agent-config.ts:36` y `webhook-processor.ts:429` fallback). Si el workspace cambia su conversational_agent_id en el futuro, la regla debe actualizarse correspondientemente (documentado como mantenimiento en 07-FLIP-PLAN.md).

    - name: `legacy_parity_recompra_disabled_client_to_default`
    - priority: `900`
    - rule_type: `agent_router`
    - conditions: `all` → `[{ fact: 'isClient', operator: 'equal', value: true }, { fact: 'recompraEnabled', operator: 'equal', value: false }]`
    - event.params: `{ agent_id: 'somnio-sales-v1' }`  (literal value of Somnio workspace.conversational_agent_id at rule-creation time)
    - active: true
    - Click "Simular cambio" → verificar el case con clients en Somnio si recompra_enabled=false → routea a sales-v1
    - Click "Guardar"

    **Rule 3 — agent_router — is_client + recompra_enabled to somnio-recompra-v1 (priority 800):**
    - name: `is_client_to_recompra`
    - priority: `800`
    - rule_type: `agent_router`
    - conditions: `all` → `[{ fact: 'isClient', operator: 'equal', value: true }, { fact: 'recompraEnabled', operator: 'equal', value: true }]`
    - event.params: `{ agent_id: 'somnio-recompra-v1' }`
    - active: true
    - Click "Guardar"

    **Note:** NO se crea Rule 4 default → no_rule_matched. Plan 04 ya hace fallback automatico al `conversational_agent_id` (somnio-sales-v1) cuando no hay match — caso !is_client.

    **Paso 3 — Crear `.planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md`** documentando las reglas creadas:

    ```markdown
    # Somnio Parity Rules — agent-lifecycle-router v1

    **Created:** <YYYY-MM-DD HH:MM:SS America/Bogota>
    **Workspace:** a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
    **Approach:** Opcion B (D-15 strict 100% parity) — fact `recompraEnabled` consume `workspace_agent_config.recompra_enabled` para replicar el switch legacy sin divergencias.

    ## Rules Created

    ### Rule 1 — forzar_humano_kill_switch (priority 1000)
    - **id:** <copy del id post-create>
    - **rule_type:** agent_router
    - **priority:** 1000
    - **conditions:**
      ```json
      { "all": [{ "fact": "tags", "operator": "arrayContainsAny", "value": ["forzar_humano", "pausar_agente"] }] }
      ```
    - **event:** `{ type: 'route', params: { agent_id: null } }` → human_handoff
    - **active:** true

    ### Rule 2 — legacy_parity_recompra_disabled_client_to_default (priority 900) — B-1 fix
    - **id:** <copy del id post-create>
    - **rule_type:** agent_router
    - **priority:** 900
    - **conditions:**
      ```json
      { "all": [
        { "fact": "isClient", "operator": "equal", "value": true },
        { "fact": "recompraEnabled", "operator": "equal", "value": false }
      ]}
      ```
    - **event:** `{ type: 'route', params: { agent_id: 'somnio-sales-v1' } }`
      - El literal `'somnio-sales-v1'` corresponde al valor actual de `workspace_agent_config.conversational_agent_id` para Somnio (verificable en `agent-config.ts:36` y `webhook-processor.ts:429` fallback). Esta regla se genera per-workspace al momento de parity-config — si Somnio cambiara su `conversational_agent_id`, la regla 2 debe re-crearse con el nuevo valor (mantenimiento documentado en 07-FLIP-PLAN.md).
    - **active:** true

    ### Rule 3 — is_client_to_recompra (priority 800)
    - **id:** <copy del id post-create>
    - **rule_type:** agent_router
    - **priority:** 800
    - **conditions:**
      ```json
      { "all": [
        { "fact": "isClient", "operator": "equal", "value": true },
        { "fact": "recompraEnabled", "operator": "equal", "value": true }
      ]}
      ```
    - **event:** `{ type: 'route', params: { agent_id: 'somnio-recompra-v1' } }`
    - **active:** true

    ## Behavior expected (parity 100% con webhook-processor.ts:174-188)

    | Caso | Legacy (flag OFF) | Router (flag ON) | Match? |
    |------|-------------------|-----------------|--------|
    | tag forzar_humano | (skip-tag handling existente) | reason=human_handoff (Rule 1) | YES — formaliza skip handling |
    | is_client + recompra_enabled=true | route to somnio-recompra-v1 | reason=matched, agent_id=somnio-recompra-v1 (Rule 3) | YES |
    | is_client + recompra_enabled=false | recompra_disabled_client_skip → fallthrough a sales-v1 (workspace.conversational_agent_id) (NOTA: legacy linea 187 hace `return { success: true }` que efectivamente silencia, pero la regla 900 routea explicitamente a sales-v1; esto se valida en dry-run Task 3 — si parity dice "diverge" investigar) | reason=matched, agent_id=somnio-sales-v1 (Rule 2) | TBD via dry-run |
    | !is_client | route to conversational_agent_id (somnio-sales-v1) | reason=no_rule_matched → fallback to conversational_agent_id (somnio-sales-v1 per Plan 04) | YES |

    ## Parity Validation Note (D-15)

    El caso "is_client + recompra_enabled=false" en legacy hace `return { success: true }` que es silencio (ningun agente responde). La regla 900 enruta a `somnio-sales-v1` para evitar perder al cliente. Si la operacion Somnio prefiere silencio en este caso, la opcion alternativa es `event.params.agent_id: null` (human_handoff). El dry-run en Task 3 captura este case explicitamente; si el resultado del dry-run muestra "diverge" en este caso, evaluar con el usuario si:
    1. Mantener Rule 2 con `agent_id: 'somnio-sales-v1'` (current — recupera trafico).
    2. Cambiar Rule 2 a `agent_id: null` (silencio identico al legacy).

    Decidir antes de Task 4 (flip).
    ```

    **Paso 4 — Commit:**
    ```bash
    git add .planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md
    git commit -m "docs(agent-lifecycle-router): Plan 07 Task 2 — Somnio parity rules (3 rules con priority 900 legacy parity, B-1 fix Opcion B)"
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md</automated>
    <automated>grep -q "forzar_humano_kill_switch" .planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md</automated>
    <automated>grep -q "is_client_to_recompra" .planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md</automated>
    <automated>grep -q "legacy_parity_recompra_disabled_client_to_default" .planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md</automated>
    <automated>grep -q "priority.*900" .planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md</automated>
  </verify>
  <acceptance_criteria>
    - 3 reglas creadas en routing_rules WHERE workspace_id='a3843b3f-...' (verificable via SQL: SELECT COUNT(*) FROM routing_rules WHERE workspace_id='a3843b3f-...' = 3) — B-1 fix Opcion B unconditional.
    - Documento `07-SOMNIO-PARITY-RULES.md` con los IDs reales de las 3 reglas y la tabla de behavior parity.
    - Rule 2 (priority 900) usa `recompraEnabled` fact + `agent_id: 'somnio-sales-v1'` literal (workspace.conversational_agent_id de agent-config.ts:36).
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - Reglas listas para dry-run validation en Task 3.
  </done>
</task>

<task type="auto">
  <name>Task 3: Dry-run validation contra Somnio 30d + documentar resultados</name>
  <read_first>
    - .planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md (Task 2 output)
    - src/lib/agents/routing/dry-run.ts (Plan 05)
  </read_first>
  <action>
    **Paso 1 — Ejecutar dry-run** desde el admin form Plan 06 (boton "Simular cambio") con `daysBack=30` (override default 7) — esto requiere o agregar un input al form para override el daysBack, O correr el dry-run via un script CLI temporal.

    **Approach simple:** crear un script ad-hoc `scripts/agent-lifecycle-router/parity-validation.ts` que invoca dryRunReplay y prints el output:

    ```typescript
    // scripts/agent-lifecycle-router/parity-validation.ts
    import { dryRunReplay } from '@/lib/agents/routing/dry-run'
    import { listRules } from '@/lib/domain/routing'

    async function main() {
      const workspaceId = 'a3843b3f-c337-4836-92b5-89c58bb98490'
      const rulesResult = await listRules({ workspaceId })
      if (!rulesResult.success) { console.error(rulesResult.error); process.exit(1) }
      const candidateRules = rulesResult.data.filter(r => r.active)

      const result = await dryRunReplay({
        workspaceId,
        candidateRules,
        daysBack: 30,
        limit: 5000,  // override default — ultimos 30 dias de Somnio puede ser mucho
      })

      console.log('\n=== DRY-RUN RESULT (Somnio 30d) ===\n')
      console.log('total_inbound:', result.total_inbound)
      console.log('changed_count:', result.summary.changed_count)
      console.log('before:', JSON.stringify(result.summary.before, null, 2))
      console.log('after:', JSON.stringify(result.summary.after, null, 2))
      console.log('\nFirst 20 changed decisions:')
      for (const d of result.decisions.filter(d => d.changed).slice(0, 20)) {
        console.log(`  ${d.conversation_id} ${d.contact_id}: ${d.current_decision?.reason}/${d.current_decision?.agent_id} → ${d.candidate_decision.reason}/${d.candidate_decision.agent_id}`)
      }
    }

    main().catch(e => { console.error(e); process.exit(1) })
    ```

    Run con vercel local env (o staging — pero contra DB de prod las queries son read-only safe — el dry-run NO escribe nada per Plan 05 verification):
    ```bash
    npx tsx scripts/agent-lifecycle-router/parity-validation.ts > /tmp/parity-output.txt
    ```

    **Paso 2 — Crear `.planning/standalone/agent-lifecycle-router/07-DRY-RUN-RESULT.md`**:

    ```markdown
    # Dry-run Result — Somnio Parity Validation

    **Date:** <YYYY-MM-DD HH:MM:SS America/Bogota>
    **Workspace:** a3843b3f-c337-4836-92b5-89c58bb98490
    **daysBack:** 30
    **limit:** 5000

    ## Resumen

    - **total_inbound:** <copy>
    - **changed_count:** <copy>
    - **changed_count / total_inbound:** <%>

    ## Distribucion before/after

    ### Before (decisiones actuales — flag OFF, legacy if/else)
    <copy JSON literal del output>

    ### After (decisiones del router con las parity rules)
    <copy JSON literal del output>

    ## Top 20 cambios

    <copy lista del script>

    ## Analisis

    - [ ] **PASS:** El UNICO cambio aceptado es la divergencia documentada en 07-SOMNIO-PARITY-RULES.md ("is_client + recompra_enabled=false" → ahora rutea a recompra-v1 en lugar de skip silencio). Si TODO el changed_count corresponde a este caso, parity OK.
    - [ ] **FAIL:** Aparecen cambios NO documentados (ej: clientes que antes iban a sales-v3 ahora van a recompra, o viceversa). Investigar caso por caso, ajustar reglas, repetir dry-run.

    Marcar checkbox + commit:
    ```

    **Paso 3 — Marcar PASS o FAIL en el doc** (basado en analisis manual del output):
    - **PASS:** Si los cambios son consistentes con la divergence documentada, proceder a Task 4.
    - **FAIL:** Pausar fase, ajustar reglas, repetir Tasks 2-3.

    **Paso 4 — Commit**:
    ```bash
    git add scripts/agent-lifecycle-router/parity-validation.ts \
            .planning/standalone/agent-lifecycle-router/07-DRY-RUN-RESULT.md
    git commit -m "docs(agent-lifecycle-router): Plan 07 Task 3 — dry-run parity validation Somnio 30d"
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/agent-lifecycle-router/07-DRY-RUN-RESULT.md</automated>
    <automated>grep -q "total_inbound" .planning/standalone/agent-lifecycle-router/07-DRY-RUN-RESULT.md</automated>
    <automated>grep -q "changed_count" .planning/standalone/agent-lifecycle-router/07-DRY-RUN-RESULT.md</automated>
    <automated>grep -q "PASS\|FAIL" .planning/standalone/agent-lifecycle-router/07-DRY-RUN-RESULT.md</automated>
  </verify>
  <acceptance_criteria>
    - Dry-run ejecutado contra Somnio 30d, output capturado.
    - `07-DRY-RUN-RESULT.md` con before/after distributions + lista de cambios + checkbox PASS/FAIL.
    - Si FAIL: parar fase, no proceder a Task 4.
    - Si PASS: proceder a Task 4.
  </acceptance_criteria>
  <done>
    - Parity validation completada y documentada.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: Push codigo + flip flag para Somnio (checkpoint humano)</name>
  <read_first>
    - .planning/standalone/agent-lifecycle-router/07-DRY-RUN-RESULT.md (Task 3 — confirmar PASS)
    - CLAUDE.md §Regla 1 (push) + §Regla 6 (proteger agente)
  </read_first>
  <what>
    1. Push del codigo a main (Plans 02-06 estan committed pero no pushed).
    2. Verificar Vercel deployment exitoso.
    3. Flip flag `lifecycle_routing_enabled=true` para Somnio workspace.
    4. Monitorear ambient.
  </what>
  <how-to-verify>
    **Step 1 — Push codigo:**
    ```bash
    git push origin main
    ```
    Esperar Vercel deployment. Verificar en https://vercel.com/<account>/morfx-new que el build pasa.

    **Step 2 — Smoke test post-deploy** (con flag aun OFF, comportamiento debe ser igual al pre-deploy):
    - Enviar mensaje de prueba al numero Somnio desde un test contact (no_client). Confirmar que el agente responde con somnio-sales-v3 como antes.
    - Enviar mensaje de prueba desde un contact con is_client=true. Confirmar que recompra-v1 atiende como antes.
    - Si algun smoke falla → KILL SWITCH: `git revert HEAD~N..HEAD` + push.

    **Step 3 — Flip flag para Somnio:**
    En Supabase Studio SQL Editor (PRODUCTION):
    ```sql
    UPDATE workspace_agent_config
    SET lifecycle_routing_enabled = true,
        updated_at = timezone('America/Bogota', NOW())
    WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
    ```
    Verificar:
    ```sql
    SELECT lifecycle_routing_enabled FROM workspace_agent_config WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490';
    -- Esperado: true
    ```

    **Step 4 — Smoke test post-flip:**
    - Enviar mensaje desde un contacto NO is_client. Esperado: el log de webhook-processor debe contener "router_fallback_default_agent" o "router_matched" con agent_id=somnio-sales-v3 (depende de las reglas creadas).
    - Enviar mensaje desde un contacto is_client. Esperado: "router_matched" con agent_id=somnio-recompra-v1.
    - Verificar que `routing_audit_log` tiene rows nuevos (SELECT COUNT(*) > 0).
    - Verificar que NO hay rows con `reason='fallback_legacy'` en los primeros minutos (eso seria signal de error en el engine).

    **Step 5 — KILL SWITCH instructions** (si algo va mal en las primeras 24h):
    ```sql
    -- En Supabase Studio production:
    UPDATE workspace_agent_config
    SET lifecycle_routing_enabled = false
    WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
    -- Confirma que la lambda siguiente lee el cambio dentro de 10s (TTL LRU).
    ```
    El comportamiento legacy if/else regresa instantaneamente. Codigo nuevo se queda intacto.
  </how-to-verify>
  <resume-signal>
    Type "rollout completo, monitoreando 24h" o describir issues + KILL SWITCH ejecutado.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 5: Documentacion (Regla 4) + flip plan + cleanup deferral</name>
  <read_first>
    - docs/architecture/ (estructura existente)
    - docs/analysis/04-estado-actual-plataforma.md (verificar formato)
    - .planning/standalone/agent-lifecycle-router/ todos los archivos creados
  </read_first>
  <action>
    **Paso 1 — Crear `.planning/standalone/agent-lifecycle-router/07-FLIP-PLAN.md`**:

    ```markdown
    # Flip Plan + 24h Monitoring + v1.1 Cleanup Deferral

    **Flip date:** <YYYY-MM-DD HH:MM:SS America/Bogota>
    **Workspace:** a3843b3f-c337-4836-92b5-89c58bb98490 (Somnio)
    **Code commit:** <SHA del HEAD post-push>

    ## 24h monitoring checklist

    - [ ] Hour +1: routing_audit_log rows > 0
    - [ ] Hour +1: `reason='fallback_legacy'` rows = 0 (engine no fallo)
    - [ ] Hour +6: distribucion de `reason` consistente con el dry-run de Task 3
    - [ ] Hour +12: ningun ticket de soporte por "el bot no responde" o "responde mal"
    - [ ] Hour +24: query p95 latency (I-3 fix):
      ```sql
      SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
      FROM routing_audit_log
      WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
        AND created_at > NOW() - INTERVAL '24 hours';
      ```
      **Threshold:** p95_ms < 200. Si p95 >= 200, investigar (cache hit ratio, fact resolver tail latency, DB load) — no necesariamente KILL SWITCH si throughput estable, pero documentar en 07-FLIP-PLAN.md como issue.
    - [ ] Hour +24: KEEP flag ON. Si algun checkbox arriba fallo critico (rows = 0, fallback_legacy > 1%, ticket de soporte por bot), KILL SWITCH.

    ## KILL SWITCH

    SQL (in Supabase Studio production):
    ```sql
    UPDATE workspace_agent_config
    SET lifecycle_routing_enabled = false
    WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
    ```

    Recovery time: <10s (LRU TTL). Legacy if/else regresa instantaneamente.

    ## Behavior change documentation

    ### "is_client + recompra_enabled=false" caso

    **Pre-router:** webhook-processor.ts:174-188 hacia `recompra_disabled_client_skip` cuando recompraEnabled=false. Bot no respondia.

    **Post-router (v1):** ese case ya no es manejado por flag global. El admin debe usar tag `pausar_agente` en contactos especificos para silenciar el bot. NO HAY equivalencia automatica.

    **Migracion para clientes Somnio si se quiere preservar el behavior:**
    1. Si `workspace_agent_config.recompra_enabled=false` para Somnio → tagear TODOS los is_client contacts con `pausar_agente` ANTES del flip.
    2. SQL de migracion (CORRER ANTES DEL FLIP solo si Somnio tiene recompra_enabled=false):
       ```sql
       INSERT INTO contact_tags (contact_id, tag_id)
       SELECT c.id, (SELECT id FROM tags WHERE name='pausar_agente' AND workspace_id=c.workspace_id)
       FROM contacts c
       WHERE c.workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
         AND c.is_client = true
         AND NOT EXISTS (SELECT 1 FROM contact_tags ct
                          INNER JOIN tags t ON t.id=ct.tag_id
                          WHERE ct.contact_id=c.id AND t.name='pausar_agente');
       ```
    Si Somnio tiene `recompra_enabled=true` (default), este caso es N/A.

    ## v1.1 Cleanup deferral (D-15)

    Despues de ~1-2 semanas de rollout exitoso (criterios PASS en monitoring):

    1. Crear nuevo standalone phase: `agent-lifecycle-router-cleanup`
    2. Tasks:
       - Borrar el bloque legacy if/else en `webhook-processor.ts:174-360` (el `if (!routerHandledMessage) { ... }` y todo lo que esta adentro).
       - Borrar la columna `lifecycle_routing_enabled` de `workspace_agent_config`.
       - Borrar el case `reason='fallback_legacy'` del switch en webhook-processor.ts (sin legacy a fall back, eso muere).
       - Update docs.

    Hasta entonces, el legacy if/else SE QUEDA INTACTO en codigo (D-15 strict).

    ## Trigger de KILL SWITCH automatico (futuro consideracion v1.2)

    Si en algun rollout futuro el `routing_audit_log` muestra > 1% de `reason='fallback_legacy'` en una ventana de 5 minutos, considerar agregar un Inngest scheduled function que monitoree y emita un alert. NO en scope v1.
    ```

    **Paso 2 — Crear `docs/architecture/agent-lifecycle-router.md`** (Regla 4 — documentacion arquitectural):

    ```markdown
    # Agent Lifecycle Router — Architecture

    **Status:** SHIPPED v1 — 2026-04-XX
    **Standalone phase:** .planning/standalone/agent-lifecycle-router/
    **Pending v1.1:** cleanup standalone (~1-2 weeks post-rollout)

    ## What it solves

    Reemplaza el if/else binario hardcoded en webhook-processor.ts:174-188 (is_client+recompra_enabled vs default) por un decision engine declarativo editable sin redeploy.

    ## 3-layer model

    ```
    inbound webhook
        ↓
    feature flag check (lifecycle_routing_enabled)
        ├── OFF → legacy if/else (preserved inline per D-15)
        └── ON  → router pipeline:
                  Layer 1: lifecycle_classifier rules → emits lifecycle_state
                  Layer 2: agent_router rules → emits agent_id (or null = human_handoff)
                  ↓
                  audit log (routing_audit_log)
                  ↓
                  webhook-processor downstream branch (lines 443-511 unchanged)
    ```

    ## Stack

    - `json-rules-engine@7.3.1` (decision engine)
    - `lru-cache@11` (10s TTL, max 100 workspaces, version-column revalidation)
    - `ajv@8` (JSON Schema validation rule-v1.schema.json)
    - Supabase tables: `routing_rules`, `routing_facts_catalog`, `routing_audit_log`

    ## Key constraints

    - Domain layer (Regla 3): `src/lib/domain/routing.ts` es el UNICO archivo con createAdminClient para routing tables
    - Timezone Bogota (Regla 2): operadores `daysSinceAtMost`/`daysSinceAtLeast` honoran America/Bogota
    - Default OFF (Regla 6): per-workspace flag, default false
    - Pitfall 1: UNIQUE constraint en (workspace_id, rule_type, priority) WHERE active=true (DB-level + runtime check en cache.ts)
    - Pitfall 2: rule-v1.schema.json rechaza `path` field en leaf conditions (CVE-2025-1302 mitigation)

    ## File structure

    - `src/lib/agents/routing/` — engine code (Pitfall 7: per-request Engine)
    - `src/lib/domain/routing.ts` — single-source-of-truth para mutations
    - `src/app/(dashboard)/agentes/routing/` — admin form (5 surfaces D-06)
    - `supabase/migrations/<ts>_agent_lifecycle_router.sql` — schema

    ## v2 roadmap (deferred)

    - `routing-builder` agent conversacional — usuario habla a un agente para editar reglas
    - Editor visual avanzado (dmn-js) si crece a 25+ rules
    - Migration a DMN si compliance externo lo exige
    ```

    **Paso 3 — Update `docs/analysis/04-estado-actual-plataforma.md`** agregando una seccion para el modulo:

    Buscar la seccion de "Agentes" o "Routing" y agregar:

    ```markdown
    ### Module: Agent Lifecycle Router (v1, shipped <date>)

    - **Status:** SHIPPED v1 (Somnio rollout completed <date>)
    - **Standalone:** .planning/standalone/agent-lifecycle-router/
    - **Capability:** Decision engine declarative para enrutar agentes basado en lifecycle del contacto. Reemplaza if/else hardcoded en webhook-processor.ts:174-188.
    - **Stack:** json-rules-engine@7.3.1 + lru-cache@11 + ajv@8
    - **Tables:** routing_rules, routing_facts_catalog, routing_audit_log + workspace_agent_config.lifecycle_routing_enabled
    - **Admin UI:** /agentes/routing (5 surfaces — list, editor, simulate, audit, facts catalog)
    - **Pending tech debt:** v1.1 cleanup (borrar legacy if/else inline + feature flag column) — agendado ~1-2 weeks post-rollout
    ```

    **Paso 4 — Commit**:
    ```bash
    git add .planning/standalone/agent-lifecycle-router/07-FLIP-PLAN.md \
            docs/architecture/agent-lifecycle-router.md \
            docs/analysis/04-estado-actual-plataforma.md
    git commit -m "docs(agent-lifecycle-router): Plan 07 Task 5 — flip plan + architecture + estado plataforma (Regla 4)"
    git push origin main
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/agent-lifecycle-router/07-FLIP-PLAN.md</automated>
    <automated>test -f docs/architecture/agent-lifecycle-router.md</automated>
    <automated>grep -q "agent-lifecycle-router" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -q "KILL SWITCH" .planning/standalone/agent-lifecycle-router/07-FLIP-PLAN.md</automated>
    <automated>grep -q "v1.1 Cleanup" .planning/standalone/agent-lifecycle-router/07-FLIP-PLAN.md</automated>
  </verify>
  <acceptance_criteria>
    - 3 archivos creados (07-FLIP-PLAN.md, docs/architecture/agent-lifecycle-router.md, update a docs/analysis).
    - Flip plan tiene KILL SWITCH instructions + v1.1 cleanup deferral documentado.
    - docs/architecture documenta arquitectura final (3-layer + stack + constraints).
    - docs/analysis incluye el modulo nuevo.
    - Commit + push.
  </acceptance_criteria>
  <done>
    - Documentacion completa, fase shippeada.
  </done>
</task>

</tasks>

<verification>
- Migracion aplicada en prod (Regla 5).
- Reglas Somnio creadas via admin form.
- Dry-run validation PASS antes del flip.
- Codigo pusheado.
- Flag flippeada para Somnio.
- 24h monitoring checklist activado.
- Documentacion actualizada (Regla 4).
- v1.1 cleanup deferido y documentado.
</verification>

<success_criteria>
- Somnio workspace usa el router en produccion.
- Legacy if/else NO se ha eliminado (D-15).
- Flag puede flippearse OFF en cualquier momento (KILL SWITCH).
- Otros workspaces siguen con flag OFF (Regla 6).
- Phase v1 cierra. v1.1 cleanup pendiente.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-lifecycle-router/07-SUMMARY.md` documentando:
- Migracion aplicada (timestamp).
- Reglas creadas en Somnio (count + IDs).
- Dry-run result (changed_count, parity verdict).
- Code push (commit SHA).
- Flag flip (timestamp + workspace).
- 24h monitoring start.
- v1.1 cleanup standalone scheduled.
</output>
