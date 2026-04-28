/**
 * Somnio PW-Confirmation — Cross-cutting Guards
 *
 * Run BEFORE phase derivation y transition table (Plan 11 engine compone:
 * comprehension → checkGuards → resolveTransition → response-track + crm-writer).
 *
 *   R0 (low confidence): si analysis.confidence < 0.5 AND intent !== 'fallback'
 *       → blocked + reason='low_confidence'.
 *       NOTA: el Zod schema (Plan 05) emite confidence en rango 0..1 (NO 0..100).
 *       Threshold de 0.5 alineado con instruccion del plan ("threshold 0.5 literal").
 *       Si intent ya es 'fallback' → NO blocked (el response-track maneja fallback
 *       como informational normal, no necesitamos handoff escalation).
 *
 *   R1 (escape intent): si analysis.intent === 'pedir_humano' (D-21 trigger d)
 *       → blocked + reason='escape_intent_pedir_humano'.
 *
 *   else: { blocked: false, reason: null }.
 *
 * Fork del patron somnio-recompra/guards.ts + somnio-v3/guards.ts. Diferencias:
 *   - confidence en rango 0..1 (vs recompra 0..100). Plan 05 schema lockea esto.
 *   - El intent enum aqui es PwIntent (22 values, ver comprehension-schema.ts).
 *   - El reason es solo un string label — el caller (engine Plan 11) decide
 *     que accion tomar (typicamente: emit action='handoff' + state.requires_human=true).
 */

import type { MessageAnalysis } from './comprehension-schema'

// ============================================================================
// Constants
// ============================================================================

/**
 * Threshold para R0 (low confidence). El Zod schema lockea confidence en
 * rango 0..1, asi que 0.5 = 50% confianza minima para procesar el intent.
 * Por debajo, el caller debe escalar a handoff (segun el plan).
 *
 * NOTE: NO confundir con `LOW_CONFIDENCE_THRESHOLD = 80` en `./constants.ts` —
 * ese es para sales-track Plan 08 fallback (escala 0..100). El schema PW
 * confidence viene en escala 0..1.
 */
const LOW_CONFIDENCE_GUARD_THRESHOLD = 0.5

// ============================================================================
// Types
// ============================================================================

export interface GuardResult {
  blocked: boolean
  reason: string | null
}

// ============================================================================
// checkGuards
// ============================================================================

/**
 * Evalua R0 (low confidence) + R1 (escape intent) sobre el output de
 * comprehension. Retorna `blocked=true` con un reason label si alguna
 * regla aplica, `blocked=false` en caso contrario.
 *
 * Convencion: el caller (engine Plan 11) interpreta `blocked=true` como
 * "tomar accion=handoff" (set state.requires_human=true + emit observability
 * event + return messages: []). NO es responsabilidad de checkGuards
 * decidir la accion final — solo flagea.
 */
export function checkGuards(analysis: MessageAnalysis): GuardResult {
  const intent = analysis.intent
  const confidence = analysis.confidence

  // R0: low confidence — bloquea solo si NO ya es fallback
  // (fallback con confidence=0 es la degradacion esperada del comprehension; no bloqueamos).
  if (confidence < LOW_CONFIDENCE_GUARD_THRESHOLD && intent !== 'fallback') {
    return {
      blocked: true,
      reason: 'low_confidence',
    }
  }

  // R1: escape intent — pedir_humano siempre escala a humano (D-21 trigger d).
  if (intent === 'pedir_humano') {
    return {
      blocked: true,
      reason: 'escape_intent_pedir_humano',
    }
  }

  return {
    blocked: false,
    reason: null,
  }
}
