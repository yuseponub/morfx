-- Migration: 20260418011321_sms_atomic_rpc.sql
-- Phase: standalone/sms-billing-atomic-rpc (Plan 01)
-- Depends on: 20260316100000_sms_onurix_foundation.sql
--
-- This migration introduces atomic SMS billing operations to close 3 defects:
--   Defect B (non-atomic INSERT + RPC) -> new insert_and_deduct_sms_message RPC
--   Defect C (deduct_sms_balance has no guard) -> guard added via CREATE OR REPLACE
--   Historical orphan rows (cost_cop=0) -> backfill_sms_message RPC for repair script
--
-- All three functions deploy atomically. Pitfall 8: do NOT split into multiple
-- migration files; Plan 02 refactor + Plan 04 backfill both depend on this.

-- ============================================================================
-- 1. insert_and_deduct_sms_message (NEW) -- D-01, D-02, D-06
--    Atomic INSERT + UPDATE + INSERT in a single plpgsql transaction.
--    Replaces the current pattern in src/lib/domain/sms.ts:132-185 of separate
--    INSERT to sms_messages + RPC call to deduct_sms_balance.
-- ============================================================================
CREATE OR REPLACE FUNCTION insert_and_deduct_sms_message(
  p_workspace_id UUID,
  p_provider_message_id TEXT,
  p_from_number TEXT,
  p_to_number TEXT,
  p_body TEXT,
  p_segments INTEGER,
  p_cost_cop DECIMAL,
  p_source TEXT,
  p_automation_execution_id UUID DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL,
  p_amount DECIMAL DEFAULT NULL,           -- almost always equals p_cost_cop; kept explicit for clarity
  p_description TEXT DEFAULT 'SMS enviado'
)
RETURNS TABLE(
  success BOOLEAN,
  sms_message_id UUID,
  new_balance DECIMAL,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config sms_workspace_config%ROWTYPE;
  v_new_balance DECIMAL;
  v_amount DECIMAL;
  v_sms_id UUID;
BEGIN
  -- Resolve effective amount (defaults to cost_cop when caller doesn't pass explicit p_amount)
  v_amount := COALESCE(p_amount, p_cost_cop);

  -- Guard: p_amount must be > 0 (D-06). Fail-loud; aborts entire transaction.
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: p_amount must be > 0, got %', v_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the workspace config row (serializes concurrent SMS sends per workspace)
  SELECT * INTO v_config
  FROM sms_workspace_config
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, 0::DECIMAL,
      'SMS no activado en este workspace'::TEXT;
    RETURN;
  END IF;

  IF NOT v_config.is_active THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, v_config.balance_cop,
      'Servicio SMS desactivado'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_config.balance_cop - v_amount;

  -- Check negative balance policy
  IF NOT v_config.allow_negative_balance AND v_new_balance < 0 THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, v_config.balance_cop,
      'Saldo SMS insuficiente'::TEXT;
    RETURN;
  END IF;

  -- 1) INSERT sms_messages
  INSERT INTO sms_messages (
    workspace_id, provider_message_id, provider, from_number, to_number,
    body, direction, status, segments, cost_cop, source,
    automation_execution_id, contact_name
  ) VALUES (
    p_workspace_id, p_provider_message_id, 'onurix', p_from_number, p_to_number,
    p_body, 'outbound', 'sent', p_segments, p_cost_cop, p_source,
    p_automation_execution_id, p_contact_name
  )
  RETURNING id INTO v_sms_id;

  -- 2) UPDATE balance + counters (mirrors deduct_sms_balance)
  UPDATE sms_workspace_config
  SET balance_cop = v_new_balance,
      total_sms_sent = total_sms_sent + 1,
      total_credits_used = total_credits_used + v_amount,
      updated_at = timezone('America/Bogota', NOW())
  WHERE workspace_id = p_workspace_id;

  -- 3) INSERT transaction log
  INSERT INTO sms_balance_transactions (
    workspace_id, type, amount_cop, balance_after, description, sms_message_id
  ) VALUES (
    p_workspace_id, 'sms_deduction', -v_amount, v_new_balance, p_description, v_sms_id
  );

  RETURN QUERY SELECT true::BOOLEAN, v_sms_id, v_new_balance, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_and_deduct_sms_message(
  UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, DECIMAL, TEXT, UUID, TEXT, DECIMAL, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_and_deduct_sms_message(
  UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, DECIMAL, TEXT, UUID, TEXT, DECIMAL, TEXT
) TO service_role;

-- ============================================================================
-- 2. deduct_sms_balance (PATCH via CREATE OR REPLACE) -- D-05
--    Adds guard p_amount <= 0 -> fail-loud error. Body otherwise unchanged from
--    20260316100000_sms_onurix_foundation.sql:149-201.
--    KEPT (not deprecated) per D-04: future top-up/super-admin paths may use it.
-- ============================================================================
CREATE OR REPLACE FUNCTION deduct_sms_balance(
  p_workspace_id UUID,
  p_amount DECIMAL,
  p_sms_message_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT 'SMS enviado'
)
RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config sms_workspace_config%ROWTYPE;
  v_new_balance DECIMAL;
BEGIN
  -- NEW: Guard p_amount > 0 (D-05). Fail-loud on invalid input.
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: p_amount must be > 0, got %', p_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- (rest unchanged from 20260316100000_sms_onurix_foundation.sql:149-201)
  SELECT * INTO v_config
  FROM sms_workspace_config
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, 0::DECIMAL, 'SMS no activado en este workspace'::TEXT;
    RETURN;
  END IF;

  IF NOT v_config.is_active THEN
    RETURN QUERY SELECT false::BOOLEAN, v_config.balance_cop, 'Servicio SMS desactivado'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_config.balance_cop - p_amount;

  IF NOT v_config.allow_negative_balance AND v_new_balance < 0 THEN
    RETURN QUERY SELECT false::BOOLEAN, v_config.balance_cop, 'Saldo SMS insuficiente'::TEXT;
    RETURN;
  END IF;

  UPDATE sms_workspace_config
  SET balance_cop = v_new_balance,
      total_sms_sent = total_sms_sent + 1,
      total_credits_used = total_credits_used + p_amount,
      updated_at = timezone('America/Bogota', NOW())
  WHERE workspace_id = p_workspace_id;

  INSERT INTO sms_balance_transactions (workspace_id, type, amount_cop, balance_after, description, sms_message_id)
  VALUES (p_workspace_id, 'sms_deduction', -p_amount, v_new_balance, p_description, p_sms_message_id);

  RETURN QUERY SELECT true::BOOLEAN, v_new_balance, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_sms_balance(UUID, DECIMAL, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_sms_balance(UUID, DECIMAL, UUID, TEXT) TO service_role;

-- ============================================================================
-- 3. backfill_sms_message (NEW) -- D-10
--    Atomic per-row repair tool used by scripts/backfill-sms-zero-cost.mjs (Plan 04).
--    Idempotent: skips rows where cost_cop already > 0.
--    Pitfall 7: does NOT increment total_sms_sent (original deduct_sms_balance
--    already incremented it even though cost_cop ended at 0).
-- ============================================================================
CREATE OR REPLACE FUNCTION backfill_sms_message(
  p_sms_message_id UUID,
  p_expected_cost_cop DECIMAL DEFAULT 97
)
RETURNS TABLE(
  success BOOLEAN,
  workspace_id UUID,
  new_balance DECIMAL,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sms sms_messages%ROWTYPE;
  v_config sms_workspace_config%ROWTYPE;
  v_new_balance DECIMAL;
BEGIN
  -- Load the SMS row
  SELECT * INTO v_sms FROM sms_messages WHERE id = p_sms_message_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, 0::DECIMAL,
      'sms_message not found'::TEXT;
    RETURN;
  END IF;

  -- Idempotency guard: only repair rows still at cost_cop=0
  IF v_sms.cost_cop IS NOT NULL AND v_sms.cost_cop > 0 THEN
    RETURN QUERY SELECT false::BOOLEAN, v_sms.workspace_id, 0::DECIMAL,
      'already backfilled (cost_cop > 0)'::TEXT;
    RETURN;
  END IF;

  -- Lock workspace config
  SELECT * INTO v_config
  FROM sms_workspace_config
  WHERE workspace_id = v_sms.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, v_sms.workspace_id, 0::DECIMAL,
      'workspace config not found'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_config.balance_cop - p_expected_cost_cop;

  -- 1) Fix the sms_messages row
  UPDATE sms_messages
  SET cost_cop = p_expected_cost_cop,
      segments = 1
  WHERE id = p_sms_message_id;

  -- 2) Update workspace_config: decrement balance + total_credits_used
  --    (do NOT increment total_sms_sent -- original deduct_sms_balance already did, see Pitfall 7)
  UPDATE sms_workspace_config
  SET balance_cop = v_new_balance,
      total_credits_used = total_credits_used + p_expected_cost_cop,
      updated_at = timezone('America/Bogota', NOW())
  WHERE workspace_id = v_sms.workspace_id;

  -- 3) Log the backfill transaction
  INSERT INTO sms_balance_transactions (
    workspace_id, type, amount_cop, balance_after, description, sms_message_id
  ) VALUES (
    v_sms.workspace_id, 'sms_deduction_backfill', -p_expected_cost_cop, v_new_balance,
    'Backfill post-cutover Onurix 2026-04-17', p_sms_message_id
  );

  RETURN QUERY SELECT true::BOOLEAN, v_sms.workspace_id, v_new_balance, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_sms_message(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_sms_message(UUID, DECIMAL) TO service_role;

-- ============================================================================
-- END OF MIGRATION
-- After applying, verify with the queries documented in
-- .planning/standalone/sms-billing-atomic-rpc/RESEARCH.md (verification queries section)
-- ============================================================================
