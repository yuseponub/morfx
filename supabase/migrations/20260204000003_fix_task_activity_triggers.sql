-- ============================================================================
-- Fix: Task Activity Trigger Architecture
-- Problem: BEFORE trigger attempting INSERT into task_activity fails due to
--          RLS evaluation timing issues.
-- Solution: Split into BEFORE (postponement only) and AFTER (logging) triggers,
--           matching the proven contact_activity pattern.
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop the broken trigger and function
-- ============================================================================

DROP TRIGGER IF EXISTS task_activity_trigger ON tasks;
DROP FUNCTION IF EXISTS log_task_changes();

-- ============================================================================
-- STEP 2: Create BEFORE trigger function for postponement counting ONLY
-- This runs BEFORE UPDATE to modify NEW.postponement_count
-- ============================================================================

CREATE OR REPLACE FUNCTION set_task_postponement_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only increment if both old and new due_date exist and new > old
  IF (NEW.due_date IS NOT NULL AND OLD.due_date IS NOT NULL
      AND NEW.due_date > OLD.due_date) THEN
    NEW.postponement_count := COALESCE(OLD.postponement_count, 0) + 1;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach BEFORE UPDATE trigger (only UPDATE needs postponement logic)
CREATE TRIGGER task_set_postponement_trigger
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_postponement_count();

-- ============================================================================
-- STEP 3: Create AFTER trigger function for activity logging
-- This runs AFTER INSERT/UPDATE/DELETE to log to task_activity
-- Matches the contact_activity pattern exactly
-- ============================================================================

CREATE OR REPLACE FUNCTION log_task_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changes_json JSONB := '{}';
  old_json JSONB;
  new_json JSONB;
  key TEXT;
  user_uuid UUID;
  action_type TEXT;
BEGIN
  -- Get current user from JWT (may be null for direct DB operations)
  BEGIN
    user_uuid := (auth.jwt() ->> 'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    user_uuid := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO task_activity (task_id, workspace_id, user_id, action, changes)
    VALUES (NEW.id, NEW.workspace_id, user_uuid, 'created', to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);

    -- Build diff of changed fields
    FOR key IN SELECT jsonb_object_keys(new_json)
    LOOP
      -- Skip auto-updated fields
      IF key NOT IN ('updated_at', 'postponement_count') AND old_json -> key IS DISTINCT FROM new_json -> key THEN
        changes_json := changes_json || jsonb_build_object(
          key, jsonb_build_object('old', old_json -> key, 'new', new_json -> key)
        );
      END IF;
    END LOOP;

    -- Determine action type based on what changed
    IF changes_json ? 'due_date' THEN
      action_type := 'due_date_changed';
    ELSIF changes_json ? 'status' THEN
      IF NEW.status = 'completed' THEN
        action_type := 'completed';
      ELSE
        action_type := 'reopened';
      END IF;
    ELSE
      action_type := 'updated';
    END IF;

    -- Only log if there are actual changes
    IF changes_json != '{}' THEN
      INSERT INTO task_activity (task_id, workspace_id, user_id, action, changes)
      VALUES (NEW.id, NEW.workspace_id, user_uuid, action_type, changes_json);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO task_activity (task_id, workspace_id, user_id, action, changes)
    VALUES (OLD.id, OLD.workspace_id, user_uuid, 'deleted', to_jsonb(OLD));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Attach AFTER trigger for INSERT/UPDATE/DELETE (matches contact_activity pattern)
CREATE TRIGGER task_activity_trigger
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_activity();
