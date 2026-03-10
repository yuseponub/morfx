-- Templates: retoma_datos (L0) and retoma_datos_parciales (L1) for capturing_data timer re-engagement

-- retoma_datos: L0 timer expired, no data captured yet
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'retoma_datos', 'primera_vez', 0, 'texto', 'Quedamos pendientes a tus datos, o si tienes alguna pregunta acerca del producto no dudes en hacerla', 0),
('somnio-sales-v1', 'retoma_datos', 'siguientes', 0, 'texto', 'Quedamos pendientes a tus datos, o si tienes alguna pregunta acerca del producto no dudes en hacerla', 0);

-- retoma_datos_parciales: L1 timer expired, partial data captured
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'retoma_datos_parciales', 'primera_vez', 0, 'texto', E'Para poder despachar tu producto nos faltaria:\n{{campos_faltantes}}\nQuedamos pendientes', 0),
('somnio-sales-v1', 'retoma_datos_parciales', 'siguientes', 0, 'texto', E'Para poder despachar tu producto nos faltaria:\n{{campos_faltantes}}\nQuedamos pendientes', 0);
