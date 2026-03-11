-- Insert pendiente_promo and pendiente_confirmacion templates for somnio-v3 agent
-- These are sent when timer L3/L4 creates an order without promo selection / confirmation

INSERT INTO agent_templates (workspace_id, agent_id, intent, content, content_type, priority, is_active, orden)
SELECT
  at.workspace_id,
  at.agent_id,
  'pendiente_promo',
  'Quedamos pendientes a la promoción que desees para poder despachar tu orden🤗',
  'texto',
  'CORE',
  true,
  0
FROM agent_templates at
WHERE at.intent = 'compra_confirmada'
GROUP BY at.workspace_id, at.agent_id
ON CONFLICT DO NOTHING;

INSERT INTO agent_templates (workspace_id, agent_id, intent, content, content_type, priority, is_active, orden)
SELECT
  at.workspace_id,
  at.agent_id,
  'pendiente_confirmacion',
  'Quedamos pendientes a la confirmación de tu compra para poder despachar tu orden🤗',
  'texto',
  'CORE',
  true,
  0
FROM agent_templates at
WHERE at.intent = 'compra_confirmada'
GROUP BY at.workspace_id, at.agent_id
ON CONFLICT DO NOTHING;
