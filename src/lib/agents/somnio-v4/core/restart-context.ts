/**
 * RestartContext (D-03 somnio-v4-consolidation Plan 08): struct ÚNICO de los
 * acumuladores cross-iteración del restart loop v4 (Path A/B). Antes vivían como
 * ~7 variables locales `let` duplicadas byte-por-byte en el runner de producción
 * (`engine/v4-production-runner.ts`) y en el engine sandbox (`engine-v4.ts`).
 *
 * D-04: el RUNNER manda — los nombres de campo y comentarios se copian del lado
 * producción (la fuente de verdad). El engine llamaba `accumulatedSentMessages`
 * al campo `accumulatedSentContents` (A6 — unificación de nombre; el shape no
 * cambia).
 *
 * El bug del 2026-05-28 (dropOwnEntry/carryState arreglado DOS veces, una por
 * lado) es el caso de prueba mental de este struct: tras consolidar aquí,
 * `dropOwnEntry` + el parse de `ownEntryUuid` viven en UN solo lugar.
 */

import type { TurnLedgerDims } from '@/lib/agents/somnio-v4/types'

/**
 * Estado arrastrado entre iteraciones del restart loop en un reprocess Path B.
 * En Path A queda `null` (se re-corre desde el estado original de la sesión, a
 * propósito — ver Pitfall 6).
 */
export interface CarryState {
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  accionesEjecutadas: unknown[]
  currentMode: string
  // somnio-v4-turn-ledger Plan 04 (P3): el reprocess Path B hereda las dims del
  // output de la iteración previa → no re-registra ni pierde efectos.
  turnLedgerDims: TurnLedgerDims
}

/**
 * Acumuladores que persisten ACROSS iteraciones del restart loop dentro de una
 * sola invocación de processMessage. La factory los inicializa a su zero-value;
 * el restart loop los lee/escribe; los `continue` los conservan vivos.
 */
export interface RestartContext {
  // R-05: accumulate output.totalTokens per iteration (single source of truth
  // for cost accounting — NO usar output.totalTokens directo, Pitfall 2).
  totalTokensAcrossRestarts: number
  // observability — Pitfall 3 distingue restart 1 vs 5.
  restartIteration: number
  // null en iter 1 (legacy v3 path), non-null tras el primer restart.
  effectiveMessage: string | null
  templatesSentCount: number
  carryState: CarryState | null
  /** Pitfall 6 — dual semantics: 'seed' (Path B desde CKPT-6b: lo enviado fue del turno PREVIO,
   *  el output de msg1 NO se envió) vs 'output' (Path B desde send-loop: msg1 parcialmente enviado).
   *  Colapsarlas re-registraría/perdería efectos del ledger. El CALLER setea la fuente
   *  (depende del site), drainPendingAndCombine NO la toca. */
  carrySource: 'seed' | 'output' | null
  // engine lo llamaba accumulatedSentMessages (A6 — mismo shape, nombre unificado).
  accumulatedSentContents: string[]
  shouldRestart: boolean
  ownEntryUuid: string | null
}

/**
 * Crea un RestartContext en su zero-value. Parsea `ownPendingEntryJson` →
 * `ownEntryUuid` (byte-copy del parse try/catch del runner): el holder apila su
 * propio mensaje en la pending list (crash-recovery D-16), y todos los drain
 * sites lo EXCLUYEN por `entry_uuid` (sino el mensaje se combina consigo mismo —
 * el bug del "hola" fantasma del 2026-05-28).
 */
export function createRestartContext(ownPendingEntryJson?: string | null): RestartContext {
  let ownEntryUuid: string | null = null
  if (ownPendingEntryJson) {
    try {
      ownEntryUuid =
        (JSON.parse(ownPendingEntryJson) as { entry_uuid?: string }).entry_uuid ?? null
    } catch {
      ownEntryUuid = null
    }
  }
  return {
    totalTokensAcrossRestarts: 0,
    restartIteration: 0,
    effectiveMessage: null,
    templatesSentCount: 0,
    carryState: null,
    carrySource: null,
    accumulatedSentContents: [],
    shouldRestart: true,
    ownEntryUuid,
  }
}

/**
 * Filtra la entrada propia del holder (por `entry_uuid`) de una lista de pending
 * entries. byte-copy del helper local del runner/engine. Filtrar por entry_uuid
 * (vs byte-exact removeOwnEntry) es robusto contra JSON drift y no necesita
 * round-trip a Redis.
 */
export function dropOwnEntry<T extends { entry_uuid: string }>(
  ctx: RestartContext,
  entries: T[],
): T[] {
  return ctx.ownEntryUuid ? entries.filter((e) => e.entry_uuid !== ctx.ownEntryUuid) : entries
}
