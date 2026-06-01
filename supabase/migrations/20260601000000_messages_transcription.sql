-- v4-media-audio-image (#3) — Wave 0 / D-09 / Regla 5
-- Persist audio transcripts for somnio-sales-v4 (written via domain setMessageTranscription, Wave 1).
-- Additive, non-destructive, NO backfill (D-04 forward-looking — old audios stay NULL).
ALTER TABLE messages ADD COLUMN transcription TEXT NULL;
