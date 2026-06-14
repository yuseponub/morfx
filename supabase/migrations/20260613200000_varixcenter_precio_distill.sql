-- ============================================================================
-- Varixcenter — Distill precio/triage (tuning 2026-06-13, decisiones usuario Q1+Q2)
--
-- Aplicado en vivo a prod via REST el 2026-06-13; este archivo es la fuente de verdad
-- en el repo (idempotente, re-ejecutable).
--
-- Q1 "Unificar": el template `triage` se ELIMINA. precio_tratamiento/info_tratamiento
--   sin tipo_venas conocido ahora responden con `precio_valoracion` (manejado en
--   response-track.ts resolveTreatmentTemplates). La ubicación ya va en el saludo.
-- Q2 "Quitar TODO precio repetido": el $100.000 vive SOLO en precio_valoracion; el
--   $95.000 (sesión escleroterapia) vive SOLO en info_vasitos_comp.
--
-- precio_valoracion pasa de 1 fila (CORE) a 3 (CORE/COMP/OPC):
--   CORE: "La consulta de valoración tiene un valor de $100.000. En esta el Doctor te da tu diagnóstico."
--   COMP: "Incluye gratis un escaneo venoso con equipo Eco Doppler para determinar el mejor plan de tratamiento para ti."
--   OPC : "¿Tienes várices grandes o vasitos?"
--
-- Rollback: re-aplicar 20260611165220_..._template_catalog.sql + restyle.
-- ============================================================================

BEGIN;

-- 1) precio_valoracion: CORE reescrito + COMP/OPC nuevos (idempotente)
UPDATE agent_templates
  SET content = E'La consulta de valoración tiene un valor de $100.000. En esta los Doctores te examinarán.',
      orden = 0, delay_s = 0
  WHERE agent_id='varixcenter' AND intent='precio_valoracion' AND priority='CORE';

DELETE FROM agent_templates
  WHERE agent_id='varixcenter' AND intent='precio_valoracion' AND priority IN ('COMPLEMENTARIA','OPCIONAL');

INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(),'varixcenter','c6621640-ba67-43de-9f05-905f09a6dc8f','precio_valoracion','primera_vez','COMPLEMENTARIA',1,'texto',
   E'Este examen incluye un escaneo con el equipo Eco-Doppler para revisar el sistema venoso interno, pudiendo así determinar tu diagnóstico y el mejor plan de tratamiento para ti.',3),
  (gen_random_uuid(),'varixcenter','c6621640-ba67-43de-9f05-905f09a6dc8f','precio_valoracion','primera_vez','OPCIONAL',2,'texto',
   E'¿Tienes várices grandes o vasitos?',3);

-- 2) Dedup precio en plantillas de tratamiento
UPDATE agent_templates SET content = E'Cada sesión de escleroterapia tiene un valor de $95.000; el número de sesiones que necesitas lo define el Dr. en la valoración, según lo que vea en el escaneo venoso.'
  WHERE agent_id='varixcenter' AND intent='info_vasitos_comp' AND priority='COMPLEMENTARIA';
UPDATE agent_templates SET content = E'Ese mismo día de la valoración recibes, en físico, tu plan de tratamiento con los costos.'
  WHERE agent_id='varixcenter' AND intent='info_grandes_comp' AND priority='COMPLEMENTARIA';
UPDATE agent_templates SET content = E'En la valoración el Dr. define tu plan de tratamiento completo con los costos, según lo que encuentre en el escaneo venoso.'
  WHERE agent_id='varixcenter' AND intent='info_ambas_comp' AND priority='COMPLEMENTARIA';
UPDATE agent_templates SET content = E'Gracias por contarme tu caso. Para darte un diagnóstico exacto y seguro, el Dr. necesita revisarte en la valoración con el escaneo venoso; por fotos o descripción no es posible determinar el tratamiento. ¿Te gustaría agendar tu valoración?'
  WHERE agent_id='varixcenter' AND intent='no_diagnostico' AND priority='CORE';

-- 3) Eliminar plantillas muertas tras el cambio de response-track
DELETE FROM agent_templates WHERE agent_id='varixcenter' AND intent IN ('triage','precio_tratamiento');

-- Sanity: $100.000 solo en precio_valoracion
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM agent_templates
    WHERE agent_id='varixcenter' AND content LIKE '%$100.000%' AND intent <> 'precio_valoracion';
  IF n > 0 THEN RAISE EXCEPTION '$100.000 repetido fuera de precio_valoracion en % plantillas', n; END IF;
  IF EXISTS (SELECT 1 FROM agent_templates WHERE agent_id='varixcenter' AND intent='triage') THEN
    RAISE EXCEPTION 'triage no eliminado'; END IF;
  RAISE NOTICE 'Distill precio/triage OK';
END $$;

COMMIT;
