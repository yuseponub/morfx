/**
 * Predicado de saturación del proveedor Gemini (RESEARCH Q1 verbatim, Pitfall #2/#4/#5).
 *
 * Solo saturación del proveedor (503/429/500/504 + mensajes de capacidad) dispara
 * fallback. Parse/schema (NoObjectGeneratedError) NO matchea aquí — no enmascarar
 * bugs de schema con un switch de provider (Pitfall #4).
 */

import { APICallError, RetryError } from 'ai'
import { isAbortError } from '@ai-sdk/provider-utils'

const SATURATION_MSG =
  /high demand|overloaded|MODEL_CAPACITY_EXHAUSTED|capacity available|RESOURCE_EXHAUSTED|UNAVAILABLE/i

function unwrap(err: unknown): unknown {
  // Defensa: con maxRetries:0 el SDK arroja APICallError crudo (Pitfall #2), pero si
  // algun path dejara maxRetries>0, viene envuelto en RetryError → desenvolver.
  if (RetryError.isInstance(err)) return err.lastError ?? err
  return err
}

/** Solo saturacion del proveedor dispara fallback. Parse/schema (NoObjectGeneratedError)
 *  NO matchea aqui (Pitfall #4 — no enmascarar bugs de schema). */
export function isGeminiSaturation(err: unknown): boolean {
  const e = unwrap(err)
  if (APICallError.isInstance(e)) {
    if (e.statusCode === 503 || e.statusCode === 429 || e.statusCode === 500 || e.statusCode === 504) return true
    if (typeof e.message === 'string' && SATURATION_MSG.test(e.message)) return true
    if (typeof e.responseBody === 'string' && SATURATION_MSG.test(e.responseBody)) return true
  }
  // Fallback por message (cubre Pitfall #5 — comprehension re-envuelve el error en un
  // new Error con el message preservado; el regex matchea "high demand").
  const msg = err instanceof Error ? err.message : String(err)
  return SATURATION_MSG.test(msg)
}

/** Timeout/abort (AbortSignal.timeout vencido) = saturacion-equivalente → dispara fallback. */
export function isTimeoutError(err: unknown): boolean {
  return isAbortError(err)
}
