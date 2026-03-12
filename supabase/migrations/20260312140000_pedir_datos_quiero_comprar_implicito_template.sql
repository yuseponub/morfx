-- Template: pedir_datos_quiero_comprar_implicito
-- When client sends data spontaneously in initial phase (implicit purchase intent),
-- bot acknowledges and asks for remaining fields only.

INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'pedir_datos_quiero_comprar_implicito', 'primera_vez', 0, 'texto', E'Por supuesto, para poder despachar tu pedido nos haría falta:\n\n{{campos_faltantes}}', 0),
('somnio-sales-v1', 'pedir_datos_quiero_comprar_implicito', 'siguientes', 0, 'texto', E'Por supuesto, para poder despachar tu pedido nos haría falta:\n\n{{campos_faltantes}}', 0);
