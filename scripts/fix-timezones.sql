-- ============================================================================
-- FIX TIMEZONE: Change all defaults from timezone('America/Bogota', NOW()) to NOW()
-- NOW() returns correct TIMESTAMPTZ in UTC.
-- ============================================================================

-- PART 1: FIX COLUMN DEFAULTS

ALTER TABLE tags ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE contacts ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE contacts ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE contact_tags ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE products ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE products ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE pipelines ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE pipelines ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE orders ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE orders ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE order_products ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE order_tags ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE saved_views ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE saved_views ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE pipeline_stages ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE custom_field_definitions ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE contact_notes ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE contact_notes ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE contact_activity ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE conversations ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE conversations ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE messages ALTER COLUMN timestamp SET DEFAULT NOW();
ALTER TABLE messages ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE whatsapp_templates ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE whatsapp_templates ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE teams ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE team_members ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE quick_replies ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE quick_replies ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE message_costs ALTER COLUMN recorded_at SET DEFAULT NOW();
ALTER TABLE tool_executions ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE api_keys ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE conversation_tags ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE order_states ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE order_states ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE tasks ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE tasks ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE task_notes ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE task_notes ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE task_activity ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE integrations ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE integrations ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE webhook_events ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE agent_sessions ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE agent_sessions ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE agent_sessions ALTER COLUMN last_activity_at SET DEFAULT NOW();
ALTER TABLE automations ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE automations ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE automation_executions ALTER COLUMN started_at SET DEFAULT NOW();
ALTER TABLE mutation_audit ALTER COLUMN occurred_at SET DEFAULT NOW();
ALTER TABLE builder_sessions ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE builder_sessions ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE sms_messages ALTER COLUMN created_at SET DEFAULT NOW();

-- PART 2: FIX TRIGGER

CREATE OR REPLACE FUNCTION set_tasks_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at := NOW();
  END IF;
  IF NEW.status != 'completed' AND OLD.status = 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- PART 3: FIX EXISTING DATA (+5 hours)

UPDATE orders SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE automations SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE automation_executions SET started_at = started_at + interval '5 hours', completed_at = CASE WHEN completed_at IS NOT NULL THEN completed_at + interval '5 hours' ELSE NULL END;
UPDATE contacts SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE conversations SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE messages SET created_at = created_at + interval '5 hours';
UPDATE tags SET created_at = created_at + interval '5 hours';
UPDATE contact_tags SET created_at = created_at + interval '5 hours';
UPDATE order_tags SET created_at = created_at + interval '5 hours';
UPDATE order_products SET created_at = created_at + interval '5 hours';
UPDATE products SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE pipelines SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE pipeline_stages SET created_at = created_at + interval '5 hours';
UPDATE order_states SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE tasks SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours', completed_at = CASE WHEN completed_at IS NOT NULL THEN completed_at + interval '5 hours' ELSE NULL END;
UPDATE quick_replies SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE teams SET created_at = created_at + interval '5 hours';
UPDATE whatsapp_templates SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE integrations SET created_at = created_at + interval '5 hours', updated_at = updated_at + interval '5 hours';
UPDATE mutation_audit SET occurred_at = occurred_at + interval '5 hours';
