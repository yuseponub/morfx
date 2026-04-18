-- Migration: 20260418040000_sms_source_not_null.sql
-- Phase: standalone/sms-time-window-by-type (D-02, D-05)
-- Depends on: 20260316100000_sms_onurix_foundation.sql (adds source column)
--             20260418030000_sms_provider_state_raw.sql (last prior migration)
--
-- Enforces by contract that every sms_messages row has a source value.
-- This is the compliance defense for the permissive isTransactionalSource
-- helper: if source is never NULL, no SMS silently bypasses the marketing guard
-- due to missing origin data.

-- 1. Conditional backfill — safe to run even if zero NULL rows exist.
--    All pre-existing SMS in prod are transactional (no campaign module yet),
--    so 'automation' is the correct default value.
UPDATE sms_messages
SET source = 'automation'
WHERE source IS NULL;

-- 2. Enforce NOT NULL. DEFAULT 'automation' from foundation migration preserved.
--    After this, any insert without explicit source falls back to 'automation'
--    via the column default. The RPC insert_and_deduct_sms_message already
--    requires p_source TEXT as a non-default parameter, so domain callers
--    cannot omit it.
ALTER TABLE sms_messages
  ALTER COLUMN source SET NOT NULL;

-- ============================================================================
-- END OF MIGRATION
-- Verification query (run post-apply, expected null_count = 0):
--   SELECT COUNT(*) AS null_count FROM sms_messages WHERE source IS NULL;
-- Expected: 0
-- ============================================================================
