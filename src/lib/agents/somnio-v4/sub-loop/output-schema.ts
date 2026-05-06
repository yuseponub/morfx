import { z } from 'zod'

/**
 * LoopOutcome — output del sub-loop AI SDK v6 (D-29 RE-SHAPE post-RESEARCH H-1).
 *
 * Schema FLAT (sin discriminated union) compatible con todos los providers:
 * - OpenAI GPT-4o mini (D-30 — sub-loop usa GPT por tools+Output.object combinados)
 * - Gemini 2.5 Flash-Lite (D-30 — comprehension + nunca-decir-check)
 * - Anthropic Haiku (futuros calls que no requieran tools+Output.object)
 *
 * RESEARCH H-1 (somnio-sales-v4-runtime-wiring): el schema previo
 * (discriminated unions + boolean literals + dynamic-keyed records) NUNCA corrió
 * contra API real — los unit tests del v4 sub-loop eran mocks. Empíricamente
 * todos los providers lo rechazan:
 * - discriminated unions → JSON Schema oneOf → Anthropic + OpenAI strict reject
 * - boolean literals (false/true) → enum:[false] con type=string → Gemini reject
 * - dynamic-keyed records → propertyNames:{type:string} → Anthropic reject
 * - optional() → ausencia de field tratada distinto en OpenAI strict mode → use nullable()
 *
 * INVARIANTES (enforced post-hoc en sub-loop/index.ts vía `validateLoopOutcomeInvariants`):
 * - status='canonical' → canonicalText !== null && sourceTopic !== null && requiresHuman === false
 * - status='template'  → responseTemplate !== null && requiresHuman === false
 * - status='no_match'  → responseTemplate === 'handoff_humano' && requiresHuman === true && knowledgeQueried !== null
 *
 * Si invariante roto post-parse → escalar suave a no_match con
 * `reason: 'invariant_violation: <detail>'` (consistent con D-57).
 *
 * D-50: 'canonical' = verbatim de la sección "## Respuesta canónica" del KB doc.
 *       NUNCA texto generativo, NUNCA cita "## NUNCA decir" ni "## Sources".
 * D-57: 'no_match' siempre handoff_humano + requiresHuman=true.
 * D-62: SIN variante de texto libre (anti-hallucination). El status se enforca
 *       por `Output.object()` schema enum, NO por toolChoice.
 *
 * AUDIT (Plan 02 Task 1): el field extraContext previo era un dynamic-keyed
 * map opcional y NO se consume en ningún lugar del codebase (verificado vía
 * grep recursivo de `outcome.extraContext` / `loopOutcome.extraContext` /
 * `output.extraContext` → 0 matches). El extraContext que aparece en
 * response-track.ts y types.ts pertenece al response-track v4 (otro shape
 * distinto, no del LoopOutcome).
 * Decisión: ELIMINAR extraContext por completo — schema más simple y portable.
 *
 * Standalone: somnio-sales-v4-runtime-wiring / Plan 02.
 */
export const LoopOutcomeSchema = z.object({
  status: z
    .enum(['template', 'canonical', 'no_match'])
    .describe('Discriminator del outcome del sub-loop (D-62)'),

  // canonical fields (nullable cuando status !== 'canonical')
  canonicalText: z
    .string()
    .nullable()
    .describe(
      'Verbatim de "## Respuesta canónica" del KB doc — solo en status=canonical (D-50)'
    ),
  sourceTopic: z
    .string()
    .nullable()
    .describe('Topic del KB doc fuente — solo en status=canonical'),
  nuncaDecirRules: z
    .array(z.string())
    .nullable()
    .describe(
      'Reglas "NUNCA decir" del KB doc para validación post-gen (D-51) — solo en status=canonical. W-09: vienen del DB column nunca_decir vía RPC match_knowledge_base.'
    ),

  // template fields (nullable cuando status !== 'template' && !== 'no_match')
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
  if (output.status === 'canonical') {
    if (output.canonicalText === null)
      return { ok: false, violation: 'canonical_missing_canonicalText' }
    if (output.sourceTopic === null)
      return { ok: false, violation: 'canonical_missing_sourceTopic' }
    if (output.requiresHuman !== false)
      return { ok: false, violation: 'canonical_requiresHuman_must_be_false' }
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
