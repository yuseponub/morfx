-- Migration: Add whatsapp_provider routing flag to workspaces
-- Purpose: Per-workspace selection between 360dialog (legacy) and meta_direct (Cloud API).
--          DB-enforced default '360dialog' = every existing workspace (Somnio + clients)
--          stays unchanged with zero backfill (Regla 6).
-- Phase: 38 (Embedded Signup + WhatsApp Inbound) — MIG-01
-- Read by: Phase 39 outbound sender selection. NOT read at Phase 38 inbound (routing
--          disambiguated by endpoint + resolveByPhoneNumberId).
-- Regla 5: APPLY THIS IN PROD BEFORE pushing any code that references the column.

ALTER TABLE workspaces
  ADD COLUMN whatsapp_provider TEXT NOT NULL DEFAULT '360dialog'
  CHECK (whatsapp_provider IN ('360dialog', 'meta_direct'));
