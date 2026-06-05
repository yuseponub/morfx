-- Migration: Relax uq_meta_page so an Instagram row can share its Facebook Page's page_id
-- Purpose: GAP-41-02 (Phase 41 instagram-direct, discovered live 2026-06-05, Varixcenter).
--          Instagram rides on the workspace's connected Facebook Page and is stored as a
--          SEPARATE channel='instagram' row that reuses the SAME page_id (the IG sender
--          needs creds.pageId — src/lib/channels/meta-instagram-sender.ts). The original
--          global CONSTRAINT uq_meta_page UNIQUE (page_id) (Phase 37 migration
--          20260401100000) forbade two rows sharing a page_id, so connectInstagramAccount's
--          IG-row INSERT collided with the existing facebook row → the operator saw
--          "Esta página ya está conectada en otro espacio de trabajo."
-- Phase: 41-instagram-direct — GAP-41-02
--
-- Fix: replace the GLOBAL unique CONSTRAINT with a PARTIAL unique INDEX scoped to
--      channel='facebook'. This keeps the real invariant ("one Facebook Page belongs to
--      exactly one facebook row → one workspace", preventing cross-workspace page theft)
--      while letting the linked Instagram row reuse the same page_id. Instagram identity
--      stays globally unique via uq_meta_ig (ig_account_id) — untouched.
--
-- Naming: the new index is intentionally still called `uq_meta_page` so the domain
--         mapWriteError check (`lower.includes('uq_meta_page')` in
--         src/lib/domain/meta-accounts.ts) keeps surfacing the clear Spanish error on a
--         genuine cross-workspace facebook page collision.
--
-- Safety on existing prod data: existing facebook rows are already unique on page_id
--   (the dropped constraint enforced it); whatsapp rows have NULL page_id (ignored by the
--   partial index); there are zero instagram rows at apply time. The partial index builds
--   clean.
--
-- REGLA 5: applied in prod BEFORE this file landed (the connectInstagramAccount code was
--   already deployed and failing only on this constraint; relaxing it makes the live code
--   succeed with no redeploy). This file reconciles the migration history with prod.

ALTER TABLE workspace_meta_accounts DROP CONSTRAINT uq_meta_page;

CREATE UNIQUE INDEX uq_meta_page
  ON workspace_meta_accounts (page_id)
  WHERE channel = 'facebook';
