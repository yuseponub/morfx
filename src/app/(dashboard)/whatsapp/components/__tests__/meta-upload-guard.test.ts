import { describe, it, expect } from 'vitest'
import { validateMetaUpload } from '../message-input'

/**
 * GAP-41-04: pure pre-upload guard for Instagram/Facebook (meta_direct) media.
 *
 * Meta returns (#100) error_subcode 2018047 for HEIC images and for images >8MB.
 * The composer must reject these BEFORE upload with a clear Spanish message.
 * WhatsApp keeps its existing 16MB limit and accepts HEIC (Regla 6).
 */
describe('validateMetaUpload', () => {
  const HEIC_MSG =
    'Convierte la imagen a JPG o PNG antes de enviarla (Instagram/Facebook no aceptan HEIC).'
  const IMG_8MB_MSG =
    'La imagen supera el límite de 8MB de Instagram/Facebook. Reduce su tamaño.'
  const VIDEO_25MB_MSG = 'El video supera el límite de 25MB de Instagram/Facebook.'

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
})
