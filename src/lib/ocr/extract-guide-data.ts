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

  // Build content block: 'document' for PDFs, 'image' for everything else
  const isPdf = PDF_MIME_TYPES.has(mimeType)

  const contentBlock: ContentBlockParam = isPdf
    ? {
        type: 'document' as const,
        source: { type: 'url' as const, url: imageUrl },
      }
    : {
        type: 'image' as const,
        source: { type: 'url' as const, url: imageUrl },
      }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `Eres un experto en logistica colombiana. Analiza esta guia de envio y extrae los datos.

Responde UNICAMENTE con un objeto JSON valido (sin texto adicional, sin markdown):
{
  "numeroGuia": "numero de la guia o null si no es legible",
  "destinatario": "nombre completo del destinatario o null",
  "direccion": "direccion completa de entrega o null",
  "ciudad": "ciudad destino o null",
  "telefono": "telefono del destinatario o null",
  "remitente": "nombre del remitente/empresa o null",
  "transportadora": "ENVIA" | "INTER" | "COORDINADORA" | "SERVIENTREGA" | "DESCONOCIDA",
  "confianza": 0-100
}

Reglas:
- "transportadora": identifica la empresa de transporte por el logo, formato o encabezado de la guia
- "confianza": refleja que tan legible es la guia y que tan seguro estas de los datos. Baja confianza si la imagen esta borrosa, cortada o los datos son parciales.
- Si un campo no es legible, ponlo como null y baja la confianza proporcionalmente.
- El numero de guia suele ser un codigo de barras o numero prominente en la guia.
- En guias colombianas, busca datos como CC/NIT, direccion con formato CL/CR/KR, ciudades colombianas.`,
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
