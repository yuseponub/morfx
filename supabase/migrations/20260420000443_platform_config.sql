-- Phase 44.1 — platform_config table
-- Almacena config runtime de plataforma (no-secret) leida via
-- src/lib/domain/platform-config.ts con cache in-memory 30s.
-- Sin RLS — acceso server-only via createAdminClient() (mismo patron que crm_bot_actions).
-- Additive: no ALTER/DROP a tablas existentes.

CREATE TABLE platform_config (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Pitfall 7 (44.1-RESEARCH): sintaxis JSONB estricta. Booleans/numbers sin comillas; null literal.
INSERT INTO platform_config (key, value) VALUES
  ('crm_bot_enabled',            'true'::jsonb),
  ('crm_bot_rate_limit_per_min', '50'::jsonb),
  ('crm_bot_alert_from',         'null'::jsonb);

COMMENT ON TABLE platform_config IS
  'Platform-level runtime config (Phase 44.1). Read via src/lib/domain/platform-config.ts with 30s in-memory TTL cache. Server-only (no RLS). Seeded: crm_bot_enabled, crm_bot_rate_limit_per_min, crm_bot_alert_from.';
