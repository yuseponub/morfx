-- ============================================================================
-- Recompra — Hotfix smoke test 2026-04-23
-- ============================================================================
-- Phase: somnio-recompra-template-catalog (standalone)
-- Origen: smoke test prod post-deploy revelo 2 issues:
--   1. saludo orden=1 (imagen ELIXIR) retorna HTTP 400 — URL Supabase quick-replies
--      esta roto. WhatsApp falla con "Media upload error". sales-v3 usa URL
--      Shopify CDN que retorna 200 OK — usar la misma.
--   2. preguntar_direccion_recompra prefija con `{{nombre_saludo}} 😊\n\n` lo que
--      re-saluda al cliente en turno 1 despues de que saludo orden=0 ya saludo
--      en turno 0. Remover prefix.
--
-- Estos dos templates YA existian en prod (no fueron creados por esta fase) —
-- esta fase solo los expuso al pasar TEMPLATE_LOOKUP_AGENT_ID a recompra-v1.
-- El redesign de scope decidio "no tocar lo que ya existe" pero el smoke test
-- mostro que ambos tenian bugs latentes. Hotfix post-deploy.

BEGIN;

-- ========================================================================
-- Fix 1: saludo orden=1 imagen URL → Shopify CDN (misma que sales-v3)
-- ========================================================================
-- URL antigua (rota): https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg -> HTTP 400
-- URL nueva (sales-v3, verified HTTP 200): https://cdn.shopify.com/s/files/1/0688/9606/3724/files/Diseno_sin_titulo_25.jpg?v=1774566355

UPDATE agent_templates
SET content = 'https://cdn.shopify.com/s/files/1/0688/9606/3724/files/Diseno_sin_titulo_25.jpg?v=1774566355|Deseas adquirir tu ELIXIR DEL SUENO?',
    updated_at = timezone('America/Bogota', NOW())
WHERE agent_id = 'somnio-recompra-v1'
  AND intent = 'saludo'
  AND orden = 1
  AND content_type = 'imagen'
  AND workspace_id IS NULL;

-- ========================================================================
-- Fix 2: preguntar_direccion_recompra → remover prefix nombre_saludo
-- ========================================================================
-- Content antiguo: '{{nombre_saludo}} 😊\n\nClaro que si! Seria para la misma direccion?\n\n📍 {{direccion_completa}}'
--   (prefix duplica el saludo que ya se envio en turno 0)
-- Content nuevo:   '¡Claro que si! Seria para la misma direccion?\n\n📍 {{direccion_completa}}'
--   (sin saludo; bot ya saludo en turno 0)

UPDATE agent_templates
SET content = E'¡Claro que si! Seria para la misma direccion?\n\n📍 {{direccion_completa}}',
    updated_at = timezone('America/Bogota', NOW())
WHERE agent_id = 'somnio-recompra-v1'
  AND intent = 'preguntar_direccion_recompra'
  AND orden = 0
  AND content_type = 'texto'
  AND workspace_id IS NULL;

COMMIT;
