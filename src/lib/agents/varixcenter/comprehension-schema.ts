// Clonado de src/lib/agents/godentist-fb-ig/comprehension-schema.ts (Standalone agent-varixcenter Wave 2 Plan 04 Task 1).
// Cambios vs godentist-fb-ig (diseño §2):
//   - intent.primary/secondary usan VARIX_INTENTS (24 intents — diseño §1).
//   - ELIMINADOS los campos de sede y de servicio dental (1 sola sede, 1 solo servicio relevante).
//   - AGREGADO tipo_venas (enum grandes|vasitos|ambas con mapeos) + ciudad.
//   - MANTENIDO verbatim: nombre, cedula, telefono, fecha_preferida/fecha_vaga,
//     preferencia_jornada, horario_seleccionado, classification.
/**
 * Varixcenter Agent — Comprehension Schema
 *
 * Zod schema for Claude Haiku structured output (Capa 2).
 * Single call per turn: intent + data extraction + classification.
 */

import { z } from 'zod'
import { VARIX_INTENTS } from './constants'

// ============================================================================
// Schema
// ============================================================================

export const MessageAnalysisSchema = z.object({
  intent: z.object({
    primary: z.enum(VARIX_INTENTS),
    secondary: z.enum([...VARIX_INTENTS, 'ninguno'] as const).describe(
      'Second intent if message has two clear intentions. ' +
      'E.g: "Hola, cuanto cuesta el tratamiento?" -> primary=saludo, secondary=precio_tratamiento. ' +
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
    cedula: z.string().nullable(),
    ciudad: z.string().nullable().describe(
      'City mentioned by the patient (e.g. "Bucaramanga", "Cúcuta", "Floridablanca")'
    ),
    tipo_venas: z.enum(['grandes', 'vasitos', 'ambas']).nullable().describe(
      'Map aliases: ' +
      '"arañitas","vasculares","venitas","vasitos pequeños" -> vasitos; ' +
      '"vena gruesa","vena pronunciada","vena interna","varices grandes" -> grandes; ' +
      '"las dos","ambas","de todo" -> ambas.'
    ),
    fecha_preferida: z.string().nullable().describe(
      'Normalized date: "manana" -> tomorrow date, "el martes" -> next tuesday date, ' +
      '"15 de marzo" -> 2026-03-15. Always YYYY-MM-DD format. ' +
      'Leave null if date is vague (only month name like "en abril") — use fecha_vaga instead.'
    ),
    fecha_vaga: z.string().nullable().describe(
      'If date is vague (only month name like "en abril", "en vacaciones", "para mayo", "despues de semana santa") ' +
      'put the month/reference here and leave fecha_preferida null. ' +
      'Do NOT use for concrete relative dates like "la proxima semana", "el martes", "manana" — those go to fecha_preferida.'
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
      'datos: only personal info (name, phone, cedula, ciudad). ' +
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
