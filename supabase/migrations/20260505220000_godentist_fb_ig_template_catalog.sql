-- ============================================================================
-- GoDentist FB/IG Sibling — Template Catalog Migration
-- Standalone: agent-godentist-fb-ig (Wave 5 Plan 07)
--
-- Clones ALL templates from agent_id='godentist' to agent_id='godentist-fb-ig'.
-- Single content change: template `saludo`/CORE uses lead-capture text per D-05.
-- All other templates verbatim (precios, ubicaciones, horarios, escape, follow-ups,
-- english_response, etc.) per D-08.
--
-- Workspace: NULL (catalog global; el sibling solo se activa en workspace
-- 'GoDentist Valoraciones' f0241182-f79b-4bc6-b0ed-b5f6eb20c514 pero el
-- catalog es global accesible via workspace-aware TemplateManager).
--
-- D-05 saludo verbatim (lead-capture lead-magnet con disclaimer Habeas Data):
--   👋 ¡Hola! Soy goBot 🤖 de godentist ®️.
--
--   Tu valoración odontológica es totalmente GRATIS 🦷✨
--   Déjanos estos datos y reservamos tu cita de inmediato:
--
--   📌 Nombre completo
--   📌 Celular
--
--   🔒 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581
--      de 2011 (Habeas Data).
--
--   Estás a un paso de comenzar tu nueva sonrisa 💙 ¿Deseas agendar tu cita
--   de valoración GRATIS?
--
-- D-08 catalog independence: el sibling NO comparte rows con godentist.
--   Anti-pattern guarda contra regresion `cdc06d9` (revertido en somnio-recompra-v1).
--
-- Idempotency: DELETE existing rows for agent_id='godentist-fb-ig' before INSERT.
-- Safe to re-run.
--
-- Rollback: DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig';
--
-- Regla 5 (CLAUDE.md): Apply MANUALLY in production BEFORE pushing code that
-- references these templates. Plan-phase Plan 07 = SQL apply [BLOCKING], Plan 08
-- = code push. Si el push del Plan 08 ocurre antes del apply, el sibling estaria
-- registrado pero `templateManager.getTemplatesForIntents('godentist-fb-ig', ...)`
-- retornaria empty Map -> response-track emitiria fallback con
-- `emptyReason: 'templates_not_found_in_catalog'` -> cliente FB/IG NO recibe
-- respuesta del bot.
--
-- Snapshot baseline (01-SNAPSHOT.md Q-A, 2026-05-05):
--   godentist catalog (workspace_id IS NULL) = 79 rows, 100% content_type='texto'.
--   Sibling target post-apply = 79 rows (sanity check DO block enforcement).
-- ============================================================================

BEGIN;

-- Idempotent: clean slate
DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig';

-- Clone all templates from godentist with single content swap for saludo CORE
INSERT INTO agent_templates (
  id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s
)
SELECT
  gen_random_uuid(),
  'godentist-fb-ig',
  workspace_id,
  intent,
  visit_type,
  priority,
  orden,
  content_type,
  CASE
    WHEN intent = 'saludo' AND priority = 'CORE' THEN
      -- D-05 locked verbatim (lead-capture con Habeas Data inline)
      E'\U0001F44B ¡Hola! Soy goBot \U0001F916 de godentist ®️.\n\nTu valoración odontológica es totalmente GRATIS \U0001F9B7✨\nDéjanos estos datos y reservamos tu cita de inmediato:\n\n\U0001F4CC Nombre completo\n\U0001F4CC Celular\n\n\U0001F512 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data).\n\nEstás a un paso de comenzar tu nueva sonrisa \U0001F499 ¿Deseas agendar tu cita de valoración GRATIS?'
    ELSE content
  END,
  delay_s
FROM agent_templates
WHERE agent_id = 'godentist'
  AND workspace_id IS NULL;

-- Sanity check 1: row count post-INSERT must match godentist row count
DO $$
DECLARE
  godentist_count INTEGER;
  sibling_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO godentist_count
  FROM agent_templates
  WHERE agent_id = 'godentist' AND workspace_id IS NULL;

  SELECT COUNT(*) INTO sibling_count
  FROM agent_templates
  WHERE agent_id = 'godentist-fb-ig';

  IF sibling_count != godentist_count THEN
    RAISE EXCEPTION 'Row count mismatch: godentist=% sibling=% (expected equal)', godentist_count, sibling_count;
  END IF;

  RAISE NOTICE 'Migration OK: % rows cloned from godentist to godentist-fb-ig', sibling_count;
END $$;

-- Sanity check 2: saludo D-05 was applied (contains "goBot" + "Habeas Data")
DO $$
DECLARE
  saludo_count INTEGER;
  saludo_has_gobot BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO saludo_count
  FROM agent_templates
  WHERE agent_id = 'godentist-fb-ig'
    AND intent = 'saludo'
    AND priority = 'CORE';

  IF saludo_count = 0 THEN
    RAISE EXCEPTION 'No saludo CORE found for godentist-fb-ig — D-05 not applied';
  END IF;

  SELECT bool_or(content LIKE '%goBot%' AND content LIKE '%Habeas Data%')
  INTO saludo_has_gobot
  FROM agent_templates
  WHERE agent_id = 'godentist-fb-ig'
    AND intent = 'saludo'
    AND priority = 'CORE';

  IF NOT saludo_has_gobot THEN
    RAISE EXCEPTION 'Saludo CORE for godentist-fb-ig does not contain goBot + Habeas Data — D-05 text not applied correctly';
  END IF;

  RAISE NOTICE 'D-05 saludo OK: % CORE row(s) with goBot + Habeas Data inline', saludo_count;
END $$;

COMMIT;
