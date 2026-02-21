-- ============================================================================
-- Carrier Dispatch Stage Config + Robot Jobs Realtime
-- Adds dispatch_pipeline_id and dispatch_stage_id to carrier_configs so the
-- "subir ordenes coord" command knows which pipeline stage to pull orders from.
-- Also adds robot_jobs to Supabase Realtime publication for Chat de Comandos
-- live job status updates (robot_job_items already published in 000003).
-- ============================================================================

-- 1. Add dispatch pipeline/stage columns to carrier_configs
ALTER TABLE carrier_configs
  ADD COLUMN dispatch_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN dispatch_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN carrier_configs.dispatch_pipeline_id IS 'Pipeline from which to pull orders for carrier dispatch. Nullable until workspace configures it.';
COMMENT ON COLUMN carrier_configs.dispatch_stage_id IS 'Stage within dispatch_pipeline_id to pull orders from. Nullable until workspace configures it.';

-- 2. Enable Supabase Realtime on robot_jobs (for Chat de Comandos job status)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE robot_jobs;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
