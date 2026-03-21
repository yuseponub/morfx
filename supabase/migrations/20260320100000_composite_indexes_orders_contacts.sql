-- ============================================================================
-- Composite indexes for orders and contacts queries
-- Addresses slow queries identified in Supabase Query Performance dashboard
-- ============================================================================

-- Orders: workspace + created_at (main orders list, avg 240ms -> should drop to <20ms)
CREATE INDEX IF NOT EXISTS idx_orders_workspace_created
  ON orders (workspace_id, created_at DESC);

-- Orders: workspace + stage + created_at (kanban/pipeline view, 98K calls)
CREATE INDEX IF NOT EXISTS idx_orders_workspace_stage_created
  ON orders (workspace_id, stage_id, created_at DESC);

-- Orders: workspace + pipeline (stage count queries)
CREATE INDEX IF NOT EXISTS idx_orders_workspace_pipeline
  ON orders (workspace_id, pipeline_id);

-- Orders: workspace + contact + created_at (orders by contact in WhatsApp panel)
CREATE INDEX IF NOT EXISTS idx_orders_workspace_contact_created
  ON orders (workspace_id, contact_id, created_at DESC);

-- Contacts: trigram indexes for ILIKE search (avg 465ms -> should drop to <50ms)
-- Requires pg_trgm extension (already enabled on Supabase by default)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON contacts USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm
  ON contacts USING GIN (phone gin_trgm_ops);

-- Contacts: workspace + name for sorted search results
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_name
  ON contacts (workspace_id, name);
