-- Add contact_tags to realtime publication so tag changes broadcast to inbox channel
ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags;
