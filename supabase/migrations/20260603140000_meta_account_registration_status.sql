-- Migration: registration lifecycle + 2SV PIN on workspace_meta_accounts
-- Purpose: Phase 38 gap-closure (Plan 04 deviation). The Embedded Signup onboarding
--          must call /register after subscribe to actually ACTIVATE the number on
--          Cloud API (otherwise it stays PENDING and receives nothing — proven live
--          2026-06-03). register can fail in a known chain (2SV → payment → other),
--          so we persist a registration_status the UI can surface, plus the NEW 2SV
--          PIN we set (encrypted) for future re-register/operations.
-- Phase: 38 (embedded-signup-wa-inbound) — gap-closure
-- Context: see .planning/phases/38-embedded-signup-wa-inbound/PLAYBOOK-number-activation.md
-- Regla 5: APPLY IN PROD before pushing the code that reads/writes these columns.
-- Regla 2: timestamps already America/Bogota on this table.

-- Registration lifecycle of the number on Cloud API.
--   pending        — row created, register not yet attempted / in progress
--   connected      — register returned success:true → number active on Cloud API
--   needs_2sv      — register blocked by leftover two-step verification (err 2388001)
--   needs_payment  — register blocked: WABA has no payment method ("Cannot Migrate")
--   register_failed— register failed for another reason (see registration_error)
ALTER TABLE workspace_meta_accounts
  ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (registration_status IN ('pending','connected','needs_2sv','needs_payment','register_failed'));

-- Last register error message (server-side detail; safe to show a derived hint in UI).
ALTER TABLE workspace_meta_accounts
  ADD COLUMN IF NOT EXISTS registration_error TEXT;

-- The 6-digit two-step verification PIN we SET at register, AES-256-GCM encrypted
-- (same packed format as access_token_encrypted). Needed to re-register / manage the
-- number later. NULL until a successful register sets it. Never logged/returned to client.
ALTER TABLE workspace_meta_accounts
  ADD COLUMN IF NOT EXISTS two_step_pin_encrypted TEXT;

-- Backfill: the number connected during the 2026-06-03 smoke is already CONNECTED
-- (registered manually with PIN 601947). Mark it so the new UI reflects reality.
UPDATE workspace_meta_accounts
  SET registration_status = 'connected'
  WHERE phone_number_id = '1134593926408063'
    AND registration_status = 'pending';
