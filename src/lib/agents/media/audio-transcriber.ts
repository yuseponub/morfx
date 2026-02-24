/**
 * Audio Transcriber
 * Phase 32: Media Processing - Plan 02
 *
 * Transcribes WhatsApp voice notes (OGG/Opus) to Spanish text via OpenAI Whisper API.
 * Downloads audio from Supabase Storage URL, creates an in-memory File object
 * (no filesystem writes -- Vercel serverless has no persistent /tmp), and sends
 * to Whisper with language hint 'es' for optimal Colombian Spanish accuracy.
 *
 * Cost: ~$0.006/min of audio. WhatsApp voice notes are typically 5-30 seconds.
 */

import OpenAI, { toFile } from 'openai'

/**
 * Determine file extension from MIME type for Whisper.
 * Whisper needs the file extension hint to select the correct decoder.
 *
 * WhatsApp voice notes arrive as audio/ogg (Opus codec inside OGG container).
 * OGG is in Whisper's supported format list.
 */
function mimeTypeToExtension(mimeType: string): string {
  if (!mimeType) return '.ogg'

  const lower = mimeType.toLowerCase()
  if (lower.includes('ogg')) return '.ogg'
  if (lower.includes('mpeg')) return '.mp3'
  if (lower.includes('aac')) return '.aac'
  if (lower.includes('amr')) return '.amr'
  if (lower.includes('wav')) return '.wav'
  if (lower.includes('webm')) return '.webm'
  if (lower.includes('mp4')) return '.mp4'
  if (lower.includes('m4a')) return '.m4a'

  // Default: WhatsApp voice notes are OGG
  return '.ogg'
}

/**
 * Transcribe audio from a Supabase Storage URL using OpenAI Whisper.
 *
 * @param audioUrl - Public URL of the audio file in Supabase Storage
 * @param mimeType - MIME type of the audio (e.g. 'audio/ogg', 'audio/mpeg')
 * @returns Success with transcribed text, or failure with error message
 */
export async function transcribeAudioFromUrl(
  audioUrl: string,
  mimeType: string
): Promise<{ success: true; text: string } | { success: false; error: string }> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Fetch audio buffer from Supabase Storage
    const response = await fetch(audioUrl)
    if (!response.ok) {
      return { success: false, error: `Failed to fetch audio: ${response.status}` }
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    // Create in-memory File object (no filesystem writes)
    const ext = mimeTypeToExtension(mimeType)
    const file = await toFile(buffer, `voice${ext}`, { type: mimeType || 'audio/ogg' })

    // Transcribe with Whisper -- language 'es' for Colombian Spanish
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'es',
    })

    // Guard against empty transcriptions (corrupted audio, silence-only)
    if (!transcription.text || transcription.text.trim().length === 0) {
      return { success: false, error: 'Empty transcription' }
    }

    return { success: true, text: transcription.text.trim() }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { success: false, error: msg }
  }
}
