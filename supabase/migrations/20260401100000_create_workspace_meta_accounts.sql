-- Migration: Create workspace_meta_accounts table
-- Purpose: Store encrypted Meta API credentials per workspace per channel
-- Used by: src/lib/meta/credentials.ts for token resolution
-- Phase: 37 (Meta App Setup + Foundation)

CREATE TABLE workspace_meta_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Account identifiers (one or more populated depending on channel)
  waba_id TEXT,                    -- WhatsApp Business Account ID
  phone_number_id TEXT,            -- WhatsApp phone number ID
  phone_number TEXT,               -- Display phone number (E.164 format)
  page_id TEXT,                    -- Facebook Page ID
  ig_account_id TEXT,              -- Instagram account ID
  business_id TEXT,                -- Meta Business Portfolio ID

  -- Encrypted access token (AES-256-GCM packed format: base64(iv + authTag + ciphertext))
  access_token_encrypted TEXT NOT NULL,

  -- Channel type
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'facebook', 'instagram')),

  -- Provider (always 'meta_direct' for now, supports future expansion)
  provider TEXT NOT NULL DEFAULT 'meta_direct',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),

  -- Metadata (optional, populated from Meta API)
  account_name TEXT,
  quality_rating TEXT,
  messaging_limit TEXT,

  -- Timestamps (Regla 2: America/Bogota)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Global uniqueness: a phone/page/ig account belongs to exactly one row
  CONSTRAINT uq_meta_phone UNIQUE (phone_number_id),
  CONSTRAINT uq_meta_page UNIQUE (page_id),
  CONSTRAINT uq_meta_ig UNIQUE (ig_account_id)
);

-- Only one active account per workspace per channel
CREATE UNIQUE INDEX idx_meta_accounts_active_per_ws
  ON workspace_meta_accounts(workspace_id, channel)
  WHERE is_active = true;

-- Fast webhook routing indexes (lookup by channel identifier)
CREATE INDEX idx_meta_accounts_phone ON workspace_meta_accounts(phone_number_id) WHERE phone_number_id IS NOT NULL;
CREATE INDEX idx_meta_accounts_page ON workspace_meta_accounts(page_id) WHERE page_id IS NOT NULL;
CREATE INDEX idx_meta_accounts_ig ON workspace_meta_accounts(ig_account_id) WHERE ig_account_id IS NOT NULL;
CREATE INDEX idx_meta_accounts_workspace ON workspace_meta_accounts(workspace_id);

-- RLS: workspace members can read their own workspace's accounts (token stays encrypted in DB)
ALTER TABLE workspace_meta_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_meta_accounts"
  ON workspace_meta_accounts FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE via RLS — all mutations go through createAdminClient()
-- This prevents accidental client-side token modification

-- Updated_at trigger (reuses existing function from project)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON workspace_meta_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
