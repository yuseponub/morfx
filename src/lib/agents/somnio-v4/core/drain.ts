/**
 * drainPendingAndCombine (D-03 somnio-v4-consolidation Plan 08): consolida la
 * secuencia repetida 12 veces (7 sites en `engine/v4-production-runner.ts` +
 * 5 sites en `engine-v4.ts`) de drenar la pending list de Redis, consumir el
 * interrupt, emitir los eventos de observabilidad y recombinar el mensaje
 * efectivo del turno. Tras este plan, ese patrón se toca en UN solo lugar — el
 * bug del 2026-05-28 (dropOwnEntry/carryState arreglado dos veces) ya no puede
 * divergir entre sites.
 *
 * INVARIANTES LOCKEADAS (no reordenar, no condicionar):
 *   a. dropOwnEntry(readAndClearPending(...)) — excluir la entrada propia del
 *      holder por entry_uuid (bug 2026-05-28 "hola" fantasma).
 *   b. clearInterrupt SIEMPRE tras readAndClearPending (bug-fix 2026-05-28: sin
 *      esto el siguiente CKPT-0 relee el interrupt y spinea Path A con pending
 *      vacío hasta el TTL de 60s).
 *   c. restartIteration++ (observability — Pitfall 3).
 *   d. orden CRONOLÓGICO en path_a: priorMsg PRIMERO, pending APPENDED
 *      (commit 494d3bb4).
 *   e. shouldRestart = true.
 *
 * El specifier ABSOLUTO `@/lib/agents/interruption-system-v2/*` es obligatorio
 * (Pitfall 8): los vi.mock de las suites de paridad interceptan por specifier de
 * módulo — un specifier relativo rompería los mocks.
 *
 * Pitfall 6 (carryState dual): este helper NO toca carryState ni carrySource —
 * la fuente (seed vs output) depende del site, así que el CALLER la setea tras
 * llamar al drain en mode 'path_b_solo'.
 */

import type { LockChannel } from '@/lib/agents/interruption-system-v2/lock'
import { readAndClearPending, clearInterrupt } from '@/lib/agents/interruption-system-v2/pending'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { dropOwnEntry, type RestartContext } from './restart-context'

export async function drainPendingAndCombine(args: {
  ctx: RestartContext
  lockCtx: { workspaceId: string; channel: LockChannel; identifier: string }
  atStep: string
  priorMsg: string
  mode: 'path_a' | 'path_b_solo'
  /** extra payload del emit Path B (ej. templates_sent_before_abort) — replicar el del site */
  pathBEmitExtra?: Record<string, unknown>
}): Promise<{ pendingCount: number }> {
  const { ctx, lockCtx, atStep, priorMsg, mode, pathBEmitExtra } = args
  const { workspaceId, channel, identifier } = lockCtx

  // (a) drenar + excluir la entrada propia del holder.
  const pending = dropOwnEntry(ctx, await readAndClearPending(workspaceId, channel, identifier))
  // (b) consumir el interrupt SIEMPRE (bug-fix 2026-05-28).
  await clearInterrupt(workspaceId, channel, identifier)

  const pendingChars = pending.reduce((s, p) => s + p.content.length, 0)

  if (mode === 'path_a') {
    // (c) incrementar iteración.
    ctx.restartIteration++
    emitLockEvent('msg_aborted_path_a_combined', {
      at_step: atStep,
      ...pathBEmitExtra,
      combined_msg_count: pending.length + 1,
      total_chars: pendingChars + priorMsg.length,
      restart_iteration: ctx.restartIteration,
    })
    emitLockEvent('pending_list_combined', {
      at_step: atStep,
      entries_count: pending.length,
      total_chars: pendingChars,
      restart_iteration: ctx.restartIteration,
    })
    // (d) orden cronológico: priorMsg PRIMERO, pending APPENDED (commit 494d3bb4).
    ctx.effectiveMessage = [priorMsg, ...pending.map((p) => p.content)].join('\n')
    // (e) reiniciar el turno.
    ctx.shouldRestart = true
    return { pendingCount: pending.length }
  }

  // mode 'path_b_solo': emitir el solo + (condicional) el pending_list_combined.
  // El cliente se redirigió tras enviar ≥1 template → DESCARTAR el resto del
  // output viejo y contestar SOLO lo nuevo (sin prior). El carryState lo setea el
  // CALLER (Pitfall 6 — la fuente seed-vs-output depende del site).
  emitLockEvent('msg_aborted_path_b_solo', {
    at_step: atStep,
    ...pathBEmitExtra,
  })
  if (pending.length > 0) {
    // restartIteration++ y pending_list_combined SOLO cuando hay algo que
    // reprocesar (los 3 sites Path B reales lo gatean por pending.length > 0).
    ctx.restartIteration++
    emitLockEvent('pending_list_combined', {
      at_step: atStep,
      entries_count: pending.length,
      total_chars: pendingChars,
      restart_iteration: ctx.restartIteration,
    })
    // SOLO lo nuevo, sin prior (carryState lo setea el caller).
    ctx.effectiveMessage = pending.map((p) => p.content).join('\n')
    ctx.shouldRestart = true
  }
  return { pendingCount: pending.length }
}
