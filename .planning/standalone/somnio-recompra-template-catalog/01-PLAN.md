---
phase: somnio-recompra-template-catalog
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/<ts>_recompra_template_catalog.sql
  - .planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md
autonomous: false

must_haves:
  truths:
    - "Snapshot SQL pre-migracion capturado — todas las filas actuales bajo agent_id='somnio-recompra-v1' serializadas en 01-SNAPSHOT.md para rollback de emergencia"
    - "Auditoria empirica D-11 ejecutada: los 22 intents esperados (sin los 2 que esta fase crea) existen bajo agent_id='somnio-recompra-v1' con rows_found >= 1"
    - "Archivo de migracion SQL existe en git con contenido literal: DELETE saludo + INSERT saludo orden=0 + INSERT saludo orden=1 imagen + DO $$ INSERT preguntar_direccion_recompra + DO $$ INSERT registro_sanitario + GRANTs"
    - "Usuario aprobo el copy exacto de los 3 templates (D-10 checkpoint): saludo texto, saludo imagen URL+caption, preguntar_direccion_recompra, registro_sanitario"
    - "Migracion NO aplicada en produccion todavia (Regla 5 — se aplica en Plan 05 junto con el push de codigo)"
  artifacts:
    - path: "supabase/migrations/<YYYYMMDDHHMMSS>_recompra_template_catalog.sql"
      provides: "Migracion SQL idempotente para poblar catalogo recompra-v1 con 3 templates (2 reemplazo saludo + 1 nuevo preguntar_direccion_recompra + 1 nuevo registro_sanitario)"
      contains: "INSERT INTO agent_templates"
    - path: ".planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md"
      provides: "Snapshot JSON del estado actual de agent_templates WHERE agent_id='somnio-recompra-v1' + resultado auditoria D-11"
      contains: "somnio-recompra-v1"
  key_links:
    - from: "supabase/migrations/<ts>_recompra_template_catalog.sql"
      to: "agent_templates table (Supabase production)"
      via: "DELETE + INSERT + DO $$ IF NOT EXISTS blocks"
      pattern: "agent_id = 'somnio-recompra-v1'"
    - from: "01-SNAPSHOT.md"
      to: "rollback plan (D-09 Opcion A — sin feature flag)"
      via: "JSON serializado de filas pre-migracion, reusable como INSERT reverso si hace falta rollback"
      pattern: "jsonb_pretty"
---

<objective>
Wave 0 — SQL audit + snapshot + migracion file + checkpoint humano de copy. Prepara toda la infra SQL para el catalogo independiente de recompra SIN aplicar en produccion todavia (Regla 5: la aplicacion real ocurre en Plan 05 junto con el push de codigo).

Purpose: (1) Verificar empiricamente la assertion D-11 (el resto del catalogo recompra-v1 ya esta completo excepto los 3 templates que esta fase toca) — si falla, la fase se pausa. (2) Capturar snapshot del estado actual para rollback D-09 Opcion A. (3) Crear el archivo de migracion idempotente en git con copy aprobado por el usuario (D-10 checkpoint humano bloqueante).

Output: 1 archivo SQL en `supabase/migrations/`, 1 archivo `01-SNAPSHOT.md` con el estado pre-migracion + resultado de auditoria D-11, copy aprobado por el usuario.

**CRITICAL — Regla 5 strict ordering:**
- Este plan NO aplica la migracion en prod. Solo crea el archivo.
- La aplicacion en prod ocurre en Plan 05, ANTES del push de codigo (Plans 02/03/04 no pushean nada).
- Si Task 1 (audit) falla (ANY intent rows_found=0), se escala al usuario y se pausa la fase hasta resolver el gap de catalogo.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-template-catalog/CONTEXT.md — decisiones D-01..D-13 (especialmente D-03, D-11, D-12)
@.planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Existing Patterns #1 (DELETE+INSERT pattern), §Pitfalls 3 (audit blocker), §Implementation Refinements 1+2, §Code Examples (Mini-SQL Plan 01)
@CLAUDE.md §Regla 5 (migracion antes de deploy), §Regla 6 (proteger agente prod)
@supabase/migrations/20260206000000_agent_templates.sql — schema canonico de agent_templates (UNIQUE constraint, RLS, columnas)
@supabase/migrations/20260317200001_tiempo_entrega_templates.sql — patron DELETE + INSERT de reemplazo (referencia)
@supabase/migrations/20260315150000_v3_independent_templates.sql — patron DO $$ IF NOT EXISTS + URL imagen ELIXIR hardcoded (referencia copy)
@supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql — patron GRANTs defensivos (LEARNING 1 Phase 44.1)
@src/lib/agents/somnio-recompra/response-track.ts — consumer: linea 39 (TEMPLATE_LOOKUP_AGENT_ID), linea 346 (direccion_completa concat), lineas 336-361 (branch preguntar_direccion)
@src/lib/agents/somnio-recompra/constants.ts — INFORMATIONAL_INTENTS set (linea 67-71), RECOMPRA_INTENTS (linea 18-50), ACTION_TEMPLATE_MAP (linea 74-79)

<interfaces>
<!-- Schema de agent_templates (VERIFIED supabase/migrations/20260206000000_agent_templates.sql) -->
CREATE TABLE agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,                          -- 'somnio-recompra-v1'
  intent TEXT NOT NULL,                            -- 'saludo' | 'preguntar_direccion_recompra' | 'registro_sanitario'
  visit_type TEXT NOT NULL CHECK (visit_type IN ('primera_vez', 'siguientes')),
  orden INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL CHECK (content_type IN ('texto', 'template', 'imagen')),
  content TEXT NOT NULL,                           -- Para imagen: "URL|caption" (pipe literal, parseado por messaging.ts:192-205)
  delay_s INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'CORE'
    CHECK (priority IN ('CORE', 'COMPLEMENTARIA', 'OPCIONAL')),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, intent, visit_type, orden, workspace_id)
);

<!-- Variables globales disponibles para el template preguntar_direccion_recompra (VERIFIED response-track.ts:131-139 + :336-361) -->
{{nombre_saludo}}         -- "Buenos dias Jose" etc. Siempre disponible.
{{direccion_completa}}    -- Solo en salesAction='preguntar_direccion' branch datosCriticos=true.
                          -- HOY hace [direccion, ciudad].filter(...).join(', ')
                          -- EN PLAN 02 se cambia a [direccion, ciudad, departamento].filter(...).join(', ') (D-12).

<!-- Copy LOCKED desde CONTEXT.md — NO paraphrase -->
- D-03 saludo orden=0 (texto, CORE):    '{{nombre_saludo}} 😊'
- D-03 saludo orden=1 (imagen, COMP):   'URL|Deseas adquirir tu ELIXIR DEL SUEÑO?' (ver Task 2 para URL completa)
- D-12 preguntar_direccion_recompra:    '¡Claro que sí! ¿Sería para la misma dirección?\n{{direccion_completa}}'
- D-06 registro_sanitario:              Copy pendiente de aprobacion usuario en Task 3 (Claude propone borrador basado en contenido existente de sales-v3)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Auditoria empirica D-11 + snapshot pre-migracion</name>
  <read_first>
    - .planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Decisiones D-11 (claim que hay que verificar)
    - .planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Pitfalls 3 (blocker semantics), §Implementation Refinement 2 (query exacta de auditoria)
    - src/lib/agents/somnio-recompra/constants.ts (para ver el set RECOMPRA_INTENTS y INFORMATIONAL_INTENTS — confirmar la lista de 22 intents esperados)
    - src/lib/agents/somnio-recompra/response-track.ts (scan de todos los template_intents consumidos — ver Mapa en CONTEXT.md §Auditoria)
  </read_first>
  <action>
    **Paso 1 — Redactar el SQL de auditoria** en un archivo temporal `.planning/standalone/somnio-recompra-template-catalog/01-audit.sql` (NO commit — solo para correr por el usuario):

    ```sql
    -- Auditoria D-11: verificar que todos los intents esperados ya existen bajo agent_id='somnio-recompra-v1'
    -- Excluye los 2 intents que esta fase crea: 'preguntar_direccion_recompra' y 'registro_sanitario'
    -- rows_found = 0 en CUALQUIER fila = BLOCKER; fase se pausa y escala a usuario.

    WITH expected(intent) AS (
      VALUES
        ('saludo'),
        ('promociones'),
        ('pago'),
        ('envio'),
        ('ubicacion'),
        ('contraindicaciones'),
        ('dependencia'),
        ('tiempo_entrega_same_day'),
        ('tiempo_entrega_next_day'),
        ('tiempo_entrega_1_3_days'),
        ('tiempo_entrega_2_4_days'),
        ('tiempo_entrega_sin_ciudad'),
        ('resumen_1x'),
        ('resumen_2x'),
        ('resumen_3x'),
        ('confirmacion_orden_same_day'),
        ('confirmacion_orden_transportadora'),
        ('pendiente_promo'),
        ('pendiente_confirmacion'),
        ('no_interesa'),
        ('rechazar'),
        ('retoma_inicial')
    )
    SELECT
      e.intent,
      (SELECT COUNT(*) FROM agent_templates a
       WHERE a.agent_id = 'somnio-recompra-v1'
         AND a.workspace_id IS NULL
         AND a.intent = e.intent) AS rows_found
    FROM expected e
    ORDER BY rows_found ASC, e.intent ASC;
    ```

    **Paso 2 — Redactar el SQL de snapshot** en el mismo archivo `01-audit.sql`:

    ```sql
    -- Snapshot pre-migracion: serializar TODAS las filas actuales bajo somnio-recompra-v1
    -- para rollback de emergencia (D-09 Opcion A — sin feature flag).
    -- El output se copia verbatim a 01-SNAPSHOT.md.

    SELECT jsonb_pretty(jsonb_agg(to_jsonb(t.*) ORDER BY t.intent, t.orden)) AS snapshot_json
    FROM agent_templates t
    WHERE t.agent_id = 'somnio-recompra-v1'
      AND t.workspace_id IS NULL;
    ```

    **Paso 3 — Pedir al usuario** que corra ambas queries en Supabase SQL Editor de produccion (manual — este task es `auto` pero depende de humano para correr SQL porque Claude no tiene acceso directo a DB prod).

    **ALTERNATIVA automatizable:** si hay acceso al CLI `supabase` con credentials, Claude puede correr las queries via:
    ```bash
    psql "$SUPABASE_DB_URL" -f .planning/standalone/somnio-recompra-template-catalog/01-audit.sql
    ```
    Si NO hay acceso, Task 1 se convierte en **checkpoint humano implicito** — el executor escribe el SQL, pide al usuario que lo corra y pegue el output.

    **Paso 4 — Crear `.planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md`** con el siguiente template:

    ```markdown
    # Snapshot Pre-Migracion — somnio-recompra-template-catalog

    **Fecha captura:** <YYYY-MM-DD HH:MM:SS America/Bogota>
    **Propósito:** Rollback D-09 Opcion A (sin feature flag) + evidencia auditoria D-11.

    ## Auditoria D-11 — Resultado

    Query: ver `01-audit.sql` Paso 1.

    | intent | rows_found |
    |--------|-----------|
    | <pegar output de la query exactamente como salio de Supabase> |

    **Resultado agregado:**
    - Total intents esperados: 22
    - Intents con rows_found = 0 (BLOCKER): <contar y listar — si >0, PAUSAR fase>
    - Intents con rows_found >= 1 (OK): <contar>

    ## Snapshot JSON — Estado Pre-Migracion

    Query: ver `01-audit.sql` Paso 2.

    ```json
    <pegar output completo de snapshot_json aqui — verbatim, sin truncar>
    ```

    ## Decision

    - [ ] ✅ Auditoria D-11 pasa (todos los rows_found >= 1) — proceder a Task 2.
    - [ ] ❌ Auditoria D-11 FALLA — PAUSAR fase, escalar a usuario, NO avanzar a Task 2.

    **Escoger una** y commit antes de avanzar.
    ```

    **Paso 5 — Commit ambos archivos** en git:
    ```bash
    git add .planning/standalone/somnio-recompra-template-catalog/01-audit.sql \
            .planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md
    git commit -m "docs(somnio-recompra-template-catalog): Task 1 — snapshot + auditoria D-11 catalog integrity"
    ```

    **NO push** — Wave 0 queda en local hasta que Plan 05 pushee todo junto.
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-recompra-template-catalog/01-audit.sql</automated>
    <automated>test -f .planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md</automated>
    <automated>grep -q "rows_found" .planning/standalone/somnio-recompra-template-catalog/01-audit.sql</automated>
    <automated>grep -q "snapshot_json" .planning/standalone/somnio-recompra-template-catalog/01-audit.sql</automated>
    <automated>grep -q "Auditoria D-11" .planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md</automated>
    <automated>grep -q "Snapshot JSON" .planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md</automated>
  </verify>
  <acceptance_criteria>
    - `01-audit.sql` existe y contiene los 2 queries exactos (CTE con los 22 intents esperados + snapshot jsonb_pretty).
    - `01-SNAPSHOT.md` existe con secciones "Auditoria D-11 — Resultado", "Snapshot JSON", "Decision".
    - El usuario corrio ambas queries en Supabase SQL Editor de produccion y pego los outputs dentro de `01-SNAPSHOT.md`.
    - La seccion "Decision" tiene una de las 2 checkboxes marcada.
    - Si Auditoria FALLA (algun rows_found = 0 excluyendo los 2 intents que creamos): DETENER plan, escalar a usuario, NO proceder a Task 2.
    - Commit atomico con mensaje exacto `docs(somnio-recompra-template-catalog): Task 1 — snapshot + auditoria D-11 catalog integrity`.
  </acceptance_criteria>
  <done>
    - Snapshot capturado verbatim del output SQL (no resumido).
    - Auditoria D-11 pasada y documentada.
    - Commit en git, NO pusheado todavia.
  </done>
</task>

<task type="auto">
  <name>Task 2: Crear archivo de migracion SQL con 3 templates + GRANTs</name>
  <read_first>
    - .planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Decisiones D-03 (copy saludo), §D-12 (copy preguntar_direccion_recompra), §D-06 (registro_sanitario)
    - .planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Code Examples (Mini-SQL Plan 01 — template literal a usar), §Existing Patterns #1 (DELETE+INSERT vs DO IF NOT EXISTS)
    - supabase/migrations/20260317200001_tiempo_entrega_templates.sql (patron DELETE + INSERT real)
    - supabase/migrations/20260315150000_v3_independent_templates.sql:53 (URL imagen ELIXIR hardcoded — copiar literal)
    - supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql (patron GRANTs)
    - .planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md (confirmar que auditoria D-11 paso antes de crear migracion)
  </read_first>
  <action>
    **Paso 1 — Generar timestamp** mayor a `20260422142336` (ultima migracion verificada: `20260422142336_crm_stage_integrity.sql`):

    ```bash
    date -u +%Y%m%d%H%M%S
    ```

    O usar timestamp fijo `20260422200000` (asegura orden despues de la ultima aplicada y es human-readable).

    **Paso 2 — Crear el archivo** `supabase/migrations/<ts>_recompra_template_catalog.sql` con el contenido LITERAL siguiente (NO paraphrase, NO reordenar, NO "optimizar"):

    ```sql
    -- ============================================================================
    -- Recompra Template Catalog — independencia de somnio-sales-v3
    -- ============================================================================
    -- Phase: somnio-recompra-template-catalog (standalone)
    -- Related: closes bug cdc06d9 "T2 template lookup apuntaba a somnio-sales-v3"
    --
    -- Cambios (3 intents, 4 rows):
    --   1. intent='saludo'                         → REPLACE orden=0 (texto CORE) + orden=1 (imagen COMPLEMENTARIA) [D-03]
    --   2. intent='preguntar_direccion_recompra'   → NEW orden=0 (texto CORE)                                      [D-12]
    --   3. intent='registro_sanitario'             → NEW orden=0 (texto CORE) — deuda tecnica existente            [D-06]
    --
    -- Idempotencia:
    --   - saludo: DELETE + INSERT (D-11 confirma que ya existen rows viejas; UPSERT no aplica bien con UNIQUE NULL workspace_id)
    --   - preguntar_direccion_recompra y registro_sanitario: DO $$ BEGIN IF NOT EXISTS ... END $$ (intents NUEVOS)
    --
    -- Rollback (si se necesita revertir post-deploy):
    --   Re-ejecutar el INSERT serializado desde 01-SNAPSHOT.md §Snapshot JSON.
    --   NO hay DROP — los 3 intents son aditivos o reemplazables.
    --
    -- Regla 5: este SQL NO se aplica automaticamente por Vercel. El usuario corre
    -- este archivo en Supabase SQL Editor de produccion durante Plan 05 Task 1,
    -- ANTES del push de codigo de Plans 02/03/04.

    BEGIN;

    -- ========================================================================
    -- 1. Replace saludo orden=0 (texto CORE) + orden=1 (imagen COMPLEMENTARIA) [D-03]
    -- ========================================================================

    DELETE FROM agent_templates
    WHERE agent_id = 'somnio-recompra-v1'
      AND intent = 'saludo'
      AND workspace_id IS NULL;

    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'saludo', 'primera_vez', 'CORE', 0, 'texto',
       '{{nombre_saludo}} 😊', 0),
      (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'saludo', 'primera_vez', 'COMPLEMENTARIA', 1, 'imagen',
       'https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?', 3);

    -- ========================================================================
    -- 2. Insert preguntar_direccion_recompra orden=0 (texto CORE) [D-12]
    --    Content LOCKED: "¡Claro que sí! ¿Sería para la misma dirección?\n{{direccion_completa}}"
    --    {{direccion_completa}} = direccion + ciudad + departamento (inyectado por response-track.ts:346 post-Plan-02)
    -- ========================================================================

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM agent_templates
        WHERE agent_id = 'somnio-recompra-v1'
          AND intent = 'preguntar_direccion_recompra'
          AND workspace_id IS NULL
        LIMIT 1
      ) THEN
        INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
        VALUES
          (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'preguntar_direccion_recompra', 'primera_vez', 'CORE', 0, 'texto',
           E'¡Claro que sí! ¿Sería para la misma dirección?\n{{direccion_completa}}', 0);
      END IF;
    END $$;

    -- ========================================================================
    -- 3. Insert registro_sanitario orden=0 (texto CORE) [D-06 — deuda existente]
    --    Content: copy de referencia sales-v3 (aprobado por usuario en Task 3 checkpoint).
    -- ========================================================================

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM agent_templates
        WHERE agent_id = 'somnio-recompra-v1'
          AND intent = 'registro_sanitario'
          AND workspace_id IS NULL
        LIMIT 1
      ) THEN
        INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
        VALUES
          (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'registro_sanitario', 'primera_vez', 'CORE', 0, 'texto',
           'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0);
      END IF;
    END $$;

    -- ========================================================================
    -- 4. Defensive GRANTs (LEARNING 1 Phase 44.1 — idempotent no-ops si ya existen)
    -- ========================================================================

    GRANT ALL ON TABLE agent_templates TO service_role;
    GRANT SELECT ON TABLE agent_templates TO authenticated;

    COMMIT;
    ```

    **Paso 3 — Verificaciones post-escritura (sin aplicar SQL):**

    ```bash
    cat supabase/migrations/<ts>_recompra_template_catalog.sql | grep -c "somnio-recompra-v1"
    # Expected: >= 8 (4 matches en SELECT guards + 4 matches en INSERTs)

    cat supabase/migrations/<ts>_recompra_template_catalog.sql | grep -c "BEGIN\|COMMIT"
    # Expected: >= 2
    ```

    **Paso 4 — NO aplicar el SQL en ningun ambiente** — solo existe en git. Regla 5: la aplicacion en prod es responsabilidad de Plan 05 Task 1.

    **Paso 5 — Commit atomico:**
    ```bash
    git add supabase/migrations/<ts>_recompra_template_catalog.sql
    git commit -m "feat(somnio-recompra-template-catalog): add migration for recompra independent template catalog (D-03, D-06, D-12)"
    ```

    **NO push.**
  </action>
  <verify>
    <automated>ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1); test -n "$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1); grep -q "DELETE FROM agent_templates" "supabase/migrations/$MIG" && grep -q "WHERE agent_id = 'somnio-recompra-v1'" "supabase/migrations/$MIG" && grep -q "AND intent = 'saludo'" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1); grep -q "'{{nombre_saludo}} 😊'" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1); grep -q "ELIXIR DEL SUEÑO" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1); grep -q "preguntar_direccion_recompra" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1); grep -q "registro_sanitario" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1); grep -q "GRANT ALL ON TABLE agent_templates TO service_role" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1); grep -q "GRANT SELECT ON TABLE agent_templates TO authenticated" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_recompra_template_catalog\.sql$' | head -1); grep -qE "^BEGIN;" "supabase/migrations/$MIG" && grep -qE "^COMMIT;" "supabase/migrations/$MIG"</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-recompra-template-catalog): add migration for recompra independent template catalog"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `supabase/migrations/<YYYYMMDDHHMMSS>_recompra_template_catalog.sql` existe.
    - Contiene el literal `DELETE FROM agent_templates WHERE agent_id = 'somnio-recompra-v1' AND intent = 'saludo' AND workspace_id IS NULL;`.
    - Contiene el literal `'{{nombre_saludo}} 😊'` (con el emoji UTF-8).
    - Contiene la URL completa `https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?`.
    - Contiene el literal `E'¡Claro que sí! ¿Sería para la misma dirección?\n{{direccion_completa}}'` (con el escape `E'...'` para el newline).
    - Contiene el texto `'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.'`.
    - Contiene ambos GRANTs (`service_role` ALL + `authenticated` SELECT).
    - Wrapping `BEGIN;` ... `COMMIT;` presente.
    - NO se ejecuto contra prod todavia.
    - Commit atomico con mensaje empezando con `feat(somnio-recompra-template-catalog): add migration`.
  </acceptance_criteria>
  <done>
    - Archivo SQL listo en git para aplicar en Plan 05.
    - Commit atomico creado, NO pusheado.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Checkpoint humano — aprobacion final del copy de los 4 templates (D-10)</name>
  <read_first>
    - supabase/migrations/<ts>_recompra_template_catalog.sql (archivo creado en Task 2)
    - .planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Decisiones D-03, D-10, D-12, D-06
    - .planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md (ver contenido viejo para comparar)
  </read_first>
  <what-built>
    Claude creó el archivo SQL con los 4 templates (saludo texto, saludo imagen, preguntar_direccion_recompra, registro_sanitario). Los 3 primeros usan copy locked en CONTEXT.md (D-03, D-12), pero necesitan review final del usuario por Regla 0 (calidad > eficiencia) y D-10 (usuario revisa antes de ejecutar). El `registro_sanitario` (D-06) usa copy de referencia de sales-v3 como borrador — el usuario debe aprobar o pedir cambio.

    **Nota critica:** Este es un checkpoint de REVIEW de copy, NO de aplicacion SQL. La migracion NO se corre contra prod aquí — eso ocurre en Plan 05 Task 1 (Regla 5 strict).
  </what-built>
  <how-to-verify>
    **Paso 1 — Review del copy de saludo orden=0 (texto CORE) [D-03]:**

    Contenido literal en el SQL:
    ```
    '{{nombre_saludo}} 😊'
    ```

    Substitucion en runtime: "Buenas tardes Jose 😊" (o "Buenos dias Maria 😊", etc. — depende de hora Colombia + primer nombre del cliente).

    - [ ] Aprobado — coincide con D-03.
    - [ ] Rechazado — escribir copy alternativo.

    **Paso 2 — Review del copy de saludo orden=1 (imagen COMPLEMENTARIA) [D-03]:**

    Contenido literal en el SQL (URL + pipe + caption):
    ```
    https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?
    ```

    La URL es la misma que usa `somnio-sales-v3` en migration `20260315150000_v3_independent_templates.sql:53` (verified). El caption "Deseas adquirir tu ELIXIR DEL SUEÑO?" usa "SUEÑO" con ñ (UTF-8). El delay_s=3 para darle tiempo al texto del orden=0 de enviarse primero.

    **Verificacion de disponibilidad de la URL** (recomendado):
    ```bash
    curl -I "https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg"
    # Expected: HTTP/2 200
    ```

    - [ ] Aprobado — URL sigue viva (200) + caption correcto.
    - [ ] Rechazado — URL dead o caption a cambiar.

    **Paso 3 — Review del copy de preguntar_direccion_recompra [D-12]:**

    Contenido literal en el SQL:
    ```
    ¡Claro que sí! ¿Sería para la misma dirección?
    {{direccion_completa}}
    ```

    Substitucion en runtime (post-Plan-02 patch):
    ```
    ¡Claro que sí! ¿Sería para la misma dirección?
    Calle 48A #27-85, Bucaramanga, Santander
    ```

    (donde `{{direccion_completa}}` = `direccion + ciudad + departamento` concatenado con ", " — D-12 + Plan 02 Task 1).

    - [ ] Aprobado — coincide con D-12 exactamente.
    - [ ] Rechazado — escribir copy alternativo.

    **Paso 4 — Review del copy de registro_sanitario [D-06]:**

    Contenido literal en el SQL (BORRADOR):
    ```
    Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.
    ```

    Este es el copy de referencia actualmente en `somnio-sales-v3`. El usuario puede:
    - Aprobar tal cual (copy-identico a sales-v3, consistente entre agentes).
    - Pedir cambio a Claude (ej. incluir numero INVIMA, url del registro, etc.) — Claude re-edita el archivo SQL y se re-checkpointean.

    - [ ] Aprobado tal cual.
    - [ ] Aprobado con cambios (especificar): _______

    **Paso 5 — Review de la auditoria D-11 + snapshot (Task 1):**

    Abrir `.planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md` y confirmar:
    - Todos los 22 intents esperados tienen rows_found >= 1 (auditoria passed).
    - Snapshot JSON no esta vacio (al menos los ~19 intents existentes bajo recompra-v1).

    - [ ] Snapshot + auditoria OK — proceder.
    - [ ] Snapshot o auditoria con gaps — ver que intent falta y escalar discuss antes de continuar.
  </how-to-verify>
  <acceptance_criteria>
    - Usuario revisa los 4 copys (saludo texto, saludo imagen, preguntar_direccion_recompra, registro_sanitario) y marca cada uno como "aprobado" o pide cambio.
    - Si pide cambios, Claude edita el archivo SQL y re-commitea + re-checkpoint hasta aprobacion total.
    - Usuario confirma que la URL de la imagen ELIXIR responde HTTP 200 (opcional pero recomendado).
    - Usuario revisa `01-SNAPSHOT.md` y confirma que Task 1 audit paso y snapshot se capturo.
    - Usuario escribe "copy aprobado" o equivalente en el resume-signal.
  </acceptance_criteria>
  <resume-signal>
    Escribe "copy aprobado" (4/4 templates OK + snapshot OK) para desbloquear Plans 02+03 (que pueden ejecutarse en paralelo Wave 1).
    Si hay cambios de copy, describe cuales y Claude los aplica antes de reanudar.
    Si la URL de la imagen no responde 200, PAUSAR fase y escalar — hay que subir el asset primero.
  </resume-signal>
</task>

</tasks>

<verification>
- `.planning/standalone/somnio-recompra-template-catalog/01-audit.sql` existe con auditoria D-11 + snapshot SQL.
- `.planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md` existe con output real pegado del usuario post-ejecucion en SQL Editor prod.
- Auditoria D-11 verificada: todos los 22 intents esperados tienen rows_found >= 1 (si falla, fase pausada).
- `supabase/migrations/<ts>_recompra_template_catalog.sql` existe en git con los 4 templates locked + GRANTs.
- Usuario aprobo el copy de los 4 templates (D-10 checkpoint).
- NO se aplico SQL en produccion (Regla 5 — eso ocurre en Plan 05).
- NO se pushea a Vercel desde este plan (Wave 0 local).
</verification>

<success_criteria>
- Plans 02 + 03 desbloqueados (pueden correr en paralelo Wave 1) — tienen el archivo SQL listo y copy aprobado para escribir codigo que dependa del nuevo contrato.
- Plan 05 tiene el archivo SQL + snapshot listo para aplicar en prod.
- Si rollback se necesita (D-09 Opcion A), 01-SNAPSHOT.md tiene la data completa para reconstruir estado previo.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-template-catalog/01-SUMMARY.md` documenting:
- Commit hash de Task 1 (snapshot + audit)
- Commit hash de Task 2 (migracion SQL)
- Nombre exacto del archivo de migracion creado (con timestamp)
- Resultado agregado de auditoria D-11 (X/22 intents OK, Y faltantes — si Y > 0, escalation)
- Link al snapshot JSON en 01-SNAPSHOT.md
- Confirmacion del usuario de aprobacion de copy (timestamp + quote del resume-signal)
- Confirmacion explicita: "Regla 5 respetada — migracion NO aplicada en prod en este plan"
</output>
