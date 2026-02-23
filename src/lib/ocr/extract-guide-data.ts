/**
 * Phase 27: Robot OCR de Guias — Claude Vision Extraction
 *
 * Calls Claude Vision (Sonnet 4) to extract structured data from shipping guide images/PDFs.
 * Runs server-side only (API key must never be exposed to client).
 * Used by the Inngest orchestrator as individual step.run() per image.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages'
import type { GuideOcrResult } from './types'

/** MIME types that should use document content block (PDF) vs image content block */
const PDF_MIME_TYPES = new Set(['application/pdf'])

/** Default result for OCR failures (all null, zero confidence) */
const EMPTY_RESULT: GuideOcrResult = {
  numeroGuia: null,
  destinatario: null,
  direccion: null,
  ciudad: null,
  telefono: null,
  remitente: null,
  transportadora: 'DESCONOCIDA',
  confianza: 0,
}

/** Valid carrier identifiers for validation */
const VALID_CARRIERS = new Set(['ENVIA', 'INTER', 'COORDINADORA', 'SERVIENTREGA', 'DESCONOCIDA'])

/**
 * Fetch image from URL and convert to base64.
 * More reliable than passing URL directly to Claude (avoids URL access issues).
 */
async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`)
  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}

/**
 * Extract structured guide data from an image or PDF URL using Claude Vision.
 *
 * @param imageUrl - Public URL of the image or PDF (Supabase Storage)
 * @param mimeType - MIME type of the file (image/jpeg, image/png, image/webp, application/pdf)
 * @returns Structured OCR data with confidence score
 * @throws Only on Anthropic API errors (caller should catch and handle as OCR failure)
 */
export async function extractGuideData(
  imageUrl: string,
  mimeType: string
): Promise<GuideOcrResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const isPdf = PDF_MIME_TYPES.has(mimeType)

  // Fetch image and convert to base64 (more reliable than URL — avoids access issues)
  const base64Data = await fetchAsBase64(imageUrl)

  const contentBlock: ContentBlockParam = isPdf
    ? {
        type: 'document' as const,
        source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64Data },
      }
    : {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64Data },
      }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `Eres un experto en logistica colombiana. Analiza esta guia de envio y extrae los datos EXACTAMENTE como aparecen en la imagen.

IMPORTANTE: Solo extrae datos que puedas LEER en la imagen. NUNCA inventes datos. Si no puedes leer un campo, ponlo como null.

Las guias colombianas tienen dos secciones principales:
- REMITENTE (quien envia): nombre, direccion, telefono, ciudad del remitente
- DESTINATARIO (quien recibe): nombre, direccion, telefono, ciudad del destinatario

Responde UNICAMENTE con un objeto JSON valido (sin texto adicional, sin markdown):
{
  "numeroGuia": "numero de la guia o null si no es legible",
  "destinatario": "nombre completo del DESTINATARIO (quien recibe) o null",
  "direccion": "direccion de entrega del DESTINATARIO o null",
  "ciudad": "ciudad DESTINO (del destinatario) o null",
  "telefono": "telefono del DESTINATARIO o null",
  "remitente": "nombre del REMITENTE (quien envia) o null",
  "transportadora": "ENVIA" | "INTER" | "COORDINADORA" | "SERVIENTREGA" | "DESCONOCIDA",
  "confianza": 0-100
}

Reglas:
- EXTRAE SOLO lo que puedes LEER. No adivines ni inventes datos.
- "destinatario" es quien RECIBE el paquete, NO el remitente.
- "ciudad" es la ciudad de DESTINO, no la de origen.
- "telefono" es el del DESTINATARIO, no el del remitente.
- "transportadora": identifica por logo, formato o encabezado (Envia, Inter Rapidisimo, Coordinadora, Servientrega).
- "confianza": 0-100 segun legibilidad. Si la imagen es borrosa o no puedes leer bien, baja la confianza.
- El numero de guia suele estar cerca del codigo de barras o como numero prominente en la parte superior.`,
          },
        ],
      },
    ],
  })

  // Extract text from response
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')

  // Parse JSON from response (handle markdown fences, commentary)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.warn('[ocr] Claude Vision response was not valid JSON:', text.slice(0, 200))
    return EMPTY_RESULT
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as GuideOcrResult

    // Validate essential fields
    if (typeof parsed.confianza !== 'number') parsed.confianza = 0
    if (!parsed.transportadora || !VALID_CARRIERS.has(parsed.transportadora)) {
      parsed.transportadora = 'DESCONOCIDA'
    }

    return parsed
  } catch (parseErr) {
    console.warn('[ocr] Failed to parse Claude Vision JSON:', parseErr)
    return EMPTY_RESULT
  }
}
