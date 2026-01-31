-- ============================================================================
-- Phase 7: WhatsApp Conversations & Messages
-- WhatsApp Business API integration via 360dialog
-- ============================================================================

-- ============================================================================
-- CONVERSATIONS TABLE
-- One conversation per unique phone number per workspace
-- ============================================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Phone identity
  phone TEXT NOT NULL,             -- E.164 format (+573001234567)
  phone_number_id TEXT NOT NULL,   -- 360dialog WhatsApp phone number ID

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  unread_count INTEGER NOT NULL DEFAULT 0,

  -- 24h window tracking
  last_customer_message_at TIMESTAMPTZ,  -- For 24h window calculation
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,

  -- Assignment (Phase 8, but schema now)
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Unique constraint: one conversation per phone per workspace
  UNIQUE(workspace_id, phone)
);

-- ============================================================================
-- MESSAGES TABLE
-- All WhatsApp messages (inbound and outbound)
-- ============================================================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- WhatsApp message ID for deduplication
  wamid TEXT,  -- Globally unique WhatsApp message ID

  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- Message content
  type TEXT NOT NULL CHECK (type IN (
    'text', 'image', 'video', 'audio', 'document', 'sticker',
    'location', 'contacts', 'template', 'interactive', 'reaction'
  )),
  content JSONB NOT NULL,  -- Flexible for different message types

  -- Status (primarily for outbound messages)
  status TEXT CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  status_timestamp TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,

  -- Media (stored in our system, not 360dialog's expiring URLs)
  media_url TEXT,           -- Our permanent URL (Supabase Storage)
  media_mime_type TEXT,
  media_filename TEXT,

  -- Timestamps (America/Bogota timezone)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Unique constraint on wamid (for deduplication)
-- Using partial unique index since wamid can be NULL for some outbound messages
ALTER TABLE messages ADD CONSTRAINT messages_wamid_unique UNIQUE (wamid);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Conversations indexes
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_conversations_phone ON conversations(workspace_id, phone);
CREATE INDEX idx_conversations_updated ON conversations(workspace_id, last_message_at DESC);
CREATE INDEX idx_conversations_contact ON conversations(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_conversations_assigned ON conversations(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_conversations_status ON conversations(workspace_id, status);
CREATE INDEX idx_conversations_unread ON conversations(workspace_id, is_read) WHERE is_read = false;

-- Messages indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id, timestamp DESC);
CREATE INDEX idx_messages_wamid ON messages(wamid) WHERE wamid IS NOT NULL;
CREATE INDEX idx_messages_workspace ON messages(workspace_id);
CREATE INDEX idx_messages_direction ON messages(conversation_id, direction);

-- ============================================================================
-- TRIGGERS: Auto-set workspace_id
-- ============================================================================

-- Conversations auto-set workspace_id
CREATE TRIGGER conversations_set_workspace
  BEFORE INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- Messages auto-set workspace_id
CREATE TRIGGER messages_set_workspace
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- ============================================================================
-- TRIGGERS: Auto-update updated_at
-- ============================================================================

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGER FUNCTION: Update conversation on new message
-- Updates last_message_at, preview, unread_count, and last_customer_message_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview_text TEXT;
BEGIN
  -- Generate preview text based on message type
  CASE NEW.type
    WHEN 'text' THEN
      preview_text := LEFT(NEW.content ->> 'body', 100);
    WHEN 'image' THEN
      preview_text := '[Imagen]';
    WHEN 'video' THEN
      preview_text := '[Video]';
    WHEN 'audio' THEN
      preview_text := '[Audio]';
    WHEN 'document' THEN
      preview_text := '[Documento]';
    WHEN 'sticker' THEN
      preview_text := '[Sticker]';
    WHEN 'location' THEN
      preview_text := '[Ubicacion]';
    WHEN 'contacts' THEN
      preview_text := '[Contacto]';
    WHEN 'template' THEN
      preview_text := '[Template]';
    WHEN 'interactive' THEN
      preview_text := '[Interactivo]';
    WHEN 'reaction' THEN
      preview_text := '[Reaccion]';
    ELSE
      preview_text := '[Mensaje]';
  END CASE;

  -- Update conversation
  UPDATE conversations
  SET
    last_message_at = NEW.timestamp,
    last_message_preview = preview_text,
    -- Only update last_customer_message_at for inbound messages
    last_customer_message_at = CASE
      WHEN NEW.direction = 'inbound' THEN NEW.timestamp
      ELSE last_customer_message_at
    END,
    -- Only increment unread_count for inbound messages
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    is_read = CASE
      WHEN NEW.direction = 'inbound' THEN false
      ELSE is_read
    END
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

-- Trigger on messages insert
CREATE TRIGGER messages_update_conversation
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CONVERSATIONS POLICIES
-- Workspace isolation using is_workspace_member()
-- ============================================================================

CREATE POLICY "conversations_workspace_isolation_select"
  ON conversations FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "conversations_workspace_isolation_insert"
  ON conversations FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "conversations_workspace_isolation_update"
  ON conversations FOR UPDATE
  USING (is_workspace_member(workspace_id));

CREATE POLICY "conversations_workspace_isolation_delete"
  ON conversations FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ============================================================================
-- MESSAGES POLICIES
-- Access via parent conversation workspace
-- ============================================================================

CREATE POLICY "messages_access_select"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND is_workspace_member(conversations.workspace_id)
    )
  );

CREATE POLICY "messages_access_insert"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND is_workspace_member(conversations.workspace_id)
    )
  );

CREATE POLICY "messages_access_update"
  ON messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND is_workspace_member(conversations.workspace_id)
    )
  );

CREATE POLICY "messages_access_delete"
  ON messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND is_workspace_member(conversations.workspace_id)
    )
  );

-- ============================================================================
-- ENABLE REALTIME
-- For instant message updates in the UI
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
