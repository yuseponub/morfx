-- Insert pendiente_promo and pendiente_confirmacion templates for somnio-v3 agent
-- These are sent when timer L3/L4 creates an order without promo selection / confirmation

INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'pendiente_promo', 'primera_vez', 0, 'texto', 'Quedamos pendientes a la promoción que desees para poder despachar tu orden🤗', 0),
('somnio-sales-v1', 'pendiente_promo', 'siguientes', 0, 'texto', 'Quedamos pendientes a la promoción que desees para poder despachar tu orden🤗', 0),
('somnio-sales-v1', 'pendiente_confirmacion', 'primera_vez', 0, 'texto', 'Quedamos pendientes a la confirmación de tu compra para poder despachar tu orden🤗', 0),
('somnio-sales-v1', 'pendiente_confirmacion', 'siguientes', 0, 'texto', 'Quedamos pendientes a la confirmación de tu compra para poder despachar tu orden🤗', 0);
