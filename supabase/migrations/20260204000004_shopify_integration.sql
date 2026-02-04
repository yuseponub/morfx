-- ============================================================================
-- Phase 11: Shopify Integration Foundation
-- Integrations table, webhook events, and orders.shopify_order_id
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTION: Check if user is workspace owner
-- Required for integration management (Owner-only permissions)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_workspace_owner(workspace_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
    AND user_id = auth.uid()
    AND role = 'owner'
  )
$$;

-- ============================================================================
-- INTEGRATIONS TABLE
-- Stores integration configurations with encrypted credentials in config JSONB
-- ============================================================================

CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Integration identity
  type TEXT NOT NULL,  -- 'shopify', future: 'woocommerce', etc.
  name TEXT NOT NULL,  -- Display name for the integration

  -- Configuration (type-specific, credentials encrypted at application layer)
  -- For Shopify:
  -- {
  --   shop_domain: "mystore.myshopify.com",
  --   access_token: "encrypted:...",
  --   api_secret: "encrypted:...",
  --   default_pipeline_id: "uuid",
  --   default_stage_id: "uuid",
  --   enable_fuzzy_matching: true,
  --   product_matching: "sku" | "name" | "value",
  --   field_mappings: {...}
  -- }
  config JSONB NOT NULL DEFAULT '{}',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,

  -- Timestamps (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- One integration type per workspace
  UNIQUE(workspace_id, type)
);

-- Indexes for integrations
CREATE INDEX idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX idx_integrations_type ON integrations(type);
CREATE INDEX idx_integrations_active ON integrations(workspace_id, is_active) WHERE is_active = true;

-- ============================================================================
-- WEBHOOK EVENTS TABLE
-- Stores received webhooks for idempotency and debugging
-- ============================================================================

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Webhook identification
  external_id TEXT NOT NULL,  -- X-Shopify-Webhook-Id for idempotency
  topic TEXT NOT NULL,  -- 'orders/create', 'orders/updated', etc.

  -- Payload for debugging and replay
  payload JSONB NOT NULL,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ,

  -- Timestamps (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Idempotency: unique webhook per integration
  UNIQUE(integration_id, external_id)
);

-- Indexes for webhook events
CREATE INDEX idx_webhook_events_integration ON webhook_events(integration_id);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at DESC);
CREATE INDEX idx_webhook_events_retry ON webhook_events(status, retry_count) WHERE status = 'failed' AND retry_count < 3;

-- ============================================================================
-- HELPER FUNCTION: Get workspace_id from integration_id
-- Required for RLS policies on webhook_events
-- ============================================================================

CREATE OR REPLACE FUNCTION get_workspace_from_integration(integration_uuid UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT workspace_id FROM integrations WHERE id = integration_uuid
$$;

-- ============================================================================
-- ALTER ORDERS TABLE
-- Add shopify_order_id for deduplication
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN shopify_order_id BIGINT;

-- Partial index for efficient lookup when shopify_order_id exists
CREATE INDEX idx_orders_shopify_order_id
  ON orders(shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;

-- ============================================================================
-- TRIGGER: Auto-update updated_at on integrations
-- ============================================================================

CREATE TRIGGER integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- INTEGRATIONS POLICIES
-- Members can view, only Owner can manage
-- ============================================================================

-- All workspace members can view integrations
CREATE POLICY "integrations_member_select"
  ON integrations FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Only Owner can create integrations
CREATE POLICY "integrations_owner_insert"
  ON integrations FOR INSERT
  WITH CHECK (is_workspace_owner(workspace_id));

-- Only Owner can update integrations
CREATE POLICY "integrations_owner_update"
  ON integrations FOR UPDATE
  USING (is_workspace_owner(workspace_id));

-- Only Owner can delete integrations
CREATE POLICY "integrations_owner_delete"
  ON integrations FOR DELETE
  USING (is_workspace_owner(workspace_id));

-- ============================================================================
-- WEBHOOK EVENTS POLICIES
-- Members can view (for debugging UI), insert/update via service role
-- ============================================================================

-- Workspace members can view webhook events (for debugging UI)
CREATE POLICY "webhook_events_member_select"
  ON webhook_events FOR SELECT
  USING (
    is_workspace_member(get_workspace_from_integration(integration_id))
  );

-- Note: INSERT/UPDATE/DELETE on webhook_events is done via service role
-- from the webhook handler (API route), no RLS policies needed for write operations

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE integrations IS 'Third-party integration configurations (Shopify, etc.) per workspace';
COMMENT ON COLUMN integrations.config IS 'Type-specific configuration JSONB. Credentials should be encrypted at application layer.';
COMMENT ON COLUMN integrations.type IS 'Integration type identifier: shopify, woocommerce, etc.';

COMMENT ON TABLE webhook_events IS 'Received webhook events for idempotency checking and debugging';
COMMENT ON COLUMN webhook_events.external_id IS 'External webhook ID (e.g., X-Shopify-Webhook-Id) for idempotency';
COMMENT ON COLUMN webhook_events.status IS 'Processing status: pending (received), processed (success), failed (needs retry or manual review)';
COMMENT ON COLUMN webhook_events.retry_count IS 'Number of processing retry attempts';

COMMENT ON COLUMN orders.shopify_order_id IS 'Shopify order ID for deduplication when syncing orders from Shopify';
