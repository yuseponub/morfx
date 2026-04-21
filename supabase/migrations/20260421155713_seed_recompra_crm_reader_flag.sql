-- Seed feature flag for somnio-recompra-crm-reader integration phase.
-- Default: false (Regla 6 — protect production agent until explicit user activation).
-- Consumer: src/lib/domain/platform-config.ts:96-154 via getPlatformConfig<boolean>(key, false).
--
-- Idempotent: re-runs leave state unchanged (ON CONFLICT DO NOTHING).
-- Activation: UPDATE platform_config SET value='true'::jsonb WHERE key='somnio_recompra_crm_reader_enabled';
-- Rollback: UPDATE platform_config SET value='false'::jsonb WHERE key='somnio_recompra_crm_reader_enabled';

INSERT INTO platform_config (key, value)
VALUES ('somnio_recompra_crm_reader_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- GRANTs explicitos (LEARNING 1 Phase 44.1 — tablas creadas via Studio SQL Editor
-- NO heredan grants automaticos al service_role, el fail-open de getPlatformConfig
-- ocultaba el 42501 permission denied haciendo imposible que el flag tomara efecto.
-- Estas grants son no-ops si ya existen (GRANT es idempotente), pero garantizan
-- que en replay/nuevo entorno el flag funciona desde el primer momento).
GRANT ALL ON TABLE platform_config TO service_role;
GRANT SELECT ON TABLE platform_config TO authenticated;
