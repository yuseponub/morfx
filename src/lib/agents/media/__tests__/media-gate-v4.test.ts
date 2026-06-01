/**
 * Tests for media-gate v4 branches (Plan 03 — v4-media-audio-image Wave 2)
 *
 * Behavioral tests validating:
 * 1. Regla 6: non-v4 agents get byte-identical results (image handoff + audio unchanged)
 * 2. v4 audio path: passthrough WITH transcription field
 * 3. v4 image path: informed handoff on decision=handoff
 * 4. v4 image path: vision_respond on decision=responder
 *
 * These tests mock audio-transcriber + image-classifier to isolate gate logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaGateInput } from '../types'

// ---- Mock dependencies BEFORE importing the module under test ----

vi.mock('../audio-transcriber', () => ({
  transcribeAudioFromUrl: vi.fn(),
}))

vi.mock('../image-classifier', () => ({
  classifyImage: vi.fn(),
}))

// sticker-interpreter and reaction-mapper are NOT called in our test cases,
// but they're imported transitively; mock them to avoid real HTTP calls.
vi.mock('../sticker-interpreter', () => ({
  interpretSticker: vi.fn().mockResolvedValue({ gesto: null, descripcion: 'mock sticker' }),
}))

vi.mock('../reaction-mapper', () => ({
  mapReaction: vi.fn().mockReturnValue('positive'),
  reactionToMediaGateResult: vi.fn().mockReturnValue({ action: 'notify_host', reason: 'mock reaction' }),
}))

vi.mock('@/lib/audit/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { transcribeAudioFromUrl } from '../audio-transcriber'
import { classifyImage } from '../image-classifier'
import { processMediaGate } from '../media-gate'

const mockTranscribe = transcribeAudioFromUrl as ReturnType<typeof vi.fn>
const mockClassify = classifyImage as ReturnType<typeof vi.fn>

// ---- Helpers ----

function makeInput(overrides: Partial<MediaGateInput> = {}): MediaGateInput {
  return {
    messageType: 'text',
    messageContent: '',
    mediaUrl: 'https://storage.example.com/media/test.jpg',
    mediaMimeType: 'image/jpeg',
    workspaceId: 'ws-test',
    conversationId: 'conv-test',
    phone: '573001234567',
    resolvedAgentId: 'somnio-sales-v3',  // non-v4 by default
    ...overrides,
  }
}

describe('media-gate v4 branches (Regla 6 + v4 behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =====================================================================
  // Regla 6 behavioral tests — non-v4 agents MUST be byte-identical
  // =====================================================================

  it('[Regla 6] non-v4 image → exact baseline handoff string (byte-identical)', async () => {
    const result = await processMediaGate(makeInput({
      messageType: 'image',
      resolvedAgentId: 'somnio-sales-v3',
    }))

    // EXACT string match — any change to this string breaks Regla 6
    expect(result).toEqual({ action: 'handoff', reason: 'Cliente envio una imagen' })
    // classifyImage must NOT be called for non-v4 agents
    expect(mockClassify).not.toHaveBeenCalled()
  })

  it('[Regla 6] non-v4 audio → passthrough WITHOUT transcription field', async () => {
    const transcript = 'hola como están'
    mockTranscribe.mockResolvedValueOnce({ success: true, text: transcript })

    const result = await processMediaGate(makeInput({
      messageType: 'audio',
      mediaMimeType: 'audio/ogg',
      resolvedAgentId: 'somnio-sales-v3',
    }))

    expect(result.action).toBe('passthrough')
    if (result.action === 'passthrough') {
      expect(result.text).toBe(transcript)
      // Non-v4 audio must NOT set transcription (it's a v4-only field)
      expect(result.transcription).toBeUndefined()
    }
  })

  // =====================================================================
  // v4 audio path
  // =====================================================================

  it('[v4] audio success → passthrough WITH transcription === text', async () => {
    const transcript = 'quiero pedir un elixir del sueño'
    mockTranscribe.mockResolvedValueOnce({ success: true, text: transcript })

    const result = await processMediaGate(makeInput({
      messageType: 'audio',
      mediaMimeType: 'audio/ogg',
      resolvedAgentId: 'somnio-sales-v4',
    }))

    expect(result.action).toBe('passthrough')
    if (result.action === 'passthrough') {
      expect(result.text).toBe(transcript)
      // v4 audio MUST include transcription for the persist step
      expect(result.transcription).toBe(transcript)
    }
  })

  // =====================================================================
  // v4 image path
  // =====================================================================

  it('[v4] image, classifyImage decision=handoff → informed handoff containing descripcion', async () => {
    mockClassify.mockResolvedValueOnce({
      categoria: 'comprobante_pago',
      descripcion: 'Captura de Nequi con transferencia de $150.000',
      decision: 'handoff',
    })

    const result = await processMediaGate(makeInput({
      messageType: 'image',
      resolvedAgentId: 'somnio-sales-v4',
    }))

    expect(result.action).toBe('handoff')
    if (result.action === 'handoff') {
      // Informed handoff must contain the descripcion (D-02/D-06)
      expect(result.reason).toContain('Captura de Nequi con transferencia de $150.000')
    }
  })

  it('[v4] image, classifyImage decision=responder → vision_respond (NOT handoff, NOT passthrough)', async () => {
    mockClassify.mockResolvedValueOnce({
      categoria: 'producto',
      descripcion: 'Foto del frasco de ELIXIR DEL SUEÑO, presentación de 30 cápsulas',
      decision: 'responder',
    })

    const result = await processMediaGate(makeInput({
      messageType: 'image',
      resolvedAgentId: 'somnio-sales-v4',
    }))

    // The media-gate must return vision_respond — NOT a handoff, NOT a passthrough
    expect(result.action).toBe('vision_respond')
    if (result.action === 'vision_respond') {
      expect(result.descripcion).toBe('Foto del frasco de ELIXIR DEL SUEÑO, presentación de 30 cápsulas')
      expect(result.categoria).toBe('producto')
    }
  })
})
