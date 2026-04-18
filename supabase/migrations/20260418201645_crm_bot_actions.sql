-- =====================================================================
-- Migration: 20260418201645_crm_bot_actions.sql
-- Phase 44: CRM Bots (Read + Write) — Plan 01
-- Date: 2026-04-18
-- Purpose:
--   Crear tabla crm_bot_actions para persistir el ciclo two-step
--   (propose -> confirm) del crm-writer + audit log de acciones del
--   crm-reader.
--
-- ADDITIVE ONLY: cero ALTER/DROP de tablas existentes.
--
-- REGLA 5: este archivo DEBE aplicarse manualmente en produccion ANTES
-- de que cualquier codigo que lo referencie sea pusheado a Vercel.
-- =====================================================================

CREATE TABLE crm_bot_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL CHECK (agent_id IN ('crm-reader', 'crm-writer')),
  invoker TEXT,
  tool_name TEXT NOT NULL,
  input_params JSONB NOT NULL,
  preview JSONB,
  output JSONB,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'executed', 'failed', 'expired')),
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  expires_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

CREATE INDEX idx_crm_bot_actions_workspace_created
  ON crm_bot_actions(workspace_id, created_at DESC);

CREATE INDEX idx_crm_bot_actions_proposed_expires
  ON crm_bot_actions(expires_at)
  WHERE status = 'proposed';

CREATE INDEX idx_crm_bot_actions_agent_status
  ON crm_bot_actions(agent_id, status);

COMMENT ON TABLE crm_bot_actions IS
  'Audit + state machine for CRM Bots (Phase 44). Writer two-step: proposed -> executed. Reader: inserted only if a write happens via shared audit path (not used today per Decision to NOT log reader tool calls here).';
COMMENT ON COLUMN crm_bot_actions.expires_at IS
  'Null for reader rows (read-only). Set to created_at + 5 min for writer proposals.';
COMMENT ON COLUMN crm_bot_actions.preview IS
  '{action, entity, before?, after} — what the mutation would do. Null for reader.';
