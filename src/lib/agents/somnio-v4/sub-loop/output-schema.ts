import { z } from 'zod'

/**
 * LoopOutcome — output del sub-loop AI SDK v6 (D-24 RAG-generative refactor Plan 03).
 *
 * Schema FLAT (sin discriminated union) compatible con todos los providers:
 * - OpenAI GPT-4o mini (sub-loop tooling call — kb_search + Output.object)
 * - Gemini 2.5 Flash (sub-loop generation call — Output.object SIN tools por H-2)
 * - Gemini 2.5 Flash-Lite (comprehension + nunca-decir-check)
 * - Anthropic Haiku (futuros calls)
 *
 * RAG-GENERATIVE REFACTOR (Plan 03, D-24):
 * - status 'canonical' ELIMINADO → reemplazado por 'generated' (texto redactado por
 *   Gemini Flash usando material del KB como insumo, NO verbatim).
 * - canonicalText ELIMINADO → reemplazado por responseText.
 * - responseConfidence + confidenceRationale agregados (D-15 auto-reportado por modelo).
 * - Path crm_mutation/cas_reject preserva flujo viejo (D-12) → emite status='template'
 *   o status='no_match', NUNCA 'generated' por ese path.
 *
 * INVARIANTES (enforced post-hoc en sub-loop/index.ts vía `validateLoopOutcomeInvariants`):
 * - status='generated' → responseText !== null && sourceTopic !== null && responseConfidence !== null && requiresHuman === false
 * - status='template'  → responseTemplate !== null && requiresHuman === false
 * - status='no_match'  → responseTemplate === 'handoff_humano' && requiresHuman === true && knowledgeQueried !== null
 *
 * Si invariante roto post-parse → escalar suave a no_match con
 * `reason: 'invariant_violation: <detail>'` (consistent con D-57).
 *
 * D-19: threshold 0.70 — si responseConfidence < 0.70 el orchestrator dispara handoff.
 * D-24: 'generated' reemplaza 'canonical' (ya no es verbatim).
 * D-57: 'no_match' siempre handoff_humano + requiresHuman=true.
 *
 * Standalone: somnio-v4-rag-generative / Plan 03 (refactor del schema de
 * somnio-sales-v4-runtime-wiring / Plan 02).
 */
export const LoopOutcomeSchema = z.object({
  status: z
    .enum(['generated', 'template', 'no_match'])
    .describe(
      "Discriminator del outcome — 'generated' reemplaza 'canonical' (D-24, ya no es verbatim)."
    ),

  // generated fields (nullable cuando status !== 'generated')
  responseText: z
    .string()
    .nullable()
    .describe(
      'Texto generado por Gemini Flash usando SOLO el material del KB (D-08). Reemplaza canonicalText.'
    ),
  sourceTopic: z
    .string()
    .nullable()
    .describe('Topic ganador del KB doc fuente — solo en status=generated (Tooling call lo seleccionó).'),
  responseConfidence: z
    .number()
    .nullable()
    .describe(
      '0..1 auto-reportado por el modelo (D-15). Threshold 0.70 → handoff (D-19).'
    ),
  confidenceRationale: z
    .string()
    .nullable()
    .describe('1 frase razón del confidence — observability.'),
  nuncaDecirRules: z
    .array(z.string())
    .nullable()
    .describe(
      'Reglas "NUNCA decir" del KB doc para validación post-gen (D-09). W-09: vienen del DB column nunca_decir vía RPC match_knowledge_base.'
    ),

  // template fields (path crm_mutation/cas_reject D-12 — SIN cambios)
  responseTemplate: z
    .string()
    .nullable()
    .describe(
      'Intent template (status=template) o "handoff_humano" (status=no_match)'
    ),

  // no_match fields (nullable cuando status !== 'no_match')
  knowledgeQueried: z
    .array(z.string())
    .nullable()
    .describe(
      'Topics consultados sin match — solo en status=no_match (D-58 doble logging)'
    ),

  // común a todos los status
  requiresHuman: z
    .boolean()
    .describe(
      'true solo en status=no_match (enforced post-hoc por validateLoopOutcomeInvariants)'
    ),
  reason: z.string().describe('Razón del outcome — observability + debugging'),
})

export type LoopOutcome = z.infer<typeof LoopOutcomeSchema>

/**
 * SubLoopReason — disparadores D-02.
 * - low_confidence: comprehension reportó intent_confidence < threshold (D-03)
 * - crm_mutation: state machine quiere ejecutar mutación CRM no trivial (D-19)
 * - cas_reject: domain.moveOrderToStage retornó stage_changed_concurrently
 * - razonamiento_libre: cliente fuera del flujo de venta (filosofía, divagaciones, etc.)
 */
export type SubLoopReason =
  | 'low_confidence'
  | 'crm_mutation'
  | 'cas_reject'
  | 'razonamiento_libre'

/**
 * Helper de validación post-hoc — enforca invariantes que el schema flat no captura.
 *
 * Se llama en `sub-loop/index.ts` justo después del `generateText({ output: Output.object(...) })`
 * y antes de retornar el LoopOutcome al consumer. Si invariante roto → caller debe
 * sobrescribir con un LoopOutcome no_match (escalación suave a handoff humano,
 * consistente con D-57). NO throw — escalar suave evita romper turnos productivos.
 *
 * @returns `{ ok: true }` si el output es válido. `{ ok: false, violation }` si
 *          alguna invariante se rompe — `violation` describe cuál (útil para
 *          observability + debugging).
 */
export function validateLoopOutcomeInvariants(output: LoopOutcome): {
  ok: boolean
  violation?: string
} {
  if (output.status === 'generated') {
    if (output.responseText === null)
      return { ok: false, violation: 'generated_missing_responseText' }
    if (output.sourceTopic === null)
      return { ok: false, violation: 'generated_missing_sourceTopic' }
    if (output.responseConfidence === null)
      return { ok: false, violation: 'generated_missing_responseConfidence' }
    if (output.requiresHuman !== false)
      return { ok: false, violation: 'generated_requiresHuman_must_be_false' }
  }
  if (output.status === 'template') {
    if (output.responseTemplate === null)
      return { ok: false, violation: 'template_missing_responseTemplate' }
    if (output.requiresHuman !== false)
      return { ok: false, violation: 'template_requiresHuman_must_be_false' }
  }
  if (output.status === 'no_match') {
    if (output.responseTemplate !== 'handoff_humano')
      return {
        ok: false,
        violation: 'no_match_responseTemplate_must_be_handoff_humano',
      }
    if (output.requiresHuman !== true)
      return { ok: false, violation: 'no_match_requiresHuman_must_be_true' }
    if (output.knowledgeQueried === null)
      return { ok: false, violation: 'no_match_missing_knowledgeQueried' }
  }
  return { ok: true }
}
