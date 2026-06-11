/**
 * Somnio v4 Engine — WRAPPER SANDBOX del core de turno v4 (somnio-v4-consolidation Plan 11, D-04/D-05).
 *
 * ⚠️ INTERRUPCIÓN: el MECANISMO de interrupción (Path A/B, dropOwnEntry, carryState, restart loop,
 * heartbeat, finally-release) YA NO vive aquí — vive en `core/turn-orchestrator.ts` (`runTurn`), el
 * MISMO core que corre producción (`engine/v4-production-runner.ts`). Tras este plan la paridad
 * prod↔sandbox es POR CONSTRUCCIÓN: ambos lados corren el mismo `runTurn` parametrizado solo por
 * `TurnCoreAdapters`. El bug del 2026-05-28 (fix doble dropOwnEntry/carryState) es estructuralmente
 * imposible — el mecanismo es código único. Contrato de paridad: `INTERRUPTION-PARITY.md` (su
 * reducción a "solo diferencias de adapters" es el Plan 12).
 *
 * Este archivo es el lado SANDBOX del core: construye los `TurnCoreAdapters` de memoria
 * (`createSandboxAdapters` — send sintético NDJSON + estado en memoria + timing simulado +
 * onResultReady write a Redis) + mapea `TurnResult` → `V4EngineOutput` (build SandboxState + DebugTurn).
 *
 * Capabilities sandbox (Divergence Map C1-C6) — el adapter absorbe el loop sintético CKPT-7.N + pacing
 * + onMessage; el wrapper queda con el mapeo de frontera:
 * - C2: build de SandboxState desde output + limpieza de keys `_v3:` stale.
 * - C3: build de DebugTurn completo (intent/tokens/orchestration con `shouldCreateOrder: false`
 *   literal/salesTrack/responseTrack/subLoop/timerSignals).
 * - C5: contrato de error sandbox INTENCIONAL (`success: true` + `[Error v4] ...`) — NO unificar con
 *   prod (`success: false`) o se rompe el route/UI.
 *
 * Diferencias intencionales con producción (NO son divergencias de mecanismo — ver INTERRUPTION-PARITY §3):
 * - El sandbox NO envía a WhatsApp; el send-adapter recoge en memoria + stream NDJSON al browser.
 * - El sandbox NO persiste a DB; devuelve el estado en memoria (SandboxState).
 * - El sandbox SIMULA el timing de prod (`simulateProdTimingMs`) para abrir la ventana de interrupción.
 * - El sandbox NO implementa CKPT-6a/crash-recovery/no-repetición (prod-only — el core salta esas
 *   ramas porque el adapter no las implementa = paridad actual exacta, D-07).
 *
 * Firma pública intacta: `SomnioV4Engine.processMessage(input: V4EngineInput): Promise<V4EngineOutput>`
 * — el route (`app/api/sandbox/process/route.ts`) NO se toca.
 */

import type { SandboxState, DebugTurn } from '@/lib/sandbox/types'
import type { PackSelection } from '@/lib/agents/types'
import type { SystemEvent } from './types'
import type { V4AgentOutput } from './types'
import type { LockHandle, LockChannel } from '@/lib/agents/interruption-system-v2/lock'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'

// El MECANISMO único de turno v4 (restart loop + Path A/B + heartbeat + finally) vive en el core
// (D-04 Plan 09). El engine lo CONSUME con adapters de memoria (Plan 11).
import { runTurn } from './core/turn-orchestrator'
import type { TurnCoreInput, TurnResult } from './core/types'
import { createSandboxAdapters, type SandboxResultPayload } from './sandbox-adapters'

export interface V4EngineInput {
  message: string
  state: SandboxState
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
  // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 + D-15).
  // All 5 fields OPTIONAL — pre-this-standalone callers (existing tests, dev workflows
  // that bypass the sandbox lock branch) continue to work without modification.
  // When null/undefined, the core skip-guards every checkpoint + heartbeat + release
  // (sandbox keeps the same behavior as before the lock standalone).
  lockHandle?: LockHandle | null
  lockChannel?: LockChannel | null  // 'whatsapp' | 'facebook' | 'instagram' — sandbox uses 'whatsapp' per D-02 Option C
  lockIdentifier?: string | null   // sandbox uses `sandbox-{sandboxSessionId}` per D-02 Option C
  ownPendingEntryJson?: string | null
  sandboxSessionId?: string         // for Pitfall 5 sandbox-result:{id} write before finally release
  /**
   * When > 0 AND lockHandle is non-null, the sandbox adapters insert ARTIFICIAL DELAYS to
   * simulate production timing inside the lock-hold window:
   *   1. `beforeAgentInvoke` (iteration 0): sleep `simulateProdTimingMs` ms representing the
   *      production LLM "thinking" time → gives msg2 a window to arrive as FOLLOWER.
   *   2. Between CKPT-7.N iterations (per-template): sleep proportional to message length →
   *      gives msg2 a window to arrive during the send loop → detected at the next CKPT-7.N.
   * Default 0 (no simulation — backward compatible). Lives in `sandbox-adapters.ts`.
   */
  simulateProdTimingMs?: number
  /**
   * standalone v4-media-audio-image (Plan 04): vision context for the dedicated image-respond
   * branch. When present, the core threads it into processMessage so the shared branch fires in
   * sandbox — parity with production. Absent on text turns. Additive — Regla 6.
   */
  visionContext?: { descripcion: string; categoria: string }
  /**
   * Optional callback fired once per template AFTER CKPT-7.N succeeds for that template AND the
   * per-template send-pacing sleep has elapsed. Used by the streaming sandbox route to flush each
   * template to the browser as it is "sent" — matching production where each
   * V4MessagingAdapter.send() call is observable client-side immediately. The callback runs WITH
   * THE LOCK STILL HELD (send-adapter is mid-loop); it MUST NOT release the lock. Lives in
   * `sandbox-adapters.ts` (send adapter).
   */
  onMessage?: (content: string, index: number) => Promise<void> | void
}

export interface V4EngineOutput {
  success: boolean
  messages: string[]
  newState: SandboxState
  debugTurn: DebugTurn
  error?: { code: string; message: string }
  timerSignal?: unknown
}

export class SomnioV4Engine {
  async processMessage(input: V4EngineInput): Promise<V4EngineOutput> {
    const timestamp = new Date().toISOString()

    // ----------------------------------------------------------------
    // Input neutral del core (derivado de V4EngineInput — SIN tipos de WhatsApp). El THROW
    // defensivo del contrato del webhook (A1) vive en el core (runTurn). El sandbox usa lock
    // identifier 'sandbox-{id}' + canal 'whatsapp' (D-02 Option C); puede venir null (fail-open).
    // ----------------------------------------------------------------
    const coreInput: TurnCoreInput = {
      message: input.message,
      conversationId: input.sandboxSessionId ?? 'sandbox-conversation',
      workspaceId: input.workspaceId,
      lockHandle: input.lockHandle,
      lockChannel: input.lockChannel,
      lockIdentifier: input.lockIdentifier,
      ownPendingEntryJson: input.ownPendingEntryJson,
      // D-22 (CR-01 review): el sandbox corre el gate CRM con mutation-tools SIMULADAS (no DB write
      // contra el workspace real). El core lo threadea al V4AgentInput. Restaura el `simulate: true`
      // que el engine viejo pasaba (1af5c49c:283) y que el Plan 11 dropeó.
      simulate: true,
      // systemEvent (H-02 review): el path timer-simulado del sandbox (retomas D-21). El core lo
      // threadea al V4AgentInput → processMessage despacha a processSystemEvent. Restaura el
      // `systemEvent: input.systemEvent` que el engine viejo pasaba (1af5c49c:271).
      systemEvent: input.systemEvent,
    }

    // ----------------------------------------------------------------
    // C5 — el mapeo TurnResult → V4EngineOutput. onResultReady (dentro del core, ANTES del release)
    // lo aplica para escribir sandbox-result:{id}; el wrapper lo aplica al TurnResult que runTurn
    // retorna → lo escrito == lo retornado. Es el ÚNICO punto de frontera hacia src/lib/sandbox/types
    // (los casts de SandboxState viven aquí; ese archivo NO se toca, compartido con sandbox v3).
    // ----------------------------------------------------------------
    const mapResult = (result: TurnResult): SandboxResultPayload =>
      this.mapResult(result, input, timestamp) as unknown as SandboxResultPayload

    const { adapters } = createSandboxAdapters({
      state: input.state,
      history: input.history,
      turnNumber: input.turnNumber,
      workspaceId: input.workspaceId,
      // systemEvent ya NO se pasa al adapter: se threadea por el core vía coreInput.systemEvent
      // (H-02 review). El adapter no lo necesita (era param muerto — L-01). Va al V4AgentInput
      // desde el core, no desde getSeedState.
      visionContext: input.visionContext,
      lockHandle: input.lockHandle,
      lockChannel: input.lockChannel,
      lockIdentifier: input.lockIdentifier,
      sandboxSessionId: input.sandboxSessionId,
      simulateProdTimingMs: input.simulateProdTimingMs,
      onMessage: input.onMessage,
      redis,
      mapResult,
    })

    // El core corre el restart loop + Path A/B + heartbeat + finally-release + onResultReady (write
    // sandbox-result ANTES del release). El wrapper solo mapea el resultado neutral a su shape.
    const result = await runTurn(coreInput, adapters)
    return this.mapResult(result, input, timestamp)
  }

  // ==================================================================
  // Mapeo TurnResult neutral → V4EngineOutput (shape sandbox). Divergencia INTENCIONAL del error
  // (sandbox success:true + '[Error v4]' vs prod success:false) — C5; el engine mapea su lado.
  // ==================================================================

  private mapResult(
    result: TurnResult,
    input: V4EngineInput,
    timestamp: string,
  ): V4EngineOutput {
    if (result.kind === 'zombie_exit') {
      // D-15 zombie defense: el send-adapter detectó que esta lambda ya no posee el lock. El core ya
      // emitió `zombie_lambda_exit` y escribió el sandbox-result vía onResultReady (Pitfall 5).
      return {
        success: false,
        messages: [],
        newState: input.state,
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: {
            intent: 'error',
            confidence: 0,
            reasoning: `LOST_LOCK at ${result.ckptId}`,
            timestamp,
          },
          tools: [],
          tokens: {
            turnNumber: input.turnNumber,
            tokensUsed: 0,
            models: [],
            timestamp,
          },
          stateAfter: input.state,
        },
        error: { code: 'V4_ZOMBIE_LAMBDA_EXIT', message: result.message },
      }
    }

    if (result.kind === 'error') {
      // C5 (divergencia INTENCIONAL vs prod success:false): el route/UI del sandbox esperan
      // success:true + un mensaje '[Error v4] ...' renderizable. NO unificar con prod.
      return {
        success: true,
        messages: [`[Error v4] ${result.message}`],
        newState: input.state,
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: {
            intent: 'error',
            confidence: 0,
            reasoning: result.message,
            timestamp,
          },
          tools: [],
          tokens: {
            turnNumber: input.turnNumber,
            tokensUsed: 0,
            models: [],
            timestamp,
          },
          stateAfter: input.state,
        },
        error: { code: 'V4_ENGINE_ERROR', message: result.message },
      }
    }

    // kind === 'completed'
    const output: V4AgentOutput = result.output

    // C2 — build SandboxState desde el output + limpieza de keys `_v3:` stale (ahora fluyen como
    // first-class fields). El namespace `_v3:` se preserva para DB compat (sessions productivas);
    // estas keys específicas se reconstruyen desde first-class fields.
    const newState: SandboxState = {
      currentMode: output.newMode ?? input.state.currentMode,
      intentsVistos: output.intentsVistos,
      templatesEnviados: output.templatesEnviados,
      datosCapturados: output.datosCapturados,
      packSeleccionado: output.packSeleccionado as PackSelection | null,
      // somnio-v4-crm-subloop D-18/D-19: cast de frontera v4→SandboxState (tipado contra v3) por
      // los 3 nuevos TipoAccion. Shape idéntico; v3 NO se toca (Regla 6).
      accionesEjecutadas: output.accionesEjecutadas as SandboxState['accionesEjecutadas'],
      // somnio-v4-turn-ledger Plan 04: el subset del ledger del turno fluye a SandboxState → llega a
      // DebugTurn vía `stateAfter: newState` para que el debug panel lo renderice.
      turnLedgerDims: output.turnLedgerDims,
    }
    delete newState.datosCapturados['_v3:accionesEjecutadas']
    delete newState.datosCapturados['_v3:templatesMostrados']

    // Pick the last timer signal (most relevant).
    const lastTimerSignal = output.timerSignals.length > 0
      ? output.timerSignals[output.timerSignals.length - 1]
      : undefined

    // C3 — build DebugTurn completo. tokens.tokensUsed = total acumulado cross-restart (lo provee el
    // core en result.totalTokens — single source of truth, Pitfall 2).
    return {
      success: output.success,
      messages: result.allSentContents,
      newState,
      timerSignal: lastTimerSignal,
      debugTurn: {
        turnNumber: input.turnNumber,
        intent: output.intentInfo ? {
          intent: output.intentInfo.intent,
          confidence: output.intentInfo.confidence,
          intent_confidence: output.intentInfo.intent_confidence,
          reasoning: output.intentInfo.reasoning,
          timestamp: output.intentInfo.timestamp,
        } : output.errorMessage ? {
          // Standalone: somnio-sales-v4-runtime-wiring / Plan 07 debug. Surface real catch-block
          // errors instead of the misleading "Timer event - no comprehension" fallback.
          intent: 'error',
          confidence: 0,
          reasoning: `ERROR: ${output.errorMessage}`,
          timestamp,
        } : {
          intent: 'system_event',
          confidence: 0,
          reasoning: 'Timer event - no comprehension',
          timestamp,
        },
        tools: [],
        tokens: {
          turnNumber: input.turnNumber,
          tokensUsed: result.totalTokens,
          models: [{
            model: 'gemini-2.5-flash' as const,
            inputTokens: Math.round(result.totalTokens * 0.7),
            outputTokens: Math.round(result.totalTokens * 0.3),
          }],
          timestamp,
        },
        stateAfter: newState,
        classification: output.decisionInfo ? {
          category: output.timerSignals.some(s => s.level === 'L5') ? 'SILENCIOSO'
            : output.newMode === 'handoff' ? 'HANDOFF'
            : 'RESPONDIBLE',
          reason: output.decisionInfo.reason,
          rulesChecked: { rule1: false, rule1_5: false, rule2: false, rule3: false },
        } : undefined,
        orchestration: output.decisionInfo ? {
          nextMode: output.newMode ?? input.state.currentMode,
          previousMode: input.state.currentMode,
          modeChanged: !!output.newMode && output.newMode !== input.state.currentMode,
          // somnio-v4-consolidation D-13: el campo legacy del V4AgentOutput fue borrado (el runner ya
          // no crea — el gate CRM lo hace en el sub-loop). El campo homólogo de DebugTurn.orchestration
          // (src/lib/sandbox/types.ts) NO se toca (compartido con sandbox v3, fuera de scope D-11) →
          // literal false.
          shouldCreateOrder: false,
          templatesCount: output.messages.length,
          // D-22 paridad: el gate CRM corrió simulado (simulate:true en el agent input). Los crmActions
          // del turno viven en turnLedgerDims (origen:'rag') y el resultado simulado en crmResult.
          crmActionsCount: output.turnLedgerDims?.crmActions?.length ?? 0,
          orderCreated: output.crmResult?.success ?? false,
        } : undefined,
        salesTrack: output.salesTrackInfo ? {
          accion: output.salesTrackInfo.accion,
          reason: output.salesTrackInfo.reason,
          enterCaptura: output.salesTrackInfo.enterCaptura,
        } : undefined,
        responseTrack: output.responseTrackInfo ? {
          salesIntents: output.responseTrackInfo.salesTemplateIntents,
          infoIntents: output.responseTrackInfo.infoTemplateIntents,
          totalMessages: output.responseTrackInfo.totalMessages,
        } : undefined,
        // V4 escalation visibility (Plan 03 D-20 honored in Plan 07 debug).
        subLoopReason: output.subLoopReason ?? undefined,
        threshold: output.threshold,
        // Standalone: v4-subloop-debug-view / Plan 03 (D-02).
        subLoopDebug: output.subLoopDebug,
        timerSignals: output.timerSignals.map(s => ({
          type: s.type,
          level: s.level,
          reason: s.reason,
        })),
      },
    }
  }
}
