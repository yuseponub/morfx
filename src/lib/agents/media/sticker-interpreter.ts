/**
 * Sticker Interpreter
 * Phase 32: Media Processing - Plan 02
 *
 * Interprets WhatsApp stickers via Claude Vision and maps them to text
 * equivalents for recognized gestures (ok, hola, jaja, gracias).
 * Unrecognized stickers return gesto=null (caller treats as SILENCIOSO/ignore).
 *
 * Pattern: Same base64 + Claude Vision approach as src/lib/ocr/extract-guide-data.ts
 * Cost: ~$0.001-0.005 per sticker (small 512x512 WebP, ~200-300 tokens)
 */

import Anthropic from '@anthropic-ai/sdk'

/**
 * Recognized gestures that map to text equivalents in the pipeline.
 * Everything outside this set is treated as unrecognized (gesto=null).
 */
const RECOGNIZED_GESTURES = new Set(['ok', 'hola', 'jaja', 'gracias'])

/**
 * Vision prompt for Claude to interpret sticker sentiment.
 * Instructs to respond with JSON only, and to return gesto=null for
 * anything that does not clearly match a basic gesture.
 */
const STICKER_VISION_PROMPT = `Eres un interprete de stickers de WhatsApp. Analiza este sticker y determina que gesto o sentimiento expresa.

Gestos reconocibles (responde con el texto equivalente):
- Pulgar arriba, ok, aprobacion, visto bueno -> "ok"
- Corazon, amor, carino -> "ok"
- Saludo, hola, chao, adios -> "hola"
- Aplausos, celebracion -> "ok"
- Risa, carcajada, algo gracioso -> "jaja"
- Gracias, agradecimiento, reverencia -> "gracias"

Si el sticker NO expresa claramente uno de estos gestos basicos, responde con:
{"gesto": null, "descripcion": "breve descripcion de lo que ves"}

Si SI expresa un gesto reconocible, responde con:
{"gesto": "ok" | "hola" | "jaja" | "gracias", "descripcion": "breve descripcion"}

Responde UNICAMENTE con JSON valido. Sin texto adicional, sin markdown.`

/**
 * Interpret a WhatsApp sticker via Claude Vision.
 *
 * @param stickerUrl - Public URL of the sticker in Supabase Storage
 * @returns Interpreted gesture (or null if unrecognized) + description
 */
export async function interpretSticker(
  stickerUrl: string
): Promise<{ gesto: string | null; descripcion: string }> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Fetch sticker and convert to base64
    const res = await fetch(stickerUrl)
    if (!res.ok) {
      return { gesto: null, descripcion: `Error: Could not fetch sticker (${res.status})` }
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    const base64Data = buffer.toString('base64')

    // Determine media type from response Content-Type header
    // Standard WhatsApp stickers are image/webp, but some clients may send image/png
    const contentType = res.headers.get('content-type')
    const mediaType = (
      contentType?.includes('webp') ? 'image/webp'
      : contentType?.includes('png') ? 'image/png'
      : contentType?.includes('gif') ? 'image/gif'
      : contentType?.includes('jpeg') || contentType?.includes('jpg') ? 'image/jpeg'
      : 'image/webp' // Default for WhatsApp stickers
    ) as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    // Call Claude Vision with base64-encoded sticker
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            { type: 'text', text: STICKER_VISION_PROMPT },
          ],
        },
      ],
    })

    // Extract text from response (same pattern as OCR module)
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // Parse JSON from response (handles markdown fences, commentary)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { gesto: null, descripcion: 'Could not parse vision response' }
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validate gesto is in recognized set (reject anything unexpected)
    const gesto = RECOGNIZED_GESTURES.has(parsed.gesto) ? parsed.gesto : null
    return { gesto, descripcion: parsed.descripcion || '' }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { gesto: null, descripcion: `Error: ${msg}` }
  }
}
