-- ============================================================================
-- Order Notes Table
-- Pattern: Same schema as contact_notes and task_notes
-- Domain layer uses createAdminClient() (no RLS needed)
-- ============================================================================

CREATE TABLE order_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_order_notes_order ON order_notes(order_id);
CREATE INDEX idx_order_notes_workspace ON order_notes(workspace_id);
CREATE INDEX idx_order_notes_created ON order_notes(created_at DESC);

-- Auto-update updated_at on update (function already exists)
CREATE TRIGGER order_notes_updated_at
  BEFORE UPDATE ON order_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
