/**
 * Media Gate
 * Phase 32: Media Processing - Plan 02
 *
 * Main entry point for media processing. Routes each incoming message
 * to the correct handler based on its type and returns a MediaGateResult
 * that determines how the pipeline proceeds.
 *
 * Placement: Runs BEFORE intent detection in the Inngest pipeline.
 * The media gate transforms non-text messages into text equivalents
 * (passthrough), triggers handoff, notifies the host, or ignores.
 *
 * Message type routing:
 * - text     -> passthrough (direct, no processing)
 * - audio    -> transcribe via Whisper, passthrough text or handoff on failure
 * - image    -> immediate handoff
 * - video    -> immediate handoff
 * - sticker  -> interpret via Claude Vision, passthrough gesture or ignore
 * - reaction -> map emoji to text, notify_host, or ignore
 */

import type { MediaGateInput, MediaGateResult } from './types'
import { transcribeAudioFromUrl } from './audio-transcriber'
import { interpretSticker } from './sticker-interpreter'
import { mapReaction, reactionToMediaGateResult } from './reaction-mapper'
import { createModuleLogger } from '@/lib/audit/logger'

const log = createModuleLogger('media-gate')

/**
 * Process a message through the media gate.
 * Routes by messageType to the appropriate handler and returns a MediaGateResult.
 *
 * @param input - Message data from the Inngest event
 * @returns MediaGateResult determining pipeline behavior
 */
export async function processMediaGate(input: MediaGateInput): Promise<MediaGateResult> {
  switch (input.messageType) {
    case 'text':
      return { action: 'passthrough', text: input.messageContent }

    case 'audio':
      return handleAudio(input)

    case 'image':
      return { action: 'handoff', reason: 'Cliente envio una imagen' }

    case 'video':
      return { action: 'handoff', reason: 'Cliente envio un video' }

    case 'sticker':
      return handleSticker(input)

    case 'reaction':
      return handleReaction(input)

    default:
      return { action: 'ignore' }
  }
}

// ---------------------------------------------------------------------------
// Internal handlers
// ---------------------------------------------------------------------------

/**
 * Handle audio messages: transcribe via Whisper, passthrough text or handoff.
 */
async function handleAudio(input: MediaGateInput): Promise<MediaGateResult> {
  if (!input.mediaUrl) {
    log.info({
      event: 'audio_handoff',
      reason: 'no_media_url',
      conversationId: input.conversationId,
    })
    return { action: 'handoff', reason: 'No se pudo transcribir el audio del cliente' }
  }

  const result = await transcribeAudioFromUrl(
    input.mediaUrl,
    input.mediaMimeType || 'audio/ogg'
  )

  if (result.success) {
    log.debug({
      event: 'audio_transcribed',
      conversationId: input.conversationId,
      charCount: result.text.length,
    })
    return { action: 'passthrough', text: result.text }
  }

  log.info({
    event: 'audio_handoff',
    reason: 'transcription_failed',
    error: result.error,
    conversationId: input.conversationId,
  })
  return { action: 'handoff', reason: 'No se pudo transcribir el audio del cliente' }
}

/**
 * Handle sticker messages: interpret via Claude Vision, passthrough gesture or ignore.
 */
async function handleSticker(input: MediaGateInput): Promise<MediaGateResult> {
  if (!input.mediaUrl) {
    log.debug({
      event: 'sticker_ignored',
      reason: 'no_media_url',
      conversationId: input.conversationId,
    })
    return { action: 'ignore' }
  }

  const result = await interpretSticker(input.mediaUrl)

  if (result.gesto !== null) {
    log.debug({
      event: 'sticker_interpreted',
      gesto: result.gesto,
      descripcion: result.descripcion,
      conversationId: input.conversationId,
    })
    return { action: 'passthrough', text: result.gesto }
  }

  log.debug({
    event: 'sticker_ignored',
    reason: 'unrecognized',
    descripcion: result.descripcion,
    conversationId: input.conversationId,
  })
  return { action: 'ignore' }
}

/**
 * Handle reaction messages: map emoji to text, notify_host, or ignore.
 */
function handleReaction(input: MediaGateInput): MediaGateResult {
  // messageContent contains the raw emoji string (set by webhook handler)
  const action = mapReaction(input.messageContent)
  const result = reactionToMediaGateResult(action)

  if (result.action !== 'ignore') {
    log.debug({
      event: 'reaction_mapped',
      action: result.action,
      conversationId: input.conversationId,
    })
  }

  return result
}
