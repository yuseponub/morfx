/**
 * GAP-41-08: detect an audio-only mp4/quicktime container.
 *
 * Returns true iff the buffer carries a 'soun' (audio) handler and NO 'vide' (video)
 * handler — i.e. a .mp4/.mov with no video track (chat-downloaded audioclip-*.mp4,
 * Android voice notes). Pure, bounded, never throws.
 *
 * Lives in its own module (NOT in the 'use server' actions file) because a Server
 * Actions file may only export async functions — a synchronous export there breaks
 * the Next.js build ("Server Actions must be async functions"). messages.ts imports
 * this helper to reclassify such files from 'video' to 'audio' for IG/FB sends
 * (Meta rejects an audio-only mp4 sent as a video attachment with (#100) 2018047).
 */
/** Max bytes scanned — moov/hdlr boxes sit at the front of a chat-exported mp4. */
const SCAN_BOUND = 524288

/** Find an ASCII `needle` in a Uint8Array `haystack`. Returns the index or -1. No Buffer. */
function indexOfAscii(haystack: Uint8Array, needle: string): number {
  const n = needle.length
  const last = haystack.length - n
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < n; j++) {
      if (haystack[i + j] !== needle.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

/**
 * Browser-safe universal byte scanner — same heuristic as {@link isAudioOnlyMp4} but over a
 * raw Uint8Array with ZERO `Buffer` reference, so it runs in the browser (the composer mirrors
 * the server reclassification of an audio-only mp4 from 'video' to 'audio' for IG/FB optimistic
 * bubbles — GAP-41-09). Pure, bounded, never throws.
 */
export function isAudioOnlyMp4Bytes(bytes: Uint8Array): boolean {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length < 8) return false
    const slice = bytes.length > SCAN_BOUND ? bytes.subarray(0, SCAN_BOUND) : bytes
    // 'vide' (a video track) wins over 'soun' — same precedence as the Node entry.
    if (indexOfAscii(slice, 'vide') !== -1) return false
    return indexOfAscii(slice, 'soun') !== -1
  } catch {
    return false
  }
}

/**
 * Node entry point — delegates to the universal {@link isAudioOnlyMp4Bytes} scanner (a Buffer
 * IS a Uint8Array). The `Buffer.isBuffer` guard is kept so the existing server test's
 * non-Buffer / tiny / empty cases behave byte-identically.
 */
export function isAudioOnlyMp4(buf: Buffer): boolean {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return false
  return isAudioOnlyMp4Bytes(buf)
}
