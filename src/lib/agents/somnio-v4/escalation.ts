/**
 * Somnio Sales Agent v4 — Sub-loop Escalation Decision (D-02)
 *
 * Pure function que evalúa los 4 triggers D-02 y devuelve un SubLoopReason
 * (o null si el happy path procede sin escalar).
 *
 * Orden de prioridad:
 *   1. cas_reject       (post-mutation retry decision)
 *   2. crm_mutation     (transition produce mutación que necesita validación contextual)
 *   3. razonamiento_libre  (intent === 'razonamiento_libre' || intent === 'otro')
 *   4. low_confidence   (intent_confidence < threshold)
 *
 * D-65: el threshold se aplica directamente sobre intent_confidence (sin formula).
 * D-69: 'otro' es sumidero por construcción del few-shot — su intent_confidence típicamente
 *       será bajo y caerá en low_confidence; aquí también lo agarramos como razonamiento_libre
 *       defensivo para semántica clara.
 *
 * Pure function — testeable sin DB ni LLM. Cero side-effects.
 *
 * Standalone: somnio-sales-v4 / Plan 07.
 */

import type { SubLoopReason } from './sub-loop/output-schema'

export interface EscalationInput {
  /** intent_confidence reportado por comprehend (D-63). Rango 0..1 */
  confidence: number
  /** Threshold leído de platform_config (D-11). Rango 0..1 */
  threshold: number
  /** intent.primary clasificado por comprehend. */
  intent: string
  /**
   * True si la transition resuelta produce una acción CRM no-trivial
   * (set por orquestador post-resolveTransition tras inspeccionar salesResult.accion).
   */
  isCrmMutation: boolean
  /**
   * True si una mutación moveOrderToStage acaba de retornar 'stage_changed_concurrently'.
   * Solo se setea en el segundo pase del orquestador (after-mutation re-run).
   */
  casReject: boolean
}

/**
 * Decide si escalar al sub-loop y con qué reason (D-02).
 *
 * Retorna `null` cuando ningún trigger se activa (happy path procede al state machine).
 */
export function decideSubLoopReason(input: EscalationInput): SubLoopReason | null {
  // 1) cas_reject (post-mutation retry decision — top priority)
  if (input.casReject) return 'cas_reject'

  // 2) crm_mutation (transition produce mutación que necesita validación contextual)
  if (input.isCrmMutation) return 'crm_mutation'

  // 3) razonamiento_libre / otro intents — D-02 + D-69 explícitos
  if (input.intent === 'razonamiento_libre' || input.intent === 'otro') {
    return 'razonamiento_libre'
  }

  // 4) low confidence — D-65 threshold sobre intent_confidence
  if (input.confidence < input.threshold) return 'low_confidence'

  return null
}
