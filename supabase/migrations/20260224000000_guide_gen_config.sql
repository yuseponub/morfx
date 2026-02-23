-- ============================================================================
-- Guide Generation Stage Config
-- Phase 28: Robot Creador de Guias PDF
--
-- Adds 9 nullable UUID columns to carrier_configs for per-carrier
-- guide generation pipeline/stage configuration:
--   - pdf_inter_*: Interrapidisimo PDF generation
--   - pdf_bogota_*: Bogota PDF generation
--   - pdf_envia_*: Envia Excel generation
--
-- Each carrier type has:
--   - pipeline_id: Which pipeline holds the source stage
--   - stage_id: Source stage where orders await guide generation
--   - dest_stage_id: Optional destination stage after generation
-- ============================================================================

ALTER TABLE carrier_configs
  ADD COLUMN IF NOT EXISTS pdf_inter_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_inter_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_inter_dest_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_bogota_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_bogota_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_bogota_dest_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_envia_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_envia_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_envia_dest_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN carrier_configs.pdf_inter_pipeline_id IS 'Pipeline for Interrapidisimo PDF guide generation source stage';
COMMENT ON COLUMN carrier_configs.pdf_inter_dest_stage_id IS 'Optional destination stage to move orders after Inter PDF generation';
COMMENT ON COLUMN carrier_configs.pdf_bogota_pipeline_id IS 'Pipeline for Bogota PDF guide generation source stage';
COMMENT ON COLUMN carrier_configs.pdf_bogota_dest_stage_id IS 'Optional destination stage to move orders after Bogota PDF generation';
COMMENT ON COLUMN carrier_configs.pdf_envia_pipeline_id IS 'Pipeline for Envia Excel guide generation source stage';
COMMENT ON COLUMN carrier_configs.pdf_envia_dest_stage_id IS 'Optional destination stage to move orders after Envia Excel generation';
