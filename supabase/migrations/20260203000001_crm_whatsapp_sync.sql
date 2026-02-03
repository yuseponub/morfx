-- ============================================================================
-- Phase 9: CRM-WhatsApp Sync Foundation
-- Adds conversation_tags table, tag scope field, and auto-tag trigger
-- ============================================================================

-- ============================================================================
-- 1. ADD TAG SCOPE TO TAGS TABLE
-- ============================================================================

-- Tag scope: 'whatsapp' (only conversations), 'orders' (only orders), 'both' (default)
ALTER TABLE tags ADD COLUMN applies_to TEXT NOT NULL DEFAULT 'both'
  CHECK (applies_to IN ('whatsapp', 'orders', 'both'));

-- ============================================================================
-- 2. CREATE CONVERSATION_TAGS JUNCTION TABLE
-- ============================================================================

CREATE TABLE conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(conversation_id, tag_id)
);

-- Create indexes for efficient lookups
CREATE INDEX idx_conversation_tags_conversation ON conversation_tags(conversation_id);
CREATE INDEX idx_conversation_tags_tag ON conversation_tags(tag_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY FOR CONVERSATION_TAGS
-- ============================================================================

ALTER TABLE conversation_tags ENABLE ROW LEVEL SECURITY;

-- SELECT: workspace member via parent conversation
CREATE POLICY "conversation_tags_access_select"
  ON conversation_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_tags.conversation_id
      AND is_workspace_member(conversations.workspace_id)
    )
  );

-- INSERT: workspace member via parent conversation
CREATE POLICY "conversation_tags_access_insert"
  ON conversation_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_tags.conversation_id
      AND is_workspace_member(conversations.workspace_id)
    )
  );

-- DELETE: workspace member via parent conversation
CREATE POLICY "conversation_tags_access_delete"
  ON conversation_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_tags.conversation_id
      AND is_workspace_member(conversations.workspace_id)
    )
  );

-- ============================================================================
-- 4. AUTO-TAG TRIGGER: Add "Cliente" tag when order reaches "Ganado"
-- ============================================================================

-- Function to auto-tag contact as "Cliente" when order reaches "Ganado" stage
CREATE OR REPLACE FUNCTION auto_tag_cliente_on_ganado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cliente_tag_id UUID;
BEGIN
  -- Only process if stage changed
  IF OLD.stage_id = NEW.stage_id THEN
    RETURN NEW;
  END IF;

  -- Check if contact_id is set (order must be linked to a contact)
  IF NEW.contact_id IS NOT NULL THEN
    -- Check if the new stage is "Ganado" (closed and named Ganado)
    IF EXISTS (
      SELECT 1 FROM pipeline_stages
      WHERE id = NEW.stage_id
        AND is_closed = true
        AND LOWER(name) = 'ganado'
    ) THEN
      -- Find "Cliente" tag in this workspace
      SELECT id INTO cliente_tag_id
      FROM tags
      WHERE workspace_id = NEW.workspace_id
        AND LOWER(name) = 'cliente';

      -- If tag exists, add to contact (idempotent via ON CONFLICT)
      IF cliente_tag_id IS NOT NULL THEN
        INSERT INTO contact_tags (contact_id, tag_id)
        VALUES (NEW.contact_id, cliente_tag_id)
        ON CONFLICT (contact_id, tag_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to orders table (AFTER UPDATE only - not on insert)
CREATE TRIGGER orders_auto_tag_cliente
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_tag_cliente_on_ganado();

-- ============================================================================
-- 5. ENABLE REALTIME FOR CONVERSATION_TAGS
-- ============================================================================

-- Enable Realtime replication for conversation_tags (for sync updates)
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_tags;
