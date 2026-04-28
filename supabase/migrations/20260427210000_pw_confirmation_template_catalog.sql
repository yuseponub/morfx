-- ============================================================================
-- PW Confirmation Template Catalog — independencia de somnio-sales-v3
-- ============================================================================
-- Phase: somnio-sales-v3-pw-confirmation (standalone)
-- agent_id: 'somnio-sales-v3-pw-confirmation' (D-01)
-- workspace_id: NULL (catalog global, accesible por workspace Somnio)
-- visit_type: 'primera_vez' (single-track per RESEARCH §A.1 sales-v3 pattern)
--
-- Cambios (post-checkpoint usuario 2026-04-27 — eliminados 3 templates):
--   INFORMACIONALES (clonados verbatim de sales-v3 — D-15, D-27):
--     saludo (CORE+COMP), precio (CORE+COMP+OPC), promociones (CORE),
--     contenido (CORE+COMP), formula (CORE+COMP+OPC),
--     como_se_toma (CORE+COMP+OPC), pago (CORE), envio (CORE+COMP),
--     ubicacion (CORE+COMP), contraindicaciones (CORE+COMP, post-rename
--     migration 20260315170000), dependencia (CORE),
--     efectividad (CORE+COMP+OPC), registro_sanitario (CORE — INVIMA /
--     PHARMA SOLUTIONS SAS per D-27),
--     tiempo_entrega_same_day, tiempo_entrega_next_day,
--     tiempo_entrega_1_3_days, tiempo_entrega_2_4_days,
--     tiempo_entrega_sin_ciudad
--
--   SALES CLONADOS de sales-v3 verbatim (D-10):
--     confirmacion_orden_same_day (CORE+COMP, post-fix
--     migration 20260317210000 "comunicara")
--     confirmacion_orden_transportadora (CORE+COMP)
--
--   NUEVOS / ADAPTADOS (D-11, D-12, D-14):
--     pedir_datos_post_compra (D-12)
--     agendar_pregunta (D-11)
--     claro_que_si_esperamos (D-14, copy lockeado verbatim en CONTEXT)
--     fallback (clonado verbatim de sales-v3)
--
--   ELIMINADOS (post-checkpoint usuario 2026-04-27):
--     - confirmar_direccion_post_compra (D-12) — REDUNDANTE: la pregunta de
--       direccion ya la hace `direccion_entrega` pre-activacion (Plan 01 audit).
--     - cancelado_handoff (D-21) — handoff es SILENCIOSO en somnio-v3/recompra
--       (engine retorna messages:[]). State machine emite event sin enviar texto.
--     - error_carga_pedido — tambien handoff silencioso (mismo patron). Plan 11
--       trata crm_context_status='error' como handoff sin envio.
--
-- DESVIACION del plan template documentada:
--   La URL imagen ELIXIR del template `saludo` orden=1 usa Shopify CDN
--   (https://cdn.shopify.com/s/files/1/0688/9606/3724/files/Diseno_sin_titulo_25.jpg?v=1774566355)
--   en lugar de la URL Supabase storage que estaba en el plan template.
--   La URL Supabase devuelve HTTP 400 en prod (verificado en
--   migration 20260423152233_recompra_saludo_hotfix.sql) — la URL Shopify CDN
--   es la unica que retorna HTTP 200. Es la misma URL que recompra-v1
--   usa post-hotfix.
--
-- Idempotencia:
--   - 0 rows existentes (Query (e) Plan 01 = 0 confirmado).
--   - DO $$ IF NOT EXISTS protege re-runs accidentales.
--   - UNIQUE(agent_id, intent, visit_type, orden, workspace_id) guard secundario.
--
-- Rollback (si se necesita revertir post-deploy):
--   DELETE FROM agent_templates WHERE agent_id = 'somnio-sales-v3-pw-confirmation';
--
-- Regla 5: este SQL NO se aplica automaticamente. Plan 13 Task 1 lo corre en prod
-- ANTES del push de Plan 13 Task 2 (que pushea todo el codigo del agente).

BEGIN;

-- ========================================================================
-- INFORMACIONALES (D-15, D-27 — copy verbatim de sales-v3)
-- ========================================================================

-- saludo (CORE texto + COMPLEMENTARIA imagen ELIXIR via Shopify CDN — DESVIACION del plan template)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'saludo' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'saludo', 'primera_vez', 'CORE', 0, 'texto',
       'Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'saludo', 'primera_vez', 'COMPLEMENTARIA', 1, 'imagen',
       'https://cdn.shopify.com/s/files/1/0688/9606/3724/files/Diseno_sin_titulo_25.jpg?v=1774566355|Deseas adquirir tu ELIXIR DEL SUENO?', 3);
  END IF;
END $$;

-- precio (CORE + COMPLEMENTARIA + OPCIONAL — verbatim sales-v3 migration 20260315150000:79-82)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'precio' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'precio', 'primera_vez', 'CORE', 0, 'texto',
       'Nuestro ELIXIR DEL SUEÑO tiene un valor de $77,900 con envio gratis, este contiene 90 comprimidos de melatonina y magnesio. Tambien manejamos promociones extra si compras el combo 2X o 3X🤗', 3),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'precio', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'precio', 'primera_vez', 'OPCIONAL', 2, 'texto',
       'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3);
  END IF;
END $$;

-- promociones (CORE — verbatim sales-v3:67-68)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'promociones' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'promociones', 'primera_vez', 'CORE', 0, 'texto',
            E'Estas son las promociones que manejamos, ¿Cuál deseas adquirir?😊\n\n• 1×: $77,900 (envío gratis)\n• 2×: $109,900 (ahorras $45,900)\n• 3×: $139,900 (ahorras $93,800)', 0);
  END IF;
END $$;

-- contenido (CORE + COMPLEMENTARIA — verbatim sales-v3:36-38)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'contenido' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'contenido', 'primera_vez', 'CORE', 0, 'texto',
       'Nuestro ELIXIR DEL SUEÑO contiene 90 comprimidos de melatonina y magnesio para relajarte y ayudarte a conciliar el sueño 😴', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'contenido', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5);
  END IF;
END $$;

-- formula (CORE + COMP + OPC — verbatim sales-v3 migration 20260315160000)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'formula' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'formula', 'primera_vez', 'CORE', 0, 'texto',
       'Su formula contiene 50mg de citrato de magnesio y 10mg de melatonina para reparar los trastornos del sueño😴', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'formula', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'formula', 'primera_vez', 'OPCIONAL', 2, 'texto',
       'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);
  END IF;
END $$;

-- como_se_toma (CORE + COMP + OPC — verbatim sales-v3:21-24)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'como_se_toma' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'como_se_toma', 'primera_vez', 'CORE', 0, 'texto',
       'Debes consumir 1 comprimido 30min antes de dormir, todos los dias.', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'como_se_toma', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'como_se_toma', 'primera_vez', 'OPCIONAL', 2, 'texto',
       'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);
  END IF;
END $$;

-- pago (CORE — verbatim sales-v3:59)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'pago' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'pago', 'primera_vez', 'CORE', 0, 'texto',
            'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3);
  END IF;
END $$;

-- envio (CORE + COMP — verbatim sales-v3:45-46)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'envio' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'envio', 'primera_vez', 'CORE', 0, 'texto',
       'Hacemos envíos a toda Colombia 🚚 (gratis).', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'envio', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Usamos Coordinadora, Envia, Interrapidísimo o domiciliarios propios según tu ciudad.', 3);
  END IF;
END $$;

-- ubicacion (CORE + COMP — verbatim sales-v3:114-115)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'ubicacion' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'ubicacion', 'primera_vez', 'CORE', 0, 'texto',
       'Tenemos centros de distribución en las principales ciudades del país, sin embargo nuestro punto principal esta ubicado en la ciudad de Bucaramanga, Santander. (Manejamos envios contraentrega a nivel nacional)', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'ubicacion', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡', 3);
  END IF;
END $$;

-- contraindicaciones (CORE + COMP — verbatim sales-v3 post-rename migration 20260315170000:18-19)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'contraindicaciones' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'contraindicaciones', 'primera_vez', 'CORE', 0, 'texto',
       'La melatonina es un compuesto orgánico natural, y el citrato de magnesio es un mineral. Ambos siendo productos orgánicos no tienen ningún tipo de efecto secundario.', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'contraindicaciones', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Sin embargo, en casos de toma de anticoagulantes recomendamos consultar con tu medico de confianza antes de consumirlo, ya que combinar la melatonina con estos podría generar efectos adversos.', 4);
  END IF;
END $$;

-- dependencia (CORE — verbatim sales-v3 migration 20260315170000:46)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'dependencia' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'dependencia', 'primera_vez', 'CORE', 0, 'texto',
            'La melatonina es un compuesto orgánico natural, y el citrato de magnesio es un mineral. Ambos siendo productos orgánicos no causan dependencia.', 0);
  END IF;
END $$;

-- efectividad (CORE + COMP + OPC — verbatim sales-v3:109-111)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'efectividad' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'efectividad', 'primera_vez', 'CORE', 0, 'texto',
       'Claro que sí! El tiempo en el que el suplemento empezará a hacer efecto depende de la severidad de tu insomnio', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'efectividad', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'efectividad', 'primera_vez', 'OPCIONAL', 2, 'texto',
       'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);
  END IF;
END $$;

-- registro_sanitario (CORE — D-27 lockea: INVIMA / PHARMA SOLUTIONS SAS verbatim sales-v3:56)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'registro_sanitario' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'registro_sanitario', 'primera_vez', 'CORE', 0, 'texto',
            'Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA SOLUTIONS SAS.', 0);
  END IF;
END $$;

-- tiempo_entrega_same_day (CORE — verbatim sales-v3 post-fix migration 20260317210000:7)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'tiempo_entrega_same_day' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'tiempo_entrega_same_day', 'primera_vez', 'CORE', 0, 'texto',
            'Tu pedido estaria llegando a {{ciudad}} {{tiempo_estimado}}✅ Nuestro domiciliario se comunicaria contigo para la entrega', 0);
  END IF;
END $$;

-- tiempo_entrega_next_day (CORE — verbatim sales-v3 migration 20260317200001:23-24)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'tiempo_entrega_next_day' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'tiempo_entrega_next_day', 'primera_vez', 'CORE', 0, 'texto',
            'Tu pedido estaria llegando a {{ciudad}} al dia siguiente de ser despachado', 0);
  END IF;
END $$;

-- tiempo_entrega_1_3_days (CORE — verbatim sales-v3 migration 20260317200001:27-28)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'tiempo_entrega_1_3_days' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'tiempo_entrega_1_3_days', 'primera_vez', 'CORE', 0, 'texto',
            'Tu pedido estaria llegando a {{ciudad}} en 1-3 dias habiles', 0);
  END IF;
END $$;

-- tiempo_entrega_2_4_days (CORE — verbatim sales-v3 migration 20260317200001:31-32)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'tiempo_entrega_2_4_days' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'tiempo_entrega_2_4_days', 'primera_vez', 'CORE', 0, 'texto',
            'Tu pedido estaria llegando a {{ciudad}} en 2-4 dias habiles', 0);
  END IF;
END $$;

-- tiempo_entrega_sin_ciudad (CORE — verbatim sales-v3 migration 20260317200001:15-16)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'tiempo_entrega_sin_ciudad' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'tiempo_entrega_sin_ciudad', 'primera_vez', 'CORE', 0, 'texto',
            'En que municipio te encuentras? El tiempo de entrega depende de tu ubicacion', 0);
  END IF;
END $$;

-- ========================================================================
-- SALES CLONADOS DE SALES-V3 VERBATIM (D-10)
-- ========================================================================

-- confirmacion_orden_same_day (CORE post-fix + COMPLEMENTARIA — verbatim migration 20260317210000:13 + 20260317200001:42-43)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'confirmacion_orden_same_day' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'confirmacion_orden_same_day', 'primera_vez', 'CORE', 0, 'texto',
       'Perfecto! Tu pedido llega {{tiempo_estimado}}✅ Nuestro domiciliario se comunicara contigo para la entrega', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'confirmacion_orden_same_day', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Recuerda tener el efectivo listo el dia que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejarselo a alguien para que lo reciba', 3);
  END IF;
END $$;

-- confirmacion_orden_transportadora (CORE + COMPLEMENTARIA — verbatim migration 20260317200001:46-51)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'confirmacion_orden_transportadora' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'confirmacion_orden_transportadora', 'primera_vez', 'CORE', 0, 'texto',
       'Perfecto! Tu pedido estaria llegando en {{tiempo_estimado}} Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto', 0),
      (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'confirmacion_orden_transportadora', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
       'Recuerda tener el efectivo listo el dia que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejarselo a alguien para que lo reciba', 3);
  END IF;
END $$;

-- ========================================================================
-- NUEVOS / ADAPTADOS (D-11, D-12, D-14, D-21)
-- ========================================================================

-- pedir_datos_post_compra (D-12) — pedir campos faltantes para envio
-- Variables: {{campos_faltantes}}
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'pedir_datos_post_compra' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'pedir_datos_post_compra', 'primera_vez', 'CORE', 0, 'texto',
            E'Para poder despachar tu pedido nos haria falta:\n\n{{campos_faltantes}}', 0);
  END IF;
END $$;

-- agendar_pregunta (D-11) — preguntar si quiere agendar para fecha futura
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'agendar_pregunta' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'agendar_pregunta', 'primera_vez', 'CORE', 0, 'texto',
            '¿Deseas agendarlo para alguna fecha futura?', 0);
  END IF;
END $$;

-- claro_que_si_esperamos (D-14) — cliente dice "espera lo pienso"
-- Copy lockeado verbatim en CONTEXT.md D-14
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'claro_que_si_esperamos' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'claro_que_si_esperamos', 'primera_vez', 'CORE', 0, 'texto',
            'Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴', 0);
  END IF;
END $$;

-- NOTE: NO `cancelado_handoff` template — handoff es silencioso en somnio-v3/recompra
-- (engine retorna messages: [] cuando action='handoff', solo emite observability event).
-- D-21 stub se materializa via state.requires_human=true + newMode='handoff', sin envio al cliente.

-- fallback (CORE — verbatim sales-v3:49)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3-pw-confirmation'
      AND intent = 'fallback' AND visit_type = 'primera_vez' AND orden = 0
      AND workspace_id IS NULL
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES (gen_random_uuid(), 'somnio-sales-v3-pw-confirmation', NULL, 'fallback', 'primera_vez', 'CORE', 0, 'texto',
            'Regálame 1 minuto por favor', 0);
  END IF;
END $$;

-- NOTE: NO `error_carga_pedido` template — degradacion por reader timeout/error
-- se trata como handoff silencioso (engine retorna messages: [], emite observability event).
-- Plan 11 engine: si crm_context_status='error' AND no se puede recuperar → action='handoff'.

-- ========================================================================
-- GRANTs defensivos (LEARNING 1 Phase 44.1)
-- ========================================================================

GRANT ALL ON TABLE agent_templates TO service_role;
GRANT SELECT ON TABLE agent_templates TO authenticated;

COMMIT;
