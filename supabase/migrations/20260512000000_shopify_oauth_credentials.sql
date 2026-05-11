-- Standalone shopify-dev-dashboard-oauth — D-15 (2026-05-12)
-- Almacena las 3 credenciales del flujo OAuth de Shopify Dev Dashboard en
-- platform_config (Phase 44.1). Reemplaza el approach de Vercel env vars.
--
-- Lectura runtime: helper getShopifyOAuthConfig() en src/lib/shopify/oauth-config.ts
-- (Plan 02), que envuelve getPlatformConfig() con politica fail-CLOSED (throws si
-- cualquier credencial falta — no podemos hacer OAuth sin secret).
--
-- Apply order (Regla 5 CLAUDE.md): aplicar ESTE archivo en prod via Supabase SQL
-- editor ANTES de pushear el codigo de Plan 02+ que lee las keys.
--
-- IMPORTANTE: los valores `<REPLACE_*>` abajo son placeholders. Tras aplicar el
-- INSERT inicial, el usuario debe correr 3 UPDATE en Supabase Studio con los
-- valores reales (Client ID + Client Secret de Dev Dashboard + state secret de
-- `openssl rand -base64 32`). Los placeholders garantizan que `getShopifyOAuthConfig`
-- throws si nadie completo el setup (defensa en profundidad).

INSERT INTO platform_config (key, value) VALUES
  ('shopify_oauth_client_id',     '"<REPLACE_WITH_DEV_DASHBOARD_CLIENT_ID>"'::jsonb),
  ('shopify_oauth_client_secret', '"<REPLACE_WITH_DEV_DASHBOARD_CLIENT_SECRET>"'::jsonb),
  ('shopify_oauth_state_secret',  '"<REPLACE_WITH_OPENSSL_RAND_BASE64_32>"'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN platform_config.value IS
  'JSONB. Para keys shopify_oauth_*: string con Client ID/Secret de Dev Dashboard + state secret 32+ chars. Wrapper getShopifyOAuthConfig() lee y valida formato.';
