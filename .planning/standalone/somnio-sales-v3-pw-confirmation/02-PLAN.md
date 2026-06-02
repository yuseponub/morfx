---
phase: somnio-sales-v3-pw-confirmation
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - supabase/migrations/<ts>_pw_confirmation_template_catalog.sql
autonomous: false

must_haves:
  truths:
    - "Archivo de migracion SQL idempotente existe en supabase/migrations/ con timestamp YYYYMMDDHHMMSS mayor a la ultima migracion ya aplicada"
    - "Migracion contiene exactamente los ~28 templates listados en RESEARCH §I.1 bajo `agent_id='somnio-sales-v3-pw-confirmation'` con `workspace_id IS NULL` (catalog global)"
    - "Templates informacionales (saludo, precio, promociones, contenido, formula, como_se_toma, pago, envio, ubicacion, contraindicaciones, dependencia, efectividad, registro_sanitario, tiempo_entrega_*) clonados VERBATIM de sales-v3 (D-15, D-27)"
    - "Templates sales reestructurados (confirmacion_orden_same_day, confirmacion_orden_transportadora, pedir_datos_post_compra, confirmar_direccion_post_compra, agendar_pregunta, claro_que_si_esperamos, cancelado_handoff, fallback, error_carga_pedido) son NUEVOS bajo agent_id propio (D-15)"
    - "registro_sanitario usa copy de sales-v3 = 'INVIMA / PHARMA SOLUTIONS SAS' literal (D-27)"
    - "URL imagen ELIXIR para `saludo` orden=1 es la misma que sales-v3 + recompra (verbatim de migration 20260315150000_v3_independent_templates.sql)"
    - "Pattern idempotente: DO $$ BEGIN IF NOT EXISTS ... INSERT ... END $$ por intent (sin DELETE — el catalogo es greenfield, query (e) Plan 01 confirma 0 rows)"
    - "GRANTs defensivos al final del archivo (LEARNING 1 Phase 44.1): GRANT ALL ON agent_templates TO service_role + GRANT SELECT ON agent_templates TO authenticated"
    - "Migracion NO aplicada en produccion todavia (Regla 5 strict — apply ocurre en Plan 12 Task 1)"
    - "Usuario aprobo el copy de los ~12 templates NUEVOS / adaptados (los informacionales VERBATIM de sales-v3 NO requieren re-approval — D-27)"
  artifacts:
    - path: "supabase/migrations/<YYYYMMDDHHMMSS>_pw_confirmation_template_catalog.sql"
      provides: "Migracion SQL idempotente que pobla el catalogo independiente del agente PW-confirmation con ~28 rows (informacionales clonados + sales reestructurados + nuevos templates)"
      contains: "somnio-sales-v3-pw-confirmation"
  key_links:
    - from: "supabase/migrations/<ts>_pw_confirmation_template_catalog.sql"
      to: "agent_templates table (Supabase production — applied in Plan 12 Task 1)"
      via: "DO $$ IF NOT EXISTS ... INSERT blocks"
      pattern: "agent_id = 'somnio-sales-v3-pw-confirmation'"
    - from: "supabase/migrations/<ts>_pw_confirmation_template_catalog.sql"
      to: "src/lib/agents/somnio-pw-confirmation/response-track.ts (Plan 07)"
      via: "TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3-pw-confirmation' lookup pattern (clonado de recompra)"
      pattern: "TEMPLATE_LOOKUP_AGENT_ID"
---

<objective>
Wave 1 — Crear el archivo de migracion SQL idempotente con el catalogo completo del agente PW-confirmation. NO aplicar en produccion (Regla 5 strict — eso es Plan 12 Task 1).

Purpose: D-15 lockea catalogo independiente bajo `agent_id='somnio-sales-v3-pw-confirmation'`. RESEARCH §I.1 inventaria ~28 templates: ~14 informacionales clonados verbatim de sales-v3 (D-27 lockea copy identico, incluye INVIMA/PHARMA SOLUTIONS), ~9 sales reestructurados/nuevos para flujo post-compra, 3 utility (fallback + cancelado_handoff + error_carga_pedido). Esta plan produce el archivo SQL listo para que Plan 12 lo aplique en prod.

Output: 1 archivo `.sql` en `supabase/migrations/` + 1 commit atomico. NO push.

**Regla 5 strict:** El archivo NO se aplica en produccion en este plan. Plan 12 Task 1 lo aplica + Plan 12 Task 2 pushea el codigo. NO existe codigo en main que referencie estos templates hasta Plan 12 — por tanto no hay riesgo de race aunque la migracion quede en git unos dias.

**Catalogo paralelizable con Plan 03 (scaffold del modulo agent):** Plan 03 crea el directorio y stubs vacios; Plan 02 crea el SQL. Ambos solo dependen de Plan 01 audit (UUIDs no son necesarios para templates — los UUIDs son para stages, no para template lookup).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-15 (catalogo propio), §D-27 (copy informacionales identico a sales-v3 incluyendo INVIMA), §D-10 (templates confirmacion con variacion municipal), §D-14 (template claro_que_si_esperamos), §D-11 (template agendar_pregunta), §D-21 (cancelado_handoff)
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §A.1 (catalogo sales-v3 completo), §I.1 (set definitivo PW-confirmation con 28 entries), §A.2 (variacion municipal — confirmacion_orden_*)
@.planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md §Query (e) — confirma greenfield (0 rows existentes para agent_id='somnio-sales-v3-pw-confirmation')
@.planning/standalone/somnio-recompra-template-catalog/01-PLAN.md — patron exacto archivo SQL idempotente + GRANTs
@supabase/migrations/20260315150000_v3_independent_templates.sql — catalogo sales-v3 (source de copy a clonar verbatim para informacionales)
@supabase/migrations/20260315160000_v3_formula_intent_templates.sql — formula intent (parte del set informacional)
@supabase/migrations/20260317200001_tiempo_entrega_templates.sql — tiempo_entrega templates por zona
@supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql — patron DO $$ IF NOT EXISTS bloques
@supabase/migrations/20260206000000_agent_templates.sql — schema (UNIQUE constraint, RLS)
@supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql — patron GRANTs defensivos
@CLAUDE.md §Regla 5 (NO apply hasta Plan 12)

<interfaces>
<!-- Schema agent_templates (verified) -->
CREATE TABLE agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  visit_type TEXT NOT NULL CHECK (visit_type IN ('primera_vez', 'siguientes')),
  orden INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL CHECK (content_type IN ('texto', 'template', 'imagen')),
  content TEXT NOT NULL,
  delay_s INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'CORE' CHECK (priority IN ('CORE', 'COMPLEMENTARIA', 'OPCIONAL')),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ...
  UNIQUE(agent_id, intent, visit_type, orden, workspace_id)
);

<!-- agent_id locked -->
AGENT_ID = 'somnio-sales-v3-pw-confirmation'

<!-- visit_type usado por catalogos sales-v3 + recompra: 'primera_vez' (single-track, sin flujo recurrente) -->
VISIT_TYPE = 'primera_vez'

<!-- workspace_id: NULL (catalog global, accesible por workspace Somnio en runtime via TemplateManager) -->
WORKSPACE_ID = NULL

<!-- URL imagen ELIXIR canonica (verified migration 20260315150000:53 + recompra-template-catalog migration) -->
ELIXIR_IMAGE_URL = 'https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg'

<!-- Variables comunes en runtime (de response-track.ts):
{{nombre_saludo}}      -- "Buenos dias Jose" etc.
{{ciudad}}             -- ciudad del pedido
{{tiempo_estimado}}    -- "HOY mismo" / "MAÑANA" / "el LUNES" / "1-3 dias habiles" (formatDeliveryTime)
{{campos_faltantes}}   -- bullet list de campos que faltan
{{direccion_completa}} -- direccion + ciudad + departamento concatenado
{{items}}              -- listado de items del pedido
{{total}}              -- total del pedido
-->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear archivo SQL idempotente con ~28 templates</name>
  <read_first>
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §I.1 (lista completa de 28 entries) + §A.1 (copy de sales-v3 a clonar)
    - supabase/migrations/20260315150000_v3_independent_templates.sql LINEAS COMPLETAS (catalogo sales-v3 — fuente del copy verbatim para informacionales)
    - supabase/migrations/20260315160000_v3_formula_intent_templates.sql (formula intent)
    - supabase/migrations/20260317200001_tiempo_entrega_templates.sql (tiempo_entrega_*)
    - supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql (patron DO $$ IF NOT EXISTS)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/01-SNAPSHOT.md (confirmar Query (e) = 0 rows greenfield)
  </read_first>
  <action>
    **Paso 1 — Generar timestamp:**

    ```bash
    date -u +%Y%m%d%H%M%S
    ```

    O usar timestamp fijo `20260427210000` (asegura orden despues de la ultima migracion 20260427160000_routing_facts_pipeline_stage_raw.sql).

    **Paso 2 — Crear el archivo `supabase/migrations/<ts>_pw_confirmation_template_catalog.sql`** con el contenido literal abajo. NO paraphrasear copy, NO reordenar, NO "optimizar". Si necesitas mas templates de los listados (revisar RESEARCH §A.1 + §I.1), agregalos al final con el mismo patron — pero la baseline minima son los 28 entries listados.

    El archivo es LARGO pero idempotente y atomico. Cada intent va dentro de su propio bloque `DO $$ BEGIN IF NOT EXISTS ... END $$` para garantizar que correr la migracion 2 veces no duplica filas (UNIQUE constraint en (agent_id, intent, visit_type, orden, workspace_id) ayuda como segundo guard).

    **Estructura del archivo (template, completar con copy real):**

    ```sql
    -- ============================================================================
    -- PW Confirmation Template Catalog — independencia de somnio-sales-v3
    -- ============================================================================
    -- Phase: somnio-sales-v3-pw-confirmation (standalone)
    -- agent_id: 'somnio-sales-v3-pw-confirmation'
    -- workspace_id: NULL (catalog global, accesible por workspace Somnio)
    -- visit_type: 'primera_vez' (single-track per RESEARCH §A.1 sales-v3 pattern)
    --
    -- Cambios (~28 intents):
    --   INFORMACIONALES (clonados verbatim de sales-v3 — D-15, D-27):
    --     saludo (CORE+COMP), precio (CORE+COMP+OPC), promociones (CORE),
    --     contenido (CORE+COMP), formula (CORE), como_se_toma (CORE+COMP+OPC),
    --     pago (CORE), envio (CORE+COMP), ubicacion (CORE+COMP),
    --     contraindicaciones (CORE), dependencia (CORE), efectividad (CORE+COMP+OPC),
    --     registro_sanitario (CORE — INVIMA / PHARMA SOLUTIONS SAS per D-27),
    --     tiempo_entrega_same_day, tiempo_entrega_next_day, tiempo_entrega_1_3_days,
    --     tiempo_entrega_2_4_days, tiempo_entrega_sin_ciudad
    --
    --   SALES REESTRUCTURADOS / NUEVOS (D-10, D-11, D-12, D-14, D-21):
    --     confirmacion_orden_same_day (post-compra adaptado — D-10)
    --     confirmacion_orden_transportadora (post-compra adaptado — D-10)
    --     pedir_datos_post_compra (D-12)
    --     confirmar_direccion_post_compra (D-12)
    --     agendar_pregunta (D-11)
    --     claro_que_si_esperamos (D-14)
    --     cancelado_handoff (D-21 stub)
    --     fallback (clonado verbatim de sales-v3)
    --     error_carga_pedido (degradacion reader timeout)
    --
    -- Idempotencia:
    --   - 0 rows existentes (Query (e) Plan 01 = 0).
    --   - DO $$ IF NOT EXISTS protege re-runs accidentales.
    --   - UNIQUE(agent_id, intent, visit_type, orden, workspace_id) guard secundario.
    --
    -- Rollback (si se necesita revertir post-deploy):
    --   DELETE FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation';
    --
    -- Regla 5: este SQL NO se aplica automaticamente. Plan 12 Task 1 lo corre en prod
    -- ANTES del push de Plan 12 Task 2 (que pushea todo el codigo del agente).

    BEGIN;

    -- ========================================================================
    -- INFORMACIONALES (D-15, D-27 — copy verbatim de sales-v3)
    -- ========================================================================

    -- saludo (CORE texto + COMPLEMENTARIA imagen ELIXIR)
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM agent_templates
        WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
          AND intent = 'saludo' AND visit_type = 'primera_vez' AND orden = 0
          AND workspace_id IS NULL
        LIMIT 1
      ) THEN
        INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
        VALUES
          (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'saludo', 'primera_vez', 'CORE', 0, 'texto',
           '{{nombre_saludo}} 💁 Bienvenido a Somnio, en que te puedo ayudar?', 0),
          (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'saludo', 'primera_vez', 'COMPLEMENTARIA', 1, 'imagen',
           'https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|ELIXIR DEL SUEÑO', 3);
      END IF;
    END $$;

    -- precio (CORE texto + COMPLEMENTARIA + OPCIONAL — leer copy real de sales-v3 migration 20260315150000:65-90 y reproducir VERBATIM)
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM agent_templates
        WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
          AND intent = 'precio' AND visit_type = 'primera_vez' AND orden = 0
          AND workspace_id IS NULL
        LIMIT 1
      ) THEN
        INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
        VALUES
          (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'precio', 'primera_vez', 'CORE', 0, 'texto',
           '<copy verbatim sales-v3 precio CORE>', 0),
          (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'precio', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
           '<copy verbatim sales-v3 precio COMP>', 0),
          (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'precio', 'primera_vez', 'OPCIONAL', 2, 'texto',
           '<copy verbatim sales-v3 precio OPC>', 0);
      END IF;
    END $$;

    -- promociones (CORE)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'promociones' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'promociones', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim sales-v3 promociones>', 0);
    END IF; END $$;

    -- contenido (CORE + COMPLEMENTARIA) — clonar de sales-v3
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'contenido' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'contenido', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim sales-v3 contenido CORE>', 0),
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'contenido', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', '<copy verbatim sales-v3 contenido COMP>', 0);
    END IF; END $$;

    -- formula (CORE) — clonar de sales-v3 migration 20260315160000_v3_formula_intent_templates.sql
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'formula' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'formula', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim sales-v3 formula>', 0);
    END IF; END $$;

    -- como_se_toma (CORE + COMP + OPC)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'como_se_toma' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'como_se_toma', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim sales-v3 como_se_toma CORE>', 0),
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'como_se_toma', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', '<copy verbatim sales-v3 como_se_toma COMP>', 0),
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'como_se_toma', 'primera_vez', 'OPCIONAL', 2, 'texto', '<copy verbatim sales-v3 como_se_toma OPC>', 0);
    END IF; END $$;

    -- pago (CORE)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'pago' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'pago', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim sales-v3 pago>', 0);
    END IF; END $$;

    -- envio (CORE + COMP)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'envio' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'envio', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim sales-v3 envio CORE>', 0),
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'envio', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', '<copy verbatim sales-v3 envio COMP>', 0);
    END IF; END $$;

    -- ubicacion (CORE + COMP)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'ubicacion' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'ubicacion', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim sales-v3 ubicacion CORE>', 0),
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'ubicacion', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', '<copy verbatim sales-v3 ubicacion COMP>', 0);
    END IF; END $$;

    -- contraindicaciones (CORE) — usar copy CANONICO de recompra (NO el alias 'efectos' de sales-v3)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'contraindicaciones' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'contraindicaciones', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim recompra contraindicaciones — Compuestos seguros y bien tolerados...>', 0);
    END IF; END $$;

    -- dependencia (CORE)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'dependencia' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'dependencia', 'primera_vez', 'CORE', 0, 'texto', 'No genera dependencia. La melatonina es una hormona natural que el cuerpo produce.', 0);
    END IF; END $$;

    -- efectividad (CORE + COMP + OPC)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'efectividad' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'efectividad', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim sales-v3 efectividad CORE>', 0),
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'efectividad', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', '<copy verbatim sales-v3 efectividad COMP>', 0),
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'efectividad', 'primera_vez', 'OPCIONAL', 2, 'texto', '<copy verbatim sales-v3 efectividad OPC>', 0);
    END IF; END $$;

    -- registro_sanitario (CORE) — D-27 lockea: INVIMA / PHARMA SOLUTIONS SAS verbatim
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'registro_sanitario' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'registro_sanitario', 'primera_vez', 'CORE', 0, 'texto', 'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0);
    END IF; END $$;

    -- tiempo_entrega_same_day, _next_day, _1_3_days, _2_4_days, _sin_ciudad (clonar de migration 20260317200001)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'tiempo_entrega_same_day' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'tiempo_entrega_same_day', 'primera_vez', 'CORE', 0, 'texto', '<copy verbatim sales-v3 tiempo_entrega_same_day — usa {{ciudad}} y {{tiempo_estimado}}>', 0);
    END IF; END $$;
    -- Repetir el patron para tiempo_entrega_next_day, tiempo_entrega_1_3_days, tiempo_entrega_2_4_days, tiempo_entrega_sin_ciudad

    -- ========================================================================
    -- SALES REESTRUCTURADOS / NUEVOS (D-10, D-11, D-12, D-14, D-21)
    -- ========================================================================

    -- confirmacion_orden_same_day (post-compra adaptado — D-10)
    -- Variables: {{tiempo_estimado}}, {{items}}, {{total}}
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'confirmacion_orden_same_day' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'confirmacion_orden_same_day', 'primera_vez', 'CORE', 0, 'texto',
         E'¡Listo! Tu pedido está confirmado ✅\n\n{{items}}\nTotal: {{total}}\n\nDespacharemos lo antes posible y llegará {{tiempo_estimado}} 🚚', 0),
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'confirmacion_orden_same_day', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
         'Recuerda: el pago se realiza al recibir el producto 💳', 0);
    END IF; END $$;

    -- confirmacion_orden_transportadora (post-compra adaptado — D-10)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'confirmacion_orden_transportadora' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'confirmacion_orden_transportadora', 'primera_vez', 'CORE', 0, 'texto',
         E'¡Listo! Tu pedido está confirmado ✅\n\n{{items}}\nTotal: {{total}}\n\nLlegará {{tiempo_estimado}} 🚚', 0),
        (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'confirmacion_orden_transportadora', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
         'Recuerda: el pago se realiza al recibir el producto 💳', 0);
    END IF; END $$;

    -- pedir_datos_post_compra (D-12) — pedir campos faltantes
    -- Variables: {{campos_faltantes}}
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'pedir_datos_post_compra' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'pedir_datos_post_compra', 'primera_vez', 'CORE', 0, 'texto',
              E'Para despachar tu pedido nos haría falta:\n{{campos_faltantes}}', 0);
    END IF; END $$;

    -- confirmar_direccion_post_compra (D-12) — preguntar si direccion es correcta
    -- Variables: {{direccion_completa}}
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'confirmar_direccion_post_compra' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'confirmar_direccion_post_compra', 'primera_vez', 'CORE', 0, 'texto',
              E'Confirmamos tu envío a 📍 {{direccion_completa}}?', 0);
    END IF; END $$;

    -- agendar_pregunta (D-11) — preguntar si quiere agendar para fecha futura
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'agendar_pregunta' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'agendar_pregunta', 'primera_vez', 'CORE', 0, 'texto',
              '¿Deseas agendarlo para alguna fecha futura?', 0);
    END IF; END $$;

    -- claro_que_si_esperamos (D-14) — cliente dice "espera lo pienso"
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'claro_que_si_esperamos' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'claro_que_si_esperamos', 'primera_vez', 'CORE', 0, 'texto',
              'Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴', 0);
    END IF; END $$;

    -- cancelado_handoff (D-21 stub) — handoff cuando cliente cancela definitivo
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'cancelado_handoff' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'cancelado_handoff', 'primera_vez', 'CORE', 0, 'texto',
              'Te conectamos con un asesor para procesar tu cancelación 🤝', 0);
    END IF; END $$;

    -- fallback (clonado verbatim de sales-v3)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'fallback' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'fallback', 'primera_vez', 'CORE', 0, 'texto',
              'Regálame 1 minuto por favor 🙏', 0);
    END IF; END $$;

    -- error_carga_pedido (degradacion reader timeout — Pitfall 2 RESEARCH §J)
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation' AND intent = 'error_carga_pedido' AND visit_type = 'primera_vez' AND orden = 0 AND workspace_id IS NULL LIMIT 1) THEN
      INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
      VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'error_carga_pedido', 'primera_vez', 'CORE', 0, 'texto',
              E'Hubo un problema cargando tu pedido. ¿Podrías indicarme tu número de pedido o nombre completo para ayudarte? 🙏', 0);
    END IF; END $$;

    -- ========================================================================
    -- GRANTs defensivos (LEARNING 1 Phase 44.1)
    -- ========================================================================

    GRANT ALL ON TABLE agent_templates TO service_role;
    GRANT SELECT ON TABLE agent_templates TO authenticated;

    COMMIT;
    ```

    **Paso 3 — Reemplazar todos los `<copy verbatim sales-v3 ...>`** con el copy real leyendo de las migrations referenciadas (lineas exactas en `read_first`). NO reformatear, NO traducir, NO "mejorar" — copy IDENTICO al de sales-v3 (D-27 lockea esto).

    **Paso 4 — Verificaciones post-escritura:**
    ```bash
    MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1)
    echo "Migration file: $MIG"

    # Esperado: ~28 INSERTs (uno por intent + variantes orden)
    grep -c "INSERT INTO agent_templates" "supabase/migrations/$MIG"

    # Esperado: 1 BEGIN + 1 COMMIT
    grep -c "^BEGIN;\|^COMMIT;" "supabase/migrations/$MIG"

    # Esperado: 2 GRANTs
    grep -c "GRANT" "supabase/migrations/$MIG"

    # Esperado: agent_id literal aparece en cada IF NOT EXISTS guard + cada INSERT
    grep -c "somnio-sales-v3-pw-confirmation" "supabase/migrations/$MIG"
    # Expected: ~50+ (2 por intent: 1 en guard + 1 en INSERT)
    ```

    **Paso 5 — NO aplicar el SQL en ningun ambiente.** Solo existe en git. Plan 12 Task 1 lo aplica en prod.

    **Paso 6 — Commit atomico:**
    ```bash
    git add supabase/migrations/<ts>_pw_confirmation_template_catalog.sql
    git commit -m "feat(somnio-sales-v3-pw-confirmation): add migration for PW-confirmation independent template catalog (~28 templates: informational verbatim from sales-v3 + sales restructured + new)"
    ```

    NO push.
  </action>
  <verify>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1); test -n "$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1); grep -qE "^BEGIN;" "supabase/migrations/$MIG" && grep -qE "^COMMIT;" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1); test $(grep -c "somnio-sales-v3-pw-confirmation" "supabase/migrations/$MIG") -ge 40</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1); test $(grep -c "INSERT INTO agent_templates" "supabase/migrations/$MIG") -ge 18</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1); grep -q "intent = 'saludo'" "supabase/migrations/$MIG" && grep -q "intent = 'confirmacion_orden_same_day'" "supabase/migrations/$MIG" && grep -q "intent = 'agendar_pregunta'" "supabase/migrations/$MIG" && grep -q "intent = 'claro_que_si_esperamos'" "supabase/migrations/$MIG" && grep -q "intent = 'cancelado_handoff'" "supabase/migrations/$MIG" && grep -q "intent = 'pedir_datos_post_compra'" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1); grep -q "INVIMA" "supabase/migrations/$MIG" && grep -q "PHARMA SOLUTIONS SAS" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1); grep -q "ELIXIR" "supabase/migrations/$MIG" && grep -q "1769960336980_Dise_o_sin_t_tulo__17_.jpg" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1); grep -q "GRANT ALL ON TABLE agent_templates TO service_role" "supabase/migrations/$MIG" && grep -q "GRANT SELECT ON TABLE agent_templates TO authenticated" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_pw_confirmation_template_catalog\.sql$' | head -1); ! grep -F "<copy verbatim" "supabase/migrations/$MIG"</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add migration for PW-confirmation independent template catalog"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `supabase/migrations/<YYYYMMDDHHMMSS>_pw_confirmation_template_catalog.sql` existe en git.
    - Wrapping `BEGIN;` ... `COMMIT;` presente.
    - Bloques `DO $$ BEGIN IF NOT EXISTS ... END $$` por cada intent (idempotencia).
    - Todos los INSERTs usan `agent_id = 'somnio-sales-v3-pw-confirmation'`, `workspace_id = NULL`, `visit_type = 'primera_vez'`.
    - Intents OBLIGATORIOS presentes: saludo, precio, promociones, contenido, formula, como_se_toma, pago, envio, ubicacion, contraindicaciones, dependencia, efectividad, registro_sanitario, tiempo_entrega_same_day, tiempo_entrega_next_day, tiempo_entrega_1_3_days, tiempo_entrega_2_4_days, tiempo_entrega_sin_ciudad, confirmacion_orden_same_day, confirmacion_orden_transportadora, pedir_datos_post_compra, confirmar_direccion_post_compra, agendar_pregunta, claro_que_si_esperamos, cancelado_handoff, fallback, error_carga_pedido.
    - `registro_sanitario` contiene literal `INVIMA` y `PHARMA SOLUTIONS SAS` (D-27).
    - `saludo` orden=1 contiene URL ELIXIR + caption + delay_s=3.
    - `claro_que_si_esperamos` contiene exactamente: `Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴` (D-14 verbatim).
    - `agendar_pregunta` contiene exactamente: `¿Deseas agendarlo para alguna fecha futura?` (D-11).
    - GRANTs defensivos al final (service_role ALL + authenticated SELECT).
    - NO contiene placeholders `<copy verbatim ...>` sin reemplazar (todos resueltos).
    - NO se aplico contra prod todavia (verificado solo via git history).
    - Commit atomico con mensaje exacto.
  </acceptance_criteria>
  <done>
    - Archivo SQL listo en git para que Plan 12 Task 1 lo aplique en prod.
    - Commit atomico, NO pusheado.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint humano — Aprobacion del copy de los ~12 templates NUEVOS / adaptados</name>
  <read_first>
    - supabase/migrations/<ts>_pw_confirmation_template_catalog.sql (creado en Task 1)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-10, §D-11, §D-12, §D-14, §D-21, §D-27
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §I.1
  </read_first>
  <what-built>
    Claude creo el archivo SQL con ~28 templates. Los informacionales son VERBATIM de sales-v3 (D-27 — no requieren approval, son los mismos textos que sales-v3 envia hoy en producción). Pero los siguientes ~12 son nuevos o adaptados para el flujo post-compra y necesitan tu approval del copy:

    1. `confirmacion_orden_same_day` (CORE + COMP) — D-10
    2. `confirmacion_orden_transportadora` (CORE + COMP) — D-10
    3. `pedir_datos_post_compra` — D-12
    4. `confirmar_direccion_post_compra` — D-12
    5. `agendar_pregunta` — D-11
    6. `claro_que_si_esperamos` — D-14 (copy lockeado verbatim en CONTEXT — solo confirmar que esta bien)
    7. `cancelado_handoff` — D-21
    8. `error_carga_pedido` — degradacion reader timeout
  </what-built>
  <how-to-verify>
    Para cada template, revisar el contenido literal en el SQL y aprobar/pedir cambio:

    **1. confirmacion_orden_same_day (CORE)** — D-10
    Texto:
    ```
    ¡Listo! Tu pedido está confirmado ✅

    {{items}}
    Total: {{total}}

    Despacharemos lo antes posible y llegará {{tiempo_estimado}} 🚚
    ```
    - [ ] Aprobado
    - [ ] Cambiar a: ___

    **2. confirmacion_orden_same_day (COMPLEMENTARIA)** — D-10
    Texto: `Recuerda: el pago se realiza al recibir el producto 💳`
    - [ ] Aprobado
    - [ ] Cambiar a: ___

    **3. confirmacion_orden_transportadora (CORE)** — D-10
    Texto:
    ```
    ¡Listo! Tu pedido está confirmado ✅

    {{items}}
    Total: {{total}}

    Llegará {{tiempo_estimado}} 🚚
    ```
    - [ ] Aprobado
    - [ ] Cambiar a: ___

    **4. confirmacion_orden_transportadora (COMPLEMENTARIA)** — D-10
    Texto: `Recuerda: el pago se realiza al recibir el producto 💳`
    - [ ] Aprobado
    - [ ] Cambiar a: ___

    **5. pedir_datos_post_compra** — D-12
    Texto:
    ```
    Para despachar tu pedido nos haría falta:
    {{campos_faltantes}}
    ```
    - [ ] Aprobado
    - [ ] Cambiar a: ___

    **6. confirmar_direccion_post_compra** — D-12
    Texto: `Confirmamos tu envío a 📍 {{direccion_completa}}?`
    - [ ] Aprobado
    - [ ] Cambiar a: ___

    **7. agendar_pregunta** — D-11
    Texto: `¿Deseas agendarlo para alguna fecha futura?`
    - [ ] Aprobado
    - [ ] Cambiar a: ___

    **8. claro_que_si_esperamos** — D-14 (lockeado verbatim en CONTEXT)
    Texto: `Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴`
    - [ ] Aprobado (deberia coincidir con D-14 exactamente)
    - [ ] Cambiar a: ___

    **9. cancelado_handoff** — D-21
    Texto: `Te conectamos con un asesor para procesar tu cancelación 🤝`
    - [ ] Aprobado
    - [ ] Cambiar a: ___

    **10. error_carga_pedido** — degradacion reader
    Texto: `Hubo un problema cargando tu pedido. ¿Podrías indicarme tu número de pedido o nombre completo para ayudarte? 🙏`
    - [ ] Aprobado
    - [ ] Cambiar a: ___

    **Verificacion de la URL imagen ELIXIR del template `saludo` orden=1:**
    ```bash
    curl -I "https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg"
    # Expected: HTTP/2 200
    ```
    - [ ] URL responde 200
    - [ ] URL caida — escalar (subir asset alternativo)

    **Verificacion de informacionales (D-27 — copy verbatim de sales-v3):**

    Spot-check 3 al azar (saludo, precio, registro_sanitario):
    - [ ] saludo orden=0 = `{{nombre_saludo}} 💁 Bienvenido a Somnio, en que te puedo ayudar?` (verificable via grep en SQL file).
    - [ ] precio CORE = identico al copy actual de sales-v3 (verificar leyendo migration 20260315150000:65-90).
    - [ ] registro_sanitario = `Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.` (D-27).

    Si algun informacional diverge del copy de sales-v3 → escalar (bug de Plan 02 — D-27 violado).
  </how-to-verify>
  <acceptance_criteria>
    - Usuario aprobo los 10 templates nuevos/adaptados (8 + 2 variantes COMP).
    - Si algun copy fue rechazado, Claude edito el SQL y re-checkpoineo hasta aprobacion total.
    - URL ELIXIR responde HTTP 200 (o se escalo si caida).
    - Spot-check de 3 informacionales confirmo que son verbatim de sales-v3 (D-27).
    - Usuario escribe "templates aprobados" para desbloquear Wave 2.
  </acceptance_criteria>
  <resume-signal>
    Escribe "templates aprobados" (10/10 nuevos OK + URL ELIXIR 200 + spot-check informacionales OK) para desbloquear Wave 2 (Plans 04 + 05 + 06 paralelizables).

    Si pides cambios de copy, especifica cuales (puede ser uno o varios) y Claude re-edita el SQL + re-checkpoint.
  </resume-signal>
</task>

</tasks>

<verification>
- `supabase/migrations/<ts>_pw_confirmation_template_catalog.sql` existe con ~28 entries.
- Idempotencia validada (DO $$ IF NOT EXISTS por intent).
- Copy de los 10 templates NUEVOS/adaptados aprobado por usuario.
- Copy de informacionales verbatim de sales-v3 (spot-check OK).
- D-27 respetado (registro_sanitario = INVIMA / PHARMA SOLUTIONS SAS).
- D-14 lockeado (claro_que_si_esperamos verbatim).
- D-11 lockeado (agendar_pregunta verbatim).
- GRANTs defensivos presentes.
- NO aplicado en prod.
- 1 commit atomico, NO pusheado.
</verification>

<success_criteria>
- Plan 07 (response-track.ts) tiene catalog real listo cuando Plan 12 lo aplique en prod — el lookup `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3-pw-confirmation'` traera los templates reales.
- Plan 12 Task 1 puede aplicar el SQL con confianza (idempotente, GRANTs incluidos, copy aprobado).
- Si rollback se necesita: `DELETE FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation';` (Query (e) Plan 01 confirmo greenfield, no hay nada anterior que preservar).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/02-SUMMARY.md` documenting:
- Commit hash de Task 1.
- Nombre exacto del archivo de migracion (con timestamp).
- Numero exacto de INSERTs (esperado ~28).
- Confirmacion del usuario de approval (timestamp + quote del resume-signal).
- Lista verbatim de los 10 templates nuevos/adaptados aprobados (copy final).
- URL ELIXIR confirmada 200.
- Confirmacion explicita: "Regla 5 respetada — NO aplicado en prod hasta Plan 12 Task 1".
</output>
</content>
</invoke>