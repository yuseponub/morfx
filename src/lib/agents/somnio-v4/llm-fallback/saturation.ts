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
    // Fallo a nivel de RED (DNS, ECONNRESET, connection refused, TLS): `@ai-sdk/provider-utils`
    // (handleFetchError, dist/index.js:496-513) envuelve el fetch error en un APICallError SIN
    // statusCode (queda undefined) + isRetryable=true + message "Cannot connect to API: ...".
    // Es la clase de error operacionalmente más cercana a la saturación (la API de Gemini no
    // responde HTTP) y con maxRetries:0 ya no hay retry del SDK que lo cubra → debe disparar
    // fallback, o el turno falla duro (H-01 gemini-fallback-haiku). NO matchea parse/schema
    // (NoObjectGeneratedError no es APICallError) → Pitfall #4 intacto.
    if (e.statusCode == null && e.isRetryable === true) return true
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

// ─── D-01/D-09 — créditos de Gemini agotados ───────────────────────────────
// Match por message PRIMERO (robusto al re-wrap de comprehension que destruye la
// clase APICallError pero preserva el message — RESEARCH Q2 / Pitfall #5).
// OQ-1: el statusCode real en prod (429/400) NO está confirmado → NO se matchea
// por statusCode solo; el message es la fuente de verdad.
// RESOURCE_EXHAUSTED a secas YA está en SATURATION_MSG (saturación de capacidad);
// aquí solo la variante con quota/credits para no conflacionar (RESEARCH Q2).
// NOTA: NO extender SATURATION_MSG — necesitamos predicados específicos para
// emitir el evento llm_credits_depleted y tratar el doble-fallo distinto (RECHAZADO
// por RESEARCH Q2).
const BILLING_MSG =
  /prepayment credits are depleted|billing|insufficient.*credit|RESOURCE_EXHAUSTED[^]*quota|quota[^]*RESOURCE_EXHAUSTED/i

// ─── D-02/D-09 — límite de union-types de Gemini ────────────────────────────
// NO incluir `union/allOf` suelto: demasiado genérico, riesgo de falso-positivo
// con parse errors genuinos (Pitfall #4 — NoObjectGeneratedError sigue re-lanzando).
const SCHEMA_CAP_MSG =
  /too many parameters with union types|too many states for serving|union type/i

/** D-01/D-09 — créditos de Gemini agotados → fallback a Haiku + correo + evento.
 *  Match por message (sobrevive el re-wrap de comprehension) y responseBody si es APICallError.
 *  NoObjectGeneratedError NO matchea (Pitfall #4). */
export function isGeminiBillingError(err: unknown): boolean {
  const e = unwrap(err)
  if (APICallError.isInstance(e)) {
    if (typeof e.message === 'string' && BILLING_MSG.test(e.message)) return true
    if (typeof e.responseBody === 'string' && BILLING_MSG.test(e.responseBody)) return true
  }
  const msg = err instanceof Error ? err.message : String(err)
  return BILLING_MSG.test(msg)
}

/** D-02/D-09 — error union-types (límite real de structured-output de Gemini) → fallback
 *  a Haiku (schema saneado) + evento RUIDOSO. NoObjectGeneratedError NO matchea (Pitfall #4). */
export function isGeminiSchemaCapacity(err: unknown): boolean {
  const e = unwrap(err)
  if (APICallError.isInstance(e)) {
    if (typeof e.message === 'string' && SCHEMA_CAP_MSG.test(e.message)) return true
    if (typeof e.responseBody === 'string' && SCHEMA_CAP_MSG.test(e.responseBody)) return true
  }
  const msg = err instanceof Error ? err.message : String(err)
  return SCHEMA_CAP_MSG.test(msg)
}
