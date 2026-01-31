-- ============================================================================
-- Phase 6: Orders Foundation
-- Products catalog, multi-pipeline support, and orders with line items
-- ============================================================================

-- ============================================================================
-- PRODUCTS TABLE
-- Products catalog for the workspace
-- ============================================================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  shopify_product_id TEXT,  -- For future Shopify matching
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, sku)
);

CREATE INDEX idx_products_workspace ON products(workspace_id);
CREATE INDEX idx_products_active ON products(workspace_id, is_active);

-- ============================================================================
-- PIPELINES TABLE
-- Multiple pipelines per workspace (e.g., "Ventas", "Devoluciones")
-- ============================================================================

CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_pipelines_workspace ON pipelines(workspace_id);

-- ============================================================================
-- PIPELINE STAGES TABLE
-- Stages within a pipeline (e.g., "Nuevo", "En proceso", "Enviado", "Ganado")
-- ============================================================================

CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  position INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER,  -- NULL = unlimited
  is_closed BOOLEAN DEFAULT false,  -- True for terminal stages like "Ganado", "Perdido"
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(pipeline_id, position)
);

CREATE INDEX idx_stages_pipeline ON pipeline_stages(pipeline_id);
CREATE INDEX idx_stages_position ON pipeline_stages(pipeline_id, position);

-- ============================================================================
-- ORDERS TABLE
-- Core orders/deals table
-- ============================================================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE RESTRICT,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  total_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
  closing_date DATE,
  description TEXT,
  carrier TEXT,           -- Transportadora (Coordinadora, Interrapidisimo, etc.)
  tracking_number TEXT,   -- Numero de guia
  linked_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,  -- For linked returns
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_orders_workspace ON orders(workspace_id);
CREATE INDEX idx_orders_contact ON orders(contact_id);
CREATE INDEX idx_orders_pipeline ON orders(pipeline_id);
CREATE INDEX idx_orders_stage ON orders(stage_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_custom_fields ON orders USING GIN (custom_fields);

-- ============================================================================
-- ORDER PRODUCTS TABLE (Junction)
-- Products within an order with snapshot pricing
-- ============================================================================

CREATE TABLE order_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,                -- Snapshot at order time
  title TEXT NOT NULL,              -- Snapshot at order time
  unit_price DECIMAL(12, 2) NOT NULL,  -- Snapshot at order time
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal DECIMAL(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_order_products_order ON order_products(order_id);
CREATE INDEX idx_order_products_product ON order_products(product_id);

-- ============================================================================
-- ORDER TAGS TABLE (Junction)
-- Tags applied to orders (reuses tags table from Phase 4)
-- ============================================================================

CREATE TABLE order_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(order_id, tag_id)
);

CREATE INDEX idx_order_tags_order ON order_tags(order_id);
CREATE INDEX idx_order_tags_tag ON order_tags(tag_id);

-- ============================================================================
-- SAVED VIEWS TABLE
-- Saved filters/views for both contacts and orders
-- ============================================================================

CREATE TABLE saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,  -- 'contact' or 'order'
  filters JSONB NOT NULL DEFAULT '{}',
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_saved_views_workspace ON saved_views(workspace_id, entity_type);
CREATE INDEX idx_saved_views_user ON saved_views(user_id);

-- ============================================================================
-- TRIGGERS: Auto-set workspace_id
-- ============================================================================

-- Products auto-set workspace_id
CREATE TRIGGER products_set_workspace
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- Pipelines auto-set workspace_id
CREATE TRIGGER pipelines_set_workspace
  BEFORE INSERT ON pipelines
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- Orders auto-set workspace_id
CREATE TRIGGER orders_set_workspace
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- Saved views auto-set workspace_id
CREATE TRIGGER saved_views_set_workspace
  BEFORE INSERT ON saved_views
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- ============================================================================
-- TRIGGERS: Auto-update updated_at
-- ============================================================================

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER pipelines_updated_at
  BEFORE UPDATE ON pipelines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER saved_views_updated_at
  BEFORE UPDATE ON saved_views
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGER FUNCTION: Auto-calculate order total
-- Updates orders.total_value when order_products change
-- ============================================================================

CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_total DECIMAL(12, 2);
  target_order_id UUID;
BEGIN
  -- Determine which order to update
  IF TG_OP = 'DELETE' THEN
    target_order_id := OLD.order_id;
  ELSE
    target_order_id := NEW.order_id;
  END IF;

  -- Calculate new total from all line items
  SELECT COALESCE(SUM(subtotal), 0)
  INTO new_total
  FROM order_products
  WHERE order_id = target_order_id;

  -- Update the order's total_value
  UPDATE orders
  SET total_value = new_total
  WHERE id = target_order_id;

  -- Return appropriate record
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Trigger on order_products for total auto-calculation
CREATE TRIGGER order_products_update_total
  AFTER INSERT OR UPDATE OR DELETE ON order_products
  FOR EACH ROW
  EXECUTE FUNCTION update_order_total();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PRODUCTS POLICIES
-- ============================================================================

CREATE POLICY "products_workspace_isolation_select"
  ON products FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "products_workspace_isolation_insert"
  ON products FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "products_workspace_isolation_update"
  ON products FOR UPDATE
  USING (is_workspace_member(workspace_id));

CREATE POLICY "products_workspace_isolation_delete"
  ON products FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ============================================================================
-- PIPELINES POLICIES
-- ============================================================================

CREATE POLICY "pipelines_workspace_isolation_select"
  ON pipelines FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "pipelines_workspace_isolation_insert"
  ON pipelines FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "pipelines_workspace_isolation_update"
  ON pipelines FOR UPDATE
  USING (is_workspace_member(workspace_id));

CREATE POLICY "pipelines_workspace_isolation_delete"
  ON pipelines FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ============================================================================
-- PIPELINE STAGES POLICIES
-- Access via parent pipeline
-- ============================================================================

CREATE POLICY "stages_access_select"
  ON pipeline_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pipelines
      WHERE pipelines.id = pipeline_stages.pipeline_id
      AND is_workspace_member(pipelines.workspace_id)
    )
  );

CREATE POLICY "stages_access_insert"
  ON pipeline_stages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipelines
      WHERE pipelines.id = pipeline_stages.pipeline_id
      AND is_workspace_member(pipelines.workspace_id)
    )
  );

CREATE POLICY "stages_access_update"
  ON pipeline_stages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pipelines
      WHERE pipelines.id = pipeline_stages.pipeline_id
      AND is_workspace_member(pipelines.workspace_id)
    )
  );

CREATE POLICY "stages_access_delete"
  ON pipeline_stages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM pipelines
      WHERE pipelines.id = pipeline_stages.pipeline_id
      AND is_workspace_member(pipelines.workspace_id)
    )
  );

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

CREATE POLICY "orders_workspace_isolation_select"
  ON orders FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "orders_workspace_isolation_insert"
  ON orders FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "orders_workspace_isolation_update"
  ON orders FOR UPDATE
  USING (is_workspace_member(workspace_id));

CREATE POLICY "orders_workspace_isolation_delete"
  ON orders FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ============================================================================
-- ORDER PRODUCTS POLICIES
-- Access via parent order
-- ============================================================================

CREATE POLICY "order_products_access_select"
  ON order_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_products.order_id
      AND is_workspace_member(orders.workspace_id)
    )
  );

CREATE POLICY "order_products_access_insert"
  ON order_products FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_products.order_id
      AND is_workspace_member(orders.workspace_id)
    )
  );

CREATE POLICY "order_products_access_update"
  ON order_products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_products.order_id
      AND is_workspace_member(orders.workspace_id)
    )
  );

CREATE POLICY "order_products_access_delete"
  ON order_products FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_products.order_id
      AND is_workspace_member(orders.workspace_id)
    )
  );

-- ============================================================================
-- ORDER TAGS POLICIES
-- Access via parent order
-- ============================================================================

CREATE POLICY "order_tags_access_select"
  ON order_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_tags.order_id
      AND is_workspace_member(orders.workspace_id)
    )
  );

CREATE POLICY "order_tags_access_insert"
  ON order_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_tags.order_id
      AND is_workspace_member(orders.workspace_id)
    )
  );

CREATE POLICY "order_tags_access_delete"
  ON order_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_tags.order_id
      AND is_workspace_member(orders.workspace_id)
    )
  );

-- ============================================================================
-- SAVED VIEWS POLICIES
-- User can see own views OR shared views in workspace
-- ============================================================================

CREATE POLICY "saved_views_select"
  ON saved_views FOR SELECT
  USING (
    is_workspace_member(workspace_id)
    AND (
      user_id = auth.uid()
      OR is_shared = true
    )
  );

CREATE POLICY "saved_views_insert"
  ON saved_views FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "saved_views_update"
  ON saved_views FOR UPDATE
  USING (
    is_workspace_member(workspace_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "saved_views_delete"
  ON saved_views FOR DELETE
  USING (
    is_workspace_member(workspace_id)
    AND user_id = auth.uid()
  );
