-- ============================================================================
-- Phase 18: Domain Layer Foundation — Mutation Audit Safety Net
-- Purpose: Track ALL mutations on critical tables to detect code that
--          bypasses the domain layer (src/lib/domain/).
-- ============================================================================

-- 1. Create audit table (system table — never exposed to users)
CREATE TABLE mutation_audit (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name text NOT NULL,
  operation text NOT NULL,  -- INSERT, UPDATE, DELETE
  row_id uuid,
  workspace_id uuid,
  occurred_at timestamptz DEFAULT timezone('America/Bogota', NOW()),
  old_data jsonb,
  new_data jsonb
);

-- No RLS on mutation_audit — system table only, accessed by cron/admin
-- ALTER TABLE mutation_audit ENABLE ROW LEVEL SECURITY; -- intentionally skipped

-- 2. Indexes for weekly cron queries
CREATE INDEX idx_mutation_audit_occurred ON mutation_audit (occurred_at);
CREATE INDEX idx_mutation_audit_workspace ON mutation_audit (workspace_id);

-- 3. Trigger function
CREATE OR REPLACE FUNCTION audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO mutation_audit (table_name, operation, row_id, workspace_id, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.workspace_id, OLD.workspace_id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4. Attach to 7 critical tables
CREATE TRIGGER audit_contacts AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_messages AFTER INSERT OR UPDATE OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_contact_tags AFTER INSERT OR DELETE ON contact_tags
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_order_tags AFTER INSERT OR DELETE ON order_tags
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();

CREATE TRIGGER audit_conversations AFTER INSERT OR UPDATE OR DELETE ON conversations
  FOR EACH ROW EXECUTE FUNCTION audit_mutation();
