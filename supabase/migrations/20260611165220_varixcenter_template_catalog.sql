-- ============================================================================
-- Varixcenter Appointment Agent — Template Catalog Migration
-- Standalone: agent-varixcenter (Wave 5 Plan 10)
--
-- Seeds the ~46 templates for the Varixcenter flebological valoración agent under
-- agent_id='varixcenter'. Wording verbatim from PLANTILLAS.md (§2-§8) + the custom
-- 2-row saludo chosen by the client in Wave 0 (AMENDA D-12, see 00-WAVE0-AUDIT.md
-- §Saludo escogido). The 5 original A-E saludo options of PLANTILLAS.md §1 are
-- DISCARDED — NOT inserted.
--
-- Workspace: c6621640-ba67-43de-9f05-905f09a6dc8f ('Varixcenter'). The agent only
-- operates in this workspace; the workspace-aware TemplateManager resolves rows via
-- `workspace_id.is.null OR workspace_id.eq.{workspaceId}`, so scoping these rows to
-- the Varixcenter workspace keeps the catalog isolated (Regla 6 / agent scope) while
-- remaining fully resolvable by getTemplatesForIntents('varixcenter', workspaceId, ...).
--
-- Saludo (AMENDA D-12 — saludo NO hace doble triage; bienvenida + CTA directo):
--   intent='saludo' CORE: "¡Hola! 👋 Bienvenido a VarixCenter, donde tus várices son
--     cosa del pasado ✨"
--   intent='saludo' COMPLEMENTARIA: "¿Deseas agendar tu valoración?"
--   (El triage ciudad+tipo_venas se difiere al template `triage` §2 — sin cambios.)
--
-- Precios verbatim (D-06): valoración $100.000, sesión escleroterapia $95.000.
--
-- Catalog independence (anti-Pitfall 1, regresion cdc06d9): el agente NUNCA comparte
-- rows con otro agent_id; TEMPLATE_LOOKUP_AGENT_ID = VARIXCENTER_AGENT_ID = 'varixcenter'.
--
-- Idempotency: DELETE existing rows for agent_id='varixcenter' before INSERT.
-- Safe to re-run.
--
-- Rollback: DELETE FROM agent_templates WHERE agent_id = 'varixcenter';
--
-- Regla 5 (CLAUDE.md): Apply MANUALLY in production (Supabase de MorfX) BEFORE
-- pushing the agent code (Waves 1-6) that references these templates. Plan 10 =
-- SQL apply [BLOCKING], Wave 6 = code push. Si el push ocurre antes del apply,
-- el agente quedaría registrado pero
-- `templateManager.getTemplatesForIntents('varixcenter', ...)` retornaría empty Map
-- -> response-track emitiría fallback con `templates_not_found_in_catalog` ->
-- el cliente NO recibe respuesta del bot (Pitfall 7, degradación silenciosa).
--
-- Columns shape cloned verbatim from analog
-- 20260505220000_godentist_fb_ig_template_catalog.sql / 20260318100000_godentist_templates.sql:
--   id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s
--   priority enum: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'  (PLANTILLAS.md "COMP" == 'COMPLEMENTARIA')
-- ============================================================================

BEGIN;

-- Idempotent: clean slate
DELETE FROM agent_templates WHERE agent_id = 'varixcenter';

-- ============================================================================
-- §1 SALUDO (custom 2 rows — AMENDA D-12; NOT the 5 A-E options)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'saludo', 'primera_vez', 'CORE', 0, 'texto',
   E'¡Hola! 👋 Bienvenido a VarixCenter, donde tus várices son cosa del pasado ✨', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'saludo', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   E'¿Deseas agendar tu valoración?', 2);

-- ============================================================================
-- §2 TRIAGE (cuando piden precio sin haber dado tipo de venas)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'triage', 'primera_vez', 'CORE', 0, 'texto',
   E'Con gusto te cuento 😊 Depende de si tienes várices grandes o vasitos, ¿cuál es tu caso? Y cuéntame, ¿de qué ciudad nos escribes?', 0);

-- ============================================================================
-- §3 INFO POR TIPO DE VENAS (6 rows — 3 CORE + 3 COMPLEMENTARIA)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'info_vasitos', 'primera_vez', 'CORE', 0, 'texto',
   E'Para los vasitos el mejor tratamiento que existe es la escleroterapia 💉 Utilizamos un medicamento muy seguro y técnicas que eliminan esas venitas de la forma adecuada. El objetivo es mejorar la circulación de la zona y evitar que empeore con los años.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'info_vasitos_comp', 'primera_vez', 'COMPLEMENTARIA', 0, 'texto',
   E'Inicialmente se realiza una valoración: el Dr. te hace un escaneo venoso (examen de las venas internas) para determinar tu plan a seguir. La consulta especializada tiene un valor de $100.000 y cada sesión de escleroterapia $95.000 — el número de sesiones se define en la valoración.', 3),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'info_grandes', 'primera_vez', 'CORE', 0, 'texto',
   E'El objetivo de tratar las venas várices es mejorar la circulación de la zona afectada y evitar que empeore con los años. Inicialmente se realiza una consulta médica especializada: el Dr. te hace un escaneo venoso (se observan las venas internas) y determina el tratamiento exacto que requieres.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'info_grandes_comp', 'primera_vez', 'COMPLEMENTARIA', 0, 'texto',
   E'La valoración tiene un costo de $100.000 e incluye el escaneo venoso. Ese mismo día recibes tu plan de tratamiento con los costos, en físico.', 3),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'info_ambas', 'primera_vez', 'CORE', 0, 'texto',
   E'Tranquil@, es muy común tener los dos casos 😊 El tratamiento combina técnicas: para los vasitos usamos escleroterapia y para las várices grandes el Dr. determina el procedimiento exacto en la valoración con el escaneo venoso.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'info_ambas_comp', 'primera_vez', 'COMPLEMENTARIA', 0, 'texto',
   E'La valoración tiene un valor de $100.000 e incluye el escaneo venoso — ahí mismo sale tu plan de tratamiento completo con costos.', 3);

-- ============================================================================
-- §4 PRECIOS / INFORMACIONALES (12 rows)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'precio_valoracion', 'primera_vez', 'CORE', 0, 'texto',
   E'La consulta de valoración tiene un valor de $100.000 e incluye un escaneo venoso con equipo Eco Doppler, con el cual el Dr. te da tu diagnóstico y tu plan de tratamiento exacto ese mismo día.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'precio_tratamiento', 'primera_vez', 'CORE', 0, 'texto',
   E'El valor del tratamiento se define según lo que el Dr. encuentre en la valoración (depende de la cantidad de sesiones que requiera cada pierna). Lo que sí te puedo adelantar: la sesión de escleroterapia tiene un valor de $95.000 y la valoración $100.000 (incluye el escaneo venoso).', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'precio_cirugia', 'primera_vez', 'CORE', 0, 'texto',
   E'Manejamos procedimientos como la ecorreabsorción guiada por Doppler y cirugía endovascular para várices grandes — son nuestro tratamiento insignia. El valor exacto se determina en la valoración, porque depende de lo que el Dr. encuentre en el escaneo venoso.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'info_laser', 'primera_vez', 'CORE', 0, 'texto',
   E'En el momento no manejamos láser para vasitos, ya que no se puede usar en todos los casos. Usamos láser endovascular, que es diferente: trata la vena interna que está generando las várices grandes. El Dr. te indica en la valoración si es tu caso.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'info_examen_doppler', 'primera_vez', 'CORE', 0, 'texto',
   E'La valoración incluye un escaneo venoso con equipo Eco Doppler, con el que el Dr. da tu diagnóstico. Si lo que necesitas son las imágenes impresas y un reporte escrito (por ejemplo para otro médico), eso es una cita de Doppler venoso aparte — te comunico con el equipo para agendarla.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'info_medias', 'primera_vez', 'CORE', 0, 'texto',
   E'Para iniciar el tratamiento necesitas una media de compresión venosa. Sus características exactas (compresión, tipo) te las indicamos en la valoración, y aquí mismo las manejamos para tu comodidad.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'ubicacion', 'primera_vez', 'CORE', 0, 'texto',
   E'Nuestra dirección es: Cra 34 # 52-125, segundo piso, Bucaramanga — VarixCenter (Cabecera).', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'horarios', 'primera_vez', 'CORE', 0, 'texto',
   E'Nuestros horarios de citas son:\n• Lunes a viernes: 8:00am a 11:30am y 2:30pm a 3:30pm\n• Sábados: 8:00am a 12:00pm\n📍 Cra 34 # 52-125, segundo piso, Bucaramanga.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'financiacion', 'primera_vez', 'CORE', 0, 'texto',
   E'Sabemos que tu bienestar no tiene precio y queremos que recuperes la salud de tus piernas de manera asequible 💙 Ofrecemos financiamiento con Addi y Sistecrédito: la simulación del crédito se hace directamente en nuestras instalaciones y en pocos minutos tienes respuesta, para iniciar tu tratamiento de inmediato.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'financiacion_opcional', 'primera_vez', 'OPCIONAL', 0, 'texto',
   E'Recuerda que tenemos opciones de financiamiento con Addi y Sistecrédito por si deseas iniciar tu tratamiento de una vez 😊', 5),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'seguros_eps', 'primera_vez', 'CORE', 0, 'texto',
   E'Somos un centro médico totalmente particular — no manejamos EPS ni prepagadas. Pero contamos con opciones de financiación con Addi y Sistecrédito para que puedas iniciar tu tratamiento.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'fuera_de_ciudad', 'primera_vez', 'COMPLEMENTARIA', 0, 'texto',
   E'Por el momento únicamente tenemos sede en Bucaramanga (Cra 34 # 52-125, segundo piso). Muchos de nuestros pacientes viajan para su valoración — si lo deseas, con gusto te agendamos para la fecha en que puedas venir 😊', 3);

-- ============================================================================
-- §5 SÍNTOMAS / MÉDICAS (3 rows)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'no_diagnostico', 'primera_vez', 'CORE', 0, 'texto',
   E'Gracias por contarme tu caso 🙏 Para darte un diagnóstico exacto y seguro, el Dr. necesita revisarte en la valoración con el escaneo venoso — por fotos o descripción no es posible determinar el tratamiento. La valoración tiene un valor de $100.000 e incluye el examen. ¿Te gustaría agendarla?', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'preguntas_medicas', 'primera_vez', 'CORE', 0, 'texto',
   E'Esa es una muy buena pregunta, y la respuesta depende de tu caso particular — eso lo determina el Dr. directamente en la valoración. Ahí mismo resuelves todas tus dudas con el especialista. ¿Te gustaría agendar?', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'pedir_texto', 'primera_vez', 'CORE', 0, 'texto',
   E'¿Me lo puedes escribir por mensaje de texto, por favor? 🙏 Así te ayudo más rápido.', 0);

-- ============================================================================
-- §6 FLUJO DE AGENDAMIENTO (9 rows)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'pedir_datos', 'primera_vez', 'CORE', 0, 'texto',
   E'¡Excelente decisión! 😊 Para agendar tu valoración necesito estos datos:\n• Nombre completo\n• Número de cédula\n• Número de teléfono de contacto', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'pedir_datos_parcial', 'primera_vez', 'CORE', 0, 'texto',
   E'Para completar tu agendamiento me falta: {{campos_faltantes}}.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'pedir_fecha', 'primera_vez', 'CORE', 0, 'texto',
   E'¡Perfecto, {{nombre}}! ¿Para qué día te gustaría tu valoración? Y cuéntame si prefieres en la mañana o en la tarde 😊', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'mostrar_disponibilidad', 'primera_vez', 'CORE', 0, 'texto',
   E'Para el {{fecha}} tenemos disponibilidad:\n\n🌅 Mañana:\n{{slots_manana}}\n\n🌆 Tarde:\n{{slots_tarde}}\n\n¿Cuál horario te queda mejor?', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'mostrar_disponibilidad_jornada', 'primera_vez', 'CORE', 0, 'texto',
   E'Para el {{fecha}} en la {{jornada}} tenemos:\n\n{{slots}}\n\n¿Cuál horario te queda mejor?', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'sin_disponibilidad', 'primera_vez', 'CORE', 0, 'texto',
   E'Para el {{fecha}} ya no tenemos cupos disponibles 😔 ¿Quieres que miremos otro día?', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'confirmar_cita', 'primera_vez', 'CORE', 0, 'texto',
   E'Perfecto, confirmo tu cita de valoración:\n• Nombre: {{nombre}}\n• Cédula: {{cedula}}\n• Teléfono: {{telefono}}\n• Fecha: {{fecha}}\n• Hora: {{horario_seleccionado}}\n¿Todo correcto?', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'cita_agendada', 'primera_vez', 'CORE', 0, 'texto',
   E'¡Listo, {{nombre}}! 🎉 Tu cita de valoración quedó agendada para el {{fecha}} a las {{horario_seleccionado}} en la Cra 34 # 52-125, piso 2, Cabecera — VarixCenter Centro Médico Flebológico.\n\nRECUERDA:\n• Traer tu propio short tipo pijama\n• Agradecemos pagos en efectivo o con tarjeta\n\n¡Te esperamos! 🤩', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'invitar_agendar', 'primera_vez', 'CORE', 0, 'texto',
   E'¿Te gustaría agendar tu valoración? El Dr. te da tu diagnóstico exacto y tu plan de tratamiento ese mismo día 😊', 0);

-- ============================================================================
-- §7 ESCAPE / CONTROL (8 rows)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'handoff', 'primera_vez', 'CORE', 0, 'texto',
   E'Te comunico con nuestro equipo para atenderte personalmente. En un momento te contactan 🙌', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'paciente_antiguo', 'primera_vez', 'CORE', 0, 'texto',
   E'¡Qué gusto saludarte de nuevo! 💙 Para temas de tu tratamiento, controles o seguimiento te comunico con nuestro equipo — en un momento te contactan 🙌', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'reagendamiento', 'primera_vez', 'CORE', 0, 'texto',
   E'Claro que sí, para reagendar tu cita te comunico con nuestro equipo. Ellos te ayudan con la nueva fecha 🙌', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'cancelar_cita', 'primera_vez', 'CORE', 0, 'texto',
   E'Entendido, te comunico con nuestro equipo para gestionar la cancelación.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'queja', 'primera_vez', 'CORE', 0, 'texto',
   E'Lamento mucho que hayas tenido esa experiencia 🙏 Te comunico de inmediato con nuestro equipo para atenderte personalmente.', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'no_interesa', 'primera_vez', 'CORE', 0, 'texto',
   E'Entendido, sin problema 😊 Quedamos a tu disposición cuando lo necesites. ¡Que tus piernas estén siempre sanas! 💙', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'despedida', 'primera_vez', 'CORE', 0, 'texto',
   E'¡Gracias por escribirnos! Quedamos atentos a cualquier inquietud 💙', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'english_response', 'primera_vez', 'CORE', 0, 'texto',
   E'Hi! Thank you for reaching out to VarixCenter. We''d love to help you. Could you write in Spanish so we can assist you better? Or if you prefer, we can connect you with an advisor 😊', 0);

-- ============================================================================
-- §8 FOLLOW-UPS (retomas por timer — 5 rows)
-- ============================================================================
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'retoma_post_info', 'primera_vez', 'CORE', 0, 'texto',
   E'¿Te gustaría agendar tu valoración? Recuerda que incluye el escaneo venoso y sales con tu plan de tratamiento exacto 😊', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'retoma_datos', 'primera_vez', 'CORE', 0, 'texto',
   E'Para completar tu cita me falta: {{campos_faltantes}}. ¿Me los compartes? 😊', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'retoma_fecha', 'primera_vez', 'CORE', 0, 'texto',
   E'¿Para qué día te gustaría tu valoración? 😊', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'retoma_horario', 'primera_vez', 'CORE', 0, 'texto',
   E'¿Te queda bien alguno de los horarios disponibles?', 0),
  (gen_random_uuid(), 'varixcenter', 'c6621640-ba67-43de-9f05-905f09a6dc8f', 'retoma_confirmacion', 'primera_vez', 'CORE', 0, 'texto',
   E'¿Confirmamos tu cita con los datos que me compartiste? 😊', 0);

-- ============================================================================
-- Sanity check 1: row count post-INSERT must equal 46
-- ============================================================================
DO $$
DECLARE
  vx_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO vx_count
  FROM agent_templates
  WHERE agent_id = 'varixcenter';

  IF vx_count != 46 THEN
    RAISE EXCEPTION 'Varixcenter template count mismatch: expected 46, got %', vx_count;
  END IF;

  RAISE NOTICE 'Migration OK: % varixcenter templates inserted', vx_count;
END $$;

-- ============================================================================
-- Sanity check 2: saludo AMENDA D-12 (CORE bienvenida + COMPLEMENTARIA CTA),
-- NOT the discarded A-E options (which contained "28 años" / doble triage).
-- ============================================================================
DO $$
DECLARE
  saludo_core_ok BOOLEAN;
  saludo_comp_ok BOOLEAN;
BEGIN
  SELECT bool_or(content LIKE '%cosa del pasado%')
  INTO saludo_core_ok
  FROM agent_templates
  WHERE agent_id = 'varixcenter' AND intent = 'saludo' AND priority = 'CORE';

  SELECT bool_or(content LIKE '%agendar tu valoración%')
  INTO saludo_comp_ok
  FROM agent_templates
  WHERE agent_id = 'varixcenter' AND intent = 'saludo' AND priority = 'COMPLEMENTARIA';

  IF NOT saludo_core_ok THEN
    RAISE EXCEPTION 'Saludo CORE for varixcenter does not match AMENDA D-12 (missing "cosa del pasado")';
  END IF;
  IF NOT saludo_comp_ok THEN
    RAISE EXCEPTION 'Saludo COMPLEMENTARIA for varixcenter does not match AMENDA D-12 (missing CTA)';
  END IF;

  RAISE NOTICE 'AMENDA D-12 saludo OK: CORE bienvenida + COMPLEMENTARIA CTA present';
END $$;

-- ============================================================================
-- Sanity check 3: precios verbatim D-06 ($100.000 valoración + $95.000 sesión)
-- ============================================================================
DO $$
DECLARE
  has_100k BOOLEAN;
  has_95k BOOLEAN;
BEGIN
  SELECT bool_or(content LIKE '%$100.000%') INTO has_100k
  FROM agent_templates WHERE agent_id = 'varixcenter';
  SELECT bool_or(content LIKE '%$95.000%') INTO has_95k
  FROM agent_templates WHERE agent_id = 'varixcenter';

  IF NOT has_100k OR NOT has_95k THEN
    RAISE EXCEPTION 'D-06 precios missing: $100.000=% $95.000=%', has_100k, has_95k;
  END IF;

  RAISE NOTICE 'D-06 precios OK: $100.000 valoración + $95.000 sesión present';
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Verification query (run manually post-apply):
-- SELECT COUNT(*) FROM agent_templates WHERE agent_id='varixcenter'; -- esperado 46
-- SELECT intent, priority FROM agent_templates WHERE agent_id='varixcenter' ORDER BY intent, priority;
-- ----------------------------------------------------------------------------
