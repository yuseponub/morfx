-- ============================================================================
-- Phase 34 Plan 01: No-Repetition System - Minifrases + Siguientes Cleanup
--
-- 1. Add minifrase column to agent_templates
-- 2. Seed minifrase values for all primera_vez templates
-- 3. Delete visit_type='siguientes' rows (replaced by runtime paraphrasing)
-- ============================================================================

-- ============================================================================
-- 1. Add minifrase column
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_templates' AND column_name = 'minifrase'
  ) THEN
    ALTER TABLE agent_templates ADD COLUMN minifrase TEXT;
  END IF;
END $$;

COMMENT ON COLUMN agent_templates.minifrase IS 'Short thematic phrase capturing template essence. Used by no-repetition filter (Phase 34).';

-- ============================================================================
-- 2. Seed minifrase values for ALL primera_vez templates
--    Matched by (agent_id, intent, visit_type, orden) tuple, NOT by UUID id.
--    Identical content across intents gets the same minifrase.
-- ============================================================================

-- ----- Intent: hola -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'pregunta si desea adquirir elixir del sueno'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: precio -----
UPDATE agent_templates SET minifrase = 'precio $77,900, envio gratis, 90 comprimidos melatonina y magnesio, promos 2X 3X'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'precio' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja mente y cuerpo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'precio' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'pago contraentrega en efectivo al recibir en hogar'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'precio' AND visit_type = 'primera_vez' AND orden = 2;

-- ----- Intent: hola+precio -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+precio' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'precio $77,900, envio gratis, 90 comprimidos melatonina y magnesio, promos 2X 3X'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+precio' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja mente y cuerpo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+precio' AND visit_type = 'primera_vez' AND orden = 2;

UPDATE agent_templates SET minifrase = 'pago contraentrega en efectivo al recibir en hogar'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+precio' AND visit_type = 'primera_vez' AND orden = 3;

-- ----- Intent: contenido_envase -----
UPDATE agent_templates SET minifrase = '90 comprimidos melatonina y magnesio para conciliar sueno'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'contenido_envase' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja mente y cuerpo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'contenido_envase' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: hola+contenido_envase -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+contenido_envase' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = '90 comprimidos melatonina y magnesio para conciliar sueno'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+contenido_envase' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja mente y cuerpo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+contenido_envase' AND visit_type = 'primera_vez' AND orden = 2;

-- ----- Intent: como_se_toma -----
UPDATE agent_templates SET minifrase = '1 comprimido 30min antes de dormir, todos los dias'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'como_se_toma' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja mente y cuerpo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'como_se_toma' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'reloj biologico se ajusta naturalmente, no es somnifero'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'como_se_toma' AND visit_type = 'primera_vez' AND orden = 2;

-- ----- Intent: hola+como_se_toma -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+como_se_toma' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = '1 comprimido 30min antes de dormir, todos los dias'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+como_se_toma' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja mente y cuerpo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+como_se_toma' AND visit_type = 'primera_vez' AND orden = 2;

UPDATE agent_templates SET minifrase = 'reloj biologico se ajusta naturalmente, no es somnifero'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+como_se_toma' AND visit_type = 'primera_vez' AND orden = 3;

-- ----- Intent: modopago -----
UPDATE agent_templates SET minifrase = 'pago contraentrega en efectivo al recibir en hogar'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'modopago' AND visit_type = 'primera_vez' AND orden = 0;

-- ----- Intent: hola+modopago -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+modopago' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'pago contraentrega en efectivo al recibir en hogar'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+modopago' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: metodos_de_pago -----
UPDATE agent_templates SET minifrase = 'metodos de pago: contraentrega, transferencias Bancolombia Nequi Daviplata, tarjeta debito credito'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'metodos_de_pago' AND visit_type = 'primera_vez' AND orden = 0;

-- ----- Intent: modopago2 -----
UPDATE agent_templates SET minifrase = 'producto se paga al recibirlo cuando llegue'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'modopago2' AND visit_type = 'primera_vez' AND orden = 0;

-- ----- Intent: envio -----
UPDATE agent_templates SET minifrase = 'envios a toda Colombia, gratis'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'envio' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'transportadora Coordinadora, Envia, Interrapidisimo, domiciliarios propios'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'envio' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: hola+envio -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+envio' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'envios a toda Colombia, gratis'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+envio' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'transportadora Coordinadora, Envia, Interrapidisimo, domiciliarios propios'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+envio' AND visit_type = 'primera_vez' AND orden = 2;

-- ----- Intent: invima -----
UPDATE agent_templates SET minifrase = 'registro Invima, laboratorio PHARMA SOLUTIONS SAS'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'invima' AND visit_type = 'primera_vez' AND orden = 0;

-- ----- Intent: hola+invima -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+invima' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'registro Invima, laboratorio PHARMA SOLUTIONS SAS'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+invima' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: ubicacion -----
UPDATE agent_templates SET minifrase = 'centros distribucion principales ciudades, punto principal Bucaramanga, envios contraentrega nacional'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'ubicacion' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'pago contraentrega en efectivo al recibir en hogar'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'ubicacion' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: hola+ubicacion -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+ubicacion' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'centros distribucion principales ciudades, punto principal Bucaramanga, envios contraentrega nacional'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+ubicacion' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'pago contraentrega en efectivo al recibir en hogar'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+ubicacion' AND visit_type = 'primera_vez' AND orden = 2;

-- ----- Intent: contraindicaciones -----
UPDATE agent_templates SET minifrase = 'melatonina y magnesio seguros y bien tolerados'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'contraindicaciones' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'anticoagulantes consultar medico antes de usar'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'contraindicaciones' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: hola+contraindicaciones -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+contraindicaciones' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'melatonina y magnesio seguros y bien tolerados'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+contraindicaciones' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'anticoagulantes consultar medico antes de usar'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+contraindicaciones' AND visit_type = 'primera_vez' AND orden = 2;

-- ----- Intent: sisirve -----
UPDATE agent_templates SET minifrase = 'efectividad depende de severidad del insomnio'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'sisirve' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja mente y cuerpo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'sisirve' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'reloj biologico se ajusta naturalmente, no es somnifero'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'sisirve' AND visit_type = 'primera_vez' AND orden = 2;

-- ----- Intent: hola+sisirve -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+sisirve' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'efectividad depende de severidad del insomnio'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+sisirve' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja mente y cuerpo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+sisirve' AND visit_type = 'primera_vez' AND orden = 2;

UPDATE agent_templates SET minifrase = 'reloj biologico se ajusta naturalmente, no es somnifero'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+sisirve' AND visit_type = 'primera_vez' AND orden = 3;

-- ----- Intent: info_promociones -----
UPDATE agent_templates SET minifrase = 'presentacion de promociones disponibles'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'info_promociones' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'precios paquetes 1X $77,900, 2X $109,900, 3X $139,900, ahorros'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'info_promociones' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'pregunta cual paquete desea adquirir'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'info_promociones' AND visit_type = 'primera_vez' AND orden = 2;

-- ----- Intent: hola+info_promociones -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+info_promociones' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'presentacion de promociones disponibles'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+info_promociones' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'precios paquetes 1X $77,900, 2X $109,900, 3X $139,900, ahorros'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+info_promociones' AND visit_type = 'primera_vez' AND orden = 2;

UPDATE agent_templates SET minifrase = 'pregunta cual paquete desea adquirir'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+info_promociones' AND visit_type = 'primera_vez' AND orden = 3;

-- ----- Intent: captura_datos_si_compra -----
UPDATE agent_templates SET minifrase = 'solicitud de datos personales para compra'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'captura_datos_si_compra' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'formulario datos: nombre, apellido, telefono, direccion, barrio, departamento, ciudad, correo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'captura_datos_si_compra' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: hola+captura_datos_si_compra -----
UPDATE agent_templates SET minifrase = 'saludo inicial, bienvenida a Somnio, suenos'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+captura_datos_si_compra' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'solicitud de datos personales para compra'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+captura_datos_si_compra' AND visit_type = 'primera_vez' AND orden = 1;

UPDATE agent_templates SET minifrase = 'formulario datos: nombre, apellido, telefono, direccion, barrio, departamento, ciudad, correo'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'hola+captura_datos_si_compra' AND visit_type = 'primera_vez' AND orden = 2;

-- ----- Intent: ofrecer_promos -----
UPDATE agent_templates SET minifrase = 'promociones cual deseas: 1X $77,900, 2X $109,900, 3X $139,900'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'ofrecer_promos' AND visit_type = 'primera_vez' AND orden = 0;

-- ----- Intent: resumen_1x -----
UPDATE agent_templates SET minifrase = 'pedido recibido 1X elixir del sueno $77,900 envio gratis'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'resumen_1x' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'pregunta confirmacion de compra'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'resumen_1x' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: resumen_2x -----
UPDATE agent_templates SET minifrase = 'pedido recibido 2X elixir del sueno $109,900 envio gratis'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'resumen_2x' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'pregunta confirmacion de compra'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'resumen_2x' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: resumen_3x -----
UPDATE agent_templates SET minifrase = 'pedido recibido 3X elixir del sueno $139,900 envio gratis'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'resumen_3x' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'pregunta confirmacion de compra'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'resumen_3x' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: compra_confirmada -----
UPDATE agent_templates SET minifrase = 'despacho pedido lo antes posible, guia por transportadora'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'compra_confirmada' AND visit_type = 'primera_vez' AND orden = 0;

UPDATE agent_templates SET minifrase = 'tener efectivo listo dia de entrega, alguien que reciba si no esta'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'compra_confirmada' AND visit_type = 'primera_vez' AND orden = 1;

-- ----- Intent: no_confirmado -----
UPDATE agent_templates SET minifrase = 'ofrece compartir promociones nuevamente o asesor humano'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'no_confirmado' AND visit_type = 'primera_vez' AND orden = 0;

-- ----- Intent: no_interesa -----
UPDATE agent_templates SET minifrase = 'despedida amable, esperamos tu mensaje para insomnio'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'no_interesa' AND visit_type = 'primera_vez' AND orden = 0;

-- ----- Intent: fallback -----
UPDATE agent_templates SET minifrase = 'solicitud de espera, regalame un minuto'
  WHERE agent_id = 'somnio-sales-v1' AND intent = 'fallback' AND visit_type = 'primera_vez' AND orden = 0;

-- ============================================================================
-- 3. Delete visit_type='siguientes' rows
--    Phase 34 replaces siguientes templates with runtime paraphrasing.
-- ============================================================================

DELETE FROM agent_templates WHERE visit_type = 'siguientes';

-- ============================================================================
-- Verification (uncomment to check)
-- ============================================================================
-- SELECT intent, orden, minifrase FROM agent_templates
--   WHERE agent_id = 'somnio-sales-v1' AND visit_type = 'primera_vez'
--   ORDER BY intent, orden;
-- SELECT COUNT(*) AS siguientes_count FROM agent_templates WHERE visit_type = 'siguientes';
