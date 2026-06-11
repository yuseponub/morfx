/**
 * turn-orchestrator.ts — el MECANISMO ÚNICO de turno v4 (D-04 somnio-v4-consolidation Plan 09).
 *
 * Extracción del while-loop del runner de producción (`engine/v4-production-runner.ts`), que es la
 * FUENTE DE VERDAD (D-04 — el lado más completo: CKPT-6a pending-templates cross-turn,
 * crash-recovery `_v3:pendingUserMessage`, no-repetición). El engine sandbox (`engine-v4.ts`) se
 * reescribe en el Plan 11 para consumir este core; el runner se reescribe en el Plan 10. Al cierre
 * de ESTE plan el orquestador compila SIN consumidores — el comportamiento del sistema no cambia.
 *
 * Motivación verbatim del usuario: "el sandbox debe ser producción con adapters falsos". Este
 * archivo ES el mecanismo que lo hace cierto por construcción: prod y sandbox corren el MISMO
 * restart loop / Path A/B / heartbeat / finally-release, parametrizado solo por `TurnCoreAdapters`.
 *
 * INVARIANTES del Divergence Map codificados aquí:
 *   - A1: lockCtx con THROW defensivo del runner (NO el null silencioso del engine).
 *   - A2: startHeartbeat fuera del loop; stop en el finally.
 *   - A3-A6: RestartContext (createRestartContext) — acumuladores cross-iteración.
 *   - A7: restart loop `while (ctx.shouldRestart)`.
 *   - A8: CKPT-0 → drain path_a en interrupt.
 *   - B1: getSeedState() per-iteración.
 *   - B2 (D-18): combine legacy DESPUÉS del seed (orden Pitfall 7).
 *   - B4: preloadOnce; C1: beforeAgentInvoke.
 *
 * SPECIFIERS (Pitfall 8): interruption-system-v2 SOLO con `@/lib/agents/interruption-system-v2/*`
 * (los vi.mock de las suites de paridad interceptan por specifier de módulo). PROHIBIDO importar
 * canales de mensajería / NDJSON / la base de datos (D-05).
 */

import { startHeartbeat, releaseLockIfOwner } from '@/lib/agents/interruption-system-v2/lock'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { processMessage as runAgentTurn } from '@/lib/agents/somnio-v4/somnio-v4-agent'
import type { V4AgentInput } from '@/lib/agents/somnio-v4/types'
import { createRestartContext } from './restart-context'
import { drainPendingAndCombine } from './drain'
import { runCheckpointGate } from './checkpoint-gate'
import type { TurnCoreAdapters, TurnCoreInput, TurnResult } from './types'

/**
 * Corre UN turno completo a través del pipeline v4 (restart loop + Path A/B + heartbeat +
 * finally-release), extraído verbatim del runner de producción (D-04). Los efectos de entorno
 * (envío real vs memoria, DB vs memoria, timing real vs simulado) los inyecta `adapters`.
 *
 * Devuelve un `TurnResult` NEUTRAL (C5) — los wrappers (Plan 10/11) lo mapean a su shape.
 */
export async function runTurn(
  input: TurnCoreInput,
  adapters: TurnCoreAdapters,
): Promise<TurnResult> {
  const startMs = Date.now()

  // ============================================================
  // A1 — lockCtx con THROW defensivo (versión del RUNNER, D-04). El engine derivaba lockCtx
  // silenciosamente a null; el runner FALLA RUIDOSO si lockHandle está presente pero faltan
  // channel/identifier (violación del contrato del webhook). El core adopta el del runner.
  // ============================================================
  const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
    ? { channel: input.lockChannel, identifier: input.lockIdentifier }
    : null
  if (input.lockHandle && !lockCtx) {
    throw new Error(
      '[interruption-v2] lockHandle present but lockChannel/lockIdentifier missing — webhook contract violated',
    )
  }

  // ============================================================
  // A2 — heartbeat: startHeartbeat FUERA del loop (Pitfall 6 — no stacking); stop en el finally.
  // ============================================================
  let stopHeartbeat: (() => void) | null = null
  if (input.lockHandle) {
    stopHeartbeat = startHeartbeat(input.lockHandle)
  }

  // ============================================================
  // A3-A6 — RestartContext: struct ÚNICO de acumuladores cross-iteración (consolidado en Plan 08).
  // ownEntryUuid se parsea de input.ownPendingEntryJson (crash-recovery D-16); todos los drains
  // excluyen la entrada propia del holder por entry_uuid.
  // ============================================================
  const ctx = createRestartContext(input.ownPendingEntryJson)

  try {
    // ============================================================
    // A7 — restart loop. Cualquier interrupt Path A en CKPT-0/1/2/3/4/5/6a/6b drena la pending
    // list, combina en effectiveMessage, y re-corre el turno en el MISMO lambda bajo el MISMO lock
    // (heartbeat lo mantiene vivo — A2). CKPT-7.N (send-loop) NO reinicia (Path B preservado).
    // ============================================================
    while (ctx.shouldRestart) {
      ctx.shouldRestart = false

      // --- A8: CKPT-0 post-acquire (pre-todo). Nada se envió aún → solo Path A en interrupt. ---
      {
        const ck0 = await runCheckpointGate({
          ckptId: 'ckpt_0_post_acquire',
          lockHandle: input.lockHandle,
          workspaceId: input.workspaceId,
          lockChannel: lockCtx?.channel,
          lockIdentifier: lockCtx?.identifier,
        })
        if (typeof ck0 === 'object' && lockCtx) {
          // Path A interrupt en CKPT-0 — restart con effectiveMessage combinado.
          // Pitfall 7: priorMsg = effectiveMessage ?? input.message (drain ANTES del combine
          // legacy de abajo — NO reordenar). El drain consolida dropOwnEntry+readAndClearPending+
          // clearInterrupt+emit×2+combine cronológico+shouldRestart (Plan 08).
          await drainPendingAndCombine({
            ctx,
            lockCtx: { workspaceId: input.workspaceId, channel: lockCtx.channel, identifier: lockCtx.identifier },
            atStep: 'ckpt_0_post_acquire',
            priorMsg: ctx.effectiveMessage ?? input.message,
            mode: 'path_a',
          })
          continue
        }
      }

      // --- B1: getSeedState() per-iteración. Prod fetch DB fresh; sandbox input.state memoria. ---
      const seed = await adapters.getSeedState()

      // ============================================================
      // B2 (D-18 crash-recovery `_v3:pendingUserMessage`) — DESPUÉS del seed (orden Pitfall 7).
      // - Por qué existe: cubre el edge de interrupt con pending-list de Redis VACÍA y 0 sends
      //   (lambda murió tras consumir el mensaje pero antes de enviar nada) — el mensaje del usuario
      //   se persiste vía savePathARollback y se re-combina en la siguiente iteración.
      // - ORDEN CRÍTICO (Pitfall 7): el drain de CKPT-0 (arriba) usa `effectiveMessage ?? input.message`
      //   ANTES de este combine. Reordenar causaría combine doble en interrupt-en-CKPT-0 con pending presente.
      // - Es funcional, NO código muerto. Borrable cuando v3 muera (D-38 / cosecha S-7).
      // R-03: en iter 1 effectiveMessage es null → fall back al legacy combine; en restart iterations
      // (effectiveMessage non-null) usa la string combinada en memoria (Pitfall 8: no DB write entre iters).
      // El legacy pending lo lee el adapter (prod implementa getLegacyPendingMessage; sandbox no → undefined).
      // ============================================================
      const legacyPendingMessage = adapters.getLegacyPendingMessage?.()
      const turnEffectiveMessage: string = ctx.effectiveMessage
        ?? (legacyPendingMessage ? `${legacyPendingMessage}\n${input.message}` : input.message)

      if (legacyPendingMessage) {
        console.log(`[V4-CORE] Path A accumulation: combining pending="${legacyPendingMessage}" + new="${input.message}"`)
      }

      // --- B4: preload + agent_module marker para sesiones nuevas (idempotente). Prod-only. ---
      await adapters.preloadOnce?.(seed.sessionId)

      // --- C1: thinking-sleep antes de invocar al agente (sandbox timing). Prod-only no-op. ---
      await adapters.beforeAgentInvoke?.(ctx.restartIteration)

      // ============================================================
      // Construir V4AgentInput desde el seed (lo que el runner arma en :310-333). El agente
      // recibe el mensaje efectivo del turno + el estado-semilla (carryState ya aplicado por el
      // adapter en getSeedState si fue un reprocess Path B).
      // ============================================================
      const v4Input: V4AgentInput = {
        message: turnEffectiveMessage,
        history: seed.history,
        currentMode: seed.currentMode,
        intentsVistos: seed.intentsVistos,
        templatesEnviados: seed.templatesEnviados,
        datosCapturados: seed.datosCapturados,
        packSeleccionado: seed.packSeleccionado,
        // seed.accionesEjecutadas es unknown[] (el core no acopla el shape); en runtime es
        // AccionRegistrada[]. Cast explícito (mismo patrón que el runner :322).
        accionesEjecutadas: seed.accionesEjecutadas as V4AgentInput['accionesEjecutadas'],
        turnLedgerDims: seed.turnLedgerDims,
        turnNumber: seed.turnNumber,
        workspaceId: input.workspaceId,
        sessionId: seed.sessionId,
        // lock fields threaded al agente — agente + sub-loop skip-guard en null.
        lockHandle: input.lockHandle ?? null,
        lockChannel: input.lockChannel ?? null,
        lockIdentifier: input.lockIdentifier ?? null,
      }

      // STUB del punto 5 (Task 2 → completado en la siguiente tarea): reemplaza este throw con la
      // SEGUNDA MITAD del flujo extraído del runner (agent invoke + CKPT-6a/6b + send + commit +
      // finally release). Hasta entonces el throw garantiza que TypeScript acepte el return type
      // Promise<TurnResult> sin construir aún el resultado — orquestador compilable e incompleto,
      // sin consumidores (comportamiento del sistema sin cambios).
      void v4Input
      void runAgentTurn
      void runCheckpointGate
      throw new Error('task 3 pending: agent invoke + CKPT-6a/6b + send + commit + finally release')
    }

    // Defensivo — exhaustividad: toda ruta dentro del while retorna o setea shouldRestart=true.
    // eslint-disable-next-line no-unreachable
    throw new Error('[V4-CORE] restart loop exited without return — invariant violation')
  } finally {
    // ============================================================
    // PROVISIONAL (Task 2): solo stop del heartbeat. La Task 3 expande este finally con la
    // estructura completa de Open Question 1 (onResultReady ANTES del release + releaseLockIfOwner
    // verbatim A16 + lock_released_normal / redis_unavailable_fallback_failed).
    // ============================================================
    if (stopHeartbeat) stopHeartbeat()
    // Referencias provisionales para que los imports A16 no queden sin uso hasta la Task 3.
    void releaseLockIfOwner
    void emitLockEvent
    void startMs
  }
}
