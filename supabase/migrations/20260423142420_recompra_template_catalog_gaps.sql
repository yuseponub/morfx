-- ============================================================================
-- Recompra Template Catalog Gaps — cerrar runtime gaps
-- ============================================================================
-- Phase: somnio-recompra-template-catalog (standalone)
-- Origen: audit D-11 revelo 3 gaps reales en prod bajo agent_id='somnio-recompra-v1'.
-- El scope original del plan (saludo/preguntar_direccion/registro_sanitario) se
-- redujo porque esos 3 ya existen en prod con copy equivalente o mejor.
--
-- Cambios (3 intents, 4 rows) — copy tomado de los originales sales-v3:
--   1. contraindicaciones              -> NEW orden=0 (texto CORE) + orden=1 (texto COMPLEMENTARIA delay=4)
--      Fuente: supabase/migrations/20260206000001_seed_somnio_templates.sql:174-175
--   2. tiempo_entrega_1_3_days         -> NEW orden=0 (texto CORE)
--      Fuente: supabase/migrations/20260317200001_tiempo_entrega_templates.sql:27-28
--   3. tiempo_entrega_2_4_days         -> NEW orden=0 (texto CORE) — zona DEFAULT
--      Fuente: supabase/migrations/20260317200001_tiempo_entrega_templates.sql:31-32
--
-- Idempotencia: DO $$ BEGIN IF NOT EXISTS ... END $$ por intent
-- (no DELETE — los 3 intents no existen bajo recompra-v1 hoy).
--
-- Rollback: los 3 intents son aditivos. Para revertir, DELETE del catalogo
-- recompra-v1 donde intent IN (...) — ver 01-SNAPSHOT.md.
--
-- Regla 5: este SQL se aplica en Supabase prod durante Plan 05 Task 1,
-- ANTES del push de codigo de Plans 02/03/04.

BEGIN;

-- ========================================================================
-- 1. contraindicaciones (texto CORE + texto COMPLEMENTARIA)
--    Copy literal desde sales-v1/v3 original (intent: contraindicaciones en v1,
--    renombrado a efectos en v3 migration 20260315150000_v3_independent_templates.sql).
-- ========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-recompra-v1'
      AND intent = 'contraindicaciones'
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'contraindicaciones', 'primera_vez', 'CORE', 0, 'texto',
       'La melatonina y el citrato de magnesio son compuestos seguros y bien tolerados.', 0),
      (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'contraindicaciones', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Si tomas anticoagulantes, consulta con tu médico antes de usarlo.', 4);
  END IF;
END $$;

-- ========================================================================
-- 2. tiempo_entrega_1_3_days (texto CORE)
--    Copy literal desde sales-v3 migration 20260317200001_tiempo_entrega_templates.sql:27-28
--    {{ciudad}} disponible; {{tiempo_estimado}} disponible pero no usado (copy estatico).
-- ========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-recompra-v1'
      AND intent = 'tiempo_entrega_1_3_days'
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'tiempo_entrega_1_3_days', 'primera_vez', 'CORE', 0, 'texto',
       'Tu pedido estaria llegando a {{ciudad}} en 1-3 dias habiles', 0);
  END IF;
END $$;

-- ========================================================================
-- 3. tiempo_entrega_2_4_days (texto CORE) — zona DEFAULT (ciudades desconocidas)
--    Copy literal desde sales-v3 migration 20260317200001_tiempo_entrega_templates.sql:31-32
-- ========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-recompra-v1'
      AND intent = 'tiempo_entrega_2_4_days'
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'tiempo_entrega_2_4_days', 'primera_vez', 'CORE', 0, 'texto',
       'Tu pedido estaria llegando a {{ciudad}} en 2-4 dias habiles', 0);
  END IF;
END $$;

-- ========================================================================
-- 4. Defensive GRANTs (LEARNING 1 Phase 44.1 — idempotent no-ops si ya existen)
-- ========================================================================

GRANT ALL ON TABLE agent_templates TO service_role;
GRANT SELECT ON TABLE agent_templates TO authenticated;

COMMIT;
