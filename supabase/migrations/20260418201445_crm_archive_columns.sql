-- =====================================================================
-- Migration: 20260418201445_crm_archive_columns.sql
-- Phase 44: CRM Bots (Read + Write) — Plan 03
-- Date: 2026-04-18
-- Purpose:
--   Agregar columna archived_at TIMESTAMPTZ NULL a contactos, pedidos,
--   notas de contacto, y notas de pedido. Permite soft-delete requerido
--   por CONTEXT D-05 (writer crm-bot NO puede DELETE real, solo archivar).
--
-- ADDITIVE ONLY: solo ADD COLUMN + CREATE INDEX. Cero ALTER existing, cero DROP.
-- La columna es nullable — filas existentes quedan con archived_at=NULL = activas.
--
-- REGLA 5: este archivo DEBE aplicarse manualmente en produccion ANTES
-- de pushear el codigo de Plan 03/04/05 a Vercel.
-- =====================================================================

ALTER TABLE contacts ADD COLUMN archived_at TIMESTAMPTZ NULL;
ALTER TABLE orders ADD COLUMN archived_at TIMESTAMPTZ NULL;
ALTER TABLE contact_notes ADD COLUMN archived_at TIMESTAMPTZ NULL;
ALTER TABLE order_notes ADD COLUMN archived_at TIMESTAMPTZ NULL;

-- Partial indexes for fast "only active rows" queries — most frequent access pattern.
CREATE INDEX idx_contacts_active ON contacts(workspace_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_orders_active ON orders(workspace_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_contact_notes_active ON contact_notes(contact_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_order_notes_active ON order_notes(order_id, created_at DESC) WHERE archived_at IS NULL;

COMMENT ON COLUMN contacts.archived_at IS
  'Soft-delete timestamp (Phase 44). NULL = active. Set by crm-writer archiveContact. Human UI still uses hard deleteContact.';
COMMENT ON COLUMN orders.archived_at IS
  'Soft-delete timestamp (Phase 44). NULL = active.';
COMMENT ON COLUMN contact_notes.archived_at IS
  'Soft-delete timestamp (Phase 44). NULL = active.';
COMMENT ON COLUMN order_notes.archived_at IS
  'Soft-delete timestamp (Phase 44). NULL = active.';
