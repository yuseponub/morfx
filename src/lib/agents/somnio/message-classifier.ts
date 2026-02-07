/**
 * Message Classifier Component
 * Phase 15.5: Somnio Ingest System - Plan 01
 *
 * Uses Claude Haiku for fast, cheap classification of customer messages
 * during data collection mode. Classifies messages as:
 * - datos: Pure data (name, phone, address, etc.)
 * - pregunta: Pure question requiring response
 * - mixto: Both data and question
 * - irrelevante: Acknowledgments (ok, gracias, etc.)
 *
 * @example
 * // datos
 * await classifier.classify("Jose Romero") // -> { classification: 'datos', ... }
 *
 * // pregunta
 * await classifier.classify("Cuanto cuesta?") // -> { classification: 'pregunta', ... }
 *
 * // mixto
 * await classifier.classify("Jose, cuanto vale?") // -> { classification: 'mixto', ... }
 *
 * // irrelevante
 * await classifier.classify("Ok") // -> { classification: 'irrelevante', ... }
 */

import Anthropic from '@anthropic-ai/sdk'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('message-classifier')

// ============================================================================
// Types
// ============================================================================

/**
 * Message classification categories.
 * - datos: Personal data only (name, phone, city, address, etc.)
 * - pregunta: Question requiring a response (price, shipping, product info)
 * - mixto: Contains both data AND a question
 * - irrelevante: Acknowledgments without useful information (ok, gracias, thumbs up)
 */
export type MessageClassification = 'datos' | 'pregunta' | 'mixto' | 'irrelevante'

/**
 * Result from message classification.
 */
export interface ClassificationResult {
  /** The classification category */
  classification: MessageClassification
  /** Confidence score 0-100 */
  confidence: number
  /** Optional reasoning for the classification */
  reasoning?: string
  /** For 'mixto' messages, hints at what data was detected */
  extractedDataHint?: Record<string, string>
}

// ============================================================================
// Prompt
// ============================================================================

/**
 * System prompt for the message classifier.
 * Based on RESEARCH.md pattern with Pitfall 5 handling (hola+datos as mixto).
 */
const CLASSIFIER_PROMPT = `Eres un clasificador de mensajes para el modo de captura de datos de Somnio.

Tu UNICA tarea es determinar si el mensaje del cliente contiene:
- DATOS: Informacion personal (nombre, telefono, ciudad, direccion, etc.)
- PREGUNTA: Una pregunta que requiere respuesta (precio, envio, producto, etc.)
- MIXTO: Contiene AMBOS datos y pregunta, o saludo con datos
- IRRELEVANTE: Acknowledgments sin informacion (ok, gracias, entendido, emojis)

## Ejemplos

"Juan Carlos Perez" -> datos (solo nombre)
"Mi direccion es calle 123" -> datos (direccion)
"3001234567" -> datos (telefono)
"Jose de Bogota en la calle 45" -> datos (nombre + ciudad + direccion)
"Cuanto vale?" -> pregunta (precio)
"Hacen envios a Medellin?" -> pregunta (envio)
"Que contiene el producto?" -> pregunta (informacion producto)
"Jose, de Bogota. Hacen envios?" -> mixto (nombre+ciudad + pregunta envio)
"Juan Perez, cuanto cuesta el de 3?" -> mixto (nombre + pregunta precio)
"Hola, soy Maria" -> mixto (saludo + nombre)
"Hola, me llamo Pedro y vivo en Cali" -> mixto (saludo + nombre + ciudad)
"Ok" -> irrelevante
"Gracias" -> irrelevante
"Perfecto" -> irrelevante
"Entendido" -> irrelevante
"Listo" -> irrelevante
"Si" -> irrelevante (confirmacion simple)
"No" -> irrelevante (negacion simple)
"Hola" -> irrelevante (solo saludo sin datos)
"Buenos dias" -> irrelevante (solo saludo sin datos)

## Instrucciones

1. NO extraigas los datos, solo CLASIFICA el tipo de mensaje
2. Si hay CUALQUIER dato personal (nombre, telefono, direccion, ciudad, etc.), es 'datos' o 'mixto'
3. Si hay pregunta pero sin datos, es 'pregunta'
4. Si es solo acknowledgment, confirmacion, o saludo sin datos, es 'irrelevante'
5. Si hay saludo + datos (ej: "Hola soy Juan"), es 'mixto' (no 'datos')
6. En caso de duda entre datos y pregunta, usa 'mixto'

## Formato de Respuesta

Responde SOLO con un JSON valido:
{
  "classification": "datos" | "pregunta" | "mixto" | "irrelevante",
  "confidence": 0-100,
  "reasoning": "breve explicacion"
}`

// ============================================================================
// MessageClassifier Class
// ============================================================================

/**
 * Message Classifier component.
 *
 * Uses Claude Haiku for fast, cheap classification of customer messages.
 * Designed for use in collecting_data mode to determine if a message
 * contains data (silent accumulation), question (respond), or both.
 */
export class MessageClassifier {
  private client: Anthropic

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    })
  }

  /**
   * Classify a customer message.
   *
   * @param message - The message to classify
   * @returns ClassificationResult with category, confidence, and optional reasoning
   *
   * @example
   * const result = await classifier.classify("Jose de Bogota, cuanto cuesta?")
   * // result.classification === 'mixto'
   * // result.confidence === 90
   */
  async classify(message: string): Promise<ClassificationResult> {
    logger.debug({ messageLength: message.length }, 'Classifying message')

    try {
      // Try Haiku first (fast and cheap)
      return await this.callClaude(message, 'claude-haiku-4-5-20251101')
    } catch (error) {
      // Fallback to Sonnet if Haiku fails (decision 13-03 pattern)
      if (error instanceof Anthropic.APIError) {
        logger.warn(
          { error: error.message, status: error.status },
          'Haiku failed, falling back to Sonnet'
        )
        return await this.callClaude(message, 'claude-sonnet-4-5-20250514')
      }
      throw error
    }
  }

  /**
   * Call Claude API for classification.
   */
  private async callClaude(
    message: string,
    model: string
  ): Promise<ClassificationResult> {
    const response = await this.client.messages.create({
      model,
      max_tokens: 256,
      system: CLASSIFIER_PROMPT,
      messages: [{ role: 'user', content: message }],
    })

    const text = this.extractText(response.content)
    const result = this.parseResponse(text)

    logger.info(
      {
        classification: result.classification,
        confidence: result.confidence,
        model,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      },
      'Message classified'
    )

    return result
  }

  /**
   * Parse Claude's response to extract classification.
   */
  private parseResponse(text: string): ClassificationResult {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])

        // Validate classification is one of the expected values
        const validClassifications: MessageClassification[] = [
          'datos', 'pregunta', 'mixto', 'irrelevante'
        ]
        const classification = validClassifications.includes(parsed.classification)
          ? parsed.classification
          : 'irrelevante'

        return {
          classification,
          confidence: typeof parsed.confidence === 'number'
            ? Math.min(100, Math.max(0, parsed.confidence))
            : 70,
          reasoning: parsed.reasoning,
          extractedDataHint: parsed.extractedDataHint,
        }
      } catch {
        logger.warn({ text: text.substring(0, 200) }, 'Failed to parse classification JSON')
      }
    }

    // Fallback: default to irrelevante with low confidence
    logger.warn({ text: text.substring(0, 200) }, 'Could not parse classification, defaulting to irrelevante')
    return {
      classification: 'irrelevante',
      confidence: 30,
      reasoning: 'Failed to parse LLM response',
    }
  }

  /**
   * Extract text from Claude response content blocks.
   */
  private extractText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }
}
