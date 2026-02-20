-- Add department column to contacts and orders
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_department TEXT;
