-- ============================================================================
-- Audit production for agent-godentist-fb-ig (Wave 0 / Plan 01)
-- ============================================================================
-- Workspace target: GoDentist Valoraciones (f0241182-f79b-4bc6-b0ed-b5f6eb20c514)
-- Source agent_id: 'godentist' (intact, not modified)
-- Target agent_id: 'godentist-fb-ig' (new sibling)
-- Read-only. Safe to run multiple times.

-- ----------------------------------------------------------------------------
-- Query (A) — Inventario completo de templates godentist (catalog global)
-- Esperado: ~75 rows con catalog completo. Si <50 → BLOCKER (catalog incompleto).
-- Open Q2 resolution: si todos los content_type son 'texto' → FB/IG safe.
-- Si hay 'imagen' o 'video' con URL hardcoded WhatsApp-only → documentar como
-- anomalia menor (D-08 dice ALL templates clonados verbatim; FB/IG soporta media).
-- ----------------------------------------------------------------------------
SELECT
  intent,
  visit_type,
  priority,
  orden,
  content_type,
  LEFT(content, 200) AS content_preview,
  delay_s,
  workspace_id
FROM agent_templates
WHERE agent_id = 'godentist'
  AND workspace_id IS NULL  -- Catalog global solamente
ORDER BY intent, priority, orden;

-- ----------------------------------------------------------------------------
-- Query (A-summary) — Conteo agregado por content_type (Open Q2 sanity)
-- ----------------------------------------------------------------------------
SELECT
  content_type,
  COUNT(*) AS row_count
FROM agent_templates
WHERE agent_id = 'godentist'
  AND workspace_id IS NULL
GROUP BY content_type
ORDER BY row_count DESC;

-- ----------------------------------------------------------------------------
-- Query (B) — Conversations FB/IG en workspace target (Pitfall 7 sanity check)
-- Esperado: rows con channel='facebook' o 'instagram'. Si todas tienen
-- channel=NULL → fact `channel` retornara null → reglas con 'in' no matchean →
-- sibling no recibira trafico. Pre-deploy check obligatorio.
-- ----------------------------------------------------------------------------
SELECT
  channel,
  COUNT(*) AS conversation_count,
  MAX(created_at) AS last_seen
FROM conversations
WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
GROUP BY channel
ORDER BY conversation_count DESC;

-- ----------------------------------------------------------------------------
-- Query (C) — Baseline agent_templates WHERE agent_id='godentist-fb-ig'
-- Esperado: 0 rows (sibling es greenfield). Si >0 → BLOCKER, limpiar antes
-- de Wave 5 Plan 07 (la migration tiene DELETE inicial idempotente, pero
-- registrar el estado pre-cleanup).
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
WHERE agent_id = 'godentist-fb-ig'
ORDER BY intent, orden;

-- ----------------------------------------------------------------------------
-- Query (D) — Priorities ocupados en routing_rules para workspace target
-- (D-15 priority collision pre-check, Pitfall 4)
-- Esperado: lista de priorities activos. Identificar gap libre para que
-- usuario use en routing rule manual del Plan 09.
-- ----------------------------------------------------------------------------
SELECT
  priority,
  name,
  enabled,
  rule_type,
  conditions,
  event
FROM routing_rules
WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
  AND enabled = true
ORDER BY priority;
