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
