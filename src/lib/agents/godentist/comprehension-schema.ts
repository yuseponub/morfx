/**
 * GoDentist Agent — Comprehension Schema
 *
 * Zod schema for Claude Haiku structured output (Capa 2).
 * Single call per turn: intent + data extraction + classification.
 */

import { z } from 'zod'
import { GD_INTENTS, SERVICIOS } from './constants'

// ============================================================================
// Schema
// ============================================================================

export const MessageAnalysisSchema = z.object({
  intent: z.object({
    primary: z.enum(GD_INTENTS),
    secondary: z.enum([...GD_INTENTS, 'ninguno'] as const).describe(
      'Second intent if message has two clear intentions. ' +
      'E.g: "Hola, cuanto cuestan los brackets?" -> primary=saludo, secondary=precio_servicio. ' +
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
    telefono: z.string().nullable().describe('Format: 573XXXXXXXXX'),
    sede_preferida: z.enum(['cabecera', 'mejoras_publicas', 'floridablanca', 'canaveral']).nullable().describe(
      'Map aliases: Jumbo/Bosque/Canaveral -> canaveral, Centro -> mejoras_publicas'
    ),
    servicio_interes: z.enum(SERVICIOS).nullable().describe(
      'Detected dental service from price question'
    ),
    cedula: z.string().nullable(),
    fecha_preferida: z.string().nullable().describe(
      'Normalized date: "manana" -> tomorrow date, "el martes" -> next tuesday date, ' +
      '"15 de marzo" -> 2026-03-15. Always YYYY-MM-DD format'
    ),
    preferencia_jornada: z.enum(['manana', 'tarde']).nullable().describe(
      '"en la manana" -> manana, "en la tarde/noche" -> tarde'
    ),
    horario_seleccionado: z.string().nullable().describe(
      'Selected time slot in 12h format: "el de las 10" -> "10:00 AM", "a las 2" -> "2:00 PM". Always H:MM AM/PM'
    ),
  }),

  classification: z.object({
    category: z.enum(['datos', 'pregunta', 'mixto', 'irrelevante']).describe(
      'datos: only personal info (name, phone, sede). ' +
      'pregunta: question or request that needs a response. ' +
      'mixto: both data and question. ' +
      'irrelevante: acknowledgments (ok, gracias, emojis) without content.'
    ),
    sentiment: z.enum(['positivo', 'neutro', 'negativo']),
    idioma: z.enum(['es', 'en', 'otro']).describe(
      'Detected language. Critical for English detection -> english_response template.'
    ),
  }),
})

// ============================================================================
// Type
// ============================================================================

export type MessageAnalysis = z.infer<typeof MessageAnalysisSchema>
