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
  /**
   * Resolved agent ID — used to gate v4-only branches (D-01 / Regla 6).
   * Non-v4 agents fall to byte-identical existing behavior.
   * Plan 03 (v4-media-audio-image Wave 2).
   */
  resolvedAgentId: string
}

/**
 * Result from the media gate. Determines how the pipeline proceeds:
 * - passthrough: Continue to normal intent detection with the given text
 * - handoff: Hand off to human agent (image/video, failed transcription)
 * - notify_host: Notify host only, bot stays active (negative reactions)
 * - ignore: Silently ignore (unmapped reactions, unrecognized stickers)
 */
export type MediaGateResult =
  | {
      action: 'passthrough'
      text: string
      /**
       * Audio transcript — only set on the v4 audio path (handleAudioV4).
       * All other passthrough cases omit this field (additive, non-breaking).
       * Consumed by agent-production.ts `persist-transcription` step.
       * Plan 03 (v4-media-audio-image Wave 2).
       */
      transcription?: string
    }
  | { action: 'handoff'; reason: string }
  | { action: 'notify_host'; reason: string }
  | { action: 'ignore' }
  | {
      /**
       * v4 image respond path — carries vision classification context forward
       * so the engine (Plan 04) can produce a grounded RAG answer.
       * The media-gate has NO send primitive; the engine emits the response.
       * Plan 03 (v4-media-audio-image Wave 2).
       */
      action: 'vision_respond'
      descripcion: string
      categoria: string
    }
