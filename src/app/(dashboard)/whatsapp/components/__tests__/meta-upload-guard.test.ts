import { describe, it, expect } from 'vitest'
import { validateMetaUpload } from '../message-input'

/**
 * GAP-41-04: pure pre-upload guard for Instagram/Facebook (meta_direct) media.
 *
 * Meta returns (#100) error_subcode 2018047 for HEIC images and for images >8MB.
 * The composer must reject these BEFORE upload with a clear Spanish message.
 * WhatsApp keeps its existing 16MB limit and accepts HEIC (Regla 6).
 *
 * GAP-41-07 (this plan): per-channel, per-mediaType FORMAT whitelists layered on
 * top of the 41-10 HEIC + size guard. IG = STRICT, FB = PERMISSIVE, WhatsApp =
 * NO format gate (Regla 6).
 */
describe('validateMetaUpload', () => {
  const HEIC_MSG =
    'Convierte la imagen a JPG o PNG antes de enviarla (Instagram/Facebook no aceptan HEIC).'
  const IMG_8MB_MSG =
    'La imagen supera el límite de 8MB de Instagram/Facebook. Reduce su tamaño.'
  const VIDEO_25MB_MSG = 'El video supera el límite de 25MB de Instagram/Facebook.'

  // GAP-41-07 exact reject messages (assert verbatim — note the accented "convíértelo").
  const IG_AUDIO_MSG_MP3 =
    'Instagram solo acepta audio AAC, M4A, WAV o MP4. Tu archivo es MP3 — convíértelo o graba una nota de voz.'
  const IG_FILE_MSG = 'Instagram solo acepta documentos PDF.'
  const IG_IMAGE_MSG = 'Instagram solo acepta imágenes JPG o PNG.'
  const FB_AUDIO_MSG = 'Facebook solo acepta audio AAC, MP3, M4A, AMR, OGG u OPUS.'

  it('Test 1: rejects a HEIC image (type image/heic) on instagram', () => {
    const result = validateMetaUpload(
      { type: 'image/heic', name: 'photo.heic', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: false, error: HEIC_MSG })
  })

  it('Test 2: rejects a .HEIF file with empty MIME on facebook (extension fallback, case-insensitive)', () => {
    const result = validateMetaUpload(
      { type: '', name: 'photo.HEIF', size: 1024 },
      'facebook'
    )
    expect(result).toEqual({ ok: false, error: HEIC_MSG })
  })

  it('Test 3: rejects a 9MB JPEG on instagram (8MB image limit)', () => {
    const result = validateMetaUpload(
      { type: 'image/jpeg', name: 'big.jpg', size: 9 * 1024 * 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: false, error: IMG_8MB_MSG })
  })

  it('Test 4: accepts a 7MB JPEG on instagram', () => {
    const result = validateMetaUpload(
      { type: 'image/jpeg', name: 'ok.jpg', size: 7 * 1024 * 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 5: accepts a 9MB JPEG on whatsapp (no 8MB image cap; below 16MB)', () => {
    const result = validateMetaUpload(
      { type: 'image/jpeg', name: 'big.jpg', size: 9 * 1024 * 1024 },
      'whatsapp'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 6: accepts a 20MB video on instagram (25MB video limit)', () => {
    const result = validateMetaUpload(
      { type: 'video/mp4', name: 'clip.mp4', size: 20 * 1024 * 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 7: rejects a 26MB video on instagram (25MB video limit)', () => {
    const result = validateMetaUpload(
      { type: 'video/mp4', name: 'clip.mp4', size: 26 * 1024 * 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: false, error: VIDEO_25MB_MSG })
  })

  it('Test 8: accepts a HEIC image on whatsapp (HEIC guard is meta-only — Regla 6)', () => {
    const result = validateMetaUpload(
      { type: 'image/heic', name: 'photo.heic', size: 1024 },
      'whatsapp'
    )
    expect(result).toEqual({ ok: true })
  })

  // --- GAP-41-07: Instagram STRICT format whitelist ---

  it('Test 9: rejects an mp3 audio on instagram (IG audio = aac/m4a/wav/mp4)', () => {
    const result = validateMetaUpload(
      { type: 'audio/mpeg', name: 'voz.mp3', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: false, error: IG_AUDIO_MSG_MP3 })
  })

  it('Test 10: accepts an m4a audio on instagram', () => {
    const result = validateMetaUpload(
      { type: 'audio/x-m4a', name: 'voz.m4a', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 11: accepts an aac audio on instagram', () => {
    const result = validateMetaUpload(
      { type: 'audio/aac', name: 'voz.aac', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 12: accepts a wav audio on instagram', () => {
    const result = validateMetaUpload(
      { type: 'audio/wav', name: 'voz.wav', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 13: accepts an mp4 audio on instagram', () => {
    const result = validateMetaUpload(
      { type: 'audio/mp4', name: 'voz.mp4', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 14: rejects a non-PDF document on instagram (IG doc = pdf only)', () => {
    const result = validateMetaUpload(
      { type: 'application/msword', name: 'doc.doc', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: false, error: IG_FILE_MSG })
  })

  it('Test 15: accepts a PDF on instagram', () => {
    const result = validateMetaUpload(
      { type: 'application/pdf', name: 'guia.pdf', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 16: rejects a gif image on instagram (IG image = jpeg/png only)', () => {
    const result = validateMetaUpload(
      { type: 'image/gif', name: 'meme.gif', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: false, error: IG_IMAGE_MSG })
  })

  it('Test 17: rejects a webp image on instagram with the JPG/PNG message', () => {
    const result = validateMetaUpload(
      { type: 'image/webp', name: 'foto.webp', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: false, error: IG_IMAGE_MSG })
  })

  // --- GAP-41-07: Facebook PERMISSIVE format whitelist ---

  it('Test 18: accepts an mp3 audio on facebook (FB allows mpeg)', () => {
    const result = validateMetaUpload(
      { type: 'audio/mpeg', name: 'voz.mp3', size: 1024 },
      'facebook'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 19: rejects a webm audio on facebook (webm not in FB audio list)', () => {
    const result = validateMetaUpload(
      { type: 'audio/webm', name: 'voz.webm', size: 1024 },
      'facebook'
    )
    expect(result).toEqual({ ok: false, error: FB_AUDIO_MSG })
  })

  it('Test 20: accepts a .docx document on facebook', () => {
    const result = validateMetaUpload(
      {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        name: 'contrato.docx',
        size: 1024,
      },
      'facebook'
    )
    expect(result).toEqual({ ok: true })
  })

  // --- GAP-41-07: extension fallback for empty/generic MIME ---

  it('Test 21: rejects an empty-MIME mp3 on instagram (extension fallback → audio mp3)', () => {
    const result = validateMetaUpload(
      { type: '', name: 'voz.mp3', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: false, error: IG_AUDIO_MSG_MP3 })
  })

  it('Test 22: accepts an empty-MIME wav on instagram (extension fallback → IG-allowed audio)', () => {
    const result = validateMetaUpload(
      { type: '', name: 'voz.wav', size: 1024 },
      'instagram'
    )
    expect(result).toEqual({ ok: true })
  })

  // --- GAP-41-07: WhatsApp passthrough (Regla 6 — NO format gate) ---

  it('Test 23: accepts an mp3 audio on whatsapp (no format gate)', () => {
    const result = validateMetaUpload(
      { type: 'audio/mpeg', name: 'voz.mp3', size: 1024 },
      'whatsapp'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 24: accepts a .doc document on whatsapp (no format gate)', () => {
    const result = validateMetaUpload(
      { type: 'application/msword', name: 'doc.doc', size: 1024 },
      'whatsapp'
    )
    expect(result).toEqual({ ok: true })
  })

  it('Test 25: accepts a gif image on whatsapp (no format gate)', () => {
    const result = validateMetaUpload(
      { type: 'image/gif', name: 'meme.gif', size: 1024 },
      'whatsapp'
    )
    expect(result).toEqual({ ok: true })
  })
})
