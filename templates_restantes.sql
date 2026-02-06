-- Parte 7 - info_promociones
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'info_promociones', 'primera_vez', 0, 'texto', 'Estas son las promociones que manejamos 😊', 0),
('somnio-sales-v1', 'info_promociones', 'primera_vez', 1, 'texto', '• 1×: $77,900 (envío gratis)
• 2×: $109,900 (ahorras $45,900)
• 3×: $139,900 (ahorras $93,800)', 3),
('somnio-sales-v1', 'info_promociones', 'primera_vez', 2, 'texto', '¿Te gustaría adquirir alguno de estos paquetes?', 4),
('somnio-sales-v1', 'info_promociones', 'siguientes', 0, 'texto', 'Estas son las promociones que manejamos 😊', 0),
('somnio-sales-v1', 'info_promociones', 'siguientes', 1, 'texto', '• 1×: $77,900 (envío gratis)
• 2×: $109,900 (ahorras $45,900)
• 3×: $139,900 (ahorras $93,800)', 3),
('somnio-sales-v1', 'info_promociones', 'siguientes', 2, 'texto', '¿Te gustaría adquirir alguno de estos paquetes?', 4),
('somnio-sales-v1', 'hola+info_promociones', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+info_promociones', 'primera_vez', 1, 'texto', 'Estas son las promociones que manejamos 😊', 0),
('somnio-sales-v1', 'hola+info_promociones', 'primera_vez', 2, 'texto', '• 1×: $77,900 (envío gratis)
• 2×: $109,900 (ahorras $45,900)
• 3×: $139,900 (ahorras $93,800)', 3),
('somnio-sales-v1', 'hola+info_promociones', 'primera_vez', 3, 'texto', '¿Te gustaría adquirir alguno de estos paquetes?', 4),
('somnio-sales-v1', 'hola+info_promociones', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+info_promociones', 'siguientes', 1, 'texto', 'Estas son las promociones que manejamos 😊', 0),
('somnio-sales-v1', 'hola+info_promociones', 'siguientes', 2, 'texto', '• 1×: $77,900 (envío gratis)
• 2×: $109,900 (ahorras $45,900)
• 3×: $139,900 (ahorras $93,800)', 3),
('somnio-sales-v1', 'hola+info_promociones', 'siguientes', 3, 'texto', '¿Te gustaría adquirir alguno de estos paquetes?', 4);

-- Parte 8 - captura_datos
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'captura_datos_si_compra', 'primera_vez', 0, 'texto', 'Por supuesto! Solo tienes que regalarnos los siguientes datos:', 0),
('somnio-sales-v1', 'captura_datos_si_compra', 'primera_vez', 1, 'texto', 'Nombre:
Apellido:
Teléfono:
Dirección completa:
Barrio:
Departamento:
Ciudad:
Correo electrónico:', 3),
('somnio-sales-v1', 'captura_datos_si_compra', 'siguientes', 0, 'texto', 'Por supuesto! Solo tienes que regalarnos los siguientes datos:', 0),
('somnio-sales-v1', 'captura_datos_si_compra', 'siguientes', 1, 'texto', 'Nombre:
Apellido:
Teléfono:
Dirección completa:
Barrio:
Departamento:
Ciudad:
Correo electrónico:', 3),
('somnio-sales-v1', 'hola+captura_datos_si_compra', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+captura_datos_si_compra', 'primera_vez', 1, 'texto', 'Por supuesto! Solo tienes que regalarnos los siguientes datos:', 0),
('somnio-sales-v1', 'hola+captura_datos_si_compra', 'primera_vez', 2, 'texto', 'Nombre:
Apellido:
Teléfono:
Dirección completa:
Barrio:
Departamento:
Ciudad:
Correo electrónico:', 3),
('somnio-sales-v1', 'hola+captura_datos_si_compra', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+captura_datos_si_compra', 'siguientes', 1, 'texto', 'Por supuesto! Solo tienes que regalarnos los siguientes datos:', 0),
('somnio-sales-v1', 'hola+captura_datos_si_compra', 'siguientes', 2, 'texto', 'Nombre:
Apellido:
Teléfono:
Dirección completa:
Barrio:
Departamento:
Ciudad:
Correo electrónico:', 3);

-- Parte 9 - ofrecer_promos y resumen
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'ofrecer_promos', 'primera_vez', 0, 'texto', 'Estas son las promociones que manejamos, ¿Cuál deseas adquirir?😊

• 1×: $77,900 (envío gratis)
• 2×: $109,900 (ahorras $45,900)
• 3×: $139,900 (ahorras $93,800)', 0),
('somnio-sales-v1', 'ofrecer_promos', 'siguientes', 0, 'texto', 'Estas son las promociones que manejamos, ¿Cuál deseas adquirir?😊

• 1×: $77,900 (envío gratis)
• 2×: $109,900 (ahorras $45,900)
• 3×: $139,900 (ahorras $93,800)', 0),
('somnio-sales-v1', 'resumen_1x', 'primera_vez', 0, 'texto', 'Pedido recibido✅ 1X ELIXIR DEL SUEÑO por un valor de $77,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_1x', 'primera_vez', 1, 'texto', 'Deseas confirmar tu compra?', 3),
('somnio-sales-v1', 'resumen_1x', 'siguientes', 0, 'texto', 'Pedido recibido✅ 1X ELIXIR DEL SUEÑO por un valor de $77,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_1x', 'siguientes', 1, 'texto', 'Deseas confirmar tu compra?', 3),
('somnio-sales-v1', 'resumen_2x', 'primera_vez', 0, 'texto', 'Pedido recibido✅ 2X ELIXIR DEL SUEÑO por un valor de $109,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_2x', 'primera_vez', 1, 'texto', 'Deseas confirmar tu compra?', 3),
('somnio-sales-v1', 'resumen_2x', 'siguientes', 0, 'texto', 'Pedido recibido✅ 2X ELIXIR DEL SUEÑO por un valor de $109,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_2x', 'siguientes', 1, 'texto', 'Deseas confirmar tu compra?', 3),
('somnio-sales-v1', 'resumen_3x', 'primera_vez', 0, 'texto', 'Pedido recibido✅ 3X ELIXIR DEL SUEÑO por un valor de $139,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_3x', 'primera_vez', 1, 'texto', 'Deseas confirmar tu compra?', 3),
('somnio-sales-v1', 'resumen_3x', 'siguientes', 0, 'texto', 'Pedido recibido✅ 3X ELIXIR DEL SUEÑO por un valor de $139,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_3x', 'siguientes', 1, 'texto', 'Deseas confirmar tu compra?', 3);

-- Parte 10 - confirmacion y escape
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'compra_confirmada', 'primera_vez', 0, 'texto', 'Perfecto! Despacharemos tu pedido lo antes posible✅ Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto', 0),
('somnio-sales-v1', 'compra_confirmada', 'primera_vez', 1, 'texto', 'Recuerda tener el efectivo listo el día que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejárselo a alguien para que lo reciba✅💴', 3),
('somnio-sales-v1', 'compra_confirmada', 'siguientes', 0, 'texto', 'Perfecto! Despacharemos tu pedido lo antes posible✅ Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto', 0),
('somnio-sales-v1', 'compra_confirmada', 'siguientes', 1, 'texto', 'Recuerda tener el efectivo listo el día que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejárselo a alguien para que lo reciba✅💴', 3),
('somnio-sales-v1', 'no_confirmado', 'primera_vez', 0, 'texto', 'Entiendo. ¿Deseas que te comparta nuevamente las promociones o prefieres que te contacte un asesor humano para resolver tus dudas? 🙌', 0),
('somnio-sales-v1', 'no_confirmado', 'siguientes', 0, 'texto', 'Entiendo. ¿Deseas que te comparta nuevamente las promociones o prefieres que te contacte un asesor humano para resolver tus dudas? 🙌', 0),
('somnio-sales-v1', 'no_interesa', 'primera_vez', 0, 'texto', 'Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio😴', 0),
('somnio-sales-v1', 'no_interesa', 'siguientes', 0, 'texto', 'Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio😴', 0),
('somnio-sales-v1', 'fallback', 'primera_vez', 0, 'texto', 'Regálame 1 minuto por favor', 0),
('somnio-sales-v1', 'fallback', 'siguientes', 0, 'texto', 'Regálame 1 minuto por favor', 0);
