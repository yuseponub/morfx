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

-- ──────────────────────────────────────────────────────────────────────────
-- Corrective (2026-04-20): grants explicitos
-- ──────────────────────────────────────────────────────────────────────────
-- Tablas creadas via Supabase Studio SQL Editor NO reciben grants automaticos
-- para el service_role ni para authenticated. La primera version de esta
-- migracion omitio los GRANTs y `getPlatformConfig` en produccion fallaba con
-- `code: 42501 — permission denied for table platform_config`, que el fail-open
-- fallback enmascaraba retornando `true` (kill-switch nunca disparaba).
--
-- LEARNING propagado: toda migracion futura que cree una tabla debe incluir
-- GRANTs explicitos aqui mismo — no asumir que las tablas creadas en prod via
-- SQL Editor hereden los privileges que habrian tenido via `supabase db push`.
-- Ver LEARNINGS.md (Phase 44.1) — LEARNING 1.
GRANT ALL    ON TABLE public.platform_config TO service_role;
GRANT SELECT ON TABLE public.platform_config TO authenticated;
