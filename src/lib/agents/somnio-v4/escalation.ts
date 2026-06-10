/**
 * Somnio Sales Agent v4 — Sub-loop Escalation Decision (D-02)
 *
 * Pure function que evalúa los triggers del PATH DEL AGENTE (slot resolver) y
 * devuelve la reason de escalación (o null si el happy path procede sin escalar).
 *
 * Orden de prioridad:
 *   1. razonamiento_libre  (intent === 'razonamiento_libre' || intent === 'otro')
 *   2. low_confidence      (intent_confidence < threshold)
 *
 * NOTA (somnio-v4-consolidation D-12): los reasons `crm_mutation` y `cas_reject`
 * NO se deciden aquí — son responsabilidad del CRM gate (crm-gate.ts) vía
 * `runCrmSubLoop`, que sigue VIVO con el `SubLoopReason` completo de
 * `sub-loop/output-schema.ts`. Los flags siempre-false que este archivo tenía
 * (params + ramas inalcanzables) fueron borrados en somnio-v4-consolidation/02
 * (Pitfall 13). El tipo de retorno se estrecha a los dos reasons que el slot
 * resolver puede producir.
 *
 * D-65: el threshold se aplica directamente sobre intent_confidence (sin formula).
 * D-69: 'otro' es sumidero por construcción del few-shot — su intent_confidence típicamente
 *       será bajo y caerá en low_confidence; aquí también lo agarramos como razonamiento_libre
 *       defensivo para semántica clara.
 *
 * Pure function — testeable sin DB ni LLM. Cero side-effects.
 *
 * Standalone: somnio-sales-v4 / Plan 07. Limpieza: somnio-v4-consolidation / Plan 02 (D-12).
 */

/** Reasons que el path del agente (slot resolver) puede producir — D-12. */
export type AgentSubLoopReason = 'low_confidence' | 'razonamiento_libre'

export interface EscalationInput {
  /** intent_confidence reportado por comprehend (D-63). Rango 0..1 */
  confidence: number
  /** Threshold leído de platform_config (D-11). Rango 0..1 */
  threshold: number
  /** intent.primary clasificado por comprehend. */
  intent: string
}

/**
 * Decide si escalar al sub-loop y con qué reason (D-02, path del agente).
 *
 * Retorna `null` cuando ningún trigger se activa (happy path procede al state machine).
 */
export function decideSubLoopReason(input: EscalationInput): AgentSubLoopReason | null {
  // 1) razonamiento_libre / otro intents — D-02 + D-69 explícitos
  if (input.intent === 'razonamiento_libre' || input.intent === 'otro') {
    return 'razonamiento_libre'
  }

  // 2) low confidence — D-65 threshold sobre intent_confidence
  if (input.confidence < input.threshold) return 'low_confidence'

  return null
}
