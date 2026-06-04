-- Migration: Add messenger_provider routing flag to workspaces
-- Purpose: Per-workspace selection between manychat (legacy proxy) and meta_direct (Graph API).
--          DB-enforced default 'manychat' = every existing workspace (incl. the protected
--          godentist-fb-ig agent) stays unchanged with zero backfill (Regla 6).
-- Phase: 40-facebook-messenger-direct — MIG-02 / D-10
-- Read by: Phase 40 Plan 04 (domain chokepoint) + Plans 06/07 (provider-reading code).
--          NOT flipped to meta_direct here — the manual cutover is Plan 08.
-- Regla 5: APPLY IN PROD BEFORE pushing any code that references workspaces.messenger_provider.

ALTER TABLE workspaces
  ADD COLUMN messenger_provider TEXT NOT NULL DEFAULT 'manychat'
  CHECK (messenger_provider IN ('manychat', 'meta_direct'));
