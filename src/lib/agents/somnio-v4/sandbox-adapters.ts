/**
 * sandbox-adapters.ts — el "lado falso" de producción (D-04/D-05 somnio-v4-consolidation Plan 11).
 *
 * ⚠️ INTERRUPCIÓN: este archivo NO contiene el mecanismo de interrupción (Path A/B, dropOwnEntry,
 * carryState, restart loop, heartbeat, finally-release). Todo eso vive en
 * `core/turn-orchestrator.ts` (`runTurn`) — el MISMO core que corre producción. Este módulo solo
 * implementa los `TurnCoreAdapters` con efectos de entorno SIMULADOS (estado en memoria, send
 * sintético NDJSON, timing artificial, sandbox-result write). La paridad es POR CONSTRUCCIÓN: prod
 * inyecta adapters reales (V4MessagingAdapter + SessionManager + Supabase), sandbox inyecta éstos,
 * y el core no sabe la diferencia. Ver `INTERRUPTION-PARITY.md`.
 *
 * Capabilities sandbox (Divergence Map C1/C4/C6) implementadas aquí:
 * - send: ABSORBE el loop sintético CKPT-7.N + pacing per-template + onMessage progressive-reveal
 *   (C1/C6 + resolución estructural A12). Retorna el MISMO contrato {messagesSent, interrupted,
 *   interruptedAtIndex} que prod → el core maneja el interrupted POST-HOC en UN solo lugar (forma
 *   del runner). El adapter NO drena ni setea carryState.
 * - getSeedState: estado de memoria (input.state) mapeado a CoreSeedState + carryState aplicado
 *   (Path B reprocess) — patrón `carry ?? input.state` del runner viejo (resuelve la deuda
 *   heredada 08/09: el builder de carryState se parametriza vía getSeedState).
 * - beforeAgentInvoke: thinking-sleep de simulateProdTimingMs SOLO en iteration 0 (paridad actual).
 * - onResultReady: write `sandbox-result:{id}` a Redis ANTES del release del lock (C4 / Pitfall 5
 *   del standalone sandbox-integration — el follower long-pollea esa key y DEBE verla antes de
 *   poder adquirir).
 *
 * NO implementa los métodos prod-only del adapter (las ramas del core gateadas por `if
 * (adapters.metodo)` se saltan = paridad actual exacta, sin CKPT-6a / crash-recovery / no-rep en
 * sandbox, D-07): commit del turno, pending-templates (get/save/clear), legacy pending message,
 * rollback Path A, no-repetición, preload, debug-sink. Su AUSENCIA es el contrato (no hay flags).
 *
 * SPECIFIERS (Pitfall 8): interruption-system-v2 SOLO con `@/lib/agents/interruption-system-v2/*`
 * (los vi.mock de las suites de paridad interceptan por specifier de módulo).
 */

import type { Redis } from '@upstash/redis'
import { runCheckpointGate } from './core/checkpoint-gate'
import type { LockHandle, LockChannel } from '@/lib/agents/interruption-system-v2/lock'
import type {
  TurnCoreAdapters,
  CoreSeedState,
  SendBlock,
  SendResult,
  TurnResult,
} from './core/types'
import type { CarryState } from './core/restart-context'
import type { SandboxState } from '@/lib/sandbox/types'
import type { SystemEvent } from './types'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Resultado FINAL del turno del sandbox que el route long-pollea desde `sandbox-result:{id}`. Es el
 * MISMO payload que el wrapper (`engine-v4.ts`) retorna a `processMessage` — el wrapper lo construye
 * a partir del TurnResult del core y se lo pasa a `createSandboxAdapters` (via setter) para que
 * onResultReady lo escriba ANTES del release. Tipo abierto (Record) porque el shape vive en
 * `src/lib/sandbox/types.ts` (V4EngineOutput) y este módulo no lo acopla.
 */
export type SandboxResultPayload = Record<string, unknown>

export interface CreateSandboxAdaptersArgs {
  /** Estado del turno en memoria (lo que el runner deriva de la sesión; aquí es input directo). */
  state: SandboxState
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
  /** Vision context del path image-respond v4 (presente solo en ese path). */
  visionContext?: { descripcion: string; categoria: string }
  /** Lock fields (null en el path legacy sin lock / fail-open). */
  lockHandle?: LockHandle | null
  lockChannel?: LockChannel | null
  lockIdentifier?: string | null
  /** Para el write `sandbox-result:{id}` antes del release (Pitfall 5). */
  sandboxSessionId?: string
  /** Delays artificiales para abrir la ventana de interrupción en la UI (C1/C6). Default 0. */
  simulateProdTimingMs?: number
  /** Progressive reveal: flush de cada template al browser tras CKPT-7.N + pacing. */
  onMessage?: (content: string, index: number) => Promise<void> | void
  /** Cliente Redis del sandbox (el mismo que el engine usa hoy — specifier absoluto). */
  redis: Redis
}

/**
 * Construye los `TurnCoreAdapters` del sandbox + un setter para el resultado final que onResultReady
 * persiste. El wrapper (`engine-v4.ts`) llama `setResult(payload)` con el V4EngineOutput mapeado
 * ANTES de que el core invoque onResultReady (el core lo invoca dentro de su try externo, antes del
 * finally-release — Open Question 1).
 */
export function createSandboxAdapters(args: CreateSandboxAdaptersArgs): {
  adapters: TurnCoreAdapters
  setResult: (payload: SandboxResultPayload) => void
} {
  const {
    state,
    history,
    turnNumber,
    workspaceId,
    systemEvent,
    visionContext,
    lockHandle,
    lockChannel,
    lockIdentifier,
    sandboxSessionId,
    simulateProdTimingMs,
    onMessage,
    redis,
  } = args

  const lockCtx =
    lockHandle && lockChannel && lockIdentifier
      ? { channel: lockChannel as LockChannel, identifier: lockIdentifier as string }
      : null

  // El wrapper setea el payload final ANTES del onResultReady (que corre dentro del try externo del
  // core, antes del finally-release). Si el turno crashea, el wrapper igual setea el payload de error
  // / zombie para que el follower no quede colgado en el long-poll.
  let finalResult: SandboxResultPayload | null = null
  const setResult = (payload: SandboxResultPayload): void => {
    finalResult = payload
  }

  // ========================================================================
  // getSeedState — estado de memoria + carryState aplicado (B1, Path B reprocess).
  // ========================================================================
  // El runner de prod hace fetch DB fresh; el sandbox lo arma desde `input.state`. El carry (Path B)
  // se aplica encima del estado original — patrón `carry ?? sessionDerived` del runner viejo. Sin
  // esto el reprocess Path B re-saludaría / re-enviaría (el core setea ctx.carryState pero NO lo
  // re-lee — delega al builder, que conoce el shape SandboxState). Resuelve la deuda 08/09.
  const getSeedState = async (carry?: CarryState | null): Promise<CoreSeedState> => {
    // Estado-semilla = carryState (Path B) ?? estado de memoria original (Path A / iter 1).
    const seed = carry ?? {
      intentsVistos: state.intentsVistos ?? [],
      templatesEnviados: state.templatesEnviados ?? [],
      datosCapturados: state.datosCapturados ?? {},
      packSeleccionado: (state.packSeleccionado as string | null) ?? null,
      accionesEjecutadas: (state.accionesEjecutadas ?? []) as unknown[],
      currentMode: state.currentMode,
      // somnio-v4-turn-ledger Plan 04: restaurar dims del turno previo con default graceful.
      turnLedgerDims: state.turnLedgerDims ?? { atendido: [], crmActions: [] },
    }

    return {
      sessionId: sandboxSessionId ?? 'sandbox',
      currentMode: seed.currentMode,
      intentsVistos: seed.intentsVistos,
      templatesEnviados: seed.templatesEnviados,
      datosCapturados: seed.datosCapturados,
      packSeleccionado: seed.packSeleccionado,
      accionesEjecutadas: seed.accionesEjecutadas,
      turnLedgerDims: seed.turnLedgerDims,
      history,
      turnNumber,
      visionContext,
    }
  }

  // ========================================================================
  // beforeAgentInvoke — thinking-sleep simulado (C1) SOLO en iteration 0 (paridad actual).
  // ========================================================================
  // Simula el "thinking" del LLM de producción: mantiene el lock tomado y abre la ventana para que
  // msg2 llegue como FOLLOWER → sea detectado en CKPT-6 (Path A combine). En las iteraciones de
  // restart NO se re-duerme: doblar la latencia past la ventana del follower (bug 2026-05-28 — el
  // combine tardaba ~36s y expiraba a los 30s).
  const beforeAgentInvoke = async (iteration: number): Promise<void> => {
    if (lockHandle && (simulateProdTimingMs ?? 0) > 0 && iteration === 0) {
      await sleep(simulateProdTimingMs!)
    }
  }

  // ========================================================================
  // send — loop sintético CKPT-7.N + pacing + onMessage progressive-reveal (C1/C6 + A12).
  // ========================================================================
  // El sandbox NO llama MessagingProductionAdapter.send — el route devuelve output.messages directo a
  // la UI. Para preservar paridad con el CKPT-7.N de WhatsApp (V4MessagingAdapter.
  // shouldAbortBeforeTemplate), sintetizamos el gate per-template aquí + el pacing + el progressive
  // reveal. RETORNAMOS el contrato SendResult {messagesSent, interrupted, interruptedAtIndex} —
  // el CORE maneja el drain/restart/carryState POST-HOC en UN solo lugar (forma del runner, A12).
  // El adapter NO drena ni setea carryState. lostLock → throw LostLockError (vía runCheckpointGate)
  // igual que prod → el core lo deja burbujear al catch externo (zombie_exit).
  const send = async (block: SendBlock): Promise<SendResult> => {
    const messages = block.messages
    let messagesSent = 0

    for (let i = 0; i < messages.length; i++) {
      // Pacing per-template (post-smoke fix 2026-05-27). El lock sigue tomado durante el sleep. Si
      // msg2 llega en el gap, la SIGUIENTE iteración lo detecta en CKPT-7.N. Skip en i=0 — paridad
      // con prod donde el pacing es ENTRE sends, no antes del primero.
      if (i > 0 && lockHandle && (simulateProdTimingMs ?? 0) > 0) {
        // ~2-6s por template proporcional a la longitud (capped). El V4MessagingAdapter de prod
        // tiene delays variables de typing-speed en este rango.
        const perTemplateMs = Math.max(2000, Math.min(6000, messages[i].length * 25))
        await sleep(perTemplateMs)
      }

      // CKPT-7.N sintético (mismo CheckpointId + semántica que hoy). lostLockLabel dinámico
      // (ckpt_7_pre_template_${i}) preserva el at_step byte-exacto del zombie_lambda_exit. El gate
      // factorizado (core/checkpoint-gate.ts) lanza LostLockError en lostLock — el core lo captura.
      const ck7 = await runCheckpointGate({
        ckptId: 'ckpt_7_pre_template',
        lockHandle,
        workspaceId,
        lockChannel: lockCtx?.channel,
        lockIdentifier: lockCtx?.identifier,
        opts: { templateIndex: i, hasSentAnything: i > 0 },
        lostLockLabel: `ckpt_7_pre_template_${i}`,
      })
      if (typeof ck7 === 'object') {
        // Interrupt detectado: el send se aborta en este índice. NO drenamos ni reiniciamos aquí —
        // el core lo maneja post-hoc desde el SendResult (Path A si messagesSent===0, Path B si >0),
        // EXACTAMENTE como con el adapter de prod. Devolvemos {interrupted, interruptedAtIndex}.
        return { messagesSent, interrupted: true, interruptedAtIndex: i }
      }

      // El template "se envió". Incrementar + progressive reveal.
      messagesSent++
      if (onMessage) {
        // Progressive reveal (post-smoke fix 2026-05-27): flush del chunk al browser inmediato,
        // espejando la observabilidad per-template de V4MessagingAdapter.send() en prod.
        await onMessage(messages[i], i)
      }
    }

    return { messagesSent, interrupted: false }
  }

  // ========================================================================
  // onResultReady — write `sandbox-result:{id}` ANTES del release (C4 / Pitfall 5).
  // ========================================================================
  // El core lo invoca con el TurnResult FINAL, dentro de su try externo, ANTES del finally-release.
  // El follower del sandbox long-pollea `sandbox-result:{id}` tras ver el lock del HOLDER — si
  // liberáramos el lock antes de escribir el resultado, el follower podría adquirir como nuevo HOLDER
  // y nunca ver el output del turno previo (la UI haría timeout). Byte-equivalente al write actual
  // (try/catch + console.error, TTL 60s). Usa el `finalResult` que el wrapper seteó (V4EngineOutput
  // mapeado) — NO el TurnResult neutral (el route consume el shape sandbox, no el del core).
  const onResultReady = async (_result: TurnResult): Promise<void> => {
    if (!sandboxSessionId || !lockHandle || !finalResult) return
    try {
      await redis.set(`sandbox-result:${sandboxSessionId}`, JSON.stringify(finalResult), { ex: 60 })
    } catch (resultWriteErr) {
      // Non-fatal — log only; el finally del core igual libera el lock; el follower hace timeout.
      console.error('[sandbox-adapters] sandbox-result write failed', resultWriteErr)
    }
  }

  const adapters: TurnCoreAdapters = {
    // OBLIGATORIOS
    send,
    getSeedState,
    // OPCIONALES sandbox-only
    beforeAgentInvoke,
    onResultReady,
    // Los métodos prod-only del adapter (commit del turno, pending-templates, no-repetición,
    // preload, debug-sink, legacy pending, rollback Path A) NO se implementan → el core salta esas
    // ramas (gate `if (adapters.metodo)`) = paridad actual exacta (sandbox sin CKPT-6a /
    // crash-recovery / no-rep — D-07).
  }

  return { adapters, setResult }
}
