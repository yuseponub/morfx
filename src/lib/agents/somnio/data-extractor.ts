/**
 * Data Extractor Component
 * Phase 14: Agente Ventas Somnio - Plan 02
 *
 * Uses Claude to intelligently extract customer data from conversation messages.
 * Handles normalization, inference, and negation detection automatically.
 */

import { ClaudeClient } from '@/lib/agents/claude-client'
import type { ClaudeMessage, ClaudeModel } from '@/lib/agents/types'
import { CLAUDE_MODELS } from '@/lib/agents/types'
import { createModuleLogger } from '@/lib/audit/logger'
import {
  normalizePhone,
  normalizeCity,
  normalizeAddress,
  inferDepartamento,
  detectNegation,
} from './normalizers'
import { CRITICAL_FIELDS } from './constants'

const logger = createModuleLogger('data-extractor')

// ============================================================================
// Types
// ============================================================================

/**
 * Customer data fields that can be extracted.
 * Maps to the 9 fields defined in CONTEXT.md
 */
export interface ExtractedData {
  nombre?: string
  apellido?: string
  telefono?: string
  direccion?: string
  ciudad?: string
  departamento?: string
  barrio?: string
  correo?: string
  indicaciones_extra?: string
}

/**
 * Result from data extraction including raw, normalized, inferred, and metadata.
 */
export interface ExtractionResult {
  /** Raw extracted values from Claude */
  extracted: ExtractedData
  /** Values after normalization (phone, city, address) */
  normalized: ExtractedData
  /** Fields that were inferred (departamento from ciudad) */
  inferred: { departamento?: string }
  /** Fields where negation was detected (will be set to N/A) */
  negations: string[]
  /** Confidence scores per field (0-100) */
  confidence: Record<string, number>
  /** Tokens used by the Claude API call */
  tokensUsed: number
}

// CRITICAL_FIELDS imported from './constants' (single source of truth)

/**
 * Additional fields (nice to have).
 */
export const ADDITIONAL_FIELDS = [
  'apellido',
  'barrio',
  'correo',
  'indicaciones_extra',
] as const

/**
 * All customer data fields.
 */
export const ALL_FIELDS = [...CRITICAL_FIELDS, ...ADDITIONAL_FIELDS] as const

// ============================================================================
// Prompts
// ============================================================================

/**
 * System prompt for Claude to extract customer data.
 */
const DATA_EXTRACTOR_PROMPT = `Eres un extractor de datos de clientes para una tienda de productos de salud en Colombia.

Tu tarea es extraer TODOS los datos de cliente que aparezcan en el mensaje del usuario.

## Campos a Extraer (9 en total)

CRITICOS (para crear pedido):
1. nombre - Nombre del cliente
2. telefono - Numero de telefono (formato colombiano)
3. direccion - Direccion de entrega (calle, carrera, numero)
4. ciudad - Ciudad de entrega
5. departamento - Departamento de Colombia

ADICIONALES:
6. apellido - Apellido del cliente (si lo proporciona)
7. barrio - Barrio de entrega (si lo proporciona)
8. correo - Email del cliente (si lo proporciona, o "N/A" si dice que no tiene)
9. indicaciones_extra - Referencias, apto, edificio, instrucciones de entrega

## Instrucciones

1. Extrae TODOS los datos que encuentres, no solo uno
2. Un mensaje puede contener multiples datos (ej: "Me llamo Juan Perez y vivo en Bogota en la calle 123")
3. Si el cliente dice que NO tiene algo (ej: "no tengo correo"), marca ese campo como "N/A"
4. Solo incluye campos que realmente esten en el mensaje
5. No inventes datos que no esten explicitamente mencionados

## Formato de Respuesta

Responde SOLO con un JSON valido:
{
  "extracted": {
    "campo1": "valor",
    "campo2": "valor"
  },
  "confidence": {
    "campo1": 95,
    "campo2": 80
  }
}

La confianza indica que tan seguro estas de la extraccion (0-100).

## Ejemplos

Mensaje: "soy Juan y vivo en bogota en la calle 123 # 45-67"
Respuesta:
{
  "extracted": {
    "nombre": "Juan",
    "ciudad": "bogota",
    "direccion": "calle 123 # 45-67"
  },
  "confidence": {
    "nombre": 95,
    "ciudad": 95,
    "direccion": 90
  }
}

Mensaje: "mi numero es 3001234567 y no tengo correo"
Respuesta:
{
  "extracted": {
    "telefono": "3001234567",
    "correo": "N/A"
  },
  "confidence": {
    "telefono": 98,
    "correo": 95
  }
}

## Datos Existentes

El cliente ya ha proporcionado estos datos en mensajes anteriores:
{existing_data}

Solo extrae datos NUEVOS del mensaje actual que no esten en los datos existentes.`

// ============================================================================
// DataExtractor Class
// ============================================================================

/**
 * Data Extractor component.
 *
 * Uses Claude to extract customer data from conversation messages,
 * then normalizes, infers missing fields, and detects negations.
 */
export class DataExtractor {
  private claudeClient: ClaudeClient
  private model: ClaudeModel

  constructor(claudeClient?: ClaudeClient, model?: ClaudeModel) {
    this.claudeClient = claudeClient ?? new ClaudeClient()
    this.model = model ?? CLAUDE_MODELS.SONNET
  }

  /**
   * Extract customer data from a message.
   *
   * @param message - The user's message to extract data from
   * @param existingData - Data already collected from previous messages
   * @param conversationHistory - Full conversation history for context
   * @returns ExtractionResult with extracted, normalized, and inferred data
   */
  async extract(
    message: string,
    existingData: Record<string, string>,
    conversationHistory: ClaudeMessage[]
  ): Promise<ExtractionResult> {
    logger.debug(
      { messageLength: message.length, existingFields: Object.keys(existingData) },
      'Starting data extraction'
    )

    // Build system prompt with existing data
    const systemPrompt = DATA_EXTRACTOR_PROMPT.replace(
      '{existing_data}',
      JSON.stringify(existingData, null, 2)
    )

    // Call Claude to extract data
    const { result, tokensUsed } = await this.claudeClient.detectIntent(
      systemPrompt,
      conversationHistory,
      message,
      this.model
    )

    // Parse the extraction from Claude's response
    const extraction = this.parseExtractionResponse(result.reasoning ?? '')

    // Detect negations in the original message
    const negations = this.detectNegations(message, extraction.extracted)

    // Apply negations (set to N/A)
    for (const field of negations) {
      extraction.extracted[field as keyof ExtractedData] = 'N/A'
    }

    // Normalize extracted data
    const normalized = this.normalizeData(extraction.extracted)

    // Infer missing fields
    const inferred = this.inferMissingFields(normalized)

    // Apply inferred fields to normalized data
    if (inferred.departamento && !normalized.departamento) {
      normalized.departamento = inferred.departamento
    }

    logger.info(
      {
        extractedFields: Object.keys(extraction.extracted),
        negations,
        inferred: Object.keys(inferred),
        tokensUsed,
      },
      'Data extraction complete'
    )

    return {
      extracted: extraction.extracted,
      normalized,
      inferred,
      negations,
      confidence: extraction.confidence,
      tokensUsed,
    }
  }

  /**
   * Parse Claude's response to extract data.
   */
  private parseExtractionResponse(
    text: string
  ): { extracted: ExtractedData; confidence: Record<string, number> } {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          extracted: (parsed.extracted ?? {}) as ExtractedData,
          confidence: (parsed.confidence ?? {}) as Record<string, number>,
        }
      } catch {
        logger.warn({ text: text.substring(0, 200) }, 'Failed to parse extraction JSON')
      }
    }

    // Fallback: empty extraction
    return { extracted: {}, confidence: {} }
  }

  /**
   * Detect negations in the message for each field.
   */
  private detectNegations(message: string, extracted: ExtractedData): string[] {
    const negations: string[] = []

    // Check each potential field for negation
    const fieldsToCheck = ['correo', 'telefono', 'barrio']
    for (const field of fieldsToCheck) {
      // Only check if field wasn't already extracted
      if (!extracted[field as keyof ExtractedData]) {
        if (detectNegation(message, field)) {
          negations.push(field)
        }
      }
    }

    return negations
  }

  /**
   * Normalize extracted data (phone, city, address).
   */
  private normalizeData(extracted: ExtractedData): ExtractedData {
    const normalized: ExtractedData = { ...extracted }

    // Normalize phone
    if (extracted.telefono && extracted.telefono !== 'N/A') {
      normalized.telefono = normalizePhone(extracted.telefono)
    }

    // Normalize city
    if (extracted.ciudad && extracted.ciudad !== 'N/A') {
      normalized.ciudad = normalizeCity(extracted.ciudad)
    }

    // Normalize address
    if (extracted.direccion && extracted.direccion !== 'N/A') {
      normalized.direccion = normalizeAddress(extracted.direccion)
    }

    // Normalize departamento (proper case)
    if (extracted.departamento && extracted.departamento !== 'N/A') {
      normalized.departamento = normalizeCity(extracted.departamento)
    }

    // Normalize barrio (proper case)
    if (extracted.barrio && extracted.barrio !== 'N/A') {
      normalized.barrio = normalizeCity(extracted.barrio)
    }

    return normalized
  }

  /**
   * Infer missing fields from available data.
   */
  private inferMissingFields(normalized: ExtractedData): { departamento?: string } {
    const inferred: { departamento?: string } = {}

    // Infer departamento from ciudad
    if (normalized.ciudad && !normalized.departamento) {
      const dept = inferDepartamento(normalized.ciudad)
      if (dept) {
        inferred.departamento = dept
      }
    }

    return inferred
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Merge extracted data with existing data.
 * New data does not overwrite with empty values.
 *
 * @param existing - Data already collected
 * @param newData - Newly extracted data
 * @returns Merged data
 */
export function mergeExtractedData(
  existing: Record<string, string>,
  newData: ExtractedData
): Record<string, string> {
  const merged = { ...existing }

  for (const [key, value] of Object.entries(newData)) {
    // Only update if new value exists and is not empty
    if (value && value.trim() !== '') {
      merged[key] = value
    }
  }

  return merged
}

/**
 * Check if minimum required data is present.
 * Minimum = 5 critical fields for proactive promo offer.
 *
 * @param data - Collected data to check
 * @returns True if 5 critical fields are present
 */
export function hasMinimumData(data: Record<string, string>): boolean {
  let count = 0
  for (const field of CRITICAL_FIELDS) {
    if (data[field] && data[field].trim() !== '' && data[field] !== 'N/A') {
      count++
    }
  }
  return count >= 5
}

/**
 * Check if all critical data is present.
 * Critical = 5 critical fields + at least 3 additional.
 * This triggers automatic ofrecer_promos flow.
 *
 * @param data - Collected data to check
 * @returns True if all critical + 3 additional fields are present
 */
export function hasCriticalData(data: Record<string, string>): boolean {
  // First check all critical fields
  for (const field of CRITICAL_FIELDS) {
    if (!data[field] || data[field].trim() === '') {
      return false
    }
  }

  // Count additional fields (including N/A as "answered")
  let additionalCount = 0
  for (const field of ADDITIONAL_FIELDS) {
    if (data[field] && data[field].trim() !== '') {
      additionalCount++
    }
  }

  // Need at least 3 additional fields (8 total = 5 critical + 3 additional)
  return additionalCount >= 3
}

/**
 * Get count of filled fields (excluding N/A for critical).
 *
 * @param data - Collected data
 * @returns Object with critical and additional counts
 */
export function getFieldCounts(
  data: Record<string, string>
): { critical: number; additional: number; total: number } {
  let critical = 0
  let additional = 0

  for (const field of CRITICAL_FIELDS) {
    if (data[field] && data[field].trim() !== '' && data[field] !== 'N/A') {
      critical++
    }
  }

  for (const field of ADDITIONAL_FIELDS) {
    // N/A counts as filled for additional fields (user answered)
    if (data[field] && data[field].trim() !== '') {
      additional++
    }
  }

  return { critical, additional, total: critical + additional }
}
