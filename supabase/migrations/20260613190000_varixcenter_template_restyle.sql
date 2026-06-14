-- ============================================================================
-- Varixcenter — Template Restyle (standalone agent-varixcenter, tuning 2026-06-13)
--
-- Pase de estilo: menos emojis / tono mas profesional (E) + nuevo wording de
-- pedir_datos sin emoji (D). Aplicado en vivo a prod via REST PATCH el 2026-06-13;
-- este archivo es la fuente de verdad en el repo (idempotente, re-ejecutable).
--
-- NO toca: saludo (dictado por el cliente, conserva la estetica), confirmar_cita,
-- ubicacion, info_* informativos ya limpios, precio_*, preguntas_medicas,
-- pedir_datos_parcial, retoma_horario, seguros_eps, cancelar_cita,
-- mostrar_disponibilidad_jornada.
--
-- Emojis conservados (tasteful): saludo CORE, cita_agendada (pin + corazon), horarios (pin).
--
-- Rollback: re-aplicar la migracion seed previa (20260611165220_..._template_catalog.sql).
-- ============================================================================

BEGIN;

UPDATE agent_templates SET content = E'Claro que sí, para agendar tu valoración necesito estos datos:\n• Nombre completo\n• Número de cédula\n• Número de teléfono de contacto'
  WHERE agent_id = 'varixcenter' AND intent = 'pedir_datos' AND priority = 'CORE';
UPDATE agent_templates SET content = E'¡Listo, {{nombre}}! Tu cita de valoración quedó agendada para el {{fecha}} a las {{horario_seleccionado}}.\n📍 Cra 34 # 52-125, piso 2 (Cabecera) — VarixCenter, Centro Médico Flebológico.\n\nPara tu cita ten en cuenta:\n• Trae un short tipo pijama\n• Recibimos pagos en efectivo o con tarjeta\n\n¡Te esperamos! 💙'
  WHERE agent_id = 'varixcenter' AND intent = 'cita_agendada' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Gracias por escribirnos. Quedamos atentos a cualquier inquietud.'
  WHERE agent_id = 'varixcenter' AND intent = 'despedida' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Hi! Thank you for reaching out to VarixCenter. We''d love to help you. Could you please write in Spanish so we can assist you better? If you prefer, we can also connect you with one of our advisors.'
  WHERE agent_id = 'varixcenter' AND intent = 'english_response' AND priority = 'CORE';
UPDATE agent_templates SET content = E'En VarixCenter queremos que recuperes la salud de tus piernas de forma accesible. Contamos con financiación a través de Addi y Sistecrédito: la simulación del crédito se realiza en nuestras instalaciones y en pocos minutos tienes respuesta para iniciar tu tratamiento.'
  WHERE agent_id = 'varixcenter' AND intent = 'financiacion' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Recuerda que contamos con opciones de financiación con Addi y Sistecrédito, por si deseas iniciar tu tratamiento de una vez.'
  WHERE agent_id = 'varixcenter' AND intent = 'financiacion_opcional' AND priority = 'OPCIONAL';
UPDATE agent_templates SET content = E'Por el momento contamos únicamente con sede en Bucaramanga (Cra 34 # 52-125, segundo piso). Muchos de nuestros pacientes viajan para su valoración; si lo deseas, con gusto te agendamos para la fecha en la que puedas venir.'
  WHERE agent_id = 'varixcenter' AND intent = 'fuera_de_ciudad' AND priority = 'COMPLEMENTARIA';
UPDATE agent_templates SET content = E'Te comunico con nuestro equipo para atenderte de forma personalizada. En un momento te contactan.'
  WHERE agent_id = 'varixcenter' AND intent = 'handoff' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Nuestros horarios de citas son:\n• Lunes a viernes: 8:00 a.m. a 11:30 a.m. y 2:30 p.m. a 3:30 p.m.\n• Sábados: 8:00 a.m. a 12:00 m.\n📍 Cra 34 # 52-125, segundo piso, Bucaramanga.'
  WHERE agent_id = 'varixcenter' AND intent = 'horarios' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Es muy común tener ambos casos. El tratamiento combina técnicas: para los vasitos usamos escleroterapia y, para las várices grandes, el Dr. determina el procedimiento exacto en la valoración con el escaneo venoso.'
  WHERE agent_id = 'varixcenter' AND intent = 'info_ambas' AND priority = 'CORE';
UPDATE agent_templates SET content = E'La valoración tiene un valor de $100.000 e incluye el escaneo venoso; ahí mismo se define tu plan de tratamiento completo con costos.'
  WHERE agent_id = 'varixcenter' AND intent = 'info_ambas_comp' AND priority = 'COMPLEMENTARIA';
UPDATE agent_templates SET content = E'Para los vasitos, el tratamiento más adecuado es la escleroterapia: utilizamos un medicamento muy seguro y técnicas que eliminan esas venitas de la forma correcta. El objetivo es mejorar la circulación de la zona y evitar que empeore con los años.'
  WHERE agent_id = 'varixcenter' AND intent = 'info_vasitos' AND priority = 'CORE';
UPDATE agent_templates SET content = E'¿Te gustaría agendar tu valoración? El Dr. te entrega tu diagnóstico exacto y tu plan de tratamiento ese mismo día.'
  WHERE agent_id = 'varixcenter' AND intent = 'invitar_agendar' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Para el {{fecha}} tenemos disponibilidad:\n\nMañana:\n{{slots_manana}}\n\nTarde:\n{{slots_tarde}}\n\n¿Cuál horario te queda mejor?'
  WHERE agent_id = 'varixcenter' AND intent = 'mostrar_disponibilidad' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Gracias por contarme tu caso. Para darte un diagnóstico exacto y seguro, el Dr. necesita revisarte en la valoración con el escaneo venoso; por fotos o descripción no es posible determinar el tratamiento. La valoración tiene un valor de $100.000 e incluye el examen. ¿Te gustaría agendarla?'
  WHERE agent_id = 'varixcenter' AND intent = 'no_diagnostico' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Entendido, sin problema. Quedamos a tu disposición cuando lo necesites. ¡Que tus piernas estén siempre sanas!'
  WHERE agent_id = 'varixcenter' AND intent = 'no_interesa' AND priority = 'CORE';
UPDATE agent_templates SET content = E'¡Qué gusto saludarte de nuevo! Para temas de tu tratamiento, controles o seguimiento te comunico con nuestro equipo; en un momento te contactan.'
  WHERE agent_id = 'varixcenter' AND intent = 'paciente_antiguo' AND priority = 'CORE';
UPDATE agent_templates SET content = E'¡Perfecto, {{nombre}}! ¿Para qué día te gustaría tu valoración? Cuéntame también si prefieres en la mañana o en la tarde.'
  WHERE agent_id = 'varixcenter' AND intent = 'pedir_fecha' AND priority = 'CORE';
UPDATE agent_templates SET content = E'¿Me lo puedes escribir por mensaje de texto, por favor? Así te ayudo más rápido.'
  WHERE agent_id = 'varixcenter' AND intent = 'pedir_texto' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Lamento mucho que hayas tenido esa experiencia. Te comunico de inmediato con nuestro equipo para atenderte de forma personalizada.'
  WHERE agent_id = 'varixcenter' AND intent = 'queja' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Claro que sí. Para reagendar tu cita te comunico con nuestro equipo; ellos te ayudan con la nueva fecha.'
  WHERE agent_id = 'varixcenter' AND intent = 'reagendamiento' AND priority = 'CORE';
UPDATE agent_templates SET content = E'¿Confirmamos tu cita con los datos que me compartiste?'
  WHERE agent_id = 'varixcenter' AND intent = 'retoma_confirmacion' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Para completar tu cita me falta: {{campos_faltantes}}. ¿Me los compartes?'
  WHERE agent_id = 'varixcenter' AND intent = 'retoma_datos' AND priority = 'CORE';
UPDATE agent_templates SET content = E'¿Para qué día te gustaría tu valoración?'
  WHERE agent_id = 'varixcenter' AND intent = 'retoma_fecha' AND priority = 'CORE';
UPDATE agent_templates SET content = E'¿Te gustaría agendar tu valoración? Recuerda que incluye el escaneo venoso y sales con tu plan de tratamiento exacto.'
  WHERE agent_id = 'varixcenter' AND intent = 'retoma_post_info' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Para el {{fecha}} ya no tenemos cupos disponibles. ¿Quieres que miremos otro día?'
  WHERE agent_id = 'varixcenter' AND intent = 'sin_disponibilidad' AND priority = 'CORE';
UPDATE agent_templates SET content = E'Con gusto te cuento. ¿Tus várices son grandes o son vasitos? Y cuéntame, ¿de qué ciudad nos escribes?'
  WHERE agent_id = 'varixcenter' AND intent = 'triage' AND priority = 'CORE';

-- Sanity: pedir_datos sin emoji y con el wording nuevo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id='varixcenter' AND intent='pedir_datos'
      AND content LIKE 'Claro que sí, para agendar%'
  ) THEN
    RAISE EXCEPTION 'pedir_datos restyle no aplicado';
  END IF;
  RAISE NOTICE 'Varixcenter restyle OK';
END $$;

COMMIT;
