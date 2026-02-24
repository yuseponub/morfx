/**
 * Media Gate Module
 * Phase 32: Media Processing
 *
 * Barrel export for the media processing pipeline.
 * Main entry point: processMediaGate()
 */

export { processMediaGate } from './media-gate'
export type { MediaGateInput, MediaGateResult } from './types'
export { mapReaction, REACTION_MAP } from './reaction-mapper'
export { transcribeAudioFromUrl } from './audio-transcriber'
export { interpretSticker } from './sticker-interpreter'
