/**
 * Orquestador del fallback Gemini → Anthropic (RESEARCH Q8 + diagrama de flujo).
 *
 * Acotado a somnio-v4 (D-04). NO wirea call-sites — eso es Wave 2. Este archivo
 * solo expone `callWithGeminiFallback<T>` que los 4 call-sites invocarán inyectando
 * sus closures `gemini`/`anthropic`.
 *
 * NOTA de seguridad (security_note — T-fb-01): NUNCA agregar contenido del mensaje
 * del usuario ni `ANTHROPIC_API_KEY` a los payloads de `emitFallbackEvent`. Solo
 * metadatos (callSite, errorCode, latencyMs).
 */

import { isGeminiSaturation, isTimeoutError } from './saturation'
import { emitFallbackEvent } from './observability'
import { effectiveState, openBreaker, closeBreaker } from './breaker'
import { FALLBACK_MODEL, TIMEOUT_MS, type CallSite } from './config'

export type { CallSite }
export { __resetBreakers } from './breaker'

export async function callWithGeminiFallback<T>(args: {
  callSite: CallSite
  gemini: (signal: AbortSignal) => Promise<T> // llamada Gemini con maxRetries:0 (lo setea el call-site)
  anthropic: () => Promise<T>                  // llamada Anthropic (schema saneado si aplica)
}): Promise<T> {
  const { callSite, gemini, anthropic } = args
  const state = effectiveState(callSite)

  // 1. Circuito abierto dentro de cooldown → salta Gemini, directo a fallback.
  if (state === 'open') {
    emitFallbackEvent('fallback_triggered', {
      callSite, provider: 'anthropic', model: FALLBACK_MODEL, errorKind: 'circuit_open',
    })
    return anthropic()
  }

  // 2. 'closed' o 'half_open' (probe) → intentar Gemini con timeout guard.
  const isProbe = state === 'half_open'
  const t0 = performance.now()
  try {
    const result = await gemini(AbortSignal.timeout(TIMEOUT_MS[callSite]))
    if (isProbe) {
      const probe_latency_ms = performance.now() - t0
      closeBreaker(callSite)
      emitFallbackEvent('probe_ok', { callSite, gemini_latency_ms: probe_latency_ms })
      emitFallbackEvent('circuit_closed', { callSite, probe_latency_ms })
    }
    return result
  } catch (err) {
    const isSaturation = isGeminiSaturation(err)
    const isTimeout = isTimeoutError(err)
    if (!isSaturation && !isTimeout) {
      // Pitfall #4 — parse/schema/NoObjectGenerated → re-throw, NO fallback.
      throw err
    }
    const gemini_latency_ms = performance.now() - t0
    const errorCode = err instanceof Error ? err.name : String(err)
    const errorKind = isProbe ? 'probe_failed' : isTimeout ? 'timeout' : 'saturation'

    if (isProbe) {
      openBreaker(callSite) // re-abre, resetea cooldown
      emitFallbackEvent('probe_failed', { callSite, errorCode })
    } else {
      openBreaker(callSite)
      emitFallbackEvent('circuit_opened', { callSite, errorCode, gemini_latency_ms })
    }
    emitFallbackEvent('fallback_triggered', {
      callSite, provider: 'anthropic', model: FALLBACK_MODEL, errorKind, errorCode, latencyMs: gemini_latency_ms,
    })

    // 3. Fallback a Anthropic. Doble fallo (Pitfall #8) → emite fallback_failed + propaga.
    try {
      return await anthropic()
    } catch (anthropicErr) {
      emitFallbackEvent('fallback_failed', {
        callSite,
        gemini_error: errorCode,
        anthropic_error: anthropicErr instanceof Error ? anthropicErr.name : String(anthropicErr),
      })
      throw anthropicErr
    }
  }
}
