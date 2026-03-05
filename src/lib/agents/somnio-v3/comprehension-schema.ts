/**
 * Somnio Sales Agent v3 — Comprehension Schema
 *
 * Zod schema for Claude Haiku structured output (Capa 2).
 * Single call per turn: intent + data extraction + classification.
 */

import { z } from 'zod'
import { V3_INTENTS } from './constants'

// ============================================================================
// Schema
// ============================================================================

export const MessageAnalysisSchema = z.object({
  intent: z.object({
    primary: z.enum(V3_INTENTS),
    secondary: z.enum([...V3_INTENTS, 'ninguno'] as const).describe(
      'Second intent if message has two clear intentions. ' +
      'E.g: "Hola, cuanto cuesta?" -> primary=saludo, secondary=precio. ' +
      'Use "ninguno" if only one intent.'
    ),
    confidence: z.number().describe(
      '0-100. 90+ clear intent, 70-89 probable, <70 ambiguous'
    ),
    reasoning: z.string().describe(
      'Brief explanation of why this intent was chosen'
    ),
  }),

  extracted_fields: z.object({
    nombre: z.string().nullable(),
    apellido: z.string().nullable(),
    telefono: z.string().nullable().describe('Format: 573XXXXXXXXX'),
    ciudad: z.string().nullable().describe('Normalize to proper case'),
    departamento: z.string().nullable(),
    direccion: z.string().nullable(),
    barrio: z.string().nullable(),
    correo: z.string().nullable(),
    indicaciones_extra: z.string().nullable(),
    cedula_recoge: z.string().nullable(),
    pack: z.enum(['1x', '2x', '3x']).nullable().describe(
      'Selected pack. "el de 2", "quiero dos" -> 2x. ' +
      '"el individual" -> 1x. "el triple" -> 3x.'
    ),
    ofi_inter: z.boolean().nullable().describe(
      'true if mentions picking up at Inter office. ' +
      '"ofi inter", "recojo en oficina", "prefiero recoger"'
    ),
  }),

  classification: z.object({
    category: z.enum(['datos', 'pregunta', 'mixto', 'irrelevante']).describe(
      'datos: only personal info (name, phone, address). ' +
      'pregunta: question or request that needs a response. ' +
      'mixto: both data and question. ' +
      'irrelevante: acknowledgments (ok, gracias, emojis) without content.'
    ),
    sentiment: z.enum(['positivo', 'neutro', 'negativo']),
    is_acknowledgment: z.boolean().describe(
      'true if message is only ok/si/gracias/jaja/emoji without substantive content'
    ),
  }),

  negations: z.object({
    correo: z.boolean().describe('"no tengo correo", "no tengo email" -> true'),
    telefono: z.boolean().describe('"no tengo celular" -> true'),
    barrio: z.boolean().describe('"no se el barrio", "no conozco el barrio" -> true'),
  }),
})

// ============================================================================
// Type
// ============================================================================

export type MessageAnalysis = z.infer<typeof MessageAnalysisSchema>
