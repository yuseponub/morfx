import { getCollector } from '@/lib/observability'

/**
 * Standalone v4-observability-completeness.
 * Stages del pipeline v4 (D-02) — usado para tipar el campo `stage` de los
 * eventos del spine y del errorStage del catch externo del agente.
 */
export type V4Stage =
  | 'comprehension'
  | 'guards'
  | 'sales-track'
  | 'crm-gate'
  | 'response-track'
  | 'sub-loop-slot'
  | 'send'

/**
 * Dual-emission no-throw (modelo emitLockEvent). Inyecta `restart_iteration`
 * uniforme en el payload (D-03, snake_case para igualar drain.ts:62).
 * El try/catch global protege el console.log de un payload circular (Pitfall 6):
 * recordEvent ya es no-throw internamente (collector.ts:159) — NO se doble-envuelve.
 * Regla 6: un fallo de observabilidad NUNCA puede tumbar un turno productivo.
 */
export function recordV4Event(
  label: string,
  payload: Record<string, unknown>,
  opts: { restartIteration?: number; durationMs?: number } = {},
): void {
  try {
    const enriched = { ...payload, restart_iteration: opts.restartIteration ?? 0 }
    getCollector()?.recordEvent('pipeline_decision', label, enriched, opts.durationMs)
    console.log(`[v4-spine] ${label}`, enriched)
  } catch {
    // Regla 6: a logging failure NEVER takes down a productive turn.
  }
}
