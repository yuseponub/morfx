-- ============================================================================
-- Client Activation Badge
-- Adds is_client flag to contacts and configurable activation rules per workspace
-- ============================================================================

-- 1. Add is_client column to contacts
ALTER TABLE contacts ADD COLUMN is_client BOOLEAN NOT NULL DEFAULT false;

-- Partial index for efficient queries on active clients
CREATE INDEX idx_contacts_is_client ON contacts(workspace_id) WHERE is_client = true;

-- 2. Create client_activation_config table
CREATE TABLE client_activation_config (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  all_are_clients BOOLEAN NOT NULL DEFAULT false,
  activation_stage_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- RLS
ALTER TABLE client_activation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_client_activation_config" ON client_activation_config
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "insert_client_activation_config" ON client_activation_config
  FOR INSERT WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "update_client_activation_config" ON client_activation_config
  FOR UPDATE USING (is_workspace_admin(workspace_id));

-- Grants
GRANT ALL ON client_activation_config TO authenticated;
GRANT ALL ON client_activation_config TO service_role;

-- Auto-update updated_at
CREATE TRIGGER update_client_activation_config_updated_at
  BEFORE UPDATE ON client_activation_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3. Drop old hardcoded trigger and function
DROP TRIGGER IF EXISTS orders_auto_tag_cliente ON orders;
DROP FUNCTION IF EXISTS auto_tag_cliente_on_ganado();

-- 4. Create new configurable trigger function
CREATE OR REPLACE FUNCTION mark_client_on_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_workspace_id UUID;
  v_tag_id UUID;
BEGIN
  -- Skip if no contact linked
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if stage_id actually changed
  IF TG_OP = 'UPDATE' AND OLD.stage_id = NEW.stage_id THEN
    RETURN NEW;
  END IF;

  -- Get workspace_id from the order
  v_workspace_id := NEW.workspace_id;

  -- Check config exists and is enabled
  SELECT enabled, activation_stage_ids
  INTO v_config
  FROM client_activation_config
  WHERE workspace_id = v_workspace_id;

  IF NOT FOUND OR NOT v_config.enabled THEN
    RETURN NEW;
  END IF;

  -- Check if new stage is in activation list
  IF NOT (NEW.stage_id = ANY(v_config.activation_stage_ids)) THEN
    RETURN NEW;
  END IF;

  -- Mark contact as client (idempotent — only update if not already true)
  UPDATE contacts
  SET is_client = true
  WHERE id = NEW.contact_id
    AND is_client = false;

  -- Backward compat: also assign "Cliente" tag if it exists
  SELECT t.id INTO v_tag_id
  FROM tags t
  WHERE t.workspace_id = v_workspace_id
    AND t.name = 'Cliente'
  LIMIT 1;

  IF v_tag_id IS NOT NULL THEN
    INSERT INTO contact_tags (contact_id, tag_id)
    VALUES (NEW.contact_id, v_tag_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach new trigger (INSERT OR UPDATE)
CREATE TRIGGER orders_mark_client_on_stage
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION mark_client_on_stage_change();

-- 5. Enable realtime for contacts (for is_client propagation)
-- Use DO block to avoid error if already added
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
EXCEPTION WHEN duplicate_object THEN
  -- Already in publication, ignore
  NULL;
END;
$$;
