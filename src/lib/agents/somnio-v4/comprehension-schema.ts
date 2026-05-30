/**
 * Somnio Sales Agent v4 — Comprehension Schema
 *
 * Zod schema for Gemini 2.5 Flash structured output (Capa 2).
 * Single call per turn: intent + data extraction + classification.
 *
 * Standalone: somnio-sales-v4
 * Cloned mecánicamente desde somnio-v3/comprehension-schema.ts (D-24).
 *
 * EXTENSIÓN v4 (D-10, D-63):
 *   - intent.intent_confidence: z.number().min(0).max(1) — self-reported confidence
 *     post-clasificación, calibrado vía few-shot (D-64). Threshold leído de
 *     platform_config en runtime (D-11). Sin formula posterior (D-64).
 *   - intent.intent_confidence_reasoning: z.string().optional() — observability + tuning (D-68).
 *
 * Anti-patterns explícitos (Pitfall 4 / D-67):
 *   - NO añadir un campo enum-mapeado para confidence (certain/likely/uncertain) — ese es Plan B (D-67).
 *   - NO subir temperature en comprehension.ts (default 0).
 */

import { z } from 'zod'
import { V4_INTENTS } from './constants'

// ============================================================================
// Schema
// ============================================================================

export const MessageAnalysisSchema = z.object({
  intent: z.object({
    primary: z.enum(V4_INTENTS),
    secondary: z.enum([...V4_INTENTS, 'ninguno'] as const).describe(
      'Second intent if message has two clear intentions. ' +
      'E.g: "Hola, cuanto cuesta?" -> primary=saludo, secondary=precio. ' +
      'Use "ninguno" if only one intent.'
    ),
    confidence: z.number().describe(
      '0-100. 90+ clear intent, 70-89 probable, <70 ambiguous. ' +
      'Campo legacy v3 — preservado para compatibilidad. v4 usa intent_confidence (0..1) para escalación.'
    ),
    reasoning: z.string().describe(
      'Brief explanation of why this intent was chosen'
    ),

    // === V4 NEW (D-10, D-63) ===
    intent_confidence: z.number().min(0).max(1).describe(
      '0..1 self-reported confidence en la clasificación PRIMARIA. ' +
      '0.85+ = universal-claro (e.g., "cuanto cuesta"), ' +
      '0.50-0.70 = context-dependent (e.g., "ok"), ' +
      '<0.40 = sumidero / fallback / razonamiento_libre. ' +
      'Reflect ambiguity at this turn IN ISOLATION (D-74) — do NOT use prior conversation phase to resolve.'
    ),
    intent_confidence_reasoning: z.string().optional().describe(
      'Brief explanation of confidence value (D-68 observability + tuning iterativo post-launch).'
    ),

    // === V4 NEW (v4-hybrid-template-rag-turn D-01 + D-04) ===
    secondary_confidence: z.number().min(0).max(1).nullable().describe(
      '0..1 self-reported confidence en la clasificacion SECUNDARIA. ' +
      'null si secondary === "ninguno". Misma calibracion template-fit que intent_confidence: ' +
      '0.85+ = la respuesta automatica del secondary CUBRE la pregunta; ' +
      '0.20-0.40 = NO CUBRE (caso especifico/sustancia/condicion); 0.45-0.65 = ambiguo.'
    ),
    secondary_confidence_reasoning: z.string().nullable().describe(
      'Breve explicacion del secondary_confidence (observability + tuning). null si secondary === "ninguno".'
    ),
    secondary_query: z.string().nullable().describe(
      'Sub-query segmentada del SEGUNDO intent — la parte del mensaje que corresponde al ' +
      'secondary, reformulada como pregunta auto-contenida. null si secondary === "ninguno". ' +
      'Ej: "cuanto vale y lo puedo tomar si tengo apnea?" -> secondary_query="puedo tomar el ' +
      'producto si tengo apnea del sueno?"'
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
    entrega_oficina: z.boolean().nullable().describe(
      'true SOLO si señal CLARA de pickup en oficina: "oficina de inter", "recoger en oficina/sede", ' +
      '"no hay nomenclatura enviar a oficina", carrier usado COMO dirección sin calle real, ' +
      '"centro oficina [ciudad]", "sede principal". ' +
      'Variantes: interrapidisimo, interrapidicimo, interapidisimo, intirrapicimo, rapidisimo, interrapid, iterrapidisimo. ' +
      'Si dice "oficina" + "inter" → true. Si SOLO dice "inter" sin oficina → false (usar menciona_inter).'
    ),
    menciona_inter: z.boolean().nullable().describe(
      'true si menciona "inter"/"interrapidisimo" (o variantes) SIN señal clara de oficina/recoger/sede. ' +
      'Ej: "lo envian por interrapidisimo?", "interrapidisimo" suelto. ' +
      'NUNCA true si entrega_oficina es true — son mutuamente excluyentes. ' +
      'En caso de duda, preferir menciona_inter (preguntar es más seguro).'
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
  }),

  negations: z.object({
    correo: z.boolean().describe('"no tengo correo", "no tengo email" -> true'),
    telefono: z.boolean().describe('"no tengo celular" -> true'),
    barrio: z.boolean().describe('"no se el barrio", "no conozco el barrio" -> true'),
    cedula_recoge: z.boolean().describe('"no quiero dar cedula", "no tengo cedula", "prefiero no dar cedula" -> true'),
  }),
})

// ============================================================================
// Type
// ============================================================================

export type MessageAnalysis = z.infer<typeof MessageAnalysisSchema>
