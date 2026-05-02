-- Standalone: somnio-sales-v4 / Plan 03
-- Clona TODOS los templates de somnio-sales-v3 a somnio-sales-v4 con contenido idéntico.
-- Pitfall 1 (RESEARCH): agent_templates es tabla Postgres INTERNAL, NO templates Meta HSM.
--   Cero involucramiento Meta. Cero re-approval. Pure SQL operation.
-- Pattern: PATTERNS.md "Pattern B — INSERT … SELECT FROM existing v3 rows"
-- D-26: contenido IDÉNTICO; v4 sólo cambia agent_id.
-- D-59: garantizar handoff_humano existe en v4 (si v3 no lo tiene, crear).
-- Regla 5: usuario aplica manualmente.

-- ROLLBACK (al final del archivo, comentado):
--   DELETE FROM public.agent_templates WHERE agent_id = 'somnio-sales-v4';

-- Pre-check: log cuántos rows hay en v3 para diff post-apply
DO $$
DECLARE v3_count INT;
BEGIN
  SELECT COUNT(*) INTO v3_count FROM public.agent_templates WHERE agent_id = 'somnio-sales-v3';
  RAISE NOTICE 'Templates somnio-sales-v3 a clonar: %', v3_count;
END $$;

-- Clone bulk: INSERT … SELECT con guard NOT EXISTS por (intent, visit_type, orden, workspace_id)
-- IMPORTANTE: si el schema real de agent_templates tiene columnas adicionales (created_at, updated_at, etc.),
-- agregarlas aquí o dejar que defaults las llenen.
INSERT INTO public.agent_templates (
  id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s
)
SELECT
  gen_random_uuid(),
  'somnio-sales-v4',
  v3.workspace_id,
  v3.intent,
  v3.visit_type,
  v3.priority,
  v3.orden,
  v3.content_type,
  v3.content,
  v3.delay_s
FROM public.agent_templates v3
WHERE v3.agent_id = 'somnio-sales-v3'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_templates v4
    WHERE v4.agent_id = 'somnio-sales-v4'
      AND v4.intent = v3.intent
      AND v4.visit_type IS NOT DISTINCT FROM v3.visit_type
      AND v4.orden = v3.orden
      AND v4.workspace_id IS NOT DISTINCT FROM v3.workspace_id
  );

-- D-59: garantizar template handoff_humano para v4
-- visit_type es NOT NULL + CHECK IN ('primera_vez','siguientes') — creamos un row por cada
-- valor válido para que el agente encuentre handoff sin importar la visita del cliente.
INSERT INTO public.agent_templates (
  id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s
)
SELECT
  gen_random_uuid(),
  'somnio-sales-v4',
  'a3843b3f-c337-4836-92b5-89c58bb98490',  -- Somnio workspace
  'handoff_humano',
  vt.visit_type,
  'CORE',
  0,
  'texto',
  'Un asesor te responde en breve. Gracias por tu paciencia.',
  0
FROM (VALUES ('primera_vez'), ('siguientes')) AS vt(visit_type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_templates t
  WHERE t.agent_id = 'somnio-sales-v4'
    AND t.intent = 'handoff_humano'
    AND t.visit_type = vt.visit_type
);

DO $$
DECLARE handoff_count INT;
BEGIN
  SELECT COUNT(*) INTO handoff_count FROM public.agent_templates
  WHERE agent_id='somnio-sales-v4' AND intent='handoff_humano';
  RAISE NOTICE 'Templates handoff_humano para somnio-sales-v4: % (esperado >= 2)', handoff_count;
END $$;

-- Post-check: confirmar conteos parejos
DO $$
DECLARE
  v3_count INT;
  v4_count INT;
BEGIN
  SELECT COUNT(*) INTO v3_count FROM public.agent_templates WHERE agent_id = 'somnio-sales-v3';
  SELECT COUNT(*) INTO v4_count FROM public.agent_templates WHERE agent_id = 'somnio-sales-v4';
  RAISE NOTICE 'Post-clone: v3=% v4=% (v4 puede ser >= v3 si se creó handoff_humano nuevo)', v3_count, v4_count;
  IF v4_count < v3_count THEN
    RAISE EXCEPTION 'Clone incompleto: v4 (%)< v3 (%)', v4_count, v3_count;
  END IF;
END $$;
