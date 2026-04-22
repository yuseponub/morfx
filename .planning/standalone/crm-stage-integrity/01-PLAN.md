---
phase: crm-stage-integrity
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/<ts>_crm_stage_integrity.sql
autonomous: false
requirements:
  - D-03
  - D-10
  - D-11
  - D-13
  - D-17
  - D-20
  - D-24

must_haves:
  truths:
    - "Archivo `supabase/migrations/<YYYYMMDDHHMMSS>_crm_stage_integrity.sql` existe en git con schema D-10 de `order_stage_history` (13 columnas) + CHECK constraint de 7 valores en `source`"
    - "La migracion crea los 3 indices de D-11 incluyendo el parcial `idx_osh_kill_switch WHERE source != 'manual'`"
    - "La migracion habilita RLS + 4 policies (SELECT workspace-scoped, INSERT WITH CHECK true, UPDATE USING false, DELETE USING false) per D-13"
    - "La migracion define trigger plpgsql `prevent_order_stage_history_mutation` con RAISE EXCEPTION + 2 triggers BEFORE UPDATE/DELETE (append-only aun para service_role)"
    - "La migracion agrega `orders` a `supabase_realtime` publication idempotentemente (bloque DO $$ IF NOT EXISTS)"
    - "La migracion inserta 2 flags en `platform_config`: `crm_stage_integrity_cas_enabled` y `crm_stage_integrity_killswitch_enabled`, ambos `'false'::jsonb`, con `ON CONFLICT (key) DO NOTHING`"
    - "La migracion concede GRANTs explicitos: `GRANT ALL ON TABLE public.order_stage_history TO service_role` + `GRANT SELECT TO authenticated` (LEARNING 1 Phase 44.1)"
    - "Migracion aplicada en Supabase production ANTES del push de Plan 02+ (Regla 5). Usuario confirma con queries de validacion."
    - "Query `SELECT value FROM platform_config WHERE key='crm_stage_integrity_cas_enabled'` devuelve `false` en produccion"
    - "Query `SELECT value FROM platform_config WHERE key='crm_stage_integrity_killswitch_enabled'` devuelve `false` en produccion"
    - "Query `SELECT COUNT(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='orders'` devuelve `1`"
    - "NO backfill de `mutation_audit` → `order_stage_history` (D-24). Tabla queda vacia al cerrar Plan 01."
  artifacts:
    - path: "supabase/migrations/<ts>_crm_stage_integrity.sql"
      provides: "DDL composite: tabla append-only + 3 indices + RLS + triggers + realtime publication ADD + seed 2 flags + GRANTs"
      contains: "CREATE TABLE order_stage_history"
  key_links:
    - from: "supabase/migrations/<ts>_crm_stage_integrity.sql"
      to: "platform_config table (Supabase production)"
      via: "INSERT ON CONFLICT DO NOTHING + GRANT"
      pattern: "crm_stage_integrity_cas_enabled.*false"
    - from: "supabase/migrations/<ts>_crm_stage_integrity.sql"
      to: "supabase_realtime publication"
      via: "ALTER PUBLICATION supabase_realtime ADD TABLE orders (idempotente)"
      pattern: "pg_publication_tables.*supabase_realtime.*orders"
    - from: "order_stage_history append-only trigger"
      to: "service_role bypass defense"
      via: "RAISE EXCEPTION en BEFORE UPDATE/DELETE"
      pattern: "prevent_order_stage_history_mutation"
---

<objective>
Wave 0 — Migracion DB compuesta (BLOCKING checkpoint Regla 5). Crea la tabla append-only `order_stage_history` (D-10), sus 3 indices (D-11) incluyendo el parcial que habilita kill-switch <5ms (Pitfall 8), RLS + trigger plpgsql de doble guardia contra bypass de service_role (Pattern 4 RESEARCH), agrega `orders` a `supabase_realtime` publication idempotentemente (Example 6 RESEARCH — `orders` NO esta hoy en la publication, verified), y seedea los 2 feature flags en `platform_config` con default `false` (D-17, D-20). Todo en UNA migracion para cumplir Regla 5 con UN SOLO checkpoint humano antes de pushear Plan 02.

Purpose: Desbloquear Plans 02-05. Plans 02+ referencian `order_stage_history` (domain + runner + trigger-emitter) y los 2 flags (`getPlatformConfig` reads). Regla 5 prohibe pushear codigo que referencie columnas/tablas/flags inexistentes en produccion (incidente historico: 20h de mensajes perdidos por columna inexistente post-deploy). Regla 6 tambien aplica — ambos flags quedan OFF, deploy inicial es no-op (CAS desactivado, kill-switch desactivado), usuario flipea manualmente workspace-by-workspace tras observar telemetria.

Output: 1 archivo SQL en git + aplicado en Supabase production + verificado con 3 queries de lectura.

**CRITICAL — Regla 5:** El SQL se ejecuta en Supabase SQL Editor production ANTES del push de Plan 02. Task 2 es `checkpoint:human-verify gate="blocking"` — el usuario corre el SQL, valida con queries, y confirma explicitamente antes de avanzar.

**CRITICAL — Regla 6:** Ambos flags default `false`. Deploy del codigo subsecuente (Plans 02-05) sera byte-identical a pre-fase en comportamiento runtime hasta flip manual del usuario. Fallback de `getPlatformConfig` en Plan 02 sera tambien `false` (fail-closed para CAS) — si la migracion falla por alguna razon, el sistema sigue sin CAS (comportamiento actual) sin romper producido.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-stage-integrity/CONTEXT.md — D-03 (audit log confirmado), D-10 (schema exacto 13 columnas), D-11 (3 indices), D-13 (RLS append-only), D-17 (flag CAS default false), D-20 (flag kill-switch default false), D-24 (NO backfill)
@.planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 4 (Append-Only Audit Ledger SQL completo lineas 520-605), §Example 5 (platform_config seed con description), §Example 6 (orders realtime publication idempotente), §Pitfall 8 (partial index critico), §Pattern Shared 6 PATTERNS.md (GRANTs LEARNING 44.1)
@.planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 0 — Migracion DB composite (lineas 252-282)
@supabase/migrations/20260212000000_orders_realtime.sql — patron publication ADD
@supabase/migrations/20260213000001_mutation_audit.sql — patron audit table sin RLS (este standalone lo eleva a con-RLS)
@supabase/migrations/20260420000443_platform_config.sql — patron GRANTs explicitos (LEARNING 1 Phase 44.1)
@supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql — patron seed idempotente ON CONFLICT DO NOTHING
@CLAUDE.md §Regla 2 (timezone America/Bogota), §Regla 5 (migracion antes de deploy), §Regla 6 (proteger agente en produccion)
@.planning/phases/44.1-crm-bots-config-db/LEARNINGS.md — LEARNING 1 GRANTs pattern

<interfaces>
<!-- Schema D-10 canonico de CONTEXT.md §Decisions D-10 (columnas obligatorias) -->
-- order_stage_history (13 columnas + 7 valores CHECK source):
id uuid PK DEFAULT gen_random_uuid()
order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE
workspace_id uuid NOT NULL
previous_stage_id uuid NULL
new_stage_id uuid NOT NULL
source text NOT NULL CHECK (source IN ('manual','automation','webhook','agent','robot','cascade_capped','system'))
actor_id uuid NULL
actor_label text NULL
cascade_depth smallint NOT NULL DEFAULT 0
trigger_event text NULL
changed_at timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW())  -- Regla 2
metadata jsonb NULL

<!-- Indices D-11 (3 indices, uno parcial) -->
CREATE INDEX idx_osh_order_changed ON order_stage_history (order_id, changed_at DESC);
CREATE INDEX idx_osh_workspace_changed ON order_stage_history (workspace_id, changed_at DESC);
CREATE INDEX idx_osh_kill_switch ON order_stage_history (order_id, changed_at DESC)
  WHERE source != 'manual';  -- partial, critico para <5ms (Pitfall 8)

<!-- RLS D-13: 4 policies + trigger plpgsql doble guardia (Pattern 4) -->
-- Policies: SELECT workspace, INSERT WITH CHECK true, UPDATE USING false, DELETE USING false
-- Trigger: RAISE EXCEPTION en BEFORE UPDATE/DELETE (bloquea service_role bypass)

<!-- Realtime publication (Example 6 RESEARCH) -->
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='orders') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
END IF; END $$;

<!-- Seeds flags (Example 5 RESEARCH con description) -->
INSERT INTO platform_config (key, value, description)
VALUES
  ('crm_stage_integrity_cas_enabled', 'false'::jsonb, 'CAS compare-and-swap on moveOrderToStage. D-17.'),
  ('crm_stage_integrity_killswitch_enabled', 'false'::jsonb, 'Runtime kill-switch (>5 non-manual changes/60s). D-20.')
ON CONFLICT (key) DO NOTHING;

<!-- GRANTs (LEARNING 1 Phase 44.1 — sin esto Studio SQL Editor no hereda) -->
GRANT ALL ON TABLE public.order_stage_history TO service_role;
GRANT SELECT ON TABLE public.order_stage_history TO authenticated;
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear migracion SQL compuesta `supabase/migrations/<ts>_crm_stage_integrity.sql`</name>
  <read_first>
    - supabase/migrations/ (listar con `ls -t supabase/migrations/ | head -5` para ver timestamp mas reciente aplicado; el nuevo archivo DEBE tener timestamp mayor en formato `YYYYMMDDHHMMSS`)
    - supabase/migrations/20260213000001_mutation_audit.sql (precedent audit table — este estandar NO tiene RLS, el nuevo SI)
    - supabase/migrations/20260420000443_platform_config.sql (precedent GRANTs explicitos lineas 22-36)
    - supabase/migrations/20260212000000_orders_realtime.sql (precedent publication ADD)
    - supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql (precedent ON CONFLICT DO NOTHING + GRANT)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-10, D-11, D-13, D-17, D-20
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 4 lineas 520-605 (SQL exacto), §Example 5 lineas 1206-1225 (seed con description), §Example 6 lineas 1229-1245 (publication ADD idempotente), §Pitfall 8 (indice parcial critico)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 0 Migracion (lineas 252-282)
  </read_first>
  <action>
    Generar timestamp con `date -u +%Y%m%d%H%M%S` (o usar timestamp mayor al mas reciente de `ls supabase/migrations/`) y crear archivo `supabase/migrations/<ts>_crm_stage_integrity.sql` con el siguiente contenido **literal** (copiado de RESEARCH.md Pattern 4 + Examples 5 & 6 + PATTERNS.md Shared 6):

    ```sql
    -- =============================================================================
    -- crm-stage-integrity — composite migration (Wave 0)
    -- Creates order_stage_history (append-only audit ledger — D-10 schema, D-11 indices, D-13 RLS).
    -- Adds orders to supabase_realtime publication (D-14 — first time orders joins the publication).
    -- Seeds 2 feature flags (D-17 cas_enabled, D-20 killswitch_enabled) both default false (Regla 6).
    -- Idempotent: safe to replay (CREATE TABLE IF NOT EXISTS via separate convention, ON CONFLICT DO NOTHING on seed, DO $$ guard on publication ADD).
    -- Regla 5: apply in Supabase SQL Editor BEFORE pushing Plans 02-05.
    -- =============================================================================

    -- 1) CREATE TABLE order_stage_history (13 columns, source CHECK with 7 values, D-10)
    CREATE TABLE IF NOT EXISTS order_stage_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL,
      previous_stage_id uuid NULL,
      new_stage_id uuid NOT NULL,
      source text NOT NULL CHECK (
        source IN ('manual', 'automation', 'webhook', 'agent', 'robot', 'cascade_capped', 'system')
      ),
      actor_id uuid NULL,
      actor_label text NULL,
      cascade_depth smallint NOT NULL DEFAULT 0,
      trigger_event text NULL,
      changed_at timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
      metadata jsonb NULL
    );

    -- 2) INDICES (D-11, 3 indices incluyendo parcial para kill-switch hot path)
    CREATE INDEX IF NOT EXISTS idx_osh_order_changed
      ON order_stage_history (order_id, changed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_osh_workspace_changed
      ON order_stage_history (workspace_id, changed_at DESC);

    -- Partial index: kill-switch query filters source != 'manual' (Pitfall 8 RESEARCH)
    -- Without this, the runtime kill-switch does full table scan → 50ms latency.
    CREATE INDEX IF NOT EXISTS idx_osh_kill_switch
      ON order_stage_history (order_id, changed_at DESC)
      WHERE source != 'manual';

    -- 3) RLS (D-13 — workspace-scoped SELECT, append-only for everyone else)
    ALTER TABLE order_stage_history ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users see history for own workspace orders" ON order_stage_history;
    CREATE POLICY "Users see history for own workspace orders"
      ON order_stage_history FOR SELECT
      USING (
        workspace_id IN (
          SELECT workspace_id FROM workspace_members
          WHERE user_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS "Service role inserts history" ON order_stage_history;
    CREATE POLICY "Service role inserts history"
      ON order_stage_history FOR INSERT
      WITH CHECK (true);

    DROP POLICY IF EXISTS "No updates on history" ON order_stage_history;
    CREATE POLICY "No updates on history"
      ON order_stage_history FOR UPDATE
      USING (false);

    DROP POLICY IF EXISTS "No deletes on history" ON order_stage_history;
    CREATE POLICY "No deletes on history"
      ON order_stage_history FOR DELETE
      USING (false);

    -- 4) TRIGGER plpgsql — defense-in-depth against service_role bypass
    -- (createAdminClient() uses service_role which bypasses RLS; trigger fires for ALL roles)
    CREATE OR REPLACE FUNCTION prevent_order_stage_history_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'order_stage_history is append-only (TG_OP=%)', TG_OP;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS guard_order_stage_history_no_update ON order_stage_history;
    CREATE TRIGGER guard_order_stage_history_no_update
      BEFORE UPDATE ON order_stage_history
      FOR EACH ROW EXECUTE FUNCTION prevent_order_stage_history_mutation();

    DROP TRIGGER IF EXISTS guard_order_stage_history_no_delete ON order_stage_history;
    CREATE TRIGGER guard_order_stage_history_no_delete
      BEFORE DELETE ON order_stage_history
      FOR EACH ROW EXECUTE FUNCTION prevent_order_stage_history_mutation();

    -- 5) GRANTs explicitos (LEARNING 1 Phase 44.1 — Studio SQL Editor no hereda grants)
    GRANT ALL    ON TABLE public.order_stage_history TO service_role;
    GRANT SELECT ON TABLE public.order_stage_history TO authenticated;

    -- 6) REALTIME publication — agregar orders idempotentemente (Example 6 RESEARCH)
    -- orders NO esta en supabase_realtime hoy (verified 2026-04-21, grep en migrations dir)
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
      END IF;
    END $$;

    -- NOTA: NO activamos REPLICA IDENTITY FULL (Pitfall 6 RESEARCH — cliente no necesita payload.old).

    -- 7) SEED feature flags (Example 5 RESEARCH, ambos default false por D-17 y D-20 + Regla 6)
    INSERT INTO platform_config (key, value, description)
    VALUES
      (
        'crm_stage_integrity_cas_enabled',
        'false'::jsonb,
        'Optimistic compare-and-swap en moveOrderToStage. Activar per-workspace tras observar telemetria. See .planning/standalone/crm-stage-integrity/CONTEXT.md D-17.'
      ),
      (
        'crm_stage_integrity_killswitch_enabled',
        'false'::jsonb,
        'Runtime kill-switch: skip automation si >5 cambios no-manuales en 60s. See D-20.'
      )
    ON CONFLICT (key) DO NOTHING;

    -- 8) COMMENTs (documentacion in-DB)
    COMMENT ON TABLE order_stage_history IS
      'Append-only ledger de cambios de stage_id en orders. Escrito por domain.moveOrderToStage.';
    COMMENT ON COLUMN order_stage_history.source IS
      'Origen: manual (UI), automation (Inngest), webhook, agent (CRM bot), robot (Coordinadora/Inter), cascade_capped (MAX_CASCADE_DEPTH hit), system.';
    COMMENT ON COLUMN order_stage_history.actor_id IS
      'user_id si manual; automation_id si automation; NULL para agent/webhook/robot/system (actor_label lleva el hint).';
    COMMENT ON COLUMN order_stage_history.previous_stage_id IS
      'NULL solo en creacion de pedido. Siempre presente en cambios subsecuentes.';

    -- =============================================================================
    -- FIN migracion. Aplicar en Supabase SQL Editor production antes de Plan 02 push.
    -- =============================================================================
    ```

    NOTAS CRITICAS:
    - Timestamp del archivo DEBE ser mayor al mas reciente en `supabase/migrations/` (Supabase aplica en orden lexicografico).
    - NO cambiar ninguno de los 7 valores del CHECK constraint — Plan 02/03 escribe exactamente esos valores.
    - NO remover el indice parcial `idx_osh_kill_switch` — Plan 03 query latency depende de el.
    - NO aplicar `REPLICA IDENTITY FULL` — Pattern 3 RESEARCH explica por que el cliente no necesita `payload.old`.
    - Los DROP POLICY / DROP TRIGGER IF EXISTS garantizan replay safety en dev.

    NO ejecutar el SQL contra produccion — solo crear el archivo. El SQL se aplica en Task 2 (checkpoint humano).
  </action>
  <verify>
    <automated>ls supabase/migrations/ | grep -E '^[0-9]{14}_crm_stage_integrity\.sql$' | head -1</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_crm_stage_integrity\.sql$' | head -1); grep -q "CREATE TABLE IF NOT EXISTS order_stage_history" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_crm_stage_integrity\.sql$' | head -1); grep -q "source IN ('manual', 'automation', 'webhook', 'agent', 'robot', 'cascade_capped', 'system')" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_crm_stage_integrity\.sql$' | head -1); grep -q "idx_osh_kill_switch" "supabase/migrations/$MIG" && grep -q "WHERE source != 'manual'" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_crm_stage_integrity\.sql$' | head -1); grep -q "ENABLE ROW LEVEL SECURITY" "supabase/migrations/$MIG" && grep -q "prevent_order_stage_history_mutation" "supabase/migrations/$MIG" && grep -q "RAISE EXCEPTION" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_crm_stage_integrity\.sql$' | head -1); grep -q "ALTER PUBLICATION supabase_realtime ADD TABLE orders" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_crm_stage_integrity\.sql$' | head -1); grep -q "crm_stage_integrity_cas_enabled" "supabase/migrations/$MIG" && grep -q "crm_stage_integrity_killswitch_enabled" "supabase/migrations/$MIG" && grep -q "'false'::jsonb" "supabase/migrations/$MIG" && grep -q "ON CONFLICT (key) DO NOTHING" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_crm_stage_integrity\.sql$' | head -1); grep -q "GRANT ALL    ON TABLE public.order_stage_history TO service_role" "supabase/migrations/$MIG" && grep -q "GRANT SELECT ON TABLE public.order_stage_history TO authenticated" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_crm_stage_integrity\.sql$' | head -1); grep -q "timezone('America/Bogota', NOW())" "supabase/migrations/$MIG"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `supabase/migrations/<YYYYMMDDHHMMSS>_crm_stage_integrity.sql` existe, timestamp > ultima migracion aplicada.
    - Contiene las 8 secciones: CREATE TABLE, INDICES x3, RLS + 4 POLICIES, TRIGGER plpgsql + 2 BEFORE triggers, GRANTs, REALTIME ADD idempotente, SEED flags, COMMENTs.
    - `source` CHECK lista los 7 valores literales: `'manual','automation','webhook','agent','robot','cascade_capped','system'`.
    - Indice parcial `idx_osh_kill_switch ... WHERE source != 'manual'` presente.
    - 2 flags seeded con `'false'::jsonb` + `ON CONFLICT DO NOTHING`.
    - GRANTs explicitos `service_role` ALL + `authenticated` SELECT.
    - `changed_at` default usa `timezone('America/Bogota', NOW())` (Regla 2).
    - Archivo commiteado (preparado para aplicar en Task 2).
    - NO ejecutado contra produccion todavia — solo archivo git.
  </acceptance_criteria>
  <done>
    - Commit atomico: `feat(crm-stage-integrity): add composite migration — order_stage_history + realtime + flags`
    - Archivo listo para que usuario ejecute en Supabase SQL Editor (Task 2).
    - NO push a Vercel hasta que Task 2 pase el checkpoint.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint — Usuario aplica migracion en Supabase production + valida con 4 queries</name>
  <read_first>
    - supabase/migrations/<ts>_crm_stage_integrity.sql (el archivo creado en Task 1)
    - CLAUDE.md §Regla 5 (migracion antes de deploy), §Regla 6 (proteger agente en produccion)
    - .planning/phases/44.1-crm-bots-config-db/LEARNINGS.md — LEARNING 1 (verificar GRANTs post-ejecucion)
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Pitfall 8 (validar indice parcial via EXPLAIN opcional)
  </read_first>
  <what-built>
    Task 1 creo el archivo de migracion composite con TODO lo que Plans 02-05 necesitan: tabla `order_stage_history` + 3 indices + RLS + trigger plpgsql de doble guardia + `orders` a `supabase_realtime` publication + seed de 2 flags default `false` + GRANTs explicitos. El archivo esta commiteado en git pero NO aplicado contra la base de produccion.

    Falta que el usuario:
    1. Abra Supabase SQL Editor del proyecto production de morfx.
    2. Copie el contenido entero del archivo de migracion y lo ejecute (idempotente, seguro para replay).
    3. Valide con 4 queries de lectura que todo quedo como se espera.
    4. Confirme explicitamente para desbloquear Plan 02 push (Regla 5).

    **IMPORTANTE (Regla 6):** Ambos flags quedan en `false`. Cuando Plans 02-05 se deployen, el codigo:
    - Plan 02 (`moveOrderToStage`): leera `crm_stage_integrity_cas_enabled=false` → ejecutara el LEGACY path (UPDATE sin `.eq('stage_id', prev)`) = comportamiento actual byte-identical.
    - Plan 03 (`automation-runner`): leera `crm_stage_integrity_killswitch_enabled=false` → saltara el query de kill-switch = comportamiento actual byte-identical.
    - Plan 02 ADICIONALMENTE escribira a `order_stage_history` desde el primer move tras deploy (D-18: no flag, additive). Si el INSERT falla por cualquier razon, se loggea y se continua (Pitfall 3 RESEARCH — history insert es best-effort).

    Por ende: si el SQL se ejecuta correctamente, el deploy de Plans 02-05 es seguro incluso sin flip del flag. El flip es lo que ACTIVA el fix operacional.
  </what-built>
  <how-to-verify>
    **Paso 1 — Aplicar la migracion en Supabase production:**

    1. Abrir https://supabase.com/dashboard → proyecto de produccion morfx → SQL Editor → New query.
    2. Copiar el contenido ENTERO de `supabase/migrations/<ts>_crm_stage_integrity.sql` (incluye CREATE TABLE + 3 INDICES + RLS + 4 POLICIES + TRIGGER FUNCTION + 2 BEFORE TRIGGERS + GRANTs + DO $$ publication + INSERT seed + COMMENTs — todo en el mismo query).
    3. Pegar en SQL Editor, click Run.
    4. Esperado: "Success. No rows returned." (o equivalente). Si ya hay `order_stage_history` de un replay previo, los `IF NOT EXISTS` y `ON CONFLICT DO NOTHING` la dejan igual.

    Si hay error **antes** del INSERT seed (ej. error de sintaxis), NO continuar — reportar a Claude para fix en Task 1 y re-ejecutar.

    **Paso 2 — Validar estructura de la tabla (13 columnas, CHECK constraint, indices):**

    ```sql
    -- 2a. Verificar tabla existe con 13 columnas
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_stage_history'
    ORDER BY ordinal_position;
    ```
    Expected: 13 filas (id, order_id, workspace_id, previous_stage_id, new_stage_id, source, actor_id, actor_label, cascade_depth, trigger_event, changed_at, metadata + el orden exacto varia segun DB pero deben ser 13).

    ```sql
    -- 2b. Verificar CHECK constraint con 7 valores
    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'public.order_stage_history'::regclass AND contype = 'c';
    ```
    Expected: Al menos 1 fila con definicion `CHECK (source = ANY (ARRAY['manual'::text, 'automation'::text, 'webhook'::text, 'agent'::text, 'robot'::text, 'cascade_capped'::text, 'system'::text]))`.

    ```sql
    -- 2c. Verificar los 3 indices (incluido el parcial)
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'order_stage_history'
    ORDER BY indexname;
    ```
    Expected: 4 filas (primary key + 3 indices custom). `idx_osh_kill_switch` debe incluir `WHERE (source <> 'manual'::text)` en su `indexdef`.

    **Paso 3 — Validar RLS + trigger append-only:**

    ```sql
    -- 3a. RLS enabled
    SELECT relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE oid = 'public.order_stage_history'::regclass;
    ```
    Expected: `relrowsecurity = true`.

    ```sql
    -- 3b. Policies (4 esperadas)
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'order_stage_history'
    ORDER BY policyname;
    ```
    Expected: 4 policies (SELECT workspace, INSERT WITH CHECK true, UPDATE USING false, DELETE USING false).

    ```sql
    -- 3c. Trigger funcional — intentar UPDATE como service_role DEBE fallar con RAISE EXCEPTION
    -- (correr como service_role desde SQL Editor)
    INSERT INTO order_stage_history (order_id, workspace_id, new_stage_id, source)
      SELECT id, workspace_id, stage_id, 'system' FROM orders LIMIT 1
      RETURNING id;
    -- Guardar el id retornado, luego:
    UPDATE order_stage_history SET source = 'manual' WHERE id = '<id_retornado>';
    -- Expected: ERROR: order_stage_history is append-only (TG_OP=UPDATE)
    ```
    Si hace el UPDATE sin error → trigger NO quedo aplicado (Task 1 fix requerido).

    **Paso 4 — Validar realtime publication + flags seeded:**

    ```sql
    -- 4a. orders en supabase_realtime
    SELECT tablename FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders';
    ```
    Expected: 1 fila con `tablename = 'orders'`.

    ```sql
    -- 4b. Ambos flags seeded default false
    SELECT key, value, description
    FROM platform_config
    WHERE key IN ('crm_stage_integrity_cas_enabled', 'crm_stage_integrity_killswitch_enabled')
    ORDER BY key;
    ```
    Expected: 2 filas, ambas con `value = false` (jsonb). Si `value = true` en alguna → alguien ya las flipeo manualmente, reportar a Claude para alinear.

    ```sql
    -- 4c. GRANTs aplicadas (LEARNING 1 check)
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'order_stage_history'
      AND grantee IN ('service_role', 'authenticated')
    ORDER BY grantee, privilege_type;
    ```
    Expected: `service_role` con al menos SELECT/INSERT/UPDATE/DELETE (aunque UPDATE/DELETE luego los bloquea el trigger — GRANT es separado). `authenticated` con SELECT.

    **Paso 5 — Confirmar estado final flags (Regla 6):**

    Flags DEBEN terminar en `false` al cerrar el checkpoint. Si el Paso 4b mostro algo distinto, corregir:

    ```sql
    UPDATE platform_config SET value = 'false'::jsonb
    WHERE key IN ('crm_stage_integrity_cas_enabled', 'crm_stage_integrity_killswitch_enabled');
    ```

    **Paso 6 — Push a Vercel (opcional pero recomendado):**

    Ahora que la migracion esta aplicada, es seguro pushear el commit de Task 1 (es solo el archivo SQL en git, no referencia ninguna tabla en codigo todavia):

    ```bash
    git push origin main
    ```

    Vercel no aplica migraciones — solo compila. Y el archivo SQL en el repo queda como fuente de verdad para replay en staging/dev.
  </how-to-verify>
  <acceptance_criteria>
    - Usuario confirma ejecucion exitosa del SQL completo en Supabase SQL Editor production.
    - Paso 2a devuelve 13 columnas.
    - Paso 2b confirma CHECK constraint con los 7 valores literales.
    - Paso 2c confirma 3 indices custom, incluido `idx_osh_kill_switch` con clausula parcial `WHERE (source <> 'manual'::text)`.
    - Paso 3a: `relrowsecurity = true`.
    - Paso 3b: 4 policies presentes (SELECT/INSERT/UPDATE/DELETE).
    - Paso 3c: UPDATE de prueba FALLA con `order_stage_history is append-only`.
    - Paso 4a: `orders` presente en `pg_publication_tables` (pubname=supabase_realtime).
    - Paso 4b: Ambos flags con `value=false`.
    - Paso 4c: GRANTs visibles para service_role + authenticated.
    - Paso 5: Flags confirmados finales en `false`.
    - Usuario escribe "migracion aplicada" o equivalente.
  </acceptance_criteria>
  <resume-signal>
    Escribe "migracion aplicada" + adjunta/pega las salidas de los Pasos 2b, 2c, 3c (el error esperado del UPDATE), 4a, 4b. Si algun Paso fallo, describe el error y NO resumas — Claude debe fix antes de avanzar.
  </resume-signal>
</task>

</tasks>

<verification>
- `supabase/migrations/<ts>_crm_stage_integrity.sql` existe en git con timestamp reciente.
- Migracion aplicada en Supabase production — tabla `order_stage_history` existe, 3 indices presentes, RLS + 4 policies + trigger plpgsql activos.
- `orders` agregada a `supabase_realtime` publication (idempotente — no-op si ya estaba, pero se verifico que NO estaba antes).
- 2 flags en `platform_config` con `value=false`.
- GRANTs `service_role` ALL + `authenticated` SELECT aplicadas.
- Usuario confirmo "migracion aplicada" con salidas de las 4 queries de validacion.
</verification>

<success_criteria>
- `npm test` no aplica todavia (no hay cambios de codigo en este plan — tests vienen en Plans 02-05).
- `getPlatformConfig<boolean>('crm_stage_integrity_cas_enabled', false)` leera `false` real de DB desde cualquier lambda dentro de 30s de cache TTL.
- `getPlatformConfig<boolean>('crm_stage_integrity_killswitch_enabled', false)` idem.
- `INSERT` a `order_stage_history` desde service_role funciona (Plan 02+ lo usara).
- `UPDATE` / `DELETE` a `order_stage_history` FALLA aun con service_role (append-only guarantee).
- Kanban de Plan 05 podra subscribirse a `postgres_changes UPDATE` sobre `orders` via Supabase Realtime.
- Regla 6 respetada: flags=false, produccion byte-identical al pre-fase.
- Plans 02-05 desbloqueados — assume schema + flags + publication disponibles en prod.
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-stage-integrity/01-SUMMARY.md` documenting:
- Commit hash del Task 1 (migracion SQL composite)
- Nombre exacto del archivo con timestamp (`<YYYYMMDDHHMMSS>_crm_stage_integrity.sql`)
- Timestamp del checkpoint humano (Task 2) cuando el usuario confirmo
- Salidas verbatim de queries Paso 2b (CHECK constraint), Paso 2c (indices), Paso 3c (trigger error esperado), Paso 4a (publication), Paso 4b (flags)
- Confirmacion explicita: "Ambos flags = false, orders en supabase_realtime, trigger append-only activo, GRANTs aplicadas. Regla 5 + Regla 6 respetadas."
- Si hubo push a Vercel: commit range + URL deploy
</output>
</content>
</invoke>