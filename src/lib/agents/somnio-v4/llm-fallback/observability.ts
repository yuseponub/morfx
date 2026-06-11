/**
 * Typed observability emitter para el switch de fallback Gemini → Anthropic (D-10).
 *
 * Patrón analogo VERBATIM de `src/lib/agents/interruption-system-v2/observability.ts`
 * (dual emission collector.recordEvent + console.log), cambiando el prefijo a
 * `[gemini-fallback]`.
 *
 * Why typed union: pasar un string arbitrario a `emitFallbackEvent` es error de
 * compilacion. Cada label pertenece al contrato D-10; agregar uno nuevo requiere
 * sumarlo aquí primero para que los consumidores (dashboards de observability,
 * alerting) dependan de una superficie estable.
 *
 * Payload discipline (security_note — T-fb-01): SOLO callSite/provider/model/
 * errorCode/errorKind/latencyMs — NUNCA contenido del mensaje del usuario ni
 * ANTHROPIC_API_KEY.
 */

import { getCollector } from '@/lib/observability'

/** 6 labels typed-union (D-10). Pasar un string arbitrario es error de compilacion. */
export type FallbackEventLabel =
  /** { callSite, provider:'anthropic', model, errorKind:'saturation'|'timeout'|'probe_failed'|'circuit_open', errorCode?, latencyMs? } */
  | 'fallback_triggered'
  /** { callSite, errorCode?, gemini_latency_ms? } */
  | 'circuit_opened'
  /** { callSite, probe_latency_ms? } */
  | 'circuit_closed'
  /** { callSite, gemini_latency_ms? } */
  | 'probe_ok'
  /** { callSite, errorCode? } */
  | 'probe_failed'
  /** { callSite, gemini_error, anthropic_error } — doble fallo (Pitfall #8) */
  | 'fallback_failed'

export function emitFallbackEvent(
  label: FallbackEventLabel,
  payload: Record<string, unknown>,
): void {
  const collector = getCollector()
  if (collector) {
    collector.recordEvent('pipeline_decision', label, payload)
  }
  console.log(`[gemini-fallback] ${label}`, payload)
}
