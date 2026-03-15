-- Migration: Independent v3 templates for somnio-sales-v3
-- Purpose: Create dedicated templates so v3 agent no longer falls back to v1
-- Idempotent: only inserts if no templates exist for somnio-sales-v3

DO $$
BEGIN
  -- Only insert if v3 has no templates yet
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates WHERE agent_id = 'somnio-sales-v3' LIMIT 1
  ) THEN

    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      -- ask_ofi_inter (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'ask_ofi_inter', 'primera_vez', 'CORE', 0, 'texto', '¿Deseas recibirlo en tu domicilio o prefieres recogerlo en oficina de Interrapidísimo?', 0),

      -- pedir_datos (was captura_datos_si_compra) (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'pedir_datos', 'primera_vez', 'CORE', 0, 'texto', 'Por supuesto! Solo tienes que regalarnos los siguientes datos:', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'pedir_datos', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', E'Nombre:\nApellido:\nTeléfono:\nDirección completa:\nBarrio:\nDepartamento:\nCiudad:\nCorreo electrónico:', 3),

      -- como_se_toma (3 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'como_se_toma', 'primera_vez', 'CORE', 0, 'texto', 'Debes consumir 1 comprimido 30min antes de dormir, todos los dias.', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'como_se_toma', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'como_se_toma', 'primera_vez', 'OPCIONAL', 2, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4),

      -- confirmacion_orden (was compra_confirmada) (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'confirmacion_orden', 'primera_vez', 'CORE', 0, 'texto', 'Perfecto! Despacharemos tu pedido lo antes posible✅ Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'confirmacion_orden', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Recuerda tener el efectivo listo el día que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejárselo a alguien para que lo reciba✅💴', 3),

      -- confirmar_cambio_ofi_inter (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'confirmar_cambio_ofi_inter', 'primera_vez', 'CORE', 0, 'texto', E'Entendido, cambiamos a entrega en oficina de Interrapidísimo. Ya no necesitamos la dirección.\n\nNos haría falta:\n\n{{campos_faltantes}}', 0),

      -- confirmar_ofi_inter (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'confirmar_ofi_inter', 'primera_vez', 'CORE', 0, 'texto', E'¡Perfecto! Anotamos que lo recogerás en oficina de Interrapidísimo en {{ciudad}}\n\nPara completar tu pedido nos haría falta:\n\n{{campos_faltantes}}', 0),

      -- contenido (was contenido_envase) (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'contenido', 'primera_vez', 'CORE', 0, 'texto', 'Nuestro ELIXIR DEL SUEÑO contiene 90 comprimidos de melatonina y magnesio para relajarte y ayudarte a conciliar el sueño 😴', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'contenido', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),

      -- efectos (was contraindicaciones) (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'efectos', 'primera_vez', 'CORE', 0, 'texto', 'La melatonina y el citrato de magnesio son compuestos seguros y bien tolerados.', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'efectos', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Si tomas anticoagulantes, consulta con tu médico antes de usarlo.', 4),

      -- envio (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'envio', 'primera_vez', 'CORE', 0, 'texto', 'Hacemos envíos a toda Colombia 🚚 (gratis).', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'envio', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Usamos Coordinadora, Envia, Interrapidísimo o domiciliarios propios según tu ciudad.', 3),

      -- fallback (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'fallback', 'primera_vez', 'CORE', 0, 'texto', 'Regálame 1 minuto por favor', 0),

      -- saludo (was hola) (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'saludo', 'primera_vez', 'CORE', 0, 'texto', 'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'saludo', 'primera_vez', 'COMPLEMENTARIA', 1, 'imagen', 'https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|Deseas adquirir tu ELIXIR DEL SUENO?', 3),

      -- registro_sanitario (was invima) (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'registro_sanitario', 'primera_vez', 'CORE', 0, 'texto', 'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0),

      -- pago (was modopago) (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'pago', 'primera_vez', 'CORE', 0, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3),

      -- rechazar (was no_confirmado) (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'rechazar', 'primera_vez', 'CORE', 0, 'texto', 'Entiendo. ¿Deseas que te comparta nuevamente las **promociones** o prefieres que **te contacte un asesor humano** para resolver tus dudas? 🙌', 0),

      -- no_interesa (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'no_interesa', 'primera_vez', 'CORE', 0, 'texto', 'Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio😴', 0),

      -- promociones (was ofrecer_promos — informational intent) (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'promociones', 'primera_vez', 'CORE', 0, 'texto', E'Estas son las promociones que manejamos, ¿Cuál deseas adquirir?😊\n\n• 1×: $77,900 (envío gratis)\n• 2×: $109,900 (ahorras $45,900)\n• 3×: $139,900 (ahorras $93,800)', 0),

      -- pedir_datos_quiero_comprar_implicito (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'pedir_datos_quiero_comprar_implicito', 'primera_vez', 'CORE', 0, 'texto', E'Por supuesto, para poder despachar tu pedido nos haría falta:\n\n{{campos_faltantes}}', 0),

      -- pendiente_confirmacion (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'pendiente_confirmacion', 'primera_vez', 'CORE', 0, 'texto', 'Quedamos pendientes a la confirmación de tu compra para poder despachar tu orden🤗', 0),

      -- pendiente_promo (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'pendiente_promo', 'primera_vez', 'CORE', 0, 'texto', 'Quedamos pendientes a la promoción que desees para poder despachar tu orden🤗', 0),

      -- precio (3 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'precio', 'primera_vez', 'CORE', 0, 'texto', 'Nuestro ELIXIR DEL SUEÑO tiene un valor de $77,900 con envio gratis, este contiene 90 comprimidos de melatonina y magnesio. Tambien manejamos promociones extra si compras el combo 2X o 3X🤗', 3),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'precio', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'precio', 'primera_vez', 'OPCIONAL', 2, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3),

      -- resumen_1x (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'resumen_1x', 'primera_vez', 'CORE', 0, 'texto', 'Pedido recibido✅ 1X ELIXIR DEL SUEÑO por un valor de $77,900 envío gratis.', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'resumen_1x', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Deseas confirmar tu compra?', 3),

      -- resumen_2x (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'resumen_2x', 'primera_vez', 'CORE', 0, 'texto', 'Pedido recibido✅ 2X ELIXIR DEL SUEÑO por un valor de $109,900 envío gratis.', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'resumen_2x', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Deseas confirmar tu compra?', 3),

      -- resumen_3x (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'resumen_3x', 'primera_vez', 'CORE', 0, 'texto', 'Pedido recibido✅ 3X ELIXIR DEL SUEÑO por un valor de $139,900 envío gratis.', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'resumen_3x', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Deseas confirmar tu compra?', 3),

      -- retoma_datos (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'retoma_datos', 'primera_vez', 'CORE', 0, 'texto', 'Quedamos pendientes a tus datos, o si tienes alguna pregunta acerca del producto no dudes en hacerla', 0),

      -- retoma_datos_implicito (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'retoma_datos_implicito', 'primera_vez', 'CORE', 0, 'texto', 'Quedamos pendientes al resto de tus datos, o si tienes alguna pregunta acerca del producto no dudes en hacerla', 0),

      -- retoma_datos_parciales (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'retoma_datos_parciales', 'primera_vez', 'CORE', 0, 'texto', E'Para poder despachar tu producto nos faltaria:\n{{campos_faltantes}}\nQuedamos pendientes', 0),

      -- retoma_inicial (1 row)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'retoma_inicial', 'primera_vez', 'CORE', 0, 'texto', 'Deseas adquirir el tuyo?', 0),

      -- efectividad (was sisirve) (3 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'efectividad', 'primera_vez', 'CORE', 0, 'texto', 'Claro que sí! El tiempo en el que el suplemento empezará a hacer efecto depende de la severidad de tu insomnio', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'efectividad', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'efectividad', 'primera_vez', 'OPCIONAL', 2, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4),

      -- ubicacion (2 rows)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'ubicacion', 'primera_vez', 'CORE', 0, 'texto', 'Tenemos centros de distribución en las principales ciudades del país, sin embargo nuestro punto principal esta ubicado en la ciudad de Bucaramanga, Santander. (Manejamos envios contraentrega a nivel nacional)', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'ubicacion', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3);

    RAISE NOTICE 'Inserted v3 templates for somnio-sales-v3';
  ELSE
    RAISE NOTICE 'Templates for somnio-sales-v3 already exist, skipping';
  END IF;
END $$;
