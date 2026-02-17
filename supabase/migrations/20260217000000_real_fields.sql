-- Migration: Add real fields for orders.name and contacts.department
-- These columns support the order name/identifier and contact department fields
-- that were previously stored only in custom_fields or missing entirely.

-- Add name column to orders (order reference/identifier)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS name TEXT;

-- Add department column to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department TEXT;

-- Add shipping_department to orders (may already exist from manual script)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_department TEXT;

-- Indexes for department lookups
CREATE INDEX IF NOT EXISTS idx_contacts_department ON contacts(department);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_department ON orders(shipping_department);
