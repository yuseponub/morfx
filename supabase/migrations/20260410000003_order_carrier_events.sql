-- ============================================================================
-- Order Carrier Events
-- Stores carrier status change history per order/guide for polling-based tracking.
-- Each row = one state snapshot from the carrier API (e.g., Envia).
-- ============================================================================

-- 1. Create order_carrier_events table
CREATE TABLE order_carrier_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  guia TEXT NOT NULL,
  carrier TEXT NOT NULL DEFAULT 'envia',
  estado TEXT NOT NULL,
  cod_estado INTEGER NOT NULL,
  novedades JSONB DEFAULT '[]',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- 2. Indexes
CREATE INDEX idx_order_carrier_events_order ON order_carrier_events(order_id);
CREATE INDEX idx_order_carrier_events_workspace ON order_carrier_events(workspace_id);
CREATE INDEX idx_order_carrier_events_guia ON order_carrier_events(guia);
CREATE INDEX idx_order_carrier_events_created ON order_carrier_events(created_at DESC);

-- 3. RLS
ALTER TABLE order_carrier_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_order_carrier_events" ON order_carrier_events
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "insert_order_carrier_events" ON order_carrier_events
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

-- 4. Grants
GRANT ALL ON order_carrier_events TO authenticated;
GRANT ALL ON order_carrier_events TO service_role;
