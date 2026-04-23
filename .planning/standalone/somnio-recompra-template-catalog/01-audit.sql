-- ============================================================================
-- Recompra Template Catalog — Auditoria D-11 + Snapshot pre-migracion
-- ============================================================================
-- Phase: somnio-recompra-template-catalog (standalone)
-- Proposito: (1) Verificar que los 22 intents esperados ya existen bajo
-- agent_id='somnio-recompra-v1' (D-11); (2) Capturar snapshot del estado
-- actual para rollback D-09 Opcion A.
--
-- Instrucciones de uso:
--   - Correr en Supabase SQL Editor de PRODUCCION (dashboard > SQL).
--   - Copiar el output de cada query al archivo 01-SNAPSHOT.md.
--   - NO aplica cambios — solo lee.

-- ============================================================================
-- PASO 1: Auditoria D-11 — rows_found por intent esperado
-- ============================================================================

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

-- ============================================================================
-- PASO 2: Snapshot JSON — estado pre-migracion completo
-- ============================================================================

SELECT jsonb_pretty(jsonb_agg(to_jsonb(t.*) ORDER BY t.intent, t.orden)) AS snapshot_json
FROM agent_templates t
WHERE t.agent_id = 'somnio-recompra-v1'
  AND t.workspace_id IS NULL;
