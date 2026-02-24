/**
 * Media Gate Types
 * Phase 32: Media Processing - Plan 01
 *
 * Type contracts for the media gate pipeline that classifies and transforms
 * non-text WhatsApp messages before they reach intent detection.
 */

/**
 * Input to the media gate. Built from the Inngest event data
 * for agent/whatsapp.message_received.
 */
export interface MediaGateInput {
  /** Message type from WhatsApp: 'text' | 'audio' | 'image' | 'video' | 'sticker' | 'reaction' */
  messageType: string
  /** Text body for text messages, emoji for reactions, '[Audio]' / '[Imagen]' etc. for media */
  messageContent: string
  /** Supabase Storage public URL (already re-hosted by webhook handler) */
  mediaUrl: string | null
  /** MIME type of the media file (e.g. 'audio/ogg', 'image/webp') */
  mediaMimeType: string | null
  workspaceId: string
  conversationId: string
  phone: string
}

/**
 * Result from the media gate. Determines how the pipeline proceeds:
 * - passthrough: Continue to normal intent detection with the given text
 * - handoff: Hand off to human agent (image/video, failed transcription)
 * - notify_host: Notify host only, bot stays active (negative reactions)
 * - ignore: Silently ignore (unmapped reactions, unrecognized stickers)
 */
export type MediaGateResult =
  | { action: 'passthrough'; text: string }
  | { action: 'handoff'; reason: string }
  | { action: 'notify_host'; reason: string }
  | { action: 'ignore' }
