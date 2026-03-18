-- ============================================================================
-- Templates: tiempo_entrega responses + personalized confirmacion_orden
-- Replaces generic confirmacion_orden with zone-aware variants.
-- ============================================================================

-- 1. Delete existing generic confirmacion_orden templates
DELETE FROM agent_templates
WHERE agent_id = 'somnio-sales-v3'
  AND intent = 'confirmacion_orden';

-- 2. Insert tiempo_entrega templates (5 variants)
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  -- tiempo_entrega_sin_ciudad: ask for city
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_sin_ciudad', 'primera_vez', 'CORE', 0, 'texto',
   'En que municipio te encuentras? El tiempo de entrega depende de tu ubicacion', 0),

  -- tiempo_entrega_same_day: dynamic via {{ciudad}} and {{tiempo_estimado}}
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_same_day', 'primera_vez', 'CORE', 0, 'texto',
   'Tu pedido estaria llegando a {{ciudad}} {{tiempo_estimado}} Nuestro domiciliario se comunicara contigo para la entrega', 0),

  -- tiempo_entrega_next_day
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_next_day', 'primera_vez', 'CORE', 0, 'texto',
   'Tu pedido estaria llegando a {{ciudad}} al dia siguiente de ser despachado', 0),

  -- tiempo_entrega_1_3_days
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_1_3_days', 'primera_vez', 'CORE', 0, 'texto',
   'Tu pedido estaria llegando a {{ciudad}} en 1-3 dias habiles', 0),

  -- tiempo_entrega_2_4_days
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'tiempo_entrega_2_4_days', 'primera_vez', 'CORE', 0, 'texto',
   'Tu pedido estaria llegando a {{ciudad}} en 2-4 dias habiles', 0);

-- 3. Insert personalized confirmacion_orden templates (4 rows: 2 variants x 2 priorities)
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  -- confirmacion_orden_same_day: CORE (domiciliario propio, no tracking guide)
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'confirmacion_orden_same_day', 'primera_vez', 'CORE', 0, 'texto',
   'Perfecto! Tu pedido llega {{tiempo_estimado}} Nuestro domiciliario se comunicara contigo para la entrega', 0),

  -- confirmacion_orden_same_day: COMPLEMENTARIA
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'confirmacion_orden_same_day', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   'Recuerda tener el efectivo listo el dia que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejarselo a alguien para que lo reciba', 3),

  -- confirmacion_orden_transportadora: CORE (mentions tracking guide)
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'confirmacion_orden_transportadora', 'primera_vez', 'CORE', 0, 'texto',
   'Perfecto! Tu pedido estaria llegando en {{tiempo_estimado}} Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto', 0),

  -- confirmacion_orden_transportadora: COMPLEMENTARIA
  (gen_random_uuid(), 'somnio-sales-v3', NULL, 'confirmacion_orden_transportadora', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto',
   'Recuerda tener el efectivo listo el dia que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejarselo a alguien para que lo reciba', 3);
