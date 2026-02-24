-- Add guide_lookup_pipeline_id and guide_lookup_stage_id to carrier_configs
-- Used by "buscar guias coord" to read from a stage different from dispatch stage.
ALTER TABLE carrier_configs
  ADD COLUMN IF NOT EXISTS guide_lookup_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guide_lookup_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;
