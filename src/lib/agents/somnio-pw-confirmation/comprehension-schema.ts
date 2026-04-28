/**
 * Somnio Sales v3 PW-Confirmation Agent — Comprehension Schema
 *
 * Zod schema for Claude Haiku structured output (single call per turn).
 * Extracts intent + shipping data from a customer message in post-purchase context.
 *
 * Fork of somnio-recompra/comprehension-schema.ts — adapted for post-purchase flow:
 *   - Intent enum is the 22 PW-confirmation intents (14 informational + 7 sales + fallback).
 *   - `datos_extraidos` shape is shipping-focused (name + phone + address + city + dept).
 *   - NO pack selection (D-18 NO crea pedidos — sales-v3 territory).
 *   - NO entrega_oficina / menciona_inter heuristics (V1 deferred — use crm-writer for address only).
 *
 * Plan 04 (constants.ts) re-exports `PW_INTENT_VALUES` from this file for runtime keyword
 * matching (defense-in-depth on top of LLM classification).
 *
 * NOTE on enum drift: keep this list in lock-step with `INFORMATIONAL_INTENTS`,
 * `SALES_INTENTS`, and `PW_CONFIRMATION_INTENTS` in `./constants.ts`. constants.ts
 * imports the union from here (single source of truth for the Zod enum).
 */

import { z } from 'zod'

// ============================================================================
// Intent enum — single source of truth (22 values)
// ============================================================================

/**
 * The 22 intents recognized by the PW-confirmation agent comprehension.
 *
 * Breakdown:
 *   - 14 informational (cloned verbatim from sales-v3 set per D-15 + D-27)
 *   - 7 sales / post-purchase actions (PW-specific — replace prospect actions)
 *   - 1 fallback (intent could not be classified)
 *
 * Excluded vs sales-v3:
 *   - `quiero_comprar`, `seleccion_pack`, `confirmar` — prospect-only intents (D-18 scope NO).
 *
 * The order here is documentation-only; the Zod `enum` validates membership.
 */
export const PW_INTENT_VALUES = [
  // Informational (14)
  'saludo',
  'precio',
  'promociones',
  'contenido',
  'formula',
  'como_se_toma',
  'pago',
  'envio',
  'ubicacion',
  'contraindicaciones',
  'dependencia',
  'efectividad',
  'registro_sanitario',
  'tiempo_entrega',
  // Sales / post-purchase actions (7)
  'confirmar_pedido',
  'cancelar_pedido',
  'esperar',
  'cambiar_direccion',
  'editar_items',
  'agendar',
  'pedir_humano',
  // Fallback (1)
  'fallback',
] as const

export type PwIntent = (typeof PW_INTENT_VALUES)[number]

// ============================================================================
// Shipping data extraction sub-schema
// ============================================================================

/**
 * Shipping fields extracted from the customer message.
 *
 * All fields are `nullish()` (null | undefined) — the LLM should set them
 * only when EXPLICITLY present in the customer message. Never invent data.
 *
 * Used by Plan 06 (state.ts) `mergeAnalysis` to merge into session state,
 * and by Plan 07 (response-track.ts) `shippingComplete` to detect missing fields.
 */
export const DatosExtraidosSchema = z.object({
  nombre: z
    .string()
    .nullish()
    .describe(
      'First name only. Extract only when explicitly given. Capitalize properly (jose -> Jose). ' +
        'NULL if not present in the message.'
    ),

  apellido: z
    .string()
    .nullish()
    .describe(
      'Last name only. Extract only when explicitly given. Capitalize properly. ' +
        'NULL if not present in the message.'
    ),

  telefono: z
    .string()
    .nullish()
    .describe(
      'Phone number — normalizar a formato 573XXXXXXXXX (10 digitos despues de 57). ' +
        'Si el cliente da un numero de 10 digitos (3001234567), prefijar con 57 -> 573001234567. ' +
        'Si ya viene con 57, dejarlo tal cual. NULL si no esta en el mensaje.'
    ),

  direccion: z
    .string()
    .nullish()
    .describe(
      'shippingAddress — solo el texto de la direccion (NO incluir ciudad/depto). ' +
        'Ejemplo: "Calle 100 #15-20 apto 301". Si el cliente da "Calle 100, Bogota, Cundinamarca" ' +
        'extrae solo "Calle 100" aqui y pon "Bogota"/"Cundinamarca" en ciudad/departamento. ' +
        'NULL si no esta en el mensaje.'
    ),

  ciudad: z
    .string()
    .nullish()
    .describe(
      'City. Normalize to proper case (bogota -> Bogota, medellin -> Medellin). ' +
        'NULL if not in the message.'
    ),

  departamento: z
    .string()
    .nullish()
    .describe(
      'Department / state (Cundinamarca, Antioquia, etc.). Normalize to proper case. ' +
        'NULL if not in the message.'
    ),
})

export type DatosExtraidos = z.infer<typeof DatosExtraidosSchema>

// ============================================================================
// Top-level MessageAnalysis schema
// ============================================================================

/**
 * Output schema for the comprehension call (single Haiku invocation per turn).
 *
 * The LLM returns one of these objects per customer message. Plan 06 (state.ts)
 * merges `intent` into the state machine event channel and `datos_extraidos`
 * into the captured-data merge. Plan 12 mocks `generateObject` to test
 * intent classification + extraction logic.
 */
export const MessageAnalysisSchema = z.object({
  intent: z
    .enum(PW_INTENT_VALUES)
    .describe(
      'Primary intent of the message (single value from the enumerated list). ' +
        'POST-PURCHASE CONTEXT: el cliente YA tiene un pedido — NO clasifiques como ' +
        '"quiero_comprar" / "seleccion_pack" (no estan en el enum porque no aplican aqui). ' +
        'D-26: si el estado actual de la maquina es awaiting_confirmation y el cliente ' +
        'responde si/dale/ok/correcto/listo/confirmo, intent = confirmar_pedido (sin importar ' +
        'que template fue el ultimo enviado). Si no se puede clasificar, usar "fallback".'
    ),

  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'Confidence score 0.0 - 1.0. ' +
        '>=0.9 = clear intent. 0.7-0.89 = probable. <0.7 = ambiguous (state-machine should ' +
        'prefer fallback / re-ask). Used by Plan 06 guards.ts (R0 low-confidence -> handoff).'
    ),

  datos_extraidos: DatosExtraidosSchema.nullish().describe(
    'Structured shipping data extracted from the message. NULL/undefined if the message ' +
      'contains no extractable shipping fields. Each field inside is independently nullish.'
  ),

  notas: z
    .string()
    .nullish()
    .describe(
      'Optional brief explanation (1-2 sentences) of why this intent was chosen, ' +
        'or any nuance the state machine should know (e.g. "cliente menciona que no ' +
        'puede recibir el martes — considerar agendar"). Used for observability ' +
        'comprehension:result events. NULL if no extra note needed.'
    ),
})

// ============================================================================
// Inferred types
// ============================================================================

export type MessageAnalysis = z.infer<typeof MessageAnalysisSchema>
