-- Fix tiempo_entrega + confirmacion_orden_same_day templates:
-- 1. Add ✅ after tiempo_estimado in same_day templates
-- 2. "comunicara" → "comunicaria"

-- tiempo_entrega_same_day
UPDATE agent_templates
SET content = 'Tu pedido estaria llegando a {{ciudad}} {{tiempo_estimado}}✅ Nuestro domiciliario se comunicaria contigo para la entrega'
WHERE agent_id = 'somnio-sales-v3'
  AND intent = 'tiempo_entrega_same_day'
  AND priority = 'CORE';

-- confirmacion_orden_same_day CORE
UPDATE agent_templates
SET content = 'Perfecto! Tu pedido llega {{tiempo_estimado}}✅ Nuestro domiciliario se comunicaria contigo para la entrega'
WHERE agent_id = 'somnio-sales-v3'
  AND intent = 'confirmacion_orden_same_day'
  AND priority = 'CORE';
