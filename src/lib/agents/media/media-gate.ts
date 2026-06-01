/**
 * Media Gate
 * Phase 32: Media Processing - Plan 02
 * Updated: Plan 03 (v4-media-audio-image Wave 2) — v4-only audio/image branches
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
 * - audio    -> v4: transcribe (handleAudioV4) + carry transcript for persistence
 *               non-v4: transcribe via Whisper (handleAudio, unchanged)
 * - image    -> v4: Gemini Vision classify (handleImageV4) → vision_respond or informed handoff
 *               non-v4: immediate handoff (BYTE-IDENTICAL to baseline — Regla 6)
 * - video    -> immediate handoff
 * - sticker  -> interpret via Claude Vision, passthrough gesture or ignore
 * - reaction -> map emoji to text, notify_host, or ignore
 *
 * REGLA 6: non-v4 agents (v3, godentist, recompra, pw-confirmation, godentist-fb-ig)
 * MUST receive byte-identical results. The baseline image handoff string
 * 'Cliente envio una imagen' and handleAudio body are PRESERVED unchanged.
 */

import type { MediaGateInput, MediaGateResult } from './types'
import { transcribeAudioFromUrl } from './audio-transcriber'
import { interpretSticker } from './sticker-interpreter'
import { mapReaction, reactionToMediaGateResult } from './reaction-mapper'
import { createModuleLogger } from '@/lib/audit/logger'
import { SOMNIO_V4_AGENT_ID } from '@/lib/agents/somnio-v4/config'
import { classifyImage } from './image-classifier'

const log = createModuleLogger('media-gate')

/**
 * Process a message through the media gate.
 * Routes by messageType to the appropriate handler and returns a MediaGateResult.
 *
 * @param input - Message data from the Inngest event (includes resolvedAgentId for v4 gating)
 * @returns MediaGateResult determining pipeline behavior
 */
export async function processMediaGate(input: MediaGateInput): Promise<MediaGateResult> {
  switch (input.messageType) {
    case 'text':
      return { action: 'passthrough', text: input.messageContent }

    case 'audio':
      // Plan 03 (v4-media-audio-image Wave 2): v4 gets handleAudioV4 (transcribe + carry transcript
      // for persist-transcription step). Non-v4 falls to handleAudio (byte-identical — Regla 6).
      return input.resolvedAgentId === SOMNIO_V4_AGENT_ID
        ? handleAudioV4(input)
        : handleAudio(input)

    case 'image':
      // Plan 03 (v4-media-audio-image Wave 2): v4 gets Gemini Vision classify → vision_respond or
      // informed handoff. Non-v4 falls to byte-identical immediate handoff (Regla 6).
      return input.resolvedAgentId === SOMNIO_V4_AGENT_ID
        ? handleImageV4(input)
        : { action: 'handoff', reason: 'Cliente envio una imagen' }  // BYTE-IDENTICAL to baseline

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
 * NON-V4 path — body is UNCHANGED (Regla 6 baseline). Do NOT modify.
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
 * V4 audio handler: transcribe via Whisper + carry transcript in the passthrough result
 * so the Inngest function can persist it via step.run('persist-transcription').
 *
 * Identical fail-safe to handleAudio on failure (D-07).
 * Plan 03 (v4-media-audio-image Wave 2).
 */
async function handleAudioV4(input: MediaGateInput): Promise<MediaGateResult> {
  if (!input.mediaUrl) {
    log.info({
      event: 'audio_handoff_v4',
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
      event: 'audio_transcribed_v4',
      conversationId: input.conversationId,
      charCount: result.text.length,
    })
    // Carry transcription in the passthrough result — consumed by the Inngest
    // persist-transcription step (Regla 3: UPDATE by wamid via setMessageTranscription).
    return { action: 'passthrough', text: result.text, transcription: result.text }
  }

  log.info({
    event: 'audio_handoff_v4',
    reason: 'transcription_failed',
    error: result.error,
    conversationId: input.conversationId,
  })
  return { action: 'handoff', reason: 'No se pudo transcribir el audio del cliente' }
}

/**
 * V4 image handler: Gemini Vision single-call classify → vision_respond or informed handoff.
 *
 * - If no mediaUrl → immediate handoff (D-07 fail-safe).
 * - If classifyImage returns decision='handoff' → informed handoff with descripcion (D-02/D-06).
 * - If classifyImage returns decision='responder' → { action:'vision_respond', descripcion, categoria }
 *   carrying the vision context into the engine. The media-gate does NOT generate or send;
 *   the engine (Plan 04) produces the grounded RAG answer and delivers it.
 *
 * Plan 03 (v4-media-audio-image Wave 2).
 */
async function handleImageV4(input: MediaGateInput): Promise<MediaGateResult> {
  if (!input.mediaUrl) {
    log.info({
      event: 'image_handoff_v4',
      reason: 'no_media_url',
      conversationId: input.conversationId,
    })
    return { action: 'handoff', reason: 'Cliente envió una imagen (sin URL)' }
  }

  const cls = await classifyImage(
    input.mediaUrl,
    input.mediaMimeType ?? 'image/jpeg',
    input.messageContent,  // optional caption
  )

  log.debug({
    event: 'image_classified_v4',
    categoria: cls.categoria,
    decision: cls.decision,
    conversationId: input.conversationId,
  })

  if (cls.decision === 'handoff') {
    // D-02/D-06: informed handoff — include the descripcion so the human agent has context
    return {
      action: 'handoff',
      reason: `Cliente envió una imagen: ${cls.descripcion || 'no se pudo describir'}`,
    }
  }

  // decision === 'responder' — carry vision context into the engine.
  // The media-gate has NO send primitive; the engine (Plan 04) emits a rag: template
  // that the production runner delivers with no-rep + interruption + ledger machinery.
  return {
    action: 'vision_respond',
    descripcion: cls.descripcion,
    categoria: cls.categoria,
  }
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
