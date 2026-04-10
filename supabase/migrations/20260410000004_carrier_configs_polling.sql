-- ============================================================================
-- Carrier Configs: Polling Stage Configuration
-- Adds pipeline/stage references so the polling cron knows which stages
-- contain orders that need carrier status checks.
-- ============================================================================

ALTER TABLE carrier_configs
  ADD COLUMN status_polling_pipeline_id UUID REFERENCES pipelines(id),
  ADD COLUMN status_polling_stage_ids UUID[] DEFAULT '{}';
