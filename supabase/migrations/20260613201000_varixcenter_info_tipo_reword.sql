-- ============================================================================
-- Varixcenter — Reword info_vasitos / info_grandes CORE (2 rutas tras "¿grandes o vasitos?")
-- Tuning 2026-06-13 (wording del cliente). Aplicado en vivo via REST; fuente de verdad.
--
-- Acompaña al cambio en comprehension-prompt.ts: la respuesta del cliente al OPC
-- "¿Tienes várices grandes o vasitos?" se clasifica como info_tratamiento + tipo_venas,
-- de modo que response-track (resolveTreatmentTemplates) envíe info_<tipo>.
-- ============================================================================

BEGIN;

UPDATE agent_templates
  SET content = E'El mejor tratamiento que existe es la escleroterapia: utilizamos un medicamento muy seguro y unas técnicas que hacen que dichas venas se eliminen de la forma adecuada. El objetivo de tratar dichas venas es mejorar la circulación de la zona afectada y evitar que empeore al pasar los años.'
  WHERE agent_id='varixcenter' AND intent='info_vasitos' AND priority='CORE';

UPDATE agent_templates
  SET content = E'El objetivo de tratar las venas várices es mejorar la circulación de la zona afectada y evitar que empeore al pasar los años; para conocer el tratamiento indicado para mejorar la circulación de tus venas necesitamos determinar tu diagnóstico.'
  WHERE agent_id='varixcenter' AND intent='info_grandes' AND priority='CORE';

COMMIT;
