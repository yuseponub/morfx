-- ============================================================================
-- Phase 43 Plan 01: Bot toggle three-state (On / Off / Muted-for-duration)
-- ============================================================================
--
-- AUDIT FINDINGS (Task 1 of plan 43-01):
--
-- Existing per-conversation bot toggle columns (added in
-- supabase/migrations/20260209000000_agent_production.sql):
--
--   conversations.agent_conversational BOOLEAN DEFAULT NULL
--     -- NULL = inherit workspace setting, true = explicitly enabled, false = disabled
--   conversations.agent_crm          BOOLEAN DEFAULT NULL
--     -- Same tri-state semantics for the CRM agent subset
--
-- Workspace-level default lives in workspace_agent_config.agent_enabled.
--
-- There is NO existing `bot_enabled` boolean column on conversations, so no
-- backfill from a legacy boolean is required. The new `bot_mode` column is
-- additive and coexists with `agent_conversational` — it is NOT a rename.
-- A later cleanup phase may consolidate both once the mobile + web code paths
-- fully migrate to `bot_mode`. For now we keep `agent_conversational` intact
-- so this migration is fully reversible and does not disrupt the production
-- agent runtime.
--
-- Web code paths that read/write the current column today:
--   src/app/(dashboard)/whatsapp/components/chat-header.tsx
--   src/app/(dashboard)/whatsapp/components/agent-config-slider.tsx
--   src/app/(dashboard)/agentes/components/config-panel.tsx
--   src/app/actions/agent-config.ts
--   src/lib/agents/production/agent-config.ts
--   src/inngest/functions/agent-timers.ts
--   src/inngest/functions/agent-timers-v3.ts
--
-- This migration adds:
--   1. enum type conversation_bot_mode ('on' | 'off' | 'muted')
--   2. conversations.bot_mode conversation_bot_mode NOT NULL DEFAULT 'on'
--   3. conversations.bot_mute_until timestamptz NULL
--   4. CHECK constraint: bot_mute_until is only set when bot_mode = 'muted'
--   5. Partial index for the auto-resume worker that polls muted rows
--
-- Storage is UTC (timestamptz). Display-side timezone conversion to
-- America/Bogota happens in the application layer per CLAUDE.md Regla 2.
-- ============================================================================

-- 1. Enum type (idempotent: re-running the migration is safe)
DO $$
BEGIN
  CREATE TYPE conversation_bot_mode AS ENUM ('on', 'off', 'muted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 2. bot_mode column — defaults to 'on' so existing rows stay active
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS bot_mode conversation_bot_mode NOT NULL DEFAULT 'on';

-- 3. bot_mute_until column — nullable, only populated when bot_mode = 'muted'
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS bot_mute_until timestamptz NULL;

-- 4. No legacy boolean to backfill from (see audit findings above).
--    `agent_conversational` uses tri-state NULL/true/false semantics that do
--    NOT map cleanly onto on/off/muted — NULL means "inherit workspace", which
--    is effectively "on" from the mobile app's perspective. Leaving every
--    existing row at the default 'on' is the correct behavior: nothing gets
--    silently muted or disabled by this migration.

-- 5. Consistency CHECK constraint: mute timestamp requires muted mode.
--    Guarded with DO block so re-runs are safe.
DO $$
BEGIN
  ALTER TABLE conversations
    ADD CONSTRAINT conversations_bot_mute_until_requires_muted
    CHECK (bot_mute_until IS NULL OR bot_mode = 'muted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END
$$;

-- 6. Partial index for the auto-resume worker.
--    The worker will periodically scan muted rows whose mute window elapsed
--    and flip them back to 'on'. A partial index keeps the scan cheap.
CREATE INDEX IF NOT EXISTS idx_conversations_bot_muted
  ON conversations (bot_mute_until)
  WHERE bot_mode = 'muted';

-- 7. Documentation comments
COMMENT ON COLUMN conversations.bot_mode IS
  'Three-state bot toggle: on (bot replies), off (humans only), muted (bot paused until bot_mute_until). Added in Phase 43 Plan 01 for mobile app.';

COMMENT ON COLUMN conversations.bot_mute_until IS
  'UTC timestamp when a muted bot auto-resumes. NULL unless bot_mode = ''muted''. Enforced by conversations_bot_mute_until_requires_muted CHECK constraint.';
