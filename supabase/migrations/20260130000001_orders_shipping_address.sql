-- ============================================================================
-- Add shipping address fields to orders table
-- Allows orders to have a different shipping address than the contact's default
-- ============================================================================

ALTER TABLE orders
ADD COLUMN shipping_address TEXT,
ADD COLUMN shipping_city TEXT;

-- Add index for city-based queries (useful for logistics filtering)
CREATE INDEX idx_orders_shipping_city ON orders(shipping_city);

COMMENT ON COLUMN orders.shipping_address IS 'Shipping address for this order (overrides contact address if set)';
COMMENT ON COLUMN orders.shipping_city IS 'Shipping city/municipality for this order (overrides contact city if set)';
