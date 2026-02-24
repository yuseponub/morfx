/**
 * Minifrase Generator
 * Phase 34: No-Repetition System - Plan 02, Task 1
 *
 * Generates thematic minifrases for human-typed and AI-generated outbound
 * messages using Haiku (Sonnet 4 until Haiku 4 is available).
 *
 * Minifrases are short thematic descriptors (~15 words) that capture the
 * ESSENCE of a message, used by the no-repetition filter (Level 2) to
 * compare candidate templates against the full outbound history.
 *
 * Template minifrases are stored in DB (agent_templates.minifrase).
 * Human/AI minifrases are generated on-the-fly by this module.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createModuleLogger } from '@/lib/audit/logger'
import type { OutboundEntry } from './no-repetition-types'

const logger = createModuleLogger('minifrase-generator')

// ============================================================================
// Prompt
// ============================================================================

const MINIFRASE_PROMPT = `Genera una minifrase tematica (max 15 palabras) que capture la ESENCIA de este mensaje de WhatsApp.
La minifrase debe capturar los TEMAS cubiertos, no las palabras exactas.

Ejemplos:
"Veras los resultados desde los primeros 3-7 dias" -> "resultados en 3-7 dias, melatonina regula ciclo, magnesio relaja"
"El pago lo haces cuando recibes el producto en efectivo" -> "pago contraentrega en efectivo al recibir"
"Tranquilo, veras cambios desde la primera semana. No es un somnifero." -> "efectividad rapida, no es somnifero, regula ciclo natural"

Responde SOLO con la minifrase, sin explicaciones ni comillas.`

// ============================================================================
// Minifrase Generator
// ============================================================================

/**
 * Generate minifrases for outbound entries that have empty tema.
 *
 * Modifies entries in-place, setting entry.tema to the generated minifrase.
 * Only processes entries where tema === '' and fullContent exists.
 * Uses Promise.all for parallel generation.
 *
 * On failure (API error, empty response), falls back to the first 15 words
 * of the message content.
 *
 * @param entries - OutboundEntry array to process (modified in-place)
 */
export async function generateMinifrases(entries: OutboundEntry[]): Promise<void> {
  // Filter entries needing minifrase generation
  const needsGeneration = entries.filter(
    (e) => e.tema === '' && e.fullContent && e.fullContent.trim().length > 0
  )

  if (needsGeneration.length === 0) {
    return
  }

  logger.info(
    { count: needsGeneration.length },
    'Generating minifrases for human/AI entries'
  )

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  // Generate minifrases in parallel
  await Promise.all(
    needsGeneration.map(async (entry) => {
      try {
        const minifrase = await callHaikuForMinifrase(client, entry.fullContent!)
        entry.tema = minifrase
        logger.debug(
          { tipo: entry.tipo, minifrase },
          'Generated minifrase'
        )
      } catch (error) {
        // Fallback: first 15 words of content
        const fallback = buildFallback(entry.fullContent!)
        entry.tema = fallback
        logger.warn(
          { tipo: entry.tipo, error: error instanceof Error ? error.message : String(error), fallback },
          'Minifrase generation failed, using fallback'
        )
      }
    })
  )

  logger.info(
    { generated: needsGeneration.length },
    'Minifrase generation complete'
  )
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Call Haiku (Sonnet 4 until Haiku 4 available) to generate a minifrase.
 * Returns the generated minifrase string.
 * Throws on API error (caller handles fallback).
 */
async function callHaikuForMinifrase(
  client: Anthropic,
  content: string
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 128,
    system: MINIFRASE_PROMPT,
    messages: [{ role: 'user', content }],
  })

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()

  // If Haiku returns empty, use fallback
  if (!text) {
    return buildFallback(content)
  }

  return text
}

/**
 * Build a fallback minifrase from the first 15 words of content.
 */
function buildFallback(content: string): string {
  return content.split(/\s+/).slice(0, 15).join(' ')
}
