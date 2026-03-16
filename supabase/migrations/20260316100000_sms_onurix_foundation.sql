-- SMS Module: Onurix Foundation
-- Creates sms_workspace_config, sms_balance_transactions tables,
-- migrates sms_messages table for Onurix provider, and creates
-- deduct_sms_balance / add_sms_balance RPC functions.

-- ============================================================================
-- 1. sms_workspace_config — per-workspace SMS settings and balance
-- ============================================================================

CREATE TABLE IF NOT EXISTS sms_workspace_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  balance_cop DECIMAL(12, 2) NOT NULL DEFAULT 0,
  allow_negative_balance BOOLEAN NOT NULL DEFAULT true,
  total_sms_sent INTEGER NOT NULL DEFAULT 0,
  total_credits_used DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

ALTER TABLE sms_workspace_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_workspace_config_select ON sms_workspace_config
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- ============================================================================
-- 3. Migrate sms_messages table for Onurix support
-- ============================================================================

-- Rename twilio_sid -> provider_message_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_messages' AND column_name = 'twilio_sid'
  ) THEN
    ALTER TABLE sms_messages RENAME COLUMN twilio_sid TO provider_message_id;
  END IF;
END $$;

-- Drop NOT NULL constraint on provider_message_id (Onurix may not always have one at insert time)
ALTER TABLE sms_messages ALTER COLUMN provider_message_id DROP NOT NULL;

-- Drop the old unique constraint (must drop constraint first, then index)
ALTER TABLE sms_messages DROP CONSTRAINT IF EXISTS sms_messages_twilio_sid_key;
DROP INDEX IF EXISTS idx_sms_messages_twilio_sid;

-- Add provider column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_messages' AND column_name = 'provider'
  ) THEN
    ALTER TABLE sms_messages ADD COLUMN provider TEXT NOT NULL DEFAULT 'onurix';
    -- Mark existing rows as twilio
    UPDATE sms_messages SET provider = 'twilio' WHERE provider_message_id IS NOT NULL AND provider = 'onurix';
  END IF;
END $$;

-- Add delivery_checked_at for Inngest delivery verification tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_messages' AND column_name = 'delivery_checked_at'
  ) THEN
    ALTER TABLE sms_messages ADD COLUMN delivery_checked_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add cost_cop for per-message cost tracking in COP
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_messages' AND column_name = 'cost_cop'
  ) THEN
    ALTER TABLE sms_messages ADD COLUMN cost_cop DECIMAL(12, 2);
  END IF;
END $$;

-- Add source column for tracking origin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_messages' AND column_name = 'source'
  ) THEN
    ALTER TABLE sms_messages ADD COLUMN source TEXT DEFAULT 'automation';
  END IF;
END $$;

-- Add contact_name for quick display in history (denormalized)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_messages' AND column_name = 'contact_name'
  ) THEN
    ALTER TABLE sms_messages ADD COLUMN contact_name TEXT;
  END IF;
END $$;

-- Index on (workspace_id, created_at DESC) — may already exist from original migration
CREATE INDEX IF NOT EXISTS idx_sms_messages_workspace_created
  ON sms_messages(workspace_id, created_at DESC);

-- Index on provider_message_id for status lookups
CREATE INDEX IF NOT EXISTS idx_sms_messages_provider_id
  ON sms_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ============================================================================
-- 2. sms_balance_transactions — log of every balance change
-- ============================================================================

CREATE TABLE IF NOT EXISTS sms_balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'recharge' | 'sms_deduction' | 'adjustment'
  amount_cop DECIMAL(12, 2) NOT NULL, -- positive for recharge, negative for deduction
  balance_after DECIMAL(12, 2) NOT NULL,
  description TEXT,
  sms_message_id UUID REFERENCES sms_messages(id) ON DELETE SET NULL,
  created_by UUID, -- admin user for recharges, null for auto-deductions
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

ALTER TABLE sms_balance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_balance_transactions_select ON sms_balance_transactions
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- Index for workspace balance history queries
CREATE INDEX IF NOT EXISTS idx_sms_balance_transactions_workspace
  ON sms_balance_transactions(workspace_id, created_at DESC);

-- ============================================================================
-- 4. deduct_sms_balance RPC — atomic check + deduction with FOR UPDATE lock
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
  -- Lock the row for atomic read-check-update
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

  -- Check if negative balance allowed
  IF NOT v_config.allow_negative_balance AND v_new_balance < 0 THEN
    RETURN QUERY SELECT false::BOOLEAN, v_config.balance_cop, 'Saldo SMS insuficiente'::TEXT;
    RETURN;
  END IF;

  -- Deduct balance
  UPDATE sms_workspace_config
  SET balance_cop = v_new_balance,
      total_sms_sent = total_sms_sent + 1,
      total_credits_used = total_credits_used + p_amount,
      updated_at = timezone('America/Bogota', NOW())
  WHERE workspace_id = p_workspace_id;

  -- Log transaction
  INSERT INTO sms_balance_transactions (workspace_id, type, amount_cop, balance_after, description, sms_message_id)
  VALUES (p_workspace_id, 'sms_deduction', -p_amount, v_new_balance, p_description, p_sms_message_id);

  RETURN QUERY SELECT true::BOOLEAN, v_new_balance, NULL::TEXT;
END;
$$;

-- ============================================================================
-- 5. add_sms_balance RPC — for admin recharges
-- ============================================================================

CREATE OR REPLACE FUNCTION add_sms_balance(
  p_workspace_id UUID,
  p_amount DECIMAL,
  p_created_by UUID,
  p_description TEXT DEFAULT 'Recarga manual'
)
RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config sms_workspace_config%ROWTYPE;
  v_new_balance DECIMAL;
BEGIN
  -- Lock the row for atomic read-check-update
  SELECT * INTO v_config
  FROM sms_workspace_config
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, 0::DECIMAL, 'SMS no activado en este workspace'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_config.balance_cop + p_amount;

  -- Update balance
  UPDATE sms_workspace_config
  SET balance_cop = v_new_balance,
      updated_at = timezone('America/Bogota', NOW())
  WHERE workspace_id = p_workspace_id;

  -- Log transaction
  INSERT INTO sms_balance_transactions (workspace_id, type, amount_cop, balance_after, description, created_by)
  VALUES (p_workspace_id, 'recharge', p_amount, v_new_balance, p_description, p_created_by);

  RETURN QUERY SELECT true::BOOLEAN, v_new_balance, NULL::TEXT;
END;
$$;
