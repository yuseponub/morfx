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
export function isAudioOnlyMp4(buf: Buffer): boolean {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 8) return false
    // Bound the scan — untrusted uploaded buffer; moov/hdlr boxes are at the front.
    const slice = buf.length > 524288 ? buf.subarray(0, 524288) : buf
    const hasVide = slice.indexOf('vide', 0, 'ascii') !== -1
    if (hasVide) return false
    const hasSoun = slice.indexOf('soun', 0, 'ascii') !== -1
    return hasSoun
  } catch {
    return false
  }
}
