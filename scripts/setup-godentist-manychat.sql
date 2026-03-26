-- ============================================================
-- SETUP: ManyChat para GoDentist Valoraciones
-- ============================================================
-- Workspace ID: f0241182-f79b-4bc6-b0ed-b5f6eb20c514
--
-- Este script configura:
--   1. manychat_api_key (para enviar mensajes via ManyChat API)
--   2. manychat_webhook_secret (para validar webhooks entrantes)
--
-- IMPORTANTE: Cambiar 'godentist-mc-secret-CAMBIAR' por un secret seguro
-- antes de ejecutar. Ejemplo: openssl rand -hex 16
-- ============================================================

-- 1. Agregar manychat_api_key y manychat_webhook_secret al workspace
UPDATE workspaces
SET settings = COALESCE(settings, '{}'::jsonb)
  || '{"manychat_api_key": "1487106984933226:8531fb4f876f81d5eb7d5733cb20279c"}'::jsonb
  || '{"manychat_webhook_secret": "godentist-mc-secret-CAMBIAR"}'::jsonb
WHERE id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';

-- 2. Verificar configuracion
SELECT id, name,
  settings->>'manychat_api_key' as mc_key,
  settings->>'manychat_webhook_secret' as mc_secret
FROM workspaces
WHERE id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514';

-- ============================================================
-- INSTRUCCIONES SETUP MANYCHAT (para el usuario)
-- ============================================================
--
-- 1. Ir a ManyChat > Settings > General > API Key
--    - Ya configurada: 1487106984933226:8531fb4f876f81d5eb7d5733cb20279c
--
-- 2. Ir a ManyChat > Automation > Flows
--
-- 3. Crear un Flow con trigger "Default Reply" (o el trigger deseado)
--    - "Default Reply" captura todos los mensajes que no matchean otro flow
--
-- 4. Agregar step "External Request" (POST)
--
--    URL:
--      https://morfx.vercel.app/api/webhooks/manychat?workspace=f0241182-f79b-4bc6-b0ed-b5f6eb20c514&secret=godentist-mc-secret-CAMBIAR
--
--    Headers:
--      Content-Type: application/json
--
--    Body (JSON):
--      {
--        "subscriber_id": "{{subscriber_id}}",
--        "first_name": "{{first_name}}",
--        "last_name": "{{last_name}}",
--        "name": "{{full_name}}",
--        "message_text": "{{last_input_text}}",
--        "channel": "{{channel}}"
--      }
--
-- 5. Guardar y activar el Flow
--
-- 6. Probar enviando un mensaje a la pagina de Facebook de GoDentist
--
-- NOTA: El secret en la URL debe coincidir con el manychat_webhook_secret
-- configurado arriba. Cambiar 'godentist-mc-secret-CAMBIAR' por el mismo
-- valor en ambos lugares.
-- ============================================================
