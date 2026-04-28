-- ============================================================================
-- godentist-blast-sms-experiment / Plan 02
-- Setup balance + activación SMS para workspace GoDentist
--
-- Decisiones de referencia:
--   D-09: sendSMS requiere fila en sms_workspace_config con is_active=true
--   D-13.2: saldo inicial >= $428k (4.142 SMS × $97 + 12% margen = $450k)
--   D-13.3: is_active = true desde el inicio
--
-- Idempotente via ON CONFLICT — re-correr es seguro.
-- NO requiere schema migration (la tabla ya existe en prod desde
-- 20260316100000_sms_onurix_foundation.sql).
-- ============================================================================

-- 1. INSERT con ON CONFLICT — idempotente
INSERT INTO sms_workspace_config (
  workspace_id,
  is_active,
  balance_cop,
  allow_negative_balance,
  total_sms_sent
)
VALUES (
  '36a74890-aad6-4804-838c-57904b1c9328',  -- GoDentist
  true,
  450000.00,
  false,
  0
)
ON CONFLICT (workspace_id) DO UPDATE SET
  is_active = EXCLUDED.is_active,
  balance_cop = GREATEST(sms_workspace_config.balance_cop, EXCLUDED.balance_cop),  -- never reduce existing balance
  allow_negative_balance = EXCLUDED.allow_negative_balance;

-- 2. Verificación post-INSERT (no muta — solo lee)
SELECT
  workspace_id,
  is_active,
  balance_cop,
  allow_negative_balance,
  total_sms_sent,
  created_at,
  updated_at
FROM sms_workspace_config
WHERE workspace_id = '36a74890-aad6-4804-838c-57904b1c9328';
