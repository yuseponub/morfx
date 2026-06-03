-- Migration: Grant table privileges on workspace_meta_accounts
-- Purpose: Fix "permission denied for table workspace_meta_accounts" — the table
--          (migration 20260401100000, Phase 37) was created without GRANTs to
--          service_role, so the domain layer's createAdminClient() INSERT/UPDATE
--          in src/lib/domain/meta-accounts.ts (upsertMetaAccount) failed at the
--          Embedded Signup smoke (Phase 38).
-- Phase: 38 (Embedded Signup + WhatsApp Inbound) — corrective
-- Context: Same class of bug as Phase 44.1 (platform_config) — tables created via
--          Supabase Studio SQL Editor do NOT auto-grant to service_role, unlike
--          `supabase db push`. Persisted here so future environments inherit it.
-- Regla 5: APPLY THIS IN PROD before relying on the column/table from code.

-- service_role performs all mutations (createAdminClient bypasses RLS but still
-- needs table-level privileges).
GRANT ALL ON TABLE workspace_meta_accounts TO service_role;

-- authenticated needs SELECT for the existing RLS read policy
-- ("workspace_members_read_meta_accounts") to actually return rows.
GRANT SELECT ON TABLE workspace_meta_accounts TO authenticated;
