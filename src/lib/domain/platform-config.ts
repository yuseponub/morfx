// ============================================================================
// Domain Layer — Platform Config (Phase 44.1)
//
// Helper para leer configuracion runtime platform-level desde la tabla
// `platform_config` en Supabase. Valores en JSONB nativo (boolean/number/
// string/null) leidos con un cache in-memory de TTL 30s por lambda instance.
//
// ──────────────────────────────────────────────────────────────────────────
// DESVIACION INTENCIONAL DEL PATRON DOMAIN LAYER
// ──────────────────────────────────────────────────────────────────────────
// A diferencia del resto de modulos en `src/lib/domain/*`, este archivo:
//   1. NO acepta `DomainContext` como primer parametro.
//   2. NO filtra por `workspace_id`.
//   3. NO retorna `DomainResult<T>` (retorna el valor directo o fallback).
//
// Rationale: `platform_config` almacena configuracion a nivel plataforma
// (kill-switch global, rate limits base, alert FROM). No hay tenancy — todas
// las keys son platform-wide. Agregar `workspace_id` es una decision
// DELIBERADAMENTE POSPUESTA a una fase futura (D8 de 44.1-CONTEXT). Cuando
// llegue el momento, se agregara la columna `workspace_id UUID NULL` a la
// tabla y se extendera esta firma de forma no-breaking.
//
// ──────────────────────────────────────────────────────────────────────────
// VENTANA DE CONSISTENCIA 30s (Pitfall 4 de 44.1-RESEARCH)
// ──────────────────────────────────────────────────────────────────────────
// Vercel corre multiples lambdas concurrentes. Cada una mantiene su propio
// cache. Tras un `UPDATE platform_config SET value=...`, diferentes lambdas
// pueden mostrar valores distintos durante hasta 30 segundos. Este modulo
// NO sincroniza caches cross-instance (fuera de scope de 44.1 — ver
// Recomendacion en RESEARCH para futuro endpoint de invalidacion manual).
//
// Runbook: tras cambiar una key en Supabase Studio, esperar ~30s antes de
// verificar el efecto en produccion.
//
// ──────────────────────────────────────────────────────────────────────────
// FAIL-OPEN POLICY (Pitfall 6 de 44.1-RESEARCH)
// ──────────────────────────────────────────────────────────────────────────
// Cualquier error de DB (network, tabla ausente, row no encontrado, tipo
// incompatible, parse error) hace que `getPlatformConfig` retorne el valor
// `fallback` provisto por el caller. NUNCA throw. Esto significa que:
//   - Si DB esta caida y caller pasa `true` como fallback para el
//     kill-switch, los bots siguen activos (fail-open explicito).
//   - Si DB esta caida y caller pasa `50` como fallback para el rate-limit,
//     el limite efectivo es 50/min.
//
// Rationale: un blip de DB no debe tumbar bots cuyo hard-kill ya existe a
// nivel de API key (workspace-level). El kill-switch via `platform_config`
// es un soft-guard, no la ultima linea de defensa.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Cache TTL in milliseconds. Exported for tests + observability.
 *
 * EXACTO: 30_000. No 60000, no 10000 — 30 segundos (CONTEXT D4).
 */
export const PLATFORM_CONFIG_TTL_MS = 30_000

interface CacheEntry {
  value: unknown
  expiresAt: number
}

/**
 * Module-scoped cache. Lives per-lambda-instance (reset on cold start).
 * No cross-instance synchronization — each Vercel lambda has its own Map.
 */
const cache = new Map<string, CacheEntry>()

/**
 * Read a platform-level config value with 30s in-memory caching.
 *
 * Behavior:
 *   - Cache hit within TTL: returns cached value, no DB round-trip.
 *   - Cache miss / expired: single `SELECT value FROM platform_config WHERE key=$1`
 *     via `createAdminClient()` (bypasses RLS — same pattern as `crm_bot_actions`).
 *   - Any error (DB, parse, type mismatch): returns `fallback`. NEVER throws.
 *
 * Type safety: if the stored JSONB value type does not match the fallback type
 * (e.g. stored as string "true" but fallback is boolean), returns fallback to
 * protect callers from runtime type errors. Exception: when `fallback` is `null`
 * or an object, any shape is accepted (since `null` can legitimately be paired
 * with string-or-null keys like `crm_bot_alert_from`).
 *
 * @param key - The `platform_config.key` to read.
 * @param fallback - Value to return on any failure mode. Also anchors the
 *   expected runtime type for coercion safety.
 * @returns Promise resolving to the config value or the fallback.
 *
 * @example
 *   const enabled = await getPlatformConfig('crm_bot_enabled', true)
 *   const limit = await getPlatformConfig('crm_bot_rate_limit_per_min', 50)
 *   const alertFrom = await getPlatformConfig<string | null>('crm_bot_alert_from', null)
 */
export async function getPlatformConfig<T>(key: string, fallback: T): Promise<T> {
  // Step 1: cache hit within TTL
  const entry = cache.get(key)
  const now = Date.now()
  if (entry && entry.expiresAt > now) {
    return entry.value as T
  }

  // Step 2-6: fetch from DB, type-check, cache, return
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', key)
      .maybeSingle()

    if (error) {
      console.error(`[platform-config] DB error reading key "${key}":`, error.message)
      return fallback
    }

    if (data == null) {
      // Row not found — do not cache (next call will retry DB)
      return fallback
    }

    const value = (data as { value: unknown }).value

    // Step 5: type-check against fallback shape (Pitfall 7 guard)
    // Exceptions:
    //   - fallback === null  → accept any shape (string|null union pattern)
    //   - typeof fallback === 'object' → accept any shape (arrays/objects)
    //   - value === null → accept when the typed union allows null (caller
    //     passes fallback=null explicitly, already handled by the first exception)
    const fallbackIsNull = fallback === null
    const fallbackIsObject = typeof fallback === 'object' && fallback !== null
    const valueIsNull = value === null

    if (!fallbackIsNull && !fallbackIsObject) {
      // Primitive fallback (boolean/number/string). Allow stored null only if
      // the JSONB is literally null — otherwise strict typeof match.
      if (!valueIsNull && typeof value !== typeof fallback) {
        console.error(
          `[platform-config] type mismatch for key "${key}": expected ${typeof fallback}, got ${typeof value}`,
        )
        return fallback
      }
    }

    // Step 6: cache + return
    cache.set(key, { value, expiresAt: Date.now() + PLATFORM_CONFIG_TTL_MS })
    return value as T
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[platform-config] unexpected error for key "${key}":`, message)
    return fallback
  }
}

/**
 * Invalidate the in-memory cache.
 *
 * @param key - If provided, removes only that key. If omitted, clears everything.
 *
 * NOTE: only affects the CURRENT lambda instance's cache. Other concurrent
 * lambdas are unaffected (see 30s consistency window note at module top).
 */
export function invalidatePlatformConfigCache(key?: string): void {
  if (key === undefined) {
    cache.clear()
    return
  }
  cache.delete(key)
}
