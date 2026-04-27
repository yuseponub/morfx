-- =============================================================================
-- agent-lifecycle-router — Add activeOrderStageRaw + activeOrderPipeline facts
-- (post-rollout follow-up, 2026-04-27)
--
-- Adds 2 new entries to routing_facts_catalog so the admin form picker shows
-- them and the engine validates rules referencing them.
--
-- Idempotent via ON CONFLICT (name) DO UPDATE.
-- =============================================================================

INSERT INTO routing_facts_catalog (name, return_type, description, examples, valid_in_rule_types) VALUES
  (
    'activeOrderStageRaw',
    'string',
    'Nombre literal del stage del pedido activo del contacto (pipeline_stages.name, ej: CONFIRMADO, REPARTO, ENTREGADO). Usar cuando se necesita filtro fino por stage especifico (vs activeOrderStage que devuelve canonical kind preparation/transit/delivered).',
    '[{"value":"CONFIRMADO","when":"pedido en stage CONFIRMADO de Ventas Somnio"},{"value":"REPARTO","when":"carrier en reparto"},{"value":null,"when":"sin pedido activo"}]'::jsonb,
    ARRAY['lifecycle_classifier','agent_router']
  ),
  (
    'activeOrderPipeline',
    'string',
    'Nombre literal del pipeline del pedido activo del contacto (pipelines.name, ej: Logistica, Ventas Somnio Standard, ENVIOS SOMNIO). Combinable con activeOrderStage/activeOrderStageRaw para reglas tipo "stage X dentro del pipeline Y".',
    '[{"value":"Logistica","when":"pedido en pipeline de logistica"},{"value":"Ventas Somnio Standard","when":"pedido en pipeline de ventas"},{"value":null,"when":"sin pedido activo"}]'::jsonb,
    ARRAY['lifecycle_classifier','agent_router']
  )
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  examples = EXCLUDED.examples,
  valid_in_rule_types = EXCLUDED.valid_in_rule_types;
