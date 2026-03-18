-- ============================================================================
-- GoDentist Agent Templates Migration
-- Standalone: agent-godentist Plan 07
--
-- Seeds all ~75 templates for the GoDentist appointment agent.
-- Templates are global (workspace_id = NULL).
-- Idempotent: deletes existing godentist templates before inserting.
-- ============================================================================

-- Clean slate for idempotency
DELETE FROM agent_templates WHERE agent_id = 'godentist';

-- ============================================================================
-- SALUDO (1 template)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'saludo', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1Hola! Bienvenido a GoDentist, nuestra felicidad es verte sonre\u00edr \U0001f60a \u00bfDeseas agendar tu cita de valoraci\u00f3n GRATIS?', 0);

-- ============================================================================
-- OPCIONAL UNIVERSAL (1 template)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'recordatorio_sin_compromiso', 'primera_vez', 'OPCIONAL', 0, 'texto',
   E'Recuerda que puedes recibir tu cotizaci\u00f3n completa sin ning\u00fan tipo de compromiso \U0001f60a', 5);

-- ============================================================================
-- PRECIOS DE SERVICIOS (22 CORE + 14 COMP = 36 templates)
-- ============================================================================

-- Corona dental
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_corona', 'primera_vez', 'CORE', 0, 'texto',
   E'Las coronas en zirconio tienen un valor desde $700.000, elaboradas con materiales de la m\u00e1s alta calidad. En algunos casos puede requerir tratamientos previos que se determinan en la valoraci\u00f3n.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_corona', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'Trabajamos con zirconio y disilicato de litio, todos nuestros tratamientos incluyen garant\u00eda \u2705', 3);

-- Protesis dental
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_protesis', 'primera_vez', 'CORE', 0, 'texto',
   E'Las pr\u00f3tesis dentales inician desde $1.100.000. Cada pr\u00f3tesis se elabora a la medida del paciente para un ajuste perfecto.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_protesis', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'El valor puede variar seg\u00fan el tipo y los materiales. En la valoraci\u00f3n te entregamos la cotizaci\u00f3n exacta para tu caso.', 3);

-- Alineadores dentales
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_alineadores', 'primera_vez', 'CORE', 0, 'texto',
   E'Los alineadores inician con escaneo y planificaci\u00f3n digital por $600.000, colocaci\u00f3n de attachments $300.000 por maxilar y cada alineador $125.000. Trabajamos con GoAligner, marca colombiana \U0001f1e8\U0001f1f4', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_alineadores', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'La cantidad de alineadores depende de tu caso. En la valoraci\u00f3n el especialista te da el plan completo con el n\u00famero exacto.', 3);

-- Brackets convencionales
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_brackets_conv', 'primera_vez', 'CORE', 0, 'texto',
   E'El montaje de brackets convencionales tiene un valor de $550.000 (superior $275.000 + inferior $275.000). Los controles mensuales son de $90.000 cada uno.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_brackets_conv', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'El tratamiento incluye aproximadamente 24 controles. \u00a1Es la mejor opci\u00f3n para empezar tu camino a una sonrisa perfecta!', 3);

-- Brackets zafiro
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_brackets_zafiro', 'primera_vez', 'CORE', 0, 'texto',
   E'Los brackets de zafiro tienen un montaje de $2.400.000 (superior $1.200.000 + inferior $1.200.000). Los controles son de $140.000 cada uno.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_brackets_zafiro', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'El zafiro es pr\u00e1cticamente invisible y muy resistente. \u00a1Ideal si buscas est\u00e9tica durante el tratamiento!', 3);

-- Autoligado clasico
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_autoligado_clasico', 'primera_vez', 'CORE', 0, 'texto',
   E'La ortodoncia de autoligado cl\u00e1sico tiene un montaje de $1.400.000 ($700.000 + $700.000). Los controles son de $140.000 cada uno.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_autoligado_clasico', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'El sistema autoligado requiere menos citas de ajuste y puede acortar el tiempo de tratamiento.', 3);

-- Autoligado pro
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_autoligado_pro', 'primera_vez', 'CORE', 0, 'texto',
   E'La ortodoncia autoligado pro tiene un montaje de $2.400.000 ($1.200.000 + $1.200.000). Los controles son de $140.000 cada uno.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_autoligado_pro', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'Es nuestra l\u00ednea premium de autoligado, con brackets de \u00faltima generaci\u00f3n para resultados m\u00e1s r\u00e1pidos.', 3);

-- Autoligado ceramico
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_autoligado_ceramico', 'primera_vez', 'CORE', 0, 'texto',
   E'La ortodoncia autoligado cer\u00e1mico tiene un montaje de $3.000.000 ($1.500.000 + $1.500.000). Los controles son de $140.000 cada uno.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_autoligado_ceramico', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'Combina la eficiencia del autoligado con la est\u00e9tica del cer\u00e1mico. \u00a1Pr\u00e1cticamente no se nota!', 3);

-- Implante dental
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_implante', 'primera_vez', 'CORE', 0, 'texto',
   E'Los implantes dentales tienen un valor desde $2.100.000. Trabajamos con marcas de prestigio mundial: Microdent, Neodent y Straumann.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_implante', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'Seg\u00fan tu caso puede requerirse tomograf\u00eda, injerto de hueso o membrana. Todo se eval\u00faa en la valoraci\u00f3n.', 3);

-- Blanqueamiento dental
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_blanqueamiento', 'primera_vez', 'CORE', 0, 'texto',
   E'Manejamos diferentes protocolos de blanqueamiento: casero, en consultorio y combinado. El valor depende del tono actual y el aclaramiento que buscas.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_blanqueamiento', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'En la valoraci\u00f3n el especialista eval\u00faa tu tono y te recomienda el protocolo ideal con su cotizaci\u00f3n exacta.', 3);

-- Limpieza dental
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_limpieza', 'primera_vez', 'CORE', 0, 'texto',
   E'La limpieza premium tiene un valor de $160.000. Para pacientes con ortodoncia es de $90.000.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_limpieza', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'Se recomienda cada 6 meses, o cada 3-4 meses si tienes ortodoncia. \u00a1Tu sonrisa te lo agradece!', 3);

-- Extraccion simple
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_extraccion_simple', 'primera_vez', 'CORE', 0, 'texto',
   E'Las extracciones simples tienen un valor entre $115.000 y $175.000 seg\u00fan la complejidad.', 0);

-- Extraccion muela del juicio
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_extraccion_juicio', 'primera_vez', 'CORE', 0, 'texto',
   E'La extracci\u00f3n de muela del juicio tiene un valor desde $225.000 por unidad seg\u00fan la complejidad del caso.', 0);

-- Diseno de sonrisa
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_diseno_sonrisa', 'primera_vez', 'CORE', 0, 'texto',
   E'El dise\u00f1o de sonrisa tiene un valor desde $260.000 por diente, con correcciones en bordes incisales para una sonrisa arm\u00f3nica.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_diseno_sonrisa', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'Utilizamos tecnolog\u00eda digital para planificar tu sonrisa ideal antes de empezar. \u00a1Ver\u00e1s el resultado antes del tratamiento!', 3);

-- Placa anti-ronquidos
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_placa_ronquidos', 'primera_vez', 'CORE', 0, 'texto',
   E'La placa anti-ronquido tiene un valor de $1.590.000. Es un dispositivo para apnea del sue\u00f1o que te ayuda a descansar mejor a ti y a tu familia.', 0);

-- Calza / Resina
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_calza_resina', 'primera_vez', 'CORE', 0, 'texto',
   E'Las calzas en resina tienen un valor desde $120.000 en adelante seg\u00fan el tama\u00f1o de la restauraci\u00f3n.', 0);

-- Rehabilitacion oral
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_rehabilitacion', 'primera_vez', 'CORE', 0, 'texto',
   E'La rehabilitaci\u00f3n oral es un tratamiento completamente personalizado. Utilizamos tecnolog\u00eda digital y rob\u00f3tica para los mejores resultados. El valor se define en la valoraci\u00f3n seg\u00fan tu plan de tratamiento.', 0);

-- Radiografia panoramica
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_radiografia', 'primera_vez', 'CORE', 0, 'texto',
   E'La radiograf\u00eda individual tiene un valor de $31.000. Tambi\u00e9n tenemos el paquete de 9 fotos + 2 radiograf\u00edas por $70.000.', 0);

-- Endodoncia
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_endodoncia', 'primera_vez', 'CORE', 0, 'texto',
   E'La endodoncia tiene un valor desde $430.000. Incluye radiograf\u00eda periapical antes y despu\u00e9s del procedimiento.', 0);

-- Carillas dentales
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_carillas', 'primera_vez', 'CORE', 0, 'texto',
   E'Las carillas en resina directa van desde $410.000/diente, en resina impresa desde $650.000/diente y en cer\u00e1mica desde $1.600.000/diente.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_carillas', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'En la valoraci\u00f3n el especialista te recomienda el material ideal seg\u00fan tu caso y expectativas.', 3);

-- Ortopedia maxilar
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_ortopedia', 'primera_vez', 'CORE', 0, 'texto',
   E'La ortopedia maxilar tiene un valor desde $2.000.000. Se maneja con cuota inicial de $1.000.000 + 10 controles de $100.000.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'precio_ortopedia', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'En algunos casos puede requerirse m\u00e1scara de Petit ($200.000). El especialista te indica en la valoraci\u00f3n.', 3);

-- Ortodoncia general (overview listing all orthodontic options)
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'precio_ortodoncia_general', 'primera_vez', 'CORE', 0, 'texto',
   E'Manejamos varias opciones de ortodoncia:\n\n\u2022 Brackets convencionales: montaje $550.000\n\u2022 Brackets zafiro: montaje $2.400.000\n\u2022 Autoligado cl\u00e1sico: montaje $1.400.000\n\u2022 Autoligado pro: montaje $2.400.000\n\u2022 Autoligado cer\u00e1mico: montaje $3.000.000\n\u2022 Alineadores GoAligner: desde $600.000 + attachments\n\n\u00bfTe gustar\u00eda saber m\u00e1s de alguna opci\u00f3n en particular?', 0);

-- ============================================================================
-- INFORMACIONALES (11 CORE + 7 COMP = 18 templates)
-- ============================================================================

-- Valoracion
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'valoracion_costo', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1La valoraci\u00f3n es totalmente GRATIS! Incluye revisi\u00f3n completa con el odont\u00f3logo y tu plan de tratamiento personalizado con cotizaci\u00f3n.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'valoracion_costo', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'Si hay especialistas disponibles, se hace interconsulta inmediata. Duraci\u00f3n aproximada 15-30 minutos.', 3),
  (gen_random_uuid(), 'godentist', NULL, 'valoracion_costo', 'primera_vez', 'COMPLEMENTARIA', 2, 'texto',
   E'La \u00fanica excepci\u00f3n es la valoraci\u00f3n de cirug\u00eda maxilofacial que tiene un costo de $200.000.', 3);

-- Financiacion
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'financiacion', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1Tenemos opciones de financiaci\u00f3n desde 3 hasta 36 cuotas! Trabajamos con Meddipay, Sistecr\u00e9dito, Addi, Sumaspay y otros convenios. Solo necesitas tu c\u00e9dula, no estar en Datacr\u00e9dito y un dispositivo con internet.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'financiacion', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'Tambi\u00e9n aceptamos Visa y Mastercard (cr\u00e9dito y d\u00e9bito), efectivo y transferencia a Bancolombia o BBVA. Si pagas de contado el d\u00eda de la valoraci\u00f3n, te damos un 5% de descuento \U0001f4aa', 3);

-- Ubicacion
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'ubicacion', 'primera_vez', 'CORE', 0, 'texto',
   E'Contamos con 4 sedes para tu comodidad: Cabecera (Cll 52 #31-32), Mejoras P\u00fablicas (Cll 41 #27-63), Floridablanca (Cll 4 #3-06) y Ca\u00f1averal en CC Jumbo El Bosque. \u00bfCu\u00e1l te queda mejor?', 0);

-- Horarios
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'horarios', 'primera_vez', 'CORE', 0, 'texto',
   E'Atendemos de lunes a viernes de 8:00am a 6:30pm y s\u00e1bados de 8:00am a 12:00md. No abrimos domingos ni festivos.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'horarios', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'La sede Cabecera los s\u00e1bados tiene jornada continua hasta las 5:00pm.', 3);

-- Materiales
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'materiales', 'primera_vez', 'CORE', 0, 'texto',
   E'Trabajamos con materiales de la m\u00e1s alta calidad: coronas en zirconio y disilicato de litio, implantes Microdent/Neodent/Straumann, y alineadores GoAligner \U0001f1e8\U0001f1f4', 0);

-- Menores
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'menores', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1S\u00ed, atendemos todas las edades! Los menores de edad deben asistir con un acompa\u00f1ante.', 0);

-- Seguros / EPS
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'seguros_eps', 'primera_vez', 'CORE', 0, 'texto',
   E'Somos cl\u00ednica particular, no manejamos EPS ni seguros. Pero tenemos excelentes opciones de financiaci\u00f3n desde 3 hasta 36 cuotas para que puedas acceder a tu tratamiento.', 0);

-- Urgencia
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'urgencia', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1S\u00ed manejamos urgencias dentales! Te recomendamos acercarte lo antes posible a la sede m\u00e1s cercana.', 0),
  (gen_random_uuid(), 'godentist', NULL, 'urgencia', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'Nuestras sedes: Cabecera (Cll 52 #31-32), Mejoras P\u00fablicas (Cll 41 #27-63), Floridablanca (Cll 4 #3-06) y Ca\u00f1averal en CC Jumbo El Bosque.', 3);

-- Garantia
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'garantia', 'primera_vez', 'CORE', 0, 'texto',
   E'S\u00ed manejamos garant\u00eda en nuestros tratamientos, sujeta a asistencia a controles y seguimiento fotogr\u00e1fico del proceso.', 0);

-- Objecion de precio
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'objecion_precio', 'primera_vez', 'CORE', 0, 'texto',
   E'Entiendo que quieras comparar. Nuestros precios reflejan la calidad de los materiales, la experiencia profesional y el seguimiento completo del tratamiento. Ofrecemos resultados confiables y con garant\u00eda \u2705', 0);

-- ============================================================================
-- FLUJO DE AGENDAMIENTO (7 templates)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'pedir_datos', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1Excelente! Para agendarte tu valoraci\u00f3n GRATIS necesito: tu nombre completo, n\u00famero de celular y la sede de tu preferencia: Cabecera, Mejoras P\u00fablicas, Floridablanca o Ca\u00f1averal.', 0),

  (gen_random_uuid(), 'godentist', NULL, 'pedir_datos_parcial', 'primera_vez', 'CORE', 0, 'texto',
   E'Para completar tu agendamiento me falta: {{campos_faltantes}}.', 0),

  (gen_random_uuid(), 'godentist', NULL, 'confirmar_cita', 'primera_vez', 'CORE', 0, 'texto',
   E'Perfecto, confirmo tus datos:\n\u2022 Nombre: {{nombre}}\n\u2022 Tel\u00e9fono: {{telefono}}\n\u2022 Sede: {{sede_preferida}}\n\u00bfTodo correcto?', 0),

  (gen_random_uuid(), 'godentist', NULL, 'cita_agendada', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1Listo, quedas agendado/a! \U0001f389 Nuestro equipo te contactar\u00e1 para confirmar fecha y hora. Si necesitas reagendar, escr\u00edbenos con tiempo.', 0),

  (gen_random_uuid(), 'godentist', NULL, 'invitar_agendar', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00bfTe gustar\u00eda agendar tu valoraci\u00f3n GRATIS? \U0001f60a', 0),

  (gen_random_uuid(), 'godentist', NULL, 'pedir_fecha', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1Perfecto {{nombre}}! \u00bfPara qu\u00e9 d\u00eda te gustar\u00eda agendar tu valoraci\u00f3n?', 0),

  (gen_random_uuid(), 'godentist', NULL, 'mostrar_disponibilidad', 'primera_vez', 'CORE', 0, 'texto',
   E'Para el {{fecha}} en la sede {{sede_preferida}} tenemos disponibilidad:\n\n\U0001f305 Ma\u00f1ana:\n{{slots_manana}}\n\n\U0001f306 Tarde:\n{{slots_tarde}}\n\n\u00bfCu\u00e1l horario te queda mejor?', 0);

-- ============================================================================
-- ESCAPE / CONTROL (6 templates)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'handoff', 'primera_vez', 'CORE', 0, 'texto',
   E'Te comunico con un asesor para atenderte personalmente. En un momento te contactan \U0001f64c', 0),

  (gen_random_uuid(), 'godentist', NULL, 'reagendamiento', 'primera_vez', 'CORE', 0, 'texto',
   E'Para reagendar tu cita te comunico con nuestra coordinadora. Ella te ayudar\u00e1 con la nueva fecha.', 0),

  (gen_random_uuid(), 'godentist', NULL, 'cancelar_cita', 'primera_vez', 'CORE', 0, 'texto',
   E'Entendido, te comunico con nuestra coordinadora para gestionar la cancelaci\u00f3n.', 0),

  (gen_random_uuid(), 'godentist', NULL, 'fuera_horario', 'primera_vez', 'CORE', 0, 'texto',
   E'En este momento estamos fuera del horario de atenci\u00f3n. Tomo tus datos y te contactamos el siguiente d\u00eda h\u00e1bil \U0001f4de', 0),

  (gen_random_uuid(), 'godentist', NULL, 'no_interesa', 'primera_vez', 'CORE', 0, 'texto',
   E'Entendido, sin problema. Quedamos a tu disposici\u00f3n cuando lo necesites \U0001f64c', 0),

  (gen_random_uuid(), 'godentist', NULL, 'despedida', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1Gracias por escribirnos! Quedamos atentos ante cualquier inquietud.', 0);

-- ============================================================================
-- FOLLOW-UPS (6 templates — 4 from PLANTILLAS + 2 from DISENO-COMPLETO)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'retoma_post_info', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00bfTe gustar\u00eda agendar tu valoraci\u00f3n GRATIS? \U0001f60a', 0),

  (gen_random_uuid(), 'godentist', NULL, 'retoma_datos', 'primera_vez', 'CORE', 0, 'texto',
   E'Para completar tu cita me falta: {{campos_faltantes}}. \u00bfMe los compartes?', 0),

  (gen_random_uuid(), 'godentist', NULL, 'retoma_confirmacion', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00bfConfirmamos tu cita con los datos que me compartiste?', 0),

  (gen_random_uuid(), 'godentist', NULL, 'retoma_final', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00a1Hola! Seguimos a tu disposici\u00f3n. \u00bfTe gustar\u00eda agendar tu valoraci\u00f3n GRATIS?', 0),

  (gen_random_uuid(), 'godentist', NULL, 'retoma_fecha', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00bfPara qu\u00e9 d\u00eda te gustar\u00eda agendar tu valoraci\u00f3n? \U0001f60a', 0),

  (gen_random_uuid(), 'godentist', NULL, 'retoma_horario', 'primera_vez', 'CORE', 0, 'texto',
   E'\u00bfTe queda bien alguno de los horarios disponibles?', 0);

-- ============================================================================
-- ENGLISH (1 template)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'english_response', 'primera_vez', 'CORE', 0, 'texto',
   E'Hi! Thank you for reaching out to GoDentist. We''d love to help you. Could you write in Spanish so we can assist you better? Or if you prefer, we can connect you with an advisor. \U0001f60a', 0);

-- ============================================================================
-- Verification (not part of migration — for manual checking)
-- SELECT count(*), priority FROM agent_templates WHERE agent_id = 'godentist' GROUP BY priority;
-- Expected: CORE ~56, COMPLEMENTARIA ~18, OPCIONAL ~1 = ~75 total
-- ============================================================================
