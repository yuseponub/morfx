-- ============================================================================
-- FIX: Contact delete trigger
-- Problem: AFTER DELETE trigger tries to insert activity record after contact
-- is deleted, violating foreign key constraint
-- Solution: Use BEFORE DELETE for delete operations
-- ============================================================================

-- Drop the existing trigger
DROP TRIGGER IF EXISTS contact_activity_trigger ON contacts;

-- Create separate triggers for INSERT/UPDATE (AFTER) and DELETE (BEFORE)

-- Keep INSERT and UPDATE as AFTER triggers
CREATE TRIGGER contact_activity_insert_update_trigger
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION log_contact_changes();

-- Make DELETE a BEFORE trigger so we can log before the contact is deleted
CREATE TRIGGER contact_activity_delete_trigger
  BEFORE DELETE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION log_contact_changes();
