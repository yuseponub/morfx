/**
 * Somnio Sales Agent v4 — Low-Confidence Threshold Lookup
 *
 * Lee `platform_config.somnio_v4_low_confidence_threshold` (D-11 parametrizable).
 * Cachea 60s para no martillar la DB en cada turn.
 * Fallback robusto a 0.70 (D-03) si la key no existe o hay error.
 *
 * D-65: el valor se aplica directamente sobre `intent.intent_confidence` (sin fórmula).
 *
 * Standalone: somnio-sales-v4 / Plan 07.
 *
 * Anti-patterns:
 *  - NO importar desde `@/lib/agents/somnio-v3/*` (D-24)
 *  - NO leer la key en cada turn sin cache (degrade post-flip si DB hiccups)
 *
 * Domain wrapper exception authorized — `platform_config` es tabla utilitaria sin
 * domain layer dedicado (mismo patrón que knowledge-base sync.ts en Plan 04 —
 * RESEARCH Shared Patterns autoriza).
 */

import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_THRESHOLD = 0.70 // D-03 — fallback si platform_config no responde
const CACHE_TTL_MS = 60_000    // 60s — calibración post-flip puede ajustar via SQL UPDATE

let cachedAt = 0
let cachedValue = DEFAULT_THRESHOLD

/**
 * Lee `platform_config.somnio_v4_low_confidence_threshold` con cache 60s.
 *
 * Returns:
 *  - número en [0..1] si la key existe y es válida
 *  - 0.70 (DEFAULT_THRESHOLD) si la key no existe, valor inválido, o DB error
 */
export async function getLowConfidenceThreshold(): Promise<number> {
  const now = Date.now()
  if (now - cachedAt < CACHE_TTL_MS) return cachedValue

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', 'somnio_v4_low_confidence_threshold')
      .maybeSingle()

    if (error || !data) {
      cachedValue = DEFAULT_THRESHOLD
    } else {
      // platform_config.value es jsonb. Puede llegar como number directo o como string.
      const raw = data.value as unknown
      const v = typeof raw === 'number' ? raw : Number(raw)
      cachedValue = Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_THRESHOLD
    }
    cachedAt = now
    return cachedValue
  } catch {
    cachedValue = DEFAULT_THRESHOLD
    cachedAt = now
    return cachedValue
  }
}

/** Test helper — limpia cache. NO usar en runtime. */
export function __clearThresholdCache(): void {
  cachedAt = 0
  cachedValue = DEFAULT_THRESHOLD
}
