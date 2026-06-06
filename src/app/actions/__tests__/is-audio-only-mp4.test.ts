import { describe, it, expect } from 'vitest'
import { isAudioOnlyMp4 } from '../messages'

// GAP-41-08: pure container heuristic — an audio-only .mp4/.mov (a 'soun' handler and NO
// 'vide' handler) must be detected so sendMediaMessage can reclassify it from 'video' to
// 'audio' for IG/FB sends (Meta rejects audio-only mp4 sent as video — (#100) 2018047).
// Synthetic buffers only — no real media file needed; the scan only needs the ASCII markers.

const audioOnlyMp4 = Buffer.concat([
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(16),
  Buffer.from('moov', 'ascii'),
  Buffer.alloc(8),
  Buffer.from('hdlr', 'ascii'),
  Buffer.alloc(8),
  Buffer.from('soun', 'ascii'), // audio handler
  Buffer.alloc(8),
  Buffer.from('mp4a', 'ascii'), // audio codec
])

const videoMp4 = Buffer.concat([
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(16),
  Buffer.from('moov', 'ascii'),
  Buffer.from('hdlr', 'ascii'),
  Buffer.from('vide', 'ascii'), // video handler present → NOT audio-only
  Buffer.from('soun', 'ascii'), // also has audio, but vide wins
])

const videoOnlyMp4 = Buffer.concat([
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(16),
  Buffer.from('moov', 'ascii'),
  Buffer.from('hdlr', 'ascii'),
  Buffer.from('vide', 'ascii'), // video handler, no soun
])

const garbage = Buffer.from('this is not a media file at all', 'utf8')
const tiny = Buffer.from([0x00, 0x01]) // length < 8
const empty = Buffer.alloc(0)
// markers at the front; bounded scan (512KB) must still find them past a large tail
const largeAudioOnly = Buffer.concat([audioOnlyMp4, Buffer.alloc(600000)])

describe('isAudioOnlyMp4', () => {
  it('Test A: audio-only mp4 (soun + mp4a, NO vide) → true', () => {
    expect(isAudioOnlyMp4(audioOnlyMp4)).toBe(true)
  })

  it('Test B: mp4 with a video track (vide AND soun) → false (vide wins)', () => {
    expect(isAudioOnlyMp4(videoMp4)).toBe(false)
  })

  it('Test C: video-only mp4 (vide, no soun) → false', () => {
    expect(isAudioOnlyMp4(videoOnlyMp4)).toBe(false)
  })

  it('Test D: non-mp4 / garbage buffer → false', () => {
    expect(isAudioOnlyMp4(garbage)).toBe(false)
  })

  it('Test E: tiny buffer (length < 8) → false', () => {
    expect(isAudioOnlyMp4(tiny)).toBe(false)
  })

  it('Test F: empty buffer → false', () => {
    expect(isAudioOnlyMp4(empty)).toBe(false)
  })

  it('Test G: non-Buffer input → false, never throws', () => {
    expect(() => isAudioOnlyMp4(undefined as unknown as Buffer)).not.toThrow()
    expect(isAudioOnlyMp4(undefined as unknown as Buffer)).toBe(false)
    expect(() => isAudioOnlyMp4('nope' as unknown as Buffer)).not.toThrow()
    expect(isAudioOnlyMp4('nope' as unknown as Buffer)).toBe(false)
  })

  it('Test H: large buffer (markers at front, bounded scan) → true, no throw', () => {
    expect(() => isAudioOnlyMp4(largeAudioOnly)).not.toThrow()
    expect(isAudioOnlyMp4(largeAudioOnly)).toBe(true)
  })
})
