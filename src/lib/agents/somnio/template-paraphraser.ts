/**
 * Template Paraphraser — Claude-powered paraphrasing for repeated intents
 * Phase 34: No-Repetition System - Plan 03, Task 1
 *
 * When a customer asks about the same topic twice, the bot should not repeat
 * the exact same text. This module paraphrases template content so the
 * information sounds fresh while keeping all factual data intact.
 *
 * Uses Anthropic SDK direct call pattern (same as message-classifier.ts).
 * Fail-safe: any error returns original content unchanged.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('template-paraphraser')

// ============================================================================
// Prompt
// ============================================================================

const PARAPHRASE_PROMPT = `Eres un asistente de ventas de WhatsApp para Somnio (suplemento natural para dormir con melatonina y magnesio).

El cliente ya recibio esta informacion antes. Necesitas PARAFRASEAR el siguiente mensaje para que suene fresco y natural, como si fuera la primera vez.

REGLAS CRITICAS:
1. MANTENER todos los datos facticos exactos (precios, numeros, tiempos, cantidades, ingredientes)
2. Solo cambiar estructura, orden de oracion, y expresiones
3. Tono amigable y colombiano (tutear, informal)
4. Maximo 20% mas corto que el original (nunca mas largo)
5. NO agregar informacion nueva que no este en el original
6. NO usar emojis a menos que el original los tenga
7. NO agregar saludos ni despedidas

Responde SOLO con el mensaje parafraseado, sin explicaciones ni comillas.`

// ============================================================================
// Client singleton
// ============================================================================

let clientInstance: Anthropic | null = null

function getClient(): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return clientInstance
}

// ============================================================================
// Constants
// ============================================================================

/** Templates shorter than this are not worth paraphrasing */
const MIN_CONTENT_LENGTH = 20

/** Maximum ratio of paraphrased / original length (1.3 = 30% longer max) */
const MAX_LENGTH_RATIO = 1.3

// ============================================================================
// Main function
// ============================================================================

/**
 * Paraphrase template content via Claude for repeated intents.
 *
 * Preserves all factual data (prices, numbers, times, quantities, ingredients)
 * while rewording the message to sound fresh.
 *
 * Fail-safe: returns original content on any error (API failure, empty response,
 * validation failure, or content too short to paraphrase).
 *
 * @param originalContent - The template content after variable substitution
 * @returns Paraphrased content, or original if paraphrasing fails/skipped
 */
export async function paraphraseTemplate(originalContent: string): Promise<string> {
  // Skip very short templates — not worth paraphrasing
  if (originalContent.length < MIN_CONTENT_LENGTH) {
    logger.debug(
      { length: originalContent.length },
      'Template too short to paraphrase, returning original'
    )
    return originalContent
  }

  try {
    const client = getClient()

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: PARAPHRASE_PROMPT,
      messages: [{ role: 'user', content: originalContent }],
    })

    // Extract text from response
    const paraphrased = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()

    // Validate: not empty
    if (!paraphrased) {
      logger.warn('Paraphrase returned empty response, returning original')
      return originalContent
    }

    // Validate: not excessively longer than original
    if (paraphrased.length > originalContent.length * MAX_LENGTH_RATIO) {
      logger.warn(
        {
          originalLength: originalContent.length,
          paraphrasedLength: paraphrased.length,
          ratio: (paraphrased.length / originalContent.length).toFixed(2),
        },
        'Paraphrased text too long, returning original'
      )
      return originalContent
    }

    logger.info(
      {
        originalLength: originalContent.length,
        paraphrasedLength: paraphrased.length,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      },
      'Template paraphrased successfully'
    )

    return paraphrased
  } catch (error) {
    // Fail-safe: any error returns original content
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Paraphrase failed, returning original content'
    )
    return originalContent
  }
}
