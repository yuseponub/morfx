-- ============================================================================
-- Migration: Quick Replies Media Support
-- Phase: 08.2
-- Description: Add media attachment support to quick replies
-- ============================================================================

-- Add media columns to quick_replies table
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS media_type TEXT;

-- Add comments for documentation
COMMENT ON COLUMN quick_replies.media_url IS 'URL of attached media file in Supabase Storage';
COMMENT ON COLUMN quick_replies.media_type IS 'Type of media: image, video, document, audio';

-- Add check constraint for valid media types
ALTER TABLE quick_replies ADD CONSTRAINT quick_replies_media_type_check
  CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'document', 'audio'));
