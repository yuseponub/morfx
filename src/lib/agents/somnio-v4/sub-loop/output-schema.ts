import { z } from 'zod'

/**
 * LoopOutcome — output del sub-loop AI SDK v6.
 *
 * D-62: discriminated union SIN variante de texto libre (anti-hallucination estructural).
 *       Enforced por Output.object() schema en `generateText`, NO por toolChoice.
 *       toolChoice='auto' se usa porque 'required' impediría el output estructurado
 *       final de la step-loop (ver RESEARCH §Pattern 2 / W-06 comentario en index.ts).
 *
 * D-50: 'canonical' = verbatim de la sección "## Respuesta canónica" del KB doc.
 *       NUNCA texto generativo, NUNCA cita "## NUNCA decir" ni "## Sources".
 *
 * D-57: 'no_match' siempre handoff_humano + requiresHuman=true.
 *
 * Standalone: somnio-sales-v4 / Plan 05.
 */
export const LoopOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('template'),
    responseTemplate: z
      .string()
      .describe(
        'Intent de un template existente en agent_templates filtrado por agent_id=somnio-sales-v4'
      ),
    extraContext: z.record(z.string(), z.string()).optional(),
    requiresHuman: z.literal(false),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('canonical'),
    canonicalText: z
      .string()
      .describe(
        'Verbatim de la sección "## Respuesta canónica" del KB doc encontrado.'
      ),
    sourceTopic: z.string().describe('topic del KB doc fuente'),
    nuncaDecirRules: z
      .array(z.string())
      .optional()
      .describe(
        'Reglas "NUNCA decir" del KB doc fuente (W-09: vienen del DB column nunca_decir vía RPC), para validación post-gen (D-51).'
      ),
    requiresHuman: z.literal(false),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('no_match'),
    responseTemplate: z.literal('handoff_humano'),
    requiresHuman: z.literal(true),
    reason: z.string(),
    knowledgeQueried: z
      .array(z.string())
      .describe(
        'Lista de topics consultados que no resolvieron el caso (D-58 doble logging).'
      ),
  }),
])

export type LoopOutcome = z.infer<typeof LoopOutcomeSchema>

/**
 * SubLoopReason — disparadores D-02.
 * - low_confidence: comprehension Haiku reportó intent_confidence < threshold (D-03)
 * - crm_mutation: state machine quiere ejecutar mutación CRM no trivial (D-19)
 * - cas_reject: domain.moveOrderToStage retornó stage_changed_concurrently
 * - razonamiento_libre: cliente fuera del flujo de venta (filosofía, divagaciones, etc.)
 */
export type SubLoopReason =
  | 'low_confidence'
  | 'crm_mutation'
  | 'cas_reject'
  | 'razonamiento_libre'
