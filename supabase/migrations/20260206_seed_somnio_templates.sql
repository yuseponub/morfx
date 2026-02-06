-- ============================================================================
-- Seed Somnio Agent Templates
-- Phase 15: Agent Sandbox - Templates reales de Carolina/Somnio
--
-- Datos extraidos de: plantillas/mensajes.json del agente n8n
-- ============================================================================

-- Limpiar templates existentes de somnio (si los hay)
DELETE FROM agent_templates WHERE agent_id = 'somnio-sales-v1';

-- ============================================================================
-- Intent: hola (saludo simple)
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola', 'primera_vez', 1, 'texto', '¿Deseas adquirir tu ELIXIR DEL SUEÑO?', 3);

-- ============================================================================
-- Intent: precio
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'precio', 'primera_vez', 0, 'texto', 'Nuestro ELIXIR DEL SUEÑO tiene un valor de $77,900 con envio gratis, este contiene 90 comprimidos de melatonina y magnesio. Tambien manejamos promociones extra si compras el combo 2X o 3X🤗', 3),
('somnio-sales-v1', 'precio', 'primera_vez', 1, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
('somnio-sales-v1', 'precio', 'primera_vez', 2, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3),
('somnio-sales-v1', 'precio', 'siguientes', 0, 'texto', 'Nuestro ELIXIR DEL SUEÑO tiene un valor de $77,900 con envio gratis, este contiene 90 comprimidos de melatonina y magnesio. Tambien manejamos promociones extra si compras el combo 2X o 3X🤗', 3),
('somnio-sales-v1', 'precio', 'siguientes', 1, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);

-- ============================================================================
-- Intent: hola+precio
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola+precio', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+precio', 'primera_vez', 1, 'texto', 'Nuestro ELIXIR DEL SUEÑO tiene un valor de $77,900 con envio gratis, este contiene 90 comprimidos de melatonina y magnesio. Tambien manejamos promociones extra si compras el combo 2X o 3X🤗', 3),
('somnio-sales-v1', 'hola+precio', 'primera_vez', 2, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
('somnio-sales-v1', 'hola+precio', 'primera_vez', 3, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3),
('somnio-sales-v1', 'hola+precio', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+precio', 'siguientes', 1, 'texto', 'Nuestro ELIXIR DEL SUEÑO tiene un valor de $77,900 con envio gratis, este contiene 90 comprimidos de melatonina y magnesio. Tambien manejamos promociones extra si compras el combo 2X o 3X🤗', 3),
('somnio-sales-v1', 'hola+precio', 'siguientes', 2, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);

-- ============================================================================
-- Intent: contenido_envase
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'contenido_envase', 'primera_vez', 0, 'texto', 'Nuestro ELIXIR DEL SUEÑO contiene 90 comprimidos de melatonina y magnesio para relajarte y ayudarte a conciliar el sueño 😴', 0),
('somnio-sales-v1', 'contenido_envase', 'primera_vez', 1, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
('somnio-sales-v1', 'contenido_envase', 'siguientes', 0, 'texto', 'Nuestro ELIXIR DEL SUEÑO contiene 90 comprimidos de melatonina y magnesio para relajarte y ayudarte a conciliar el sueño 😴', 0);

-- ============================================================================
-- Intent: hola+contenido_envase
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola+contenido_envase', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+contenido_envase', 'primera_vez', 1, 'texto', 'Nuestro ELIXIR DEL SUEÑO contiene 90 comprimidos de melatonina y magnesio para relajarte y ayudarte a conciliar el sueño 😴', 0),
('somnio-sales-v1', 'hola+contenido_envase', 'primera_vez', 2, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
('somnio-sales-v1', 'hola+contenido_envase', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+contenido_envase', 'siguientes', 1, 'texto', 'Nuestro ELIXIR DEL SUEÑO contiene 90 comprimidos de melatonina y magnesio para relajarte y ayudarte a conciliar el sueño 😴', 0);

-- ============================================================================
-- Intent: como_se_toma
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'como_se_toma', 'primera_vez', 0, 'texto', 'Debes consumir 1 comprimido 30min antes de dormir, todos los dias.', 0),
('somnio-sales-v1', 'como_se_toma', 'primera_vez', 1, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
('somnio-sales-v1', 'como_se_toma', 'primera_vez', 2, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4),
('somnio-sales-v1', 'como_se_toma', 'siguientes', 0, 'texto', 'Debes consumir 1 comprimido 30min antes de dormir, todos los dias.', 0),
('somnio-sales-v1', 'como_se_toma', 'siguientes', 1, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);

-- ============================================================================
-- Intent: hola+como_se_toma
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola+como_se_toma', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+como_se_toma', 'primera_vez', 1, 'texto', 'Debes consumir 1 comprimido 30min antes de dormir, todos los dias.', 0),
('somnio-sales-v1', 'hola+como_se_toma', 'primera_vez', 2, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
('somnio-sales-v1', 'hola+como_se_toma', 'primera_vez', 3, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4),
('somnio-sales-v1', 'hola+como_se_toma', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+como_se_toma', 'siguientes', 1, 'texto', 'Debes consumir 1 comprimido 30min antes de dormir, todos los dias.', 0),
('somnio-sales-v1', 'hola+como_se_toma', 'siguientes', 2, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);

-- ============================================================================
-- Intent: modopago
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'modopago', 'primera_vez', 0, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3),
('somnio-sales-v1', 'modopago', 'siguientes', 0, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3);

-- ============================================================================
-- Intent: hola+modopago
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola+modopago', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+modopago', 'primera_vez', 1, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3),
('somnio-sales-v1', 'hola+modopago', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+modopago', 'siguientes', 1, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3);

-- ============================================================================
-- Intent: metodos_de_pago
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'metodos_de_pago', 'primera_vez', 0, 'texto', 'Como metodos de pago manejamos:

- Pago contra-entrega (Pagas al recibir en efectivo).
- Transferencias (Bancolombia, Nequi y Daviplata).
- Tarjeta debito/credito (link de pago).', 0),
('somnio-sales-v1', 'metodos_de_pago', 'siguientes', 0, 'texto', 'Como metodos de pago manejamos:

- Pago contra-entrega (Pagas al recibir en efectivo).
- Transferencias (Bancolombia, Nequi y Daviplata).
- Tarjeta debito/credito (link de pago).', 0);

-- ============================================================================
-- Intent: modopago2
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'modopago2', 'primera_vez', 0, 'texto', 'Claro que sí! El producto lo pagas al recibirlo cuando te llegue💴', 0),
('somnio-sales-v1', 'modopago2', 'siguientes', 0, 'texto', 'Claro que sí! El producto lo pagas al recibirlo cuando te llegue💴', 0);

-- ============================================================================
-- Intent: envio
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'envio', 'primera_vez', 0, 'texto', 'Hacemos envíos a toda Colombia 🚚 (gratis).', 0),
('somnio-sales-v1', 'envio', 'primera_vez', 1, 'texto', 'Usamos Coordinadora, Envia, Interrapidísimo o domiciliarios propios según tu ciudad.', 3),
('somnio-sales-v1', 'envio', 'siguientes', 0, 'texto', 'Hacemos envíos a toda Colombia 🚚 (gratis).', 0);

-- ============================================================================
-- Intent: hola+envio
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola+envio', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+envio', 'primera_vez', 1, 'texto', 'Hacemos envíos a toda Colombia 🚚 (gratis).', 0),
('somnio-sales-v1', 'hola+envio', 'primera_vez', 2, 'texto', 'Usamos Coordinadora, Envia, Interrapidísimo o domiciliarios propios según tu ciudad.', 3),
('somnio-sales-v1', 'hola+envio', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+envio', 'siguientes', 1, 'texto', 'Hacemos envíos a toda Colombia 🚚 (gratis).', 0);

-- ============================================================================
-- Intent: invima
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'invima', 'primera_vez', 0, 'texto', 'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0),
('somnio-sales-v1', 'invima', 'siguientes', 0, 'texto', 'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0);

-- ============================================================================
-- Intent: hola+invima
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola+invima', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+invima', 'primera_vez', 1, 'texto', 'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0),
('somnio-sales-v1', 'hola+invima', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+invima', 'siguientes', 1, 'texto', 'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0);

-- ============================================================================
-- Intent: ubicacion
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'ubicacion', 'primera_vez', 0, 'texto', 'Tenemos centros de distribución en las principales ciudades del país, sin embargo nuestro punto principal esta ubicado en la ciudad de Bucaramanga, Santander. (Manejamos envios contraentrega a nivel nacional)', 0),
('somnio-sales-v1', 'ubicacion', 'primera_vez', 1, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3),
('somnio-sales-v1', 'ubicacion', 'siguientes', 0, 'texto', 'Tenemos centros de distribución en las principales ciudades del país, sin embargo nuestro punto principal esta ubicado en la ciudad de Bucaramanga, Santander. (Manejamos envios contraentrega a nivel nacional)', 0);

-- ============================================================================
-- Intent: hola+ubicacion
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola+ubicacion', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+ubicacion', 'primera_vez', 1, 'texto', 'Tenemos centros de distribución en las principales ciudades del país, sin embargo nuestro punto principal esta ubicado en la ciudad de Bucaramanga, Santander. (Manejamos envios contraentrega a nivel nacional)', 0),
('somnio-sales-v1', 'hola+ubicacion', 'primera_vez', 2, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3),
('somnio-sales-v1', 'hola+ubicacion', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+ubicacion', 'siguientes', 1, 'texto', 'Tenemos centros de distribución en las principales ciudades del país, sin embargo nuestro punto principal esta ubicado en la ciudad de Bucaramanga, Santander. (Manejamos envios contraentrega a nivel nacional)', 0);

-- ============================================================================
-- Intent: contraindicaciones
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'contraindicaciones', 'primera_vez', 0, 'texto', 'La melatonina y el citrato de magnesio son compuestos seguros y bien tolerados.', 0),
('somnio-sales-v1', 'contraindicaciones', 'primera_vez', 1, 'texto', 'Si tomas anticoagulantes, consulta con tu médico antes de usarlo.', 4),
('somnio-sales-v1', 'contraindicaciones', 'siguientes', 0, 'texto', 'La melatonina y el citrato de magnesio son compuestos seguros y bien tolerados.', 0);

-- ============================================================================
-- Intent: hola+contraindicaciones
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola+contraindicaciones', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+contraindicaciones', 'primera_vez', 1, 'texto', 'La melatonina y el citrato de magnesio son compuestos seguros y bien tolerados.', 0),
('somnio-sales-v1', 'hola+contraindicaciones', 'primera_vez', 2, 'texto', 'Si tomas anticoagulantes, consulta con tu médico antes de usarlo.', 4),
('somnio-sales-v1', 'hola+contraindicaciones', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+contraindicaciones', 'siguientes', 1, 'texto', 'La melatonina y el citrato de magnesio son compuestos seguros y bien tolerados.', 0);

-- ============================================================================
-- Intent: sisirve
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'sisirve', 'primera_vez', 0, 'texto', 'Claro que sí! El tiempo en el que el suplemento empezará a hacer efecto depende de la severidad de tu insomnio', 0),
('somnio-sales-v1', 'sisirve', 'primera_vez', 1, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
('somnio-sales-v1', 'sisirve', 'primera_vez', 2, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4),
('somnio-sales-v1', 'sisirve', 'siguientes', 0, 'texto', 'Claro que sí! El tiempo en el que el suplemento empezará a hacer efecto depende de la severidad de tu insomnio', 0),
('somnio-sales-v1', 'sisirve', 'siguientes', 1, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);

-- ============================================================================
-- Intent: hola+sisirve
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'hola+sisirve', 'primera_vez', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+sisirve', 'primera_vez', 1, 'texto', 'Claro que sí! El tiempo en el que el suplemento empezará a hacer efecto depende de la severidad de tu insomnio', 0),
('somnio-sales-v1', 'hola+sisirve', 'primera_vez', 2, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
('somnio-sales-v1', 'hola+sisirve', 'primera_vez', 3, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4),
('somnio-sales-v1', 'hola+sisirve', 'siguientes', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
('somnio-sales-v1', 'hola+sisirve', 'siguientes', 1, 'texto', 'Claro que sí! El tiempo en el que el suplemento empezará a hacer efecto depende de la severidad de tu insomnio', 0),
('somnio-sales-v1', 'hola+sisirve', 'siguientes', 2, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);

-- ============================================================================
-- Intent: info_promociones
-- ============================================================================
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
('somnio-sales-v1', 'info_promociones', 'siguientes', 2, 'texto', '¿Te gustaría adquirir alguno de estos paquetes?', 4);

-- ============================================================================
-- Intent: hola+info_promociones
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
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

-- ============================================================================
-- Intent: captura_datos_si_compra
-- ============================================================================
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
Correo electrónico:', 3);

-- ============================================================================
-- Intent: hola+captura_datos_si_compra
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
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

-- ============================================================================
-- Intent: ofrecer_promos (cuando datos completos)
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'ofrecer_promos', 'primera_vez', 0, 'texto', 'Estas son las promociones que manejamos, ¿Cuál deseas adquirir?😊

• 1×: $77,900 (envío gratis)
• 2×: $109,900 (ahorras $45,900)
• 3×: $139,900 (ahorras $93,800)', 0),
('somnio-sales-v1', 'ofrecer_promos', 'siguientes', 0, 'texto', 'Estas son las promociones que manejamos, ¿Cuál deseas adquirir?😊

• 1×: $77,900 (envío gratis)
• 2×: $109,900 (ahorras $45,900)
• 3×: $139,900 (ahorras $93,800)', 0);

-- ============================================================================
-- Intent: resumen_1x
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'resumen_1x', 'primera_vez', 0, 'texto', 'Pedido recibido✅ 1X ELIXIR DEL SUEÑO por un valor de $77,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_1x', 'primera_vez', 1, 'texto', 'Deseas confirmar tu compra?', 3),
('somnio-sales-v1', 'resumen_1x', 'siguientes', 0, 'texto', 'Pedido recibido✅ 1X ELIXIR DEL SUEÑO por un valor de $77,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_1x', 'siguientes', 1, 'texto', 'Deseas confirmar tu compra?', 3);

-- ============================================================================
-- Intent: resumen_2x
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'resumen_2x', 'primera_vez', 0, 'texto', 'Pedido recibido✅ 2X ELIXIR DEL SUEÑO por un valor de $109,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_2x', 'primera_vez', 1, 'texto', 'Deseas confirmar tu compra?', 3),
('somnio-sales-v1', 'resumen_2x', 'siguientes', 0, 'texto', 'Pedido recibido✅ 2X ELIXIR DEL SUEÑO por un valor de $109,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_2x', 'siguientes', 1, 'texto', 'Deseas confirmar tu compra?', 3);

-- ============================================================================
-- Intent: resumen_3x
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'resumen_3x', 'primera_vez', 0, 'texto', 'Pedido recibido✅ 3X ELIXIR DEL SUEÑO por un valor de $139,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_3x', 'primera_vez', 1, 'texto', 'Deseas confirmar tu compra?', 3),
('somnio-sales-v1', 'resumen_3x', 'siguientes', 0, 'texto', 'Pedido recibido✅ 3X ELIXIR DEL SUEÑO por un valor de $139,900 envío gratis.', 0),
('somnio-sales-v1', 'resumen_3x', 'siguientes', 1, 'texto', 'Deseas confirmar tu compra?', 3);

-- ============================================================================
-- Intent: compra_confirmada
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'compra_confirmada', 'primera_vez', 0, 'texto', 'Perfecto! Despacharemos tu pedido lo antes posible✅ Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto', 0),
('somnio-sales-v1', 'compra_confirmada', 'primera_vez', 1, 'texto', 'Recuerda tener el efectivo listo el día que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejárselo a alguien para que lo reciba✅💴', 3),
('somnio-sales-v1', 'compra_confirmada', 'siguientes', 0, 'texto', 'Perfecto! Despacharemos tu pedido lo antes posible✅ Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto', 0),
('somnio-sales-v1', 'compra_confirmada', 'siguientes', 1, 'texto', 'Recuerda tener el efectivo listo el día que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejárselo a alguien para que lo reciba✅💴', 3);

-- ============================================================================
-- Intent: no_confirmado
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'no_confirmado', 'primera_vez', 0, 'texto', 'Entiendo. ¿Deseas que te comparta nuevamente las **promociones** o prefieres que **te contacte un asesor humano** para resolver tus dudas? 🙌', 0),
('somnio-sales-v1', 'no_confirmado', 'siguientes', 0, 'texto', 'Entiendo. ¿Deseas que te comparta nuevamente las **promociones** o prefieres que **te contacte un asesor humano** para resolver tus dudas? 🙌', 0);

-- ============================================================================
-- Intent: no_interesa
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'no_interesa', 'primera_vez', 0, 'texto', 'Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio😴', 0),
('somnio-sales-v1', 'no_interesa', 'siguientes', 0, 'texto', 'Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio😴', 0);

-- ============================================================================
-- Intent: fallback
-- ============================================================================
INSERT INTO agent_templates (agent_id, intent, visit_type, orden, content_type, content, delay_s) VALUES
('somnio-sales-v1', 'fallback', 'primera_vez', 0, 'texto', 'Regálame 1 minuto por favor', 0),
('somnio-sales-v1', 'fallback', 'siguientes', 0, 'texto', 'Regálame 1 minuto por favor', 0);

-- ============================================================================
-- Verificación
-- ============================================================================
-- SELECT intent, visit_type, COUNT(*) as templates FROM agent_templates WHERE agent_id = 'somnio-sales-v1' GROUP BY intent, visit_type ORDER BY intent;
