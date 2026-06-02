-- ============================================================================
-- agent-lifecycle-router — Snapshot pre-migracion + audit baseline
-- Run en Supabase SQL Editor de PRODUCCION antes de aplicar la migracion (Plan 07 Task 1).
-- Outputs se pegan verbatim en .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md
-- ============================================================================

-- Query 1: workspace_agent_config baseline (cuantos workspaces, recompra_enabled distribution)
SELECT
  COUNT(*) AS total_workspaces_with_config,
  SUM(CASE WHEN agent_enabled THEN 1 ELSE 0 END) AS agent_enabled_count,
  SUM(CASE WHEN recompra_enabled THEN 1 ELSE 0 END) AS recompra_enabled_count,
  array_agg(DISTINCT conversational_agent_id) AS conversational_agents_in_use
FROM workspace_agent_config;

-- Query 2: tags productivas que el router consumira (contar quantos contactos tiene cada una)
SELECT
  t.name AS tag_name,
  COUNT(DISTINCT ct.contact_id) AS contacts_with_tag
FROM tags t
LEFT JOIN contact_tags ct ON ct.tag_id = t.id
WHERE t.name IN (
  'forzar_humano', 'pausar_agente', 'forzar_sales_v3', 'forzar_recompra',
  'vip', 'pago_anticipado',
  'WPP', 'P/W', 'RECO'  -- skip-tags actuales del webhook-handler.ts:91 (referencia)
)
GROUP BY t.name, t.workspace_id
ORDER BY contacts_with_tag DESC;

-- Query 3: distribucion actual de pedidos activos por stage_name (baseline para parity)
-- NOTA: el schema usa pipeline_stages.name (no hay columna stage_kind). El admin clasificara
-- manualmente cada nombre a un kind logico (preparation/transit/delivered) en el SNAPSHOT.
SELECT
  ps.name AS stage_name,
  p.name  AS pipeline_name,
  COUNT(*) AS active_orders
FROM orders o
JOIN pipeline_stages ps ON ps.id = o.stage_id
JOIN pipelines p        ON p.id  = ps.pipeline_id
WHERE o.archived_at IS NULL
  AND o.created_at > NOW() - INTERVAL '30 days'
GROUP BY ps.name, p.name
ORDER BY active_orders DESC;

-- Query 4: contactos is_client en Somnio workspace (D-15 parity reference)
-- Somnio workspace = a3843b3f-c337-4836-92b5-89c58bb98490
SELECT
  workspace_id,
  COUNT(*) AS total_contacts,
  SUM(CASE WHEN is_client THEN 1 ELSE 0 END) AS clients,
  SUM(CASE WHEN NOT is_client OR is_client IS NULL THEN 1 ELSE 0 END) AS prospects
FROM contacts
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
GROUP BY workspace_id;

-- Query 5: ultimos 30 dias de mensajes inbound de Somnio (input para dry-run Plan 07)
-- NOTA: la tabla es `messages` (whatsapp_conversations migration), no whatsapp_messages.
SELECT
  DATE_TRUNC('day', m.created_at AT TIME ZONE 'America/Bogota') AS day,
  COUNT(*) AS inbound_messages,
  COUNT(DISTINCT m.conversation_id) AS distinct_conversations
FROM messages m
WHERE m.workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND m.direction = 'inbound'
  AND m.created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', m.created_at AT TIME ZONE 'America/Bogota')
ORDER BY day DESC;
