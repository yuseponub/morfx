/**
 * Somnio Sales Agent v2 — Comprehension Schema
 *
 * Zod schema for Claude structured output (Capa 1).
 * Defines the exact shape of the analysis result.
 */

import { z } from 'zod'
import { V2_INTENTS } from './constants'

// ============================================================================
// Schema
// ============================================================================

export const MessageAnalysisSchema = z.object({
  intent: z.object({
    primary: z.enum(V2_INTENTS),
    secondary: z.enum([...V2_INTENTS, 'ninguno'] as const).describe(
      'Second intent if message has two clear intentions. E.g: "Hola, cuanto cuesta?" → primary=saludo, secondary=precio. Use "ninguno" if only one intent.'
    ),
    confidence: z.number().describe('0-100. 90+ clear, 70-89 probable, <70 ambiguous'),
    reasoning: z.string().describe('Brief explanation of why this intent was chosen'),
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
      'Selected pack. "el de 2", "quiero el doble" → 2x'
    ),
    ofi_inter: z.boolean().nullable().describe(
      'true if mentions picking up at Inter office. "ofi inter", "recojo en oficina"'
    ),
  }),

  classification: z.object({
    category: z.enum(['datos', 'pregunta', 'mixto', 'irrelevante']).describe(
      'datos: only personal info. pregunta: requires response. mixto: both. irrelevante: ok, gracias, emojis'
    ),
    sentiment: z.enum(['positivo', 'neutro', 'negativo']),
    is_acknowledgment: z.boolean().describe(
      'true if only ok/si/gracias/jaja/emoji without substantive content'
    ),
  }),

  negations: z.object({
    correo: z.boolean().describe('"no tengo correo" → true'),
    telefono: z.boolean().describe('"no tengo celular" → true'),
    barrio: z.boolean().describe('"no se el barrio" → true'),
  }),
})

// ============================================================================
// Type
// ============================================================================

export type MessageAnalysis = z.infer<typeof MessageAnalysisSchema>
