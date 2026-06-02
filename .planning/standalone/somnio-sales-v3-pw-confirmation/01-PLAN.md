---
phase: somnio-sales-v3-pw-confirmation
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql
  - .planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md
autonomous: false

must_haves:
  truths:
    - "01-AUDIT.sql contiene 5 queries: (a) stage UUIDs de NUEVO PAG WEB / FALTA INFO / FALTA CONFIRMAR / CONFIRMADO en pipeline 'Ventas Somnio Standard' (D-04, D-10, D-14), (b) existencia + body de templates pre-activacion `pedido_recibido_v2`, `direccion_entrega`, `confirmar_compra` (D-09 + D-26), (c) viabilidad de `messages.template_name` populated para los 3 templates (D-26 sanity check), (d) inventario de automations Somnio disparadas por stage_changed en pipeline Ventas (D-10 — confirma que mover a CONFIRMADO ya dispara logistica/factura), (e) snapshot del estado actual de `agent_templates WHERE agent_id='somnio-sales-v3-pw-confirmation'` (debe estar vacio — el agente nuevo no existe)"
    - "01-SNAPSHOT.md tiene los 5 outputs de queries pegados verbatim del Supabase SQL Editor production"
    - "Stage UUIDs de los 4 stages relevantes capturados literalmente y listos para hardcode en Wave 1 Plan 04 constants.ts (Open Q7 resuelto: hardcode tras audit prod, NO runtime resolution)"
    - "Si query (b) devuelve 0 rows para alguno de los 3 templates pre-activacion → BLOCKER: pausar fase y escalar al usuario (D-26 asume que existen — si no, el contrato del agente esta roto)"
    - "Si query (c) muestra que `template_name` esta NULL para los 3 templates pre-activacion → documentar en SNAPSHOT pero NO bloquear (D-26 desacopla: el estado de la maquina, no `messages.template_name`, es el guard del 'si')"
    - "Si query (d) muestra que NO existe automation que mueva a CONFIRMADO + dispare logistica → escalar al usuario (asuncion RESEARCH §E.2 resultaria invalida — el agente solo mueve stage, asume que automations hacen el resto)"
  artifacts:
    - path: ".planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql"
      provides: "5 queries de audit production: stage UUIDs + templates pre-activacion + viability messages.template_name + automations Somnio + agent_templates baseline"
      contains: "Ventas Somnio Standard"
    - path: ".planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md"
      provides: "Outputs literales de las 5 queries + decision Go/No-Go por query"
      contains: "Stage UUIDs"
  key_links:
    - from: ".planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md §Stage UUIDs"
      to: "src/lib/agents/somnio-pw-confirmation/constants.ts (Wave 1 Plan 04)"
      via: "PW_CONFIRMATION_STAGES = { NUEVO_PAG_WEB: '<uuid>', FALTA_INFO: '<uuid>', FALTA_CONFIRMAR: '<uuid>', CONFIRMADO: '<uuid>' }"
      pattern: "PW_CONFIRMATION_STAGES"
    - from: ".planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md §Pre-activation templates"
      to: "src/lib/agents/somnio-pw-confirmation/state.ts (Wave 2 Plan 06 — initial state = 'awaiting_confirmation' per D-26)"
      via: "documentacion del contrato D-26 — los 3 templates ya enviados antes de invocar agente"
      pattern: "awaiting_confirmation"
---

<objective>
Wave 0 — SQL audit production + snapshot. Captura los datos productivos necesarios para que las 13 plans subsecuentes puedan referenciar UUIDs y contratos verificados (no asumidos). Implementa D-24 §1, §5, §8 + parcial §11.

Purpose: Las decisiones D-04 (stage names), D-09 (templates pre-activacion), D-10 (automations CONFIRMADO), D-14 (FALTA CONFIRMAR), D-26 (state initial = 'awaiting_confirmation') asumen datos productivos que NO estan en el codebase. Esta plan verifica empiricamente y captura los UUIDs / bodies / counts en un snapshot inmutable. Si CUALQUIER assumption falla → fase pausada y escalada al usuario antes de tocar codigo.

Output: 1 archivo SQL (`01-AUDIT.sql`) + 1 archivo de snapshot (`01-SNAPSHOT.md`) con outputs reales de produccion + Go/No-Go decision por query.

**CRITICAL — Regla 5:** Esta plan NO aplica ninguna mutacion en produccion. Solo lee. Las queries SELECT son seguras. La aplicacion de la migracion de templates (Plan 02) NO ocurre aqui — eso es Plan 12.

**CRITICAL — Bloqueante:** Si query (b) o query (d) devuelve resultados invalidos, PAUSAR fase. NO avanzar a Wave 1.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md
@.planning/standalone/somnio-sales-v3-pw-confirmation/DISCUSSION-LOG.md
@.planning/standalone/somnio-recompra-template-catalog/01-PLAN.md — patron exacto Wave 0 SQL audit + snapshot file
@CLAUDE.md
@supabase/migrations/20260427160000_routing_facts_pipeline_stage_raw.sql — referencia de pipeline 'Ventas Somnio Standard'
@supabase/migrations/20260131000002_whatsapp_extended_foundation.sql — schema whatsapp_templates + messages.template_name
@supabase/migrations/20260206000000_agent_templates.sql — schema agent_templates (UNIQUE constraint, RLS)

<interfaces>
<!-- Workspace Somnio (LOCKED por D-19) -->
WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'

<!-- Pipeline name LOCKED por RESEARCH §E.1 (verificado en migration 20260427160000) -->
PIPELINE_NAME = 'Ventas Somnio Standard'

<!-- Stage names LOCKED por CONTEXT D-04 + D-10 + D-14 + D-18 -->
STAGE_NAMES = ['NUEVO PAG WEB', 'FALTA INFO', 'FALTA CONFIRMAR', 'CONFIRMADO']

<!-- Template names LOCKED por CONTEXT D-09 + D-26 (asuncion del flujo pre-activacion) -->
PREACTIVATION_TEMPLATES = ['pedido_recibido_v2', 'direccion_entrega', 'confirmar_compra']

<!-- agent_id LOCKED por D-01 -->
AGENT_ID = 'somnio-sales-v3-pw-confirmation'
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear `01-AUDIT.sql` con las 5 queries de audit production</name>
  <read_first>
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §E.1 (stages), §E.2 (automations), §F.1 (templates pre-activacion), §A.1 (agent_templates baseline)
    - .planning/standalone/somnio-recompra-template-catalog/01-PLAN.md Task 1 (patron snapshot+audit)
    - supabase/migrations/20260427160000_routing_facts_pipeline_stage_raw.sql (verificar nombre exacto del pipeline 'Ventas Somnio Standard')
  </read_first>
  <action>
    Crear el archivo `.planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql` con el contenido literal siguiente. Este archivo NO se aplica automaticamente — el usuario lo corre manual en Supabase SQL Editor de produccion en Task 2.

    ```sql
    -- ============================================================================
    -- Audit production for somnio-sales-v3-pw-confirmation (Wave 0 / Plan 01)
    -- ============================================================================
    -- Workspace: Somnio (a3843b3f-c337-4836-92b5-89c58bb98490)
    -- Pipeline: 'Ventas Somnio Standard'
    -- Read-only. Safe to run multiple times.

    -- ----------------------------------------------------------------------------
    -- Query (a) — Stage UUIDs de los 4 stages relevantes (D-04, D-10, D-14, D-18)
    -- Esperado: 4 rows. Si <4 → BLOCKER (algun stage no existe en prod).
    -- ----------------------------------------------------------------------------
    SELECT
      s.id AS stage_uuid,
      s.name AS stage_name,
      s.position,
      p.name AS pipeline_name,
      p.id AS pipeline_uuid
    FROM pipeline_stages s
    JOIN pipelines p ON p.id = s.pipeline_id
    WHERE p.workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
      AND p.name = 'Ventas Somnio Standard'
      AND s.name IN ('NUEVO PAG WEB', 'FALTA INFO', 'FALTA CONFIRMAR', 'CONFIRMADO')
    ORDER BY s.position;

    -- ----------------------------------------------------------------------------
    -- Query (b) — Templates pre-activacion: existencia + body (D-09, D-26)
    -- Esperado: 3 rows con `name`, `language`, `category`, `status`, `components`,
    --           `variable_mapping`. Si <3 → BLOCKER (contrato D-26 invalido).
    -- ----------------------------------------------------------------------------
    SELECT
      id,
      name,
      language,
      category,
      status,
      components,
      variable_mapping,
      created_at
    FROM whatsapp_templates
    WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
      AND name IN ('pedido_recibido_v2', 'direccion_entrega', 'confirmar_compra')
    ORDER BY name;

    -- ----------------------------------------------------------------------------
    -- Query (c) — Viabilidad de messages.template_name populated (D-26 sanity check)
    -- Esperado: 3 rows (uno por template) con count > 0. Si row faltante → NO BLOCKER
    -- (D-26 desacopla — la maquina de estados es el guard real, NO template_name).
    -- Pero documentar en SNAPSHOT.
    -- ----------------------------------------------------------------------------
    SELECT
      template_name,
      COUNT(*) AS occurrences,
      MAX(timestamp) AS last_seen
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
      AND m.direction = 'outbound'
      AND m.template_name IN ('pedido_recibido_v2', 'direccion_entrega', 'confirmar_compra')
    GROUP BY template_name
    ORDER BY template_name;

    -- ----------------------------------------------------------------------------
    -- Query (d) — Automations Somnio disparadas por stage_changed (D-10, RESEARCH §E.2)
    -- Esperado: >=1 row con automation que mueva a/desde CONFIRMADO O dispare actions
    -- de logistica/factura cuando entra a CONFIRMADO. Si 0 rows mencionando CONFIRMADO
    -- → BLOCKER (el agente solo mueve stage; si automations no existen, el flujo se rompe).
    -- ----------------------------------------------------------------------------
    SELECT
      id,
      name,
      enabled,
      trigger_config,
      actions
    FROM automations
    WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
      AND (
        trigger_config->>'trigger' = 'stage_changed'
        OR trigger_config::text ILIKE '%CONFIRMADO%'
        OR trigger_config::text ILIKE '%FALTA CONFIRMAR%'
      )
    ORDER BY name;

    -- ----------------------------------------------------------------------------
    -- Query (e) — Baseline agent_templates: el agente nuevo NO debe tener filas todavia
    -- Esperado: 0 rows. Si >0 → algo se pre-creo y debe limpiarse antes de Wave 1 Plan 02.
    -- ----------------------------------------------------------------------------
    SELECT
      id,
      intent,
      visit_type,
      orden,
      content_type,
      LEFT(content, 80) AS content_preview,
      priority,
      workspace_id
    FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
    ORDER BY intent, orden;
    ```

    Hacer commit del archivo:
    ```bash
    git add .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql
    git commit -m "docs(somnio-sales-v3-pw-confirmation): add Wave 0 SQL audit queries (stages, pre-activation templates, automations, baseline)"
    ```

    NO push.
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql</automated>
    <automated>grep -q "Ventas Somnio Standard" .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql</automated>
    <automated>grep -q "pedido_recibido_v2" .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql</automated>
    <automated>grep -q "direccion_entrega" .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql</automated>
    <automated>grep -q "confirmar_compra" .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql</automated>
    <automated>grep -q "NUEVO PAG WEB" .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql</automated>
    <automated>grep -q "FALTA CONFIRMAR" .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql</automated>
    <automated>grep -q "CONFIRMADO" .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql</automated>
    <automated>grep -q "somnio-sales-v3-pw-confirmation" .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql</automated>
    <automated>grep -c "^SELECT" .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql | awk '$1 >= 5 { exit 0 } { exit 1 }'</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(somnio-sales-v3-pw-confirmation): add Wave 0 SQL audit queries"</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql` existe y contiene las 5 queries SELECT.
    - Cada query tiene comentario explicativo (Query a/b/c/d/e + criterio Go/No-Go).
    - Pipeline name literal `'Ventas Somnio Standard'`, workspace UUID literal, los 4 stage names literales, los 3 template names literales, agent_id literal.
    - Commit atomico con mensaje exacto.
    - NO push.
  </acceptance_criteria>
  <done>
    - Archivo SQL listo para que el usuario ejecute en Supabase SQL Editor de produccion.
    - Commit atomico en git, NO pusheado.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint humano — Usuario corre las 5 queries en prod + Claude crea SNAPSHOT</name>
  <read_first>
    - .planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql (creado en Task 1)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-09, §D-10, §D-14, §D-26
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §E.1, §E.2, §F.1
  </read_first>
  <what-built>
    Claude creo `01-AUDIT.sql` con 5 queries SELECT-only para producción. Necesitamos:
    1. Que el usuario abra Supabase SQL Editor del proyecto Somnio prod.
    2. Pegue cada query y ejecute (puede ser una a la vez o todas juntas).
    3. Pegue los 5 outputs verbatim al chat (o los suba como archivo).
    4. Claude cree `01-SNAPSHOT.md` con los outputs + decision Go/No-Go por query.

    **Los outputs son CRITICOS** para Wave 1+: las stage UUIDs se hardcodearan en `constants.ts` (Plan 04). Sin estos UUIDs reales, el agente no sabe a que stage mover el pedido.
  </what-built>
  <how-to-verify>
    **Paso 1 — Aplicar las 5 queries en Supabase SQL Editor production:**

    1. Abrir https://supabase.com/dashboard → proyecto morfx prod → SQL Editor → New query.
    2. Copiar el contenido de `.planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql`.
    3. Pegar y correr una a una (cada query SELECT termina con `;`).
    4. Para cada query, copiar el output completo (sin truncar) y pegarlo al chat.

    **Paso 2 — Decision Go/No-Go por query:**

    | Query | Go (avanzar a Wave 1) | No-Go (PAUSAR + escalar) |
    |-------|------------------------|---------------------------|
    | (a) Stage UUIDs | 4 rows con UUIDs validos | <4 rows o pipeline 'Ventas Somnio Standard' no existe |
    | (b) Pre-activation templates | 3 rows con bodies validos | <3 rows (D-26 contrato roto) |
    | (c) messages.template_name viability | Cualquier resultado, NO bloqueante | N/A — solo informativo |
    | (d) Automations | >=1 row mencionando CONFIRMADO con actions de logistica/factura | 0 rows mencionando CONFIRMADO (asuncion §E.2 invalida) |
    | (e) agent_templates baseline | 0 rows | >0 rows (limpiar antes de Plan 02) |

    **Paso 3 — Claude crea `01-SNAPSHOT.md` con el siguiente template:**

    ```markdown
    # Snapshot Audit Production — somnio-sales-v3-pw-confirmation

    **Fecha captura:** <YYYY-MM-DD HH:MM America/Bogota>
    **Workspace:** Somnio (a3843b3f-c337-4836-92b5-89c58bb98490)
    **Source:** outputs verbatim de las 5 queries en `01-AUDIT.sql`.
    **Proposito:** desbloquear Wave 1 con UUIDs reales hardcoded (Open Q7 resuelto via audit).

    ## Query (a) — Stage UUIDs (D-04, D-10, D-14, D-18)

    | stage_uuid | stage_name | position | pipeline_name | pipeline_uuid |
    |------------|-----------|----------|---------------|---------------|
    | <pegar output verbatim> |

    **Decision:** [ ] GO (4/4 stages encontrados) / [ ] NO-GO (<4 stages — escalar)

    **Stage UUIDs LOCKED para Plan 04 constants.ts:**
    - `NUEVO_PAG_WEB`     = '<uuid>'
    - `FALTA_INFO`        = '<uuid>'
    - `FALTA_CONFIRMAR`   = '<uuid>'
    - `CONFIRMADO`        = '<uuid>'
    - `PIPELINE_VENTAS_SOMNIO` = '<uuid>'

    ## Query (b) — Templates pre-activacion (D-09, D-26)

    | id | name | language | category | status | components_preview | variable_mapping |
    |----|------|----------|----------|--------|--------------------|------------------|
    | <pegar output verbatim — components puede truncarse a 200 chars con ellipsis> |

    **Decision:** [ ] GO (3/3 templates existen + status=APPROVED) / [ ] NO-GO (<3 o status invalido — D-26 contrato roto, escalar)

    ## Query (c) — messages.template_name viability (D-26 sanity check, NO bloqueante)

    | template_name | occurrences | last_seen |
    |---------------|-------------|-----------|
    | <pegar output verbatim> |

    **Interpretacion:**
    - Si los 3 templates aparecen con occurrences >0 → `template_name` SI se popula. Helper `getLastTemplateName(conversationId)` puede ser util como sanity check secundario (NO guard primario por D-26).
    - Si 0 occurrences → `template_name` NO se popula (sistema pre-activacion bypass del sender de morfx). El agente DEBE confiar 100% en el estado de la maquina (D-26).

    **Decision:** [ ] Documentado (no bloquea — D-26 ya desacopla)

    ## Query (d) — Automations Somnio (D-10, RESEARCH §E.2)

    | id | name | enabled | trigger_config_preview | actions_preview |
    |----|------|---------|------------------------|-----------------|
    | <pegar output verbatim> |

    **Analisis automations relevantes a CONFIRMADO:**
    - <listar nombre + trigger + actions de las automations que disparan al entrar a CONFIRMADO>

    **Decision:**
    - [ ] GO (>=1 automation dispara logistica/factura/tag al entrar a CONFIRMADO — el agente solo mueve stage, automations hacen el resto).
    - [ ] NO-GO (0 automations a CONFIRMADO — escalar al usuario; el flujo se rompe si solo movemos stage).

    ## Query (e) — agent_templates baseline

    | id | intent | visit_type | orden | content_type | content_preview | priority | workspace_id |
    |----|--------|-----------|-------|--------------|-----------------|----------|--------------|
    | <pegar output verbatim — esperado: 0 rows> |

    **Decision:** [ ] GO (0 rows — agente fresh) / [ ] NO-GO (>0 rows — limpiar manualmente con DELETE antes de Plan 02)

    ## Decision agregada

    - [ ] **Wave 0 PASA — desbloquear Wave 1.** Todas las decisions individuales son GO o "no bloqueante".
    - [ ] **Wave 0 BLOCKER — pausar fase.** Quien y por que: ___

    ## Stage UUIDs locked para uso en Wave 1+

    Estos 5 UUIDs se usaran como constantes en `src/lib/agents/somnio-pw-confirmation/constants.ts` (Plan 04 Task 1):

    ```typescript
    export const PW_CONFIRMATION_STAGES = {
      PIPELINE_ID: '<pegar pipeline_uuid>',
      NUEVO_PAG_WEB: '<pegar stage_uuid>',
      FALTA_INFO: '<pegar stage_uuid>',
      FALTA_CONFIRMAR: '<pegar stage_uuid>',
      CONFIRMADO: '<pegar stage_uuid>',
    } as const
    ```
    ```

    **Paso 4 — Claude commit:**

    ```bash
    git add .planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md
    git commit -m "docs(somnio-sales-v3-pw-confirmation): add Wave 0 production snapshot — stage UUIDs + pre-activation templates + automations audit"
    ```
  </how-to-verify>
  <acceptance_criteria>
    - Usuario corrio las 5 queries en Supabase SQL Editor de produccion.
    - Claude pego los 5 outputs verbatim en `01-SNAPSHOT.md`.
    - Stage UUIDs reales capturados (los 4 stages + el pipeline UUID).
    - Templates pre-activacion confirmados existentes (3/3) o escalado al usuario si <3.
    - Automations relevantes a CONFIRMADO documentadas (>=1) o escalado si 0.
    - Decision agregada marcada como "GO" — todas las queries pasan.
    - Si BLOCKER (b o d): NO avanzar a Wave 1, escalar al usuario, documentar la accion correctiva en SNAPSHOT.md.
    - Commit atomico con mensaje exacto.
  </acceptance_criteria>
  <resume-signal>
    Escribe "audit aprobado" (5/5 queries OK + decisions GO) para desbloquear Wave 1 (Plans 02 + 03 paralelizables).

    Si query (b) o (d) falla:
    - Pega el output al chat.
    - Discutamos la accion correctiva (crear los templates manualmente, crear automation, etc.) ANTES de proceder.
  </resume-signal>
</task>

</tasks>

<verification>
- `.planning/standalone/somnio-sales-v3-pw-confirmation/01-AUDIT.sql` existe con 5 queries SELECT.
- `.planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md` existe con outputs verbatim del usuario.
- Stage UUIDs de los 4 stages relevantes capturados.
- Templates pre-activacion confirmados (3/3) o escalado.
- Automations a CONFIRMADO confirmadas (>=1) o escalado.
- Decision agregada GO marcada.
- 2 commits atomicos en git, NO pusheados (Wave 0 queda local hasta Plan 12).
</verification>

<success_criteria>
- Plan 02 (template migration file) puede usar el agent_id locked + saber que el catalogo nuevo es greenfield (Query e = 0 rows).
- Plan 04 (constants.ts) puede hardcodear los 4 stage UUIDs reales (Open Q7 cerrado).
- Plan 06 (state machine) puede asumir D-26 (estado inicial = 'awaiting_confirmation') con seguridad — los 3 templates pre-activacion existen y son validos.
- Si la audit revela un blocker, la fase se pausa SIN tocar codigo (cero side-effects).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/01-SUMMARY.md` documenting:
- Commit hash de Task 1 (audit SQL file)
- Commit hash de Task 2 (snapshot file)
- Resultado agregado: GO / NO-GO con razon.
- Lista de los 4 stage UUIDs locked (con names).
- Confirmacion de los 3 pre-activation templates existentes (status, language).
- Lista de automations relevantes a CONFIRMADO (>=1).
- Pegar la seccion `PW_CONFIRMATION_STAGES` de SNAPSHOT.md aqui — sera la fuente exacta para Plan 04 Task 1.
</output>
</content>
</invoke>