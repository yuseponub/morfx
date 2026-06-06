import { describe, it, expect } from 'vitest'
import { isAudioOnlyMp4Bytes } from '@/lib/media/mp4-detect'

// GAP-41-09: browser-safe sibling of the Node isAudioOnlyMp4(Buffer). Same container heuristic
// (a 'soun' handler and NO 'vide' handler ⇒ audio-only) but over a Uint8Array with no Buffer
// reference, so the composer (message-input.tsx, a client component) can mirror the server
// reclassification of an audio-only .mp4 from 'video' to 'audio' for IG/FB optimistic bubbles.
// Synthetic Uint8Array fixtures only — the scan only needs the ASCII box markers.

function ascii(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

const audioOnly = concat(
  ascii('ftypisom'),
  new Uint8Array(16),
  ascii('moov'),
  new Uint8Array(8),
  ascii('hdlr'),
  new Uint8Array(8),
  ascii('soun'), // audio handler, no vide
  new Uint8Array(8),
  ascii('mp4a'),
)

const videoAndAudio = concat(
  ascii('ftypisom'),
  new Uint8Array(16),
  ascii('moov'),
  ascii('hdlr'),
  ascii('vide'), // video handler present → NOT audio-only
  ascii('soun'), // also audio, but vide wins
)

const videoOnly = concat(
  ascii('ftypisom'),
  new Uint8Array(16),
  ascii('moov'),
  ascii('hdlr'),
  ascii('vide'), // video handler, no soun
)

const garbage = ascii('this is not a media file at all')
const tiny = Uint8Array.from([0x00, 0x01]) // length < 8
const empty = new Uint8Array(0)
// markers at the front; the bounded 512KB scan must still find them past a large tail
const largeAudioOnly = concat(audioOnly, new Uint8Array(600000))

describe('isAudioOnlyMp4Bytes', () => {
  it('Test A: audio-only (soun, NO vide) → true', () => {
    expect(isAudioOnlyMp4Bytes(audioOnly)).toBe(true)
  })

  it('Test B: has video track (vide AND soun) → false (vide wins)', () => {
    expect(isAudioOnlyMp4Bytes(videoAndAudio)).toBe(false)
  })

  it('Test C: video-only (vide, no soun) → false', () => {
    expect(isAudioOnlyMp4Bytes(videoOnly)).toBe(false)
  })

  it('Test D: garbage bytes → false', () => {
    expect(isAudioOnlyMp4Bytes(garbage)).toBe(false)
  })

  it('Test E: tiny array (length < 8) → false', () => {
    expect(isAudioOnlyMp4Bytes(tiny)).toBe(false)
  })

  it('Test F: empty array → false', () => {
    expect(isAudioOnlyMp4Bytes(empty)).toBe(false)
  })

  it('Test G: non-Uint8Array input → false, never throws', () => {
    expect(() => isAudioOnlyMp4Bytes(undefined as unknown as Uint8Array)).not.toThrow()
    expect(isAudioOnlyMp4Bytes(undefined as unknown as Uint8Array)).toBe(false)
    expect(() => isAudioOnlyMp4Bytes('nope' as unknown as Uint8Array)).not.toThrow()
    expect(isAudioOnlyMp4Bytes('nope' as unknown as Uint8Array)).toBe(false)
  })

  it('Test H: large array (markers at front, bounded scan) → true, no throw', () => {
    expect(() => isAudioOnlyMp4Bytes(largeAudioOnly)).not.toThrow()
    expect(isAudioOnlyMp4Bytes(largeAudioOnly)).toBe(true)
  })
})
