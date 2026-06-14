-- ============================================================================
-- Varixcenter — info_<tipo> COMP = pregunta de agendar (2026-06-13, petición usuario)
-- Aplicado en vivo via REST; fuente de verdad.
--
-- Reemplaza el contenido del COMP de info_vasitos / info_grandes por la invitación a
-- agendar. (El $95.000 que vivía en info_vasitos_comp se retira del catálogo por decisión
-- del usuario — todo se define en la valoración.)
--
-- Acompaña al cambio en transitions.ts: cuando se conoce tipo_venas y se envía info_<tipo>
-- + este COMP (CTA inline), NO se arma el timer L2 (evita invitar_agendar redundante).
-- ============================================================================

BEGIN;

UPDATE agent_templates SET content = E'¿Deseas agendar tu cita de valoración?'
  WHERE agent_id='varixcenter' AND intent='info_vasitos_comp' AND priority='COMPLEMENTARIA';
UPDATE agent_templates SET content = E'¿Deseas agendar tu cita de valoración?'
  WHERE agent_id='varixcenter' AND intent='info_grandes_comp' AND priority='COMPLEMENTARIA';

COMMIT;
