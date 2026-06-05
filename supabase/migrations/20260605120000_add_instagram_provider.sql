-- Migration: Add instagram_provider routing flag to workspaces
-- Purpose: Per-workspace selection between manychat (legacy proxy) and meta_direct (Graph API)
--          for INSTAGRAM, INDEPENDENT of messenger_provider (D-IG-02). DB-enforced default
--          'manychat' = every existing workspace (incl. godentist-fb-ig) stays unchanged,
--          zero backfill (Regla 6). Sibling of 20260604120000_add_messenger_provider.sql.
-- Phase: 41-instagram-direct — MIG-02 / D-IG-02
--
-- REGLA 5 (HARD GATE): APPLY THIS MIGRATION IN PROD BEFORE pushing any code that references
--   workspaces.instagram_provider (the readInstagramProvider chokepoint in domain/messages.ts).
--   Deploying provider-reading code against a missing column is the 20h-lost-messages failure mode.

ALTER TABLE workspaces
  ADD COLUMN instagram_provider TEXT NOT NULL DEFAULT 'manychat'
  CHECK (instagram_provider IN ('manychat', 'meta_direct'));

-- Optional display-only IG handle on the meta-account row (D-IG-04 Claude's Discretion).
-- ig_account_id (the identity) + uq_meta_ig + idx_meta_accounts_ig ALREADY EXIST (Phase 37) — do NOT re-add.
ALTER TABLE workspace_meta_accounts
  ADD COLUMN ig_username TEXT;
