-- ============================================================================
-- Atomic counter increment RPC + batch_completed_emitted flag
-- Fixes P0 Bug #1: counter race condition where two concurrent callbacks
-- both read the same count, increment by 1, and one increment is lost.
-- Also adds batch_completed_emitted column for Plan 04 idempotent emission.
-- ============================================================================

-- 1. Add batch_completed_emitted column for idempotent batch_completed event emission
--    When a job completes, we emit a batch_completed event exactly once.
--    This flag prevents duplicate emissions if two workers race to complete the job.
ALTER TABLE robot_jobs ADD COLUMN IF NOT EXISTS batch_completed_emitted BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN robot_jobs.batch_completed_emitted IS
  'Guards against duplicate batch_completed event emission. Set to true after the event is emitted once.';

-- 2. Atomic counter increment RPC function
--    Replaces the buggy read-then-write pattern in robot-jobs.ts.
--    A single UPDATE...RETURNING guarantees no lost increments under concurrency.
CREATE OR REPLACE FUNCTION increment_robot_job_counter(
  p_job_id UUID,
  p_is_success BOOLEAN
)
RETURNS TABLE (
  new_success_count INTEGER,
  new_error_count INTEGER,
  total_items INTEGER,
  is_now_complete BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_success INTEGER;
  v_error   INTEGER;
  v_total   INTEGER;
  v_complete BOOLEAN;
BEGIN
  -- Atomic increment: single UPDATE ... RETURNING ensures no race condition
  UPDATE robot_jobs
  SET
    success_count = CASE WHEN p_is_success THEN success_count + 1 ELSE success_count END,
    error_count   = CASE WHEN NOT p_is_success THEN error_count + 1 ELSE error_count END
  WHERE id = p_job_id
  RETURNING
    robot_jobs.success_count,
    robot_jobs.error_count,
    robot_jobs.total_items
  INTO v_success, v_error, v_total;

  -- If the job was not found, raise an exception
  IF NOT FOUND THEN
    RAISE EXCEPTION 'robot_job not found: %', p_job_id;
  END IF;

  -- Check if all items are now complete
  v_complete := (v_success + v_error) >= v_total;

  -- Auto-complete the job if all items are done
  -- Idempotent guard: only transition if still in an active status
  IF v_complete THEN
    UPDATE robot_jobs
    SET
      status = 'completed',
      completed_at = timezone('America/Bogota', NOW())
    WHERE id = p_job_id
      AND status NOT IN ('completed', 'failed');
  END IF;

  -- Return the updated counters and completion flag
  RETURN QUERY SELECT v_success, v_error, v_total, v_complete;
END;
$$;

-- 3. Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION increment_robot_job_counter(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_robot_job_counter(UUID, BOOLEAN) TO service_role;
