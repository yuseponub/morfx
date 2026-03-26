-- Templates para somnio-recompra-v1
-- Basado en v3 pero simplificado:
-- - Sin contenido, formula, como_se_toma, efectividad (cliente ya conoce el producto)
-- - Sin ask_ofi_inter, confirmar_ofi_inter, confirmar_cambio_ofi_inter
-- - Sin pedir_datos, retoma_datos, retoma_datos_parciales, retoma_datos_implicito
-- - Sin pedir_datos_quiero_comprar_implicito
-- - Nuevo: preguntar_direccion_recompra
-- - Promos: SIN "Cual deseas adquirir?" (el cliente ya sabe)
-- - Saludo: personalizado con {{nombre_saludo}} en vez de "Hola Bienvenido"

-- Limpiar templates existentes (idempotente)
DELETE FROM agent_templates WHERE agent_id = 'somnio-recompra-v1';

INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  -- ============================================================
  -- NUEVO: preguntar_direccion_recompra
  -- Se usa cuando el cliente quiere pedir y necesitamos confirmar direccion
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'preguntar_direccion_recompra', 'primera_vez', 'CORE', 0, 'texto', E'{{nombre_saludo}} 😊\n\nClaro que si! Seria para la misma direccion?\n\n📍 {{direccion_completa}}', 0),

  -- ============================================================
  -- saludo (personalizado — sin "Bienvenido a Somnio")
  -- El greeting por hora ya va en {{nombre_saludo}}
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'saludo', 'primera_vez', 'CORE', 0, 'texto', '{{nombre_saludo}} 😊', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'saludo', 'primera_vez', 'COMPLEMENTARIA', 1, 'imagen', 'https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|Deseas adquirir tu ELIXIR DEL SUENO?', 3),

  -- ============================================================
  -- promociones (SIN "Cual deseas adquirir?" — el cliente ya sabe)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'promociones', 'primera_vez', 'CORE', 0, 'texto', E'Estas son las promociones que manejamos 😊\n\n• 1×: $77,900 (envio gratis)\n• 2×: $109,900 (ahorras $45,900)\n• 3×: $139,900 (ahorras $93,800)', 0),

  -- ============================================================
  -- pago (modo de pago)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'pago', 'primera_vez', 'CORE', 0, 'texto', 'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3),

  -- ============================================================
  -- envio
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'envio', 'primera_vez', 'CORE', 0, 'texto', 'Hacemos envios a toda Colombia 🚚 (gratis).', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'envio', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Usamos Coordinadora, Envia, Interrapidisimo o domiciliarios propios segun tu ciudad.', 3),

  -- ============================================================
  -- registro_sanitario
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'registro_sanitario', 'primera_vez', 'CORE', 0, 'texto', 'Contamos con produccion en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0),

  -- ============================================================
  -- contraindicaciones (efectos)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'efectos', 'primera_vez', 'CORE', 0, 'texto', 'La melatonina y el citrato de magnesio son compuestos seguros y bien tolerados.', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'efectos', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Si tomas anticoagulantes, consulta con tu medico antes de usarlo.', 4),

  -- ============================================================
  -- ubicacion
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'ubicacion', 'primera_vez', 'CORE', 0, 'texto', 'Tenemos centros de distribucion en las principales ciudades del pais, sin embargo nuestro punto principal esta ubicado en la ciudad de Bucaramanga, Santander. (Manejamos envios contraentrega a nivel nacional)', 0),

  -- ============================================================
  -- dependencia (no incluido en v3 original pero es intent informativo)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'dependencia', 'primera_vez', 'CORE', 0, 'texto', 'No genera dependencia. La melatonina es una hormona que tu cuerpo produce de forma natural. El suplemento solo ayuda a regularla.', 0),

  -- ============================================================
  -- resumen_1x, resumen_2x, resumen_3x (confirmacion de orden)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'resumen_1x', 'primera_vez', 'CORE', 0, 'texto', 'Pedido recibido✅ 1X ELIXIR DEL SUENO por un valor de $77,900 envio gratis.', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'resumen_1x', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Deseas confirmar tu compra?', 3),

  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'resumen_2x', 'primera_vez', 'CORE', 0, 'texto', 'Pedido recibido✅ 2X ELIXIR DEL SUENO por un valor de $109,900 envio gratis.', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'resumen_2x', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Deseas confirmar tu compra?', 3),

  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'resumen_3x', 'primera_vez', 'CORE', 0, 'texto', 'Pedido recibido✅ 3X ELIXIR DEL SUENO por un valor de $139,900 envio gratis.', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'resumen_3x', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Deseas confirmar tu compra?', 3),

  -- ============================================================
  -- confirmacion_orden (despues de confirmar compra)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'confirmacion_orden_transportadora', 'primera_vez', 'CORE', 0, 'texto', 'Perfecto! Despacharemos tu pedido lo antes posible✅ Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'confirmacion_orden_transportadora', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Recuerda tener el efectivo listo el dia que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejarselo a alguien para que lo reciba✅💴', 3),

  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'confirmacion_orden_same_day', 'primera_vez', 'CORE', 0, 'texto', 'Perfecto! Despacharemos tu pedido lo antes posible✅ Tu pedido llegara {{tiempo_estimado}}', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'confirmacion_orden_same_day', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Recuerda tener el efectivo listo para que puedas recibir tu compra✅💴', 3),

  -- ============================================================
  -- pendiente_promo (timer L3: no eligio promo)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'pendiente_promo', 'primera_vez', 'CORE', 0, 'texto', 'Quedamos pendientes a la promocion que desees para poder despachar tu orden🤗', 0),

  -- ============================================================
  -- pendiente_confirmacion (timer L4: no confirmo)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'pendiente_confirmacion', 'primera_vez', 'CORE', 0, 'texto', 'Quedamos pendientes a la confirmacion de tu compra para poder despachar tu orden🤗', 0),

  -- ============================================================
  -- rechazar
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'rechazar', 'primera_vez', 'CORE', 0, 'texto', 'Entiendo. Deseas que te comparta nuevamente las **promociones** o prefieres que **te contacte un asesor humano** para resolver tus dudas? 🙌', 0),

  -- ============================================================
  -- no_interesa
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'no_interesa', 'primera_vez', 'CORE', 0, 'texto', 'Claro que si 🤍 Esperamos tu mensaje para brindarte la mejor solucion a tus noches de insomnio😴', 0),

  -- ============================================================
  -- retoma_inicial (timer L5 en initial)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'retoma_inicial', 'primera_vez', 'CORE', 0, 'texto', 'Deseas adquirir el tuyo?', 0),

  -- ============================================================
  -- fallback
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'fallback', 'primera_vez', 'CORE', 0, 'texto', 'Regalame 1 minuto por favor', 0),

  -- ============================================================
  -- tiempo_entrega (zona-based)
  -- ============================================================
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'tiempo_entrega_same_day', 'primera_vez', 'CORE', 0, 'texto', 'Para {{ciudad}} el tiempo de entrega es {{tiempo_estimado}} 🚚', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'tiempo_entrega_next_day', 'primera_vez', 'CORE', 0, 'texto', 'Para {{ciudad}} el tiempo de entrega es {{tiempo_estimado}} 🚚', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'tiempo_entrega_standard', 'primera_vez', 'CORE', 0, 'texto', 'Para {{ciudad}} el tiempo de entrega es {{tiempo_estimado}} 🚚', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'tiempo_entrega_remote', 'primera_vez', 'CORE', 0, 'texto', 'Para {{ciudad}} el tiempo de entrega es {{tiempo_estimado}} 🚚', 0),
  (gen_random_uuid(), 'somnio-recompra-v1', NULL, 'tiempo_entrega_sin_ciudad', 'primera_vez', 'CORE', 0, 'texto', 'En que municipio te encuentras? Asi te puedo dar un estimado del tiempo de entrega 📦', 0);
