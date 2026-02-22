-- ============================================================================
-- Phase 26: Guide Lookup Columns
-- Adds carrier_guide_number to orders (Coordinadora guide/rotulo number,
-- separate from tracking_number which stores the pedido number).
-- Adds job_type to robot_jobs to distinguish create_shipment from guide_lookup.
-- ============================================================================

-- 1. Add carrier_guide_number column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_guide_number TEXT;

-- 2. Partial index for efficient lookups of orders that have a guide assigned
CREATE INDEX IF NOT EXISTS idx_orders_carrier_guide ON orders(carrier_guide_number)
  WHERE carrier_guide_number IS NOT NULL;

-- 3. Add job_type column to robot_jobs (defaults to 'create_shipment' for backward compat)
ALTER TABLE robot_jobs ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'create_shipment';

-- 4. Index for type-scoped active job queries (e.g., getActiveJob('guide_lookup'))
CREATE INDEX IF NOT EXISTS idx_robot_jobs_type_status ON robot_jobs(workspace_id, job_type, status);
