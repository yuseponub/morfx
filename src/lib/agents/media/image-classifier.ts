/**
 * Image Classifier — Gemini Vision single-call
 * Plan 03 (v4-media-audio-image Wave 2)
 *
 * Classifies a customer-sent image into one of 6 categories using Gemini 2.5 Flash
 * (multimodal) with Output.object structured output.
 *
 * Key decisions:
 * - D-06: taxonomy — producto/pagina → decision='responder'; others → 'handoff'
 * - D-07: fail-safe — ANY failure returns { categoria:'ambiguo', descripcion:'', decision:'handoff' }
 * - D-08: model = gemini-2.5-flash (consistency with v4; 10x cheaper than Claude for vision)
 * - Pitfall 4: decision is ALWAYS derived in code from categoria — NEVER returned by the LLM
 * - Pitfall 6: all 4 harm categories set to threshold=none (prevents Gemini safety blocks on health terms)
 * - Base64 image fetch pattern adapted from ocr/extract-guide-data.ts
 */

import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { callWithGeminiFallback } from '../somnio-v4/llm-fallback'
import { safeAccessOutput } from '../somnio-v4/sub-loop/safe-output'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ImageCategoria =
  | 'producto'
  | 'pagina'
  | 'comprobante_pago'
  | 'documento_identidad'
  | 'captura_conversacion'
  | 'ambiguo'

export interface ImageClassification {
  categoria: ImageCategoria
  descripcion: string
  /**
   * Computed IN CODE from categoria — NEVER returned by the LLM (Pitfall 4).
   * 'responder' → the engine will produce a grounded RAG answer (Plan 04).
   * 'handoff'   → informed handoff with descripcion (D-06).
   */
  decision: 'responder' | 'handoff'
}

// ---------------------------------------------------------------------------
// D-07 fail-safe constant
// ---------------------------------------------------------------------------

const FAIL_SAFE: ImageClassification = {
  categoria: 'ambiguo',
  descripcion: '',
  decision: 'handoff',
}

// ---------------------------------------------------------------------------
// Zod schema — NOTE: NO `decision` field (Pitfall 4 — LLM never returns decision)
// ---------------------------------------------------------------------------

const ClassificationSchema = z.object({
  categoria: z.enum([
    'producto',
    'pagina',
    'comprobante_pago',
    'documento_identidad',
    'captura_conversacion',
    'ambiguo',
  ]).describe('Categoría de la imagen según su contenido visible'),
  descripcion: z.string()
    .describe('1-2 oraciones describiendo lo que se ve en la imagen'),
})

// ---------------------------------------------------------------------------
// Vision prompt (Spanish, customer-facing context)
// ---------------------------------------------------------------------------

const CLASSIFICATION_PROMPT = `Eres un asistente de clasificación de imágenes para un negocio de ventas.
Analiza esta imagen enviada por un cliente de WhatsApp y clasifícala.

CATEGORÍAS posibles:
- "producto": foto del frasco, empaque o producto físico (ej: ELIXIR DEL SUEÑO, suplementos, cosméticos)
- "pagina": captura de pantalla de una página web, landing page, tienda online o catálogo digital
- "comprobante_pago": recibo de transferencia, screenshot de Nequi/Bancolombia/Daviplata/PSE, comprobante de pago
- "documento_identidad": cédula de ciudadanía, pasaporte, licencia de conducción u otro documento oficial
- "captura_conversacion": screenshot de otro chat de WhatsApp, Telegram, Instagram u otra app de mensajes
- "ambiguo": cualquier otra imagen o cuando no queda claro a qué categoría pertenece

REGLAS:
- Asigna SOLO una categoría — la más precisa.
- Si hay duda entre dos categorías, usa "ambiguo".
- Describe en 1-2 oraciones lo que ves en la imagen (campo "descripcion").
- NUNCA confirmes si un pago fue recibido o procesado. Solo describe lo que ves visualmente.
- Si la imagen es borrosa, cortada o ilegible, usa "ambiguo".`

// ---------------------------------------------------------------------------
// Helper: fetch image as base64 (adapted from ocr/extract-guide-data.ts)
// ---------------------------------------------------------------------------

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`[image-classifier] fetchAsBase64 failed: ${res.status} ${res.statusText}`)
  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}

// ---------------------------------------------------------------------------
// Compute decision from categoria (Pitfall 4 — code-derived, never from LLM)
// ---------------------------------------------------------------------------

function computeDecision(categoria: ImageCategoria): 'responder' | 'handoff' {
  return categoria === 'producto' || categoria === 'pagina' ? 'responder' : 'handoff'
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Classify a customer-sent image using Gemini Vision (single call).
 *
 * @param imageUrl  - Public URL of the image (Supabase Storage re-hosted by webhook)
 * @param mimeType  - MIME type of the image (e.g. 'image/jpeg', 'image/webp')
 * @param caption   - Optional text caption sent by the customer alongside the image
 * @returns         - { categoria, descripcion, decision } — decision derived in code (Pitfall 4)
 */
export async function classifyImage(
  imageUrl: string,
  mimeType: string,
  caption?: string,
): Promise<ImageClassification> {
  try {
    // Fetch image as base64 for reliability (pattern from extract-guide-data.ts)
    const base64Data = await fetchAsBase64(imageUrl)

    const promptText = caption
      ? `${CLASSIFICATION_PROMPT}\n\nTexto del cliente junto a la imagen: "${caption}"`
      : CLASSIFICATION_PROMPT

    // MISMO content para ambos providers — AI SDK normaliza el image part por provider (A1).
    const visionContent = [
      { type: 'image' as const, image: base64Data, mediaType: mimeType },
      { type: 'text' as const, text: promptText },
    ]

    // Fallback Gemini → Haiku 4.5 con visión (D-02/D-03) — el fail-safe handoff
    // queda como ÚLTIMO recurso si AMBOS providers fallan (D-07, abajo en el catch).
    const rawResult = await callWithGeminiFallback({
      callSite: 'vision',
      gemini: (signal) =>
        generateText({
          model: google('gemini-2.5-flash'),
          maxRetries: 0, // D-05 — el orquestador hace N=1 + fallback
          abortSignal: signal, // D-06 — AbortSignal.timeout del orquestador
          messages: [{ role: 'user', content: visionContent }],
          output: Output.object({ schema: ClassificationSchema }),
          // Pitfall 6 — without this, Gemini silently blocks health-related terms
          // → NoOutputGeneratedError with finishReason='SAFETY'.
          // Verbatim from generation-call.ts:69-78.
          providerOptions: {
            google: {
              safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
              ],
            },
          },
        }),
      anthropic: (signal) =>
        generateText({
          model: anthropic('claude-haiku-4-5'), // D-02/D-03 — Haiku 4.5 con visión (techo absoluto)
          maxRetries: 0,        // M-01 — N=1 también en el último recurso
          abortSignal: signal,  // M-01 — timeout guard fresco del helper (no el de Gemini)
          messages: [{ role: 'user', content: visionContent }],
          output: Output.object({ schema: ClassificationSchema }),
          // Pitfall #7 — el branch Anthropic NO lleva safetySettings de Google (son google-only).
        }),
    })

    // Pitfall #11: usar safeAccessOutput (lee result.output con fallback a parse de result.text)
    // en vez del acceso legacy a la salida experimental — unifica el shape entre ambos providers
    // (el campo legacy puede no existir igual con Anthropic).
    let output: z.infer<typeof ClassificationSchema>
    try {
      output = safeAccessOutput(rawResult, ClassificationSchema)
    } catch {
      console.warn('[image-classifier] Unexpected output shape — using fail-safe')
      return FAIL_SAFE
    }
    if (!output || typeof output.categoria !== 'string') {
      console.warn('[image-classifier] Unexpected output shape from vision — using fail-safe')
      return FAIL_SAFE
    }

    const categoria = output.categoria as ImageCategoria
    const descripcion = typeof output.descripcion === 'string' ? output.descripcion : ''

    // Pitfall 4: decision ALWAYS computed from categoria in code — NEVER from LLM output
    const decision = computeDecision(categoria)

    return { categoria, descripcion, decision }
  } catch (err) {
    // D-07: ÚLTIMO recurso — cualquier fallo (fetch, AMBOS providers caídos, parse) → handoff.
    // El fallback Anthropic ya se intentó dentro de callWithGeminiFallback; si también falló,
    // el helper emitió fallback_failed y propagó → aterriza aquí (D-03: handoff solo si AMBOS caen).
    console.warn('[image-classifier] Classification failed — using fail-safe handoff:', err)
    return FAIL_SAFE
  }
}
