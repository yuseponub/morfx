-- ============================================================================
-- Phase 27: Make robot_job_items.order_id nullable for OCR guide items
--
-- OCR job items represent images, not orders. order_id starts as NULL and
-- gets populated when the OCR engine matches a guide to an order.
-- The UNIQUE constraint is replaced with a partial index so that
-- order-based items still enforce uniqueness while NULL order_id is allowed.
-- ============================================================================

-- 1. Drop the existing UNIQUE constraint on (job_id, order_id)
ALTER TABLE robot_job_items DROP CONSTRAINT IF EXISTS robot_job_items_job_id_order_id_key;

-- 2. Make order_id nullable (FK on nullable column is valid in PostgreSQL — NULL values skip FK check)
ALTER TABLE robot_job_items ALTER COLUMN order_id DROP NOT NULL;

-- 3. Add partial unique index: enforce uniqueness only when order_id IS NOT NULL
-- This prevents duplicate order entries within the same job while allowing
-- multiple NULL order_id rows (OCR image items)
CREATE UNIQUE INDEX IF NOT EXISTS uq_robot_job_items_job_order
  ON robot_job_items (job_id, order_id)
  WHERE order_id IS NOT NULL;
