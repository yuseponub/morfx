-- Add OCR stage configuration columns to carrier_configs
-- OCR guide reading uses a separate pipeline/stage from Coordinadora dispatch.
-- Example: orders in "ESPERANDO GUIAS" stage get matched with uploaded guide images.

ALTER TABLE carrier_configs
  ADD COLUMN IF NOT EXISTS ocr_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ocr_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;
