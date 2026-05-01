-- Standalone: somnio-sales-v4 / Plan 02
-- Seed platform_config keys para v4.
-- Pattern: 20260420000443_platform_config.sql verbatim
-- D-03 threshold inicial = 0.70; D-11 parametrizable

INSERT INTO public.platform_config (key, value) VALUES
  ('somnio_v4_low_confidence_threshold', '0.70'::jsonb),
  ('somnio_v4_kb_sync_enabled',          'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ROLLBACK:
-- DELETE FROM public.platform_config WHERE key IN
--   ('somnio_v4_low_confidence_threshold', 'somnio_v4_kb_sync_enabled');
