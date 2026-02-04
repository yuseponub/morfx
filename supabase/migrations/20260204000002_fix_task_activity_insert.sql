-- ============================================================================
-- Fix: Allow task_activity inserts from trigger
-- The trigger uses SECURITY DEFINER but RLS still applies to the inserts.
-- We need to allow inserts via the service role / function owner.
-- ============================================================================

-- Option 1: Disable RLS for trigger operations by making function bypass RLS
-- We recreate the function with additional SET commands
CREATE OR REPLACE FUNCTION log_task_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off  -- Bypass RLS for this function
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
      -- Skip updated_at and postponement_count (they are derived/auto-updated)
      IF key NOT IN ('updated_at', 'postponement_count') AND old_json -> key IS DISTINCT FROM new_json -> key THEN
        changes_json := changes_json || jsonb_build_object(
          key, jsonb_build_object('old', old_json -> key, 'new', new_json -> key)
        );
      END IF;
    END LOOP;

    -- Determine action type based on what changed
    IF changes_json ? 'due_date' THEN
      action_type := 'due_date_changed';
      -- Increment postponement counter ONLY if:
      -- 1. Both old and new due_date are NOT NULL
      -- 2. New due_date is AFTER old due_date (moved forward)
      IF (NEW.due_date IS NOT NULL AND OLD.due_date IS NOT NULL
          AND NEW.due_date > OLD.due_date) THEN
        NEW.postponement_count := COALESCE(OLD.postponement_count, 0) + 1;
      END IF;
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
END;
$$;
