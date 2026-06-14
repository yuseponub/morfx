/**
 * Somnio Sales Agent v4 — Main Agent Pipeline (orquestador)
 *
 * Arquitectura híbrida (D-01):
 *   1. Comprehension (Gemini 2.5 Flash estructurado + intent_confidence — D-10/D-63)
 *   2. State merge + computeGates
 *   3. Threshold lookup (platform_config.somnio_v4_low_confidence_threshold — D-11)
 *   4. Slot resolver (D-02 triggers low_confidence / razonamiento_libre / otro)
 *      → si escala: runSubLoop por slot (resolveLowSlot mapea el LoopOutcome inline)
 *   5. Guards R0/R1 (escape intents)
 *   6. resolveSalesTrack (state machine determinista)
 *   7. GATE CRM (standalone #2 Plan 06 — D-01/D-05/D-06): runCrmGate reemplaza
 *      el resolvedor de invocaciones inline + el createOrder inline + el bloque createOrder del runner.
 *      ADITIVO, NO early-return (D-05): carga grounding lazy + sub-loop GROUNDED +
 *      guards (idempotency/CAS/whitelist) + crmActions origen:'rag' + crmResult
 *      (Pitfall 6) → CAE a response-track. createOrder cascaron, updateOrder pack,
 *      moveOrderToStage(CONFIRMADO) ocurren DENTRO del sub-loop (NO en el runner).
 *   8. resolveResponseTrack (templates)
 *   9. Build V4AgentOutput (crmResult re-cableado a EngineOutput — el campo legacy
 *      shouldCreateOrder fue borrado en somnio-v4-consolidation D-13)
 *
 * D-60: outcome=no_match del sub-loop → V4AgentOutput.requiresHuman=true + newMode='handoff'.
 *
 * Standalone: somnio-sales-v4 / Plan 07 Task 4.
 *
 * Anti-patterns:
 * - NO importar el módulo legacy v3 (D-24)
 * - NO usar el production adapter del agente legacy (D-07)
 * - NO emitir template post-success si createOrder/updateOrder falló (D-20)
 */

import { comprehend } from './comprehension'
import {
  mergeAnalysis,
  computeGates,
  serializeState,
  deserializeState,
  commitTurn,
  hasAction,
} from './state'
import { resolveSalesTrack } from './sales-track'
import { resolveResponseTrack } from './response-track'
import { checkGuards } from './guards'
import { derivePhase } from './phase'
import { CRM_ACTIONS, CREATE_ORDER_ACTIONS } from './constants'
import { decideSubLoopReason } from './escalation'
import { computeSlots, type SlotPlan, type SlotDecision } from './slots'
import { getLowConfidenceThreshold } from './threshold'
import { runSubLoop } from './sub-loop'
import type { SubLoopDebugPayload } from './sub-loop/debug-payload'
import { runCrmGate } from './crm-gate'
import type { LoopOutcome } from './sub-loop/output-schema'
import { captureUnknownCase } from './unknown-cases/capture'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from './config'
import { getCollector } from '@/lib/observability'
// Standalone v4-observability-completeness (Plan 02):
// engine_error en el error path (D-01) + restart_iteration en el spine (D-02/D-03).
import { recordV4Event, type V4Stage } from './observability'
import { bodyTruncate } from '@/lib/agents/shared/crm-mutation-tools/helpers'
// ============================================================================
// Standalone: debounce-interruption-system-v2 (Plan 05 Task 5.1)
// CKPT-1 (post-comprehension) + CKPT-2 (post-state-machine) fire here.
// LostLockError is re-thrown so V4ProductionRunner's outer catch (Plan 04
// Task 4.3) can emit `zombie_lambda_exit`. The interrupt branch returns a
// V4AgentOutput with success=false + errorMessage discriminator so the runner
// can detect Path A (no sends yet) and persist pending for next-turn combine.
// All call sites are skip-gated on the three lock fields being non-null, so
// sandbox / pre-v4 / fail-open callers are unaffected.
// D-06 (Plan 07): el boilerplate (skip-gate + lostLock throw + emit) está
// factorizado en runCheckpointGate; las colocaciones CKPT-1/2 NO se mueven.
// ============================================================================
import { runCheckpointGate } from './core/checkpoint-gate'
import type {
  AgentState,
  V4AgentInput,
  V4AgentOutput,
  TimerSignal,
  AccionRegistrada,
  Atendido,
  CrmActionRegistrada,
  ProcessedMessage,
  TurnLedger,
} from './types'

// ============================================================================
// Turn Ledger helpers (standalone: somnio-v4-turn-ledger — D-04/D-17)
// ============================================================================

/**
 * D-04/D-17: deriva los crmActions del ledger desde las acciones registradas con
 * `crmAction:true` en este turno (origen 'determinista' = mensaje usuario, 'timer'
 * = timer event). El push exitoso de la acción implica result:'success' (el shape
 * D-04 completo — tool/args reales/result/code — lo llena el orquestador del
 * standalone #2; aquí registramos lo disponible HOY sin inventar datos).
 */
function buildCrmActionsFromAcciones(
  acciones: AccionRegistrada[],
  origen: 'determinista' | 'timer',
  turno: number,
): CrmActionRegistrada[] {
  return acciones
    .filter((a) => a.crmAction === true && a.turno === turno && a.origen === origen)
    .map((a) => ({
      tool: a.tipo,
      args: {},
      result: 'success' as const,
      origen,
    }))
}

/**
 * D-17b (Plan 04): deriva el summary liviano (modeTransition/confidence/messagesSent/
 * intent) que el runner emite a observability desde el MISMO TurnLedger construido en
 * el turno. El agente es la fuente de verdad — el runner NO recalcula estos campos.
 * Runtime-only, nunca persistido.
 */
function buildLedgerSummary(ledger: TurnLedger): NonNullable<V4AgentOutput['turnLedgerSummary']> {
  return {
    intent: ledger.comprehension.intent,
    confidence: ledger.comprehension.confidence,
    modeTransition: ledger.modeTransition,
    messagesSent: ledger.messagesSent,
  }
}

// ============================================================================
// Top-level Dispatch
// ============================================================================

/**
 * Process a customer message through the v4 pipeline.
 * Routes timer events to processSystemEvent; user messages to processUserMessage.
 */
export async function processMessage(input: V4AgentInput): Promise<V4AgentOutput> {
  if (input.systemEvent && input.systemEvent.type === 'timer_expired') {
    return processSystemEvent(input, input.systemEvent)
  }
  return processUserMessage(input)
}

// ============================================================================
// User Message Path
// ============================================================================

async function processUserMessage(input: V4AgentInput): Promise<V4AgentOutput> {
  const timerSignals: TimerSignal[] = []
  // Plan 03 D-03: closure var captures sub-loop debug payload across all
  // runSubLoop invocations + error path. Survives throws (Pitfall 7 option a).
  let capturedSubLoopDebug: SubLoopDebugPayload | undefined = undefined

  // Standalone v4-observability-completeness (Plan 02):
  // - restartIteration (D-03): consumido de input (default 0) → threadeado a los
  //   eventos del pipeline + a las calls runCrmGate/runSubLoop + al engine_error.
  // - currentStage (D-01): var local actualizada al ENTRAR a cada stage; el catch
  //   externo la usa para emitir engine_error con EL STAGE donde reventó + errorStage.
  const restartIteration = input.restartIteration ?? 0
  let currentStage: V4Stage = 'comprehension'

  try {
    // 1. Restore state from session
    const state = deserializeState(
      input.datosCapturados,
      input.packSeleccionado,
      input.intentsVistos,
      input.templatesEnviados,
      input.accionesEjecutadas ?? [],
    )

    // somnio-v4-turn-ledger Plan 03 (D-17): modo previo del turno, capturado ANTES
    // de cualquier merge/decisión. modeTransition.from = este valor; .to = newMode
    // resultante. Si no hay cambio, from===to (sigue siendo info válida del turno).
    const prevMode = computeMode(state)

    // Hoisted above comprehension so the vision branch can pass it to runSubLoop.
    const recentBotMessages = input.history
      .filter((h) => h.role === 'assistant')
      .slice(-2)
      .map((h) => h.content)

    // ========================================================================
    // standalone v4-media-audio-image (Plan 04) — DEDICATED VISION BRANCH (D-05).
    //
    // When the media-gate classified an image as producto/pagina, it routed the
    // turn into the engine with visionContext.descripcion. This branch is DEDICATED:
    // it SKIPS comprehension / state-machine / templates entirely, but stays
    // KB-GROUNDED via the SAME RAG infra the low-confidence slot uses
    // (runSubLoop → kb_search + buildGenerationPrompt + runGenerationCall +
    // RESPONSE_CONFIDENCE_THRESHOLD + binary backstop). RQ-1 + D-05.
    //
    // Delivery: emit a rag:<sourceTopic> ProcessedMessage into output.templates;
    // the runner's existing 5h-main send loop delivers it automatically (no-rep
    // rag:* at :796 + ledger exclusion at :839 of v4-production-runner.ts).
    // ========================================================================
    if (input.visionContext) {
      const { descripcion, categoria } = input.visionContext
      // Combine image description + any caption text the client sent.
      const vquery = `${descripcion}${input.message ? '\nTexto del cliente: ' + input.message : ''}`

      let visionOutcome: Awaited<ReturnType<typeof runSubLoop>>
      try {
        visionOutcome = await runSubLoop({
          reason: 'razonamiento_libre',
          ctx: {
            workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
            conversationId: input.sessionId ?? '',
            sessionId: input.sessionId ?? '',
            userMessage: vquery,
            recentMessages: input.history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
            lockHandle: input.lockHandle ?? null,
            lockChannel: input.lockChannel ?? null,
            lockIdentifier: input.lockIdentifier ?? null,
            // Standalone v4-observability-completeness (Plan 02, D-03): consistencia
            // de telemetría en la rama vision.
            restartIteration,
            stateContext: {
              datosCapturados: input.datosCapturados,
              atendidoPrevio: input.turnLedgerDims?.atendido ?? [],
              recentBotMessages,
            },
          },
          onDebug: (p) => { capturedSubLoopDebug = p },
        })
      } catch (err) {
        // Error in sub-loop → informed handoff (D-07 fail-safe).
        const errDesc = err instanceof Error ? err.message : String(err)
        const errLedger: TurnLedger = {
          comprehension: { intent: 'imagen', confidence: 0 },
          atendido: [{ kind: 'handoff', reason: `imagen producto/página — ${descripcion} (error: ${errDesc})` }],
          crmActions: [],
          modeTransition: { from: prevMode, to: 'handoff' },
          messagesSent: 0,
        }
        const errSerialized = commitTurn(state, errLedger)
        return {
          success: true,
          messages: [],
          newMode: 'handoff',
          requiresHuman: true,
          intentsVistos: errSerialized.intentsVistos,
          templatesEnviados: errSerialized.templatesEnviados,
          datosCapturados: errSerialized.datosCapturados,
          packSeleccionado: errSerialized.packSeleccionado,
          accionesEjecutadas: errSerialized.accionesEjecutadas,
          turnLedgerDims: errSerialized.turnLedgerDims,
          turnLedgerSummary: buildLedgerSummary(errLedger),
          totalTokens: 0,
          timerSignals,
          subLoopDebug: capturedSubLoopDebug,
        }
      }

      // interrupted → Path A discriminator (mirror resolveLowSlot interrupt handling).
      if (
        visionOutcome.status === 'no_match' &&
        typeof visionOutcome.reason === 'string' &&
        visionOutcome.reason.startsWith('interrupted_at_ckpt_')
      ) {
        return {
          success: false,
          messages: [],
          errorMessage: visionOutcome.reason,
          intentsVistos: input.intentsVistos,
          templatesEnviados: input.templatesEnviados,
          datosCapturados: input.datosCapturados,
          packSeleccionado: input.packSeleccionado,
          accionesEjecutadas: input.accionesEjecutadas ?? [],
          turnLedgerDims: input.turnLedgerDims ?? { atendido: [], crmActions: [] },
          totalTokens: 0,
          timerSignals,
          subLoopDebug: capturedSubLoopDebug,
        }
      }

      // generated + confidence OK → emit rag: ProcessedMessage (mirror resolveLowSlot :576-589).
      if (visionOutcome.status === 'generated' && visionOutcome.responseText && visionOutcome.sourceTopic) {
        const ragMsg: ProcessedMessage = {
          templateId: `rag:${visionOutcome.sourceTopic}`,
          content: visionOutcome.responseText,
          contentType: 'texto',
          delayMs: 0,
          priority: 'CORE',
        }
        const visionLedger: TurnLedger = {
          comprehension: { intent: 'imagen', confidence: visionOutcome.responseConfidence ?? 0 },
          atendido: [{
            kind: 'kb_topic',
            topic: visionOutcome.sourceTopic,
            confidence: visionOutcome.responseConfidence ?? 0,
            texto: visionOutcome.responseText,
            turno: state.turnCount,
          }],
          crmActions: [],
          modeTransition: { from: prevMode, to: computeMode(state) },
          messagesSent: 1,
        }
        const visionSerialized = commitTurn(state, visionLedger)
        return {
          success: true,
          messages: [visionOutcome.responseText],
          templates: [ragMsg],
          intentsVistos: visionSerialized.intentsVistos,
          templatesEnviados: visionSerialized.templatesEnviados,
          datosCapturados: visionSerialized.datosCapturados,
          packSeleccionado: visionSerialized.packSeleccionado,
          accionesEjecutadas: visionSerialized.accionesEjecutadas,
          turnLedgerDims: visionSerialized.turnLedgerDims,
          turnLedgerSummary: buildLedgerSummary(visionLedger),
          totalTokens: 0,
          timerSignals,
          subLoopDebug: capturedSubLoopDebug,
        }
      }

      // no_match / generated-with-null / empty KB → informed handoff (D-07).
      const handoffReason = `imagen ${categoria} — ${descripcion}`
      const handoffLedger: TurnLedger = {
        comprehension: { intent: 'imagen', confidence: 0 },
        atendido: [{ kind: 'handoff', reason: `imagen producto/página — ${descripcion}` }],
        crmActions: [],
        modeTransition: { from: prevMode, to: 'handoff' },
        messagesSent: 0,
      }
      const handoffSerialized = commitTurn(state, handoffLedger)
      return {
        success: true,
        messages: [],
        newMode: 'handoff',
        requiresHuman: true,
        intentsVistos: handoffSerialized.intentsVistos,
        templatesEnviados: handoffSerialized.templatesEnviados,
        datosCapturados: handoffSerialized.datosCapturados,
        packSeleccionado: handoffSerialized.packSeleccionado,
        accionesEjecutadas: handoffSerialized.accionesEjecutadas,
        turnLedgerDims: handoffSerialized.turnLedgerDims,
        turnLedgerSummary: buildLedgerSummary(handoffLedger),
        totalTokens: 0,
        timerSignals,
        subLoopDebug: capturedSubLoopDebug,
        decisionInfo: { action: 'handoff', reason: handoffReason },
      }
    }
    // END DEDICATED VISION BRANCH — normal pipeline continues below.

    // 2. Comprehension (Gemini 2.5 Flash estructurado + intent_confidence)
    const { analysis, tokensUsed } = await comprehend(
      input.message,
      input.history,
      input.datosCapturados,
      recentBotMessages,
    )

    // ========================================================================
    // CKPT-1 `ckpt_1_post_comprehension` (D-18 + Plan 05 Task 5.1)
    // Skip-gated on lockHandle/lockChannel/lockIdentifier — sandbox / pre-v4 /
    // fail-open callers skip the checkpoint entirely. lostLock → throw to
    // runner outer catch. interrupted → Path A (no sends possible yet); return
    // a V4AgentOutput with errorMessage discriminator the runner can detect.
    // ========================================================================
    {
      // D-06 (Plan 07): el boilerplate skip-gate + lostLock throw + emit está
      // factorizado en runCheckpointGate. La COLOCACIÓN no se mueve; el agente
      // conserva SU builder de retorno (V4AgentOutput-passthrough).
      const ck1Gate = await runCheckpointGate({
        ckptId: 'ckpt_1_post_comprehension',
        lockHandle: input.lockHandle,
        workspaceId: input.workspaceId,
        lockChannel: input.lockChannel,
        lockIdentifier: input.lockIdentifier,
        interruptEmit: {
          combined_msg_count: 1, // self only at this point; runner reads pending later
          total_chars: input.message.length,
        },
      })
      if (typeof ck1Gate === 'object') {
        return {
          success: false,
          messages: [],
          errorMessage: 'interrupted_at_ckpt_1_post_comprehension',
          intentsVistos: input.intentsVistos,
          templatesEnviados: input.templatesEnviados,
          datosCapturados: input.datosCapturados,
          packSeleccionado: input.packSeleccionado,
          accionesEjecutadas: input.accionesEjecutadas ?? [],
          // somnio-v4-turn-ledger Plan 01: interrupt/error descarta el turno → preserva
          // dims del input (default vacío si legacy). Plan 03 mantiene este passthrough.
          turnLedgerDims: input.turnLedgerDims ?? { atendido: [], crmActions: [] },
          totalTokens: tokensUsed,
          timerSignals: [],
        }
      }
    }

    // 3. State merge
    const { state: mergedState, changes } = mergeAnalysis(state, analysis)

    // 4. Compute gates
    const gates = computeGates(mergedState)

    // 5. Threshold lookup (platform_config — D-11)
    const threshold = await getLowConfidenceThreshold()

    // ========================================================================
    // 6. [v4-hybrid Plan 03 — T-1] Compute the per-intent SLOT PLAN.
    // Replaces the binary early-return (escalate EVERYTHING based on primary
    // alone). The slot plan is computed HERE but RESOLVED at the END of the
    // pipeline (post-sales-track, post-gate-CRM, post-response-track) so the
    // deterministic track can resolve COVERED intents' templates and the slot
    // resolver only INJECTS RAG text for the LOW intent(s). computeSlots
    // (Plan 02) reuses decideSubLoopReason per-intent (covered|low + ragQuery).
    // ========================================================================
    const slotPlan: SlotPlan = computeSlots({
      primaryIntent: analysis.intent.primary,
      primaryConfidence: analysis.intent.intent_confidence,
      secondaryIntent: analysis.intent.secondary,
      secondaryConfidence: analysis.intent.secondary_confidence ?? null,
      secondaryQuery: analysis.intent.secondary_query ?? null,
      primaryQuery: analysis.intent.primary_query ?? null,
      rawMessage: input.message,
      threshold,
    })

    // `earlyReason` retained for the comprehension_completed_v4 event only
    // (it reflects the PRIMARY's escalation reason). It NO LONGER early-returns.
    const earlyReason = decideSubLoopReason({
      confidence: analysis.intent.intent_confidence,
      threshold,
      intent: analysis.intent.primary,
    })

    // T-1: scaledToSubLoop reflects ANY low slot (primary OR secondary), not
    // just the primary — the slot resolver may escalate either intent to RAG.
    const anyLowSlot =
      slotPlan.primary.coverage === 'low' || slotPlan.secondary?.coverage === 'low'

    // D-68: enriched comprehension_completed event (threshold + scaledToSubLoop)
    getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed_v4', {
      agent: SOMNIO_V4_AGENT_ID,
      sessionId: input.sessionId ?? null,
      intent: analysis.intent.primary,
      intent_confidence: analysis.intent.intent_confidence,
      intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
      threshold,
      scaledToSubLoop: anyLowSlot,
      earlyReason: earlyReason ?? null,
      tokensUsed,
      restart_iteration: restartIteration, // Plan 02 (D-02/D-03)
      secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : null,
      secondary_confidence: analysis.intent.secondary_confidence ?? null,
      secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
      secondary_query: analysis.intent.secondary_query ?? null,
      primary_query: analysis.intent.primary_query ?? null,
    })

    // NOTE (T-1): the exclusive early-return that lived here (escalate the WHOLE
    // turn to RAG when the primary was low_confidence/razonamiento_libre, skipping
    // guards/sales-track/gate-CRM/response-track) is GONE. The flow now ALWAYS
    // proceeds through guards → CKPT-2 → sales-track → gate CRM → response-track →
    // slot resolver (resolveLowSlot below). The slot resolver injects RAG only for
    // the low slot(s) and combines with the deterministic templates.

    // 7. Guards R0/R1 (escape intents)
    currentStage = 'guards' // Plan 02 (D-01): stage tracking para engine_error.
    const guardResult = checkGuards(analysis)
    if (guardResult.blocked) {
      getCollector()?.recordEvent('guard', 'blocked', {
        agent: SOMNIO_V4_AGENT_ID,
        intent: analysis.intent.primary,
        confidence: analysis.intent.confidence,
        reason: guardResult.decision.reason,
        restart_iteration: restartIteration, // Plan 02 (D-02/D-03)
      })

      if (guardResult.decision.timerSignal) {
        timerSignals.push(guardResult.decision.timerSignal)
      }
      // somnio-v4-turn-ledger Plan 03 (R1): guard R0/R1 blocked → handoff. Ledger
      // COMPLETO (D-17): atendido handoff, 0 mensajes, modeTransition→handoff.
      const ledgerR1: TurnLedger = {
        comprehension: {
          intent: analysis.intent.primary,
          secondary:
            analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          confidence: analysis.intent.intent_confidence,
        },
        atendido: [{ kind: 'handoff', reason: guardResult.decision.reason }],
        crmActions: [],
        modeTransition: { from: prevMode, to: 'handoff' },
        messagesSent: 0,
      }
      const serialized = commitTurn(mergedState, ledgerR1)
      return {
        success: true,
        messages: [],
        newMode: 'handoff',
        requiresHuman: true, // D-60 también para R1 escape intents (semantically a handoff)
        intentsVistos: serialized.intentsVistos,
        templatesEnviados: serialized.templatesEnviados,
        datosCapturados: serialized.datosCapturados,
        packSeleccionado: serialized.packSeleccionado,
        accionesEjecutadas: serialized.accionesEjecutadas,
        turnLedgerDims: serialized.turnLedgerDims, // somnio-v4-turn-ledger Plan 03: commitTurn
        turnLedgerSummary: buildLedgerSummary(ledgerR1), // Plan 04 D-17b: emit a observability
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          intent_confidence: analysis.intent.intent_confidence,
          secondary:
            analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        subLoopReason: null,
        threshold,
        subLoopDebug: capturedSubLoopDebug,
        totalTokens: tokensUsed,
        timerSignals,
        decisionInfo: {
          action: 'handoff',
          reason: guardResult.decision.reason,
          gates,
        },
        classificationInfo: {
          category: analysis.classification.category,
          sentiment: analysis.classification.sentiment,
        },
      }
    }

    getCollector()?.recordEvent('guard', 'passed', {
      agent: SOMNIO_V4_AGENT_ID,
      intent: analysis.intent.primary,
      confidence: analysis.intent.confidence,
      restart_iteration: restartIteration, // Plan 02 (D-02/D-03)
    })

    // ========================================================================
    // CKPT-2 `ckpt_2_post_state_machine` (D-18 + Plan 05 Task 5.1)
    // Fires after guards pass and BEFORE the sales-track state machine
    // resolution. lostLock → throw to runner outer catch. interrupted → Path A
    // (no sends possible yet); return V4AgentOutput with errorMessage
    // discriminator so runner detects and persists pending for next-turn combine.
    // Skip-gated on the three lock fields being non-null.
    // ========================================================================
    {
      // D-06 (Plan 07): boilerplate factorizado en runCheckpointGate; colocación
      // intacta; el agente conserva SU builder de retorno.
      const ck2Gate = await runCheckpointGate({
        ckptId: 'ckpt_2_post_state_machine',
        lockHandle: input.lockHandle,
        workspaceId: input.workspaceId,
        lockChannel: input.lockChannel,
        lockIdentifier: input.lockIdentifier,
        interruptEmit: {
          combined_msg_count: 1,
          total_chars: input.message.length,
        },
      })
      if (typeof ck2Gate === 'object') {
        return {
          success: false,
          messages: [],
          errorMessage: 'interrupted_at_ckpt_2_post_state_machine',
          intentsVistos: input.intentsVistos,
          templatesEnviados: input.templatesEnviados,
          datosCapturados: input.datosCapturados,
          packSeleccionado: input.packSeleccionado,
          accionesEjecutadas: input.accionesEjecutadas ?? [],
          // somnio-v4-turn-ledger Plan 01: interrupt/error descarta el turno → preserva
          // dims del input (default vacío si legacy). Plan 03 mantiene este passthrough.
          turnLedgerDims: input.turnLedgerDims ?? { atendido: [], crmActions: [] },
          totalTokens: tokensUsed,
          timerSignals: [],
        }
      }
    }

    // 8. Sales track — WHAT TO DO
    currentStage = 'sales-track' // Plan 02 (D-01): stage tracking para engine_error.
    const phase = derivePhase(mergedState.accionesEjecutadas)
    const salesResult = resolveSalesTrack({
      phase,
      state: mergedState,
      gates,
      event: {
        type: 'user_message',
        intent: analysis.intent.primary,
        category: analysis.classification.category,
        changes,
      },
    })

    getCollector()?.recordEvent('pipeline_decision', 'sales_track_result', {
      agent: SOMNIO_V4_AGENT_ID,
      intent: analysis.intent.primary,
      action: salesResult.accion ?? 'none',
      reason: salesResult.reason,
      enterCaptura: salesResult.enterCaptura,
      hasTimerSignal: !!salesResult.timerSignal,
      secondaryAction: salesResult.secondarySalesAction ?? 'none',
      phase,
      restart_iteration: restartIteration, // Plan 02 (D-02/D-03)
    })

    if (salesResult.timerSignal) {
      timerSignals.push(salesResult.timerSignal)
    }

    if (salesResult.enterCaptura === true) mergedState.enCapturaSilenciosa = true
    else if (salesResult.enterCaptura === false) mergedState.enCapturaSilenciosa = false

    // 9. GATE CRM (standalone #2 Plan 06 — D-01/D-05/D-06). REEMPLAZA el camino
    // determinista inline (el resolvedor de invocaciones inline + decision createOrder + el bloque
    // createOrder del runner) por el sub-loop GROUNDED + guards (idempotency/CAS/
    // whitelist) como red final (D-03).
    //
    // ADITIVO, NO early-return (D-05): el gate carga grounding (lazy), corre el
    // sub-loop CRM, deriva crmActions (origen:'rag' D-14) + crmResult (Pitfall 6),
    // actualiza el snapshot _v4 — y CAE a response-track (que sigue enviando
    // templates). El gate decide internamente si prende (accion CRM-gate-set |
    // newFields shipping | category 'datos'); si no prende retorna { crmActions: [] }.
    currentStage = 'crm-gate' // Plan 02 (D-01): stage tracking para engine_error.
    const crmGateOut = await runCrmGate({
      workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
      sessionId: input.sessionId ?? '',
      accion: salesResult.accion ?? null,
      changes,
      category: analysis.classification.category,
      mergedState,
      datosCapturados: input.datosCapturados,
      phone: input.datosCapturados.telefono ?? null,
      userMessage: input.message,
      ledgerCrmActions: input.turnLedgerDims?.crmActions ?? [],
      // Sandbox pasa true (Task 4 — V4AgentInput.simulate); prod pasa false ->
      // mutation-tools reales. Gate D-22.
      simulate: input.simulate ?? false,
      // Standalone: debounce-interruption-system-v2 — thread lock fields al sub-loop.
      lockHandle: input.lockHandle ?? null,
      lockChannel: input.lockChannel ?? null,
      lockIdentifier: input.lockIdentifier ?? null,
      // Standalone v4-observability-completeness (Plan 02, D-03): threadea la
      // iteración de restart para que el gate (Plan 03) etiquete sus eventos.
      restartIteration,
    })

    // 11. Response track
    currentStage = 'response-track' // Plan 02 (D-01): stage tracking para engine_error.
    // T-8 (v4-hybrid Plan 04): pass per-intent coverage from the slot plan so that
    // LOW intents are NOT given a template (they escalate to RAG in the slot resolver
    // below). Default-undefined = 'covered' (back-compat with any non-hybrid callers).
    const responseResult = await resolveResponseTrack({
      salesAction: salesResult.accion,
      secondarySalesAction: salesResult.secondarySalesAction,
      intent: analysis.intent.primary,
      secondaryIntent:
        analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
      intentCoverage: slotPlan.primary.coverage,
      secondaryCoverage: slotPlan.secondary?.coverage,
      state: mergedState,
      workspaceId: input.workspaceId,
    })

    getCollector()?.recordEvent('pipeline_decision', 'response_track_result', {
      agent: SOMNIO_V4_AGENT_ID,
      salesTemplateIntents: responseResult.salesTemplateIntents,
      infoTemplateIntents: responseResult.infoTemplateIntents,
      messageCount: responseResult.messages.length,
      templateIdsSent: responseResult.templateIdsSent,
      restart_iteration: restartIteration, // Plan 02 (D-02/D-03)
    })

    // 12. Register action (single registration point)
    if (salesResult.accion && salesResult.accion !== 'silence') {
      mergedState.accionesEjecutadas.push({
        tipo: salesResult.accion,
        turno: mergedState.turnCount,
        origen: 'bot',
        ...(CRM_ACTIONS.has(salesResult.accion) && { crmAction: true }),
      })
    }

    // 13. Update templatesMostrados
    for (const tid of responseResult.templateIdsSent) {
      if (!mergedState.templatesMostrados.includes(tid)) {
        mergedState.templatesMostrados.push(tid)
      }
    }

    // ========================================================================
    // 13.5 [v4-hybrid Plan 03 — THE CORE] SLOT RESOLVER + COMBINER.
    //
    // T-1=(b): runs at the END (post-sales-track, post-gate-CRM, post-response-
    // track). The deterministic track already resolved COVERED intents' templates
    // (responseResult.messages); here we INJECT RAG text for the LOW slot(s) and
    // combine them in intent order (D-11).
    //
    // Sequential per T-4 (no parallel fan-out): primary first, then secondary (D-11 order).
    // Each low slot runs ONE runSubLoop invocation (D-08). The 2 invocations reuse
    // the existing CKPT-3/4/5 inside runRagSubLoop (R6-B — NO new CheckpointId;
    // duplicate events acceptable).
    //
    // R1-A: a resolved slot's messages MUST survive even when the OTHER slot
    //       escalates to human (partial handoff — never set messages:[]).
    // R1-B/R6-A: an interrupt inside a RAG slot propagates errorMessage (Path A
    //       restart), NOT handoff. Safe because send is POST-return.
    // ========================================================================
    const ragMessages: ProcessedMessage[] = [] // synthetic RAG messages, in slot order
    const ragAtendido: Atendido[] = []
    const handoffSlots: { intent: string; reason: string }[] = []
    let interruptErrorMessage: string | null = null

    const resolveLowSlot = async (
      slot: SlotDecision,
      slotReason: 'low_confidence' | 'razonamiento_libre',
    ): Promise<void> => {
      // Short-circuit: a prior slot already interrupted — discard the whole turn.
      if (interruptErrorMessage) return

      getCollector()?.recordEvent('pipeline_decision', 'subloop_low_confidence_invoked', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: input.sessionId ?? null,
        reason: slotReason,
        confidence:
          slot.intent === analysis.intent.primary
            ? analysis.intent.intent_confidence
            : (analysis.intent.secondary_confidence ?? 0),
        threshold,
        intent: slot.intent,
      })

      const outcome = await runSubLoop({
        reason: slotReason,
        ctx: {
          workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
          conversationId: input.sessionId ?? '',
          sessionId: input.sessionId ?? '',
          // T-2: raw message for low primary; secondary_query for low secondary
          // (computeSlots already selected the correct ragQuery per slot).
          userMessage: slot.ragQuery ?? input.message,
          recentMessages: input.history
            .slice(-4)
            .map((m) => ({ role: m.role, content: m.content })),
          lockHandle: input.lockHandle ?? null,
          lockChannel: input.lockChannel ?? null,
          lockIdentifier: input.lockIdentifier ?? null,
          // Standalone v4-observability-completeness (Plan 02, D-03): threadea la
          // iteración de restart para que el sub-loop (Plan 03) etiquete sus eventos.
          restartIteration,
          // #2 v4-subloop-context-pass (C-01): contexto del state para el path RAG.
          stateContext: {
            datosCapturados: input.datosCapturados,
            atendidoPrevio: input.turnLedgerDims?.atendido ?? [],
            recentBotMessages,   // ya computados arriba (L162)
          },
        },
        onDebug: (p) => {
          // T-6: keep the LAST onDebug payload (array support deferred).
          capturedSubLoopDebug = p
        },
      })

      // R1-B / R6-A: interrupt → errorMessage (Path A restart), NOT handoff.
      if (
        outcome.status === 'no_match' &&
        typeof outcome.reason === 'string' &&
        outcome.reason.startsWith('interrupted_at_ckpt_')
      ) {
        interruptErrorMessage = outcome.reason
        return
      }

      // generated → inject synthetic RAG ProcessedMessage (R4 + D-05 CORE).
      if (outcome.status === 'generated' && outcome.responseText && outcome.sourceTopic) {
        ragMessages.push({
          templateId: `rag:${outcome.sourceTopic}`,
          content: outcome.responseText,
          contentType: 'texto',
          delayMs: 0,
          priority: 'CORE',
        })
        ragAtendido.push({
          kind: 'kb_topic',
          topic: outcome.sourceTopic,
          confidence: outcome.responseConfidence ?? 0,
          texto: outcome.responseText,
          turno: mergedState.turnCount,
        })
        return
      }

      // no_match (real handoff) OR generated-with-null (defensive) → partial
      // handoff for THIS slot. Preserve the early-return's side-effects per slot:
      // captureUnknownCase (fire-and-forget) + handoff_low_confidence_fallback event.
      const knowledgeQueried =
        (outcome.status === 'no_match' ? outcome.knowledgeQueried : null) ?? []
      void captureUnknownCase({
        workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
        conversationId: input.sessionId ?? '',
        message: slot.ragQuery ?? input.message,
        intent: slot.intent,
        intentConfidence:
          slot.intent === analysis.intent.primary
            ? analysis.intent.intent_confidence
            : (analysis.intent.secondary_confidence ?? 0),
        knowledgeQueried,
        reason: outcome.reason,
      })
      getCollector()?.recordEvent('pipeline_decision', 'handoff_low_confidence_fallback', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: input.sessionId ?? null,
        conversationId: input.sessionId ?? '',
        knowledgeQueried,
        reason: outcome.reason,
        intent: slot.intent,
      })
      handoffSlots.push({
        intent: slot.intent,
        reason: outcome.reason ?? 'low_confidence_no_match',
      })
    }

    // Sequential resolution — primary first, then secondary (D-11 order).
    currentStage = 'sub-loop-slot' // Plan 02 (D-01): stage tracking para engine_error.
    const primaryLow = slotPlan.primary.coverage === 'low'
    if (primaryLow && slotPlan.primary.reason) {
      await resolveLowSlot(slotPlan.primary, slotPlan.primary.reason)
    }
    if (slotPlan.secondary && slotPlan.secondary.coverage === 'low' && slotPlan.secondary.reason) {
      await resolveLowSlot(slotPlan.secondary, slotPlan.secondary.reason)
    }

    // R1-B / R6-A: interrupt short-circuit — return the interrupt-discriminator
    // output (same shape as CKPT-1/CKPT-2 returns) so the runner triggers Path A
    // restart. NO sends have happened yet (send is post-return), so the resolved
    // slot's text in ragMessages is discarded cleanly.
    if (interruptErrorMessage) {
      return {
        success: false,
        messages: [],
        errorMessage: interruptErrorMessage,
        intentsVistos: input.intentsVistos,
        templatesEnviados: input.templatesEnviados,
        datosCapturados: input.datosCapturados,
        packSeleccionado: input.packSeleccionado,
        accionesEjecutadas: input.accionesEjecutadas ?? [],
        turnLedgerDims: input.turnLedgerDims ?? { atendido: [], crmActions: [] },
        totalTokens: tokensUsed,
        timerSignals: [],
        subLoopDebug: capturedSubLoopDebug,
      }
    }

    // Combine deterministic templates + synthetic RAG messages in intent order
    // (D-11). ragMessages was pushed in [primary, secondary] order. When the
    // primary is low, its RAG comes first; otherwise the covered primary template
    // leads and RAG follows (both-low → responseResult is empty, ragMessages
    // already ordered). Documented V1 ordering choice (plan Task 2 (C)).
    const combinedMessages: ProcessedMessage[] = primaryLow
      ? [...ragMessages, ...responseResult.messages]
      : [...responseResult.messages, ...ragMessages]

    const partialHandoff = handoffSlots.length > 0

    // 14. Natural silence — only when there is genuinely NOTHING to say:
    // no deterministic template, no RAG message, AND no handoff.
    if (combinedMessages.length === 0 && !partialHandoff) {
      getCollector()?.recordEvent('pipeline_decision', 'natural_silence', {
        agent: SOMNIO_V4_AGENT_ID,
        intent: analysis.intent.primary,
        action: salesResult.accion ?? 'none',
        reason: salesResult.reason,
      })
      // somnio-v4-turn-ledger Plan 03 (R2): silencio natural. D-15: SÍ se registra
      // (un silencio deliberado es información del turno). Ledger COMPLETO (D-17):
      // atendido silence, 0 mensajes, modeTransition poblado, crmActions de este turno.
      const newModeR2 = computeMode(mergedState)
      const ledgerR2: TurnLedger = {
        comprehension: {
          intent: analysis.intent.primary,
          secondary:
            analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          confidence: analysis.intent.intent_confidence,
        },
        atendido: [{ kind: 'silence' }],
        // D-14 (Plan 06): user path usa los crmActions DERIVADOS del gate CRM
        // (origen:'rag', ground-truth del sub-loop) en vez de buildCrmActionsFromAcciones.
        crmActions: crmGateOut.crmActions,
        modeTransition: { from: prevMode, to: newModeR2 },
        messagesSent: 0,
      }
      const serialized = commitTurn(mergedState, ledgerR2)
      return {
        success: true,
        messages: [],
        newMode: newModeR2,
        intentsVistos: serialized.intentsVistos,
        templatesEnviados: serialized.templatesEnviados,
        datosCapturados: serialized.datosCapturados,
        packSeleccionado: serialized.packSeleccionado,
        accionesEjecutadas: serialized.accionesEjecutadas,
        turnLedgerDims: serialized.turnLedgerDims, // somnio-v4-turn-ledger Plan 03: commitTurn
        turnLedgerSummary: buildLedgerSummary(ledgerR2), // Plan 04 D-17b: emit a observability
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          intent_confidence: analysis.intent.intent_confidence,
          secondary:
            analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        subLoopReason: null,
        threshold,
        subLoopDebug: capturedSubLoopDebug,
        totalTokens: tokensUsed,
        timerSignals,
        decisionInfo: {
          action: 'silence',
          reason: salesResult.reason,
          templateIntents: [
            ...responseResult.salesTemplateIntents,
            ...responseResult.infoTemplateIntents,
          ],
          gates,
        },
        salesTrackInfo: {
          accion: salesResult.accion,
          reason: salesResult.reason,
          enterCaptura: salesResult.enterCaptura,
        },
        responseTrackInfo: {
          salesTemplateIntents: responseResult.salesTemplateIntents,
          infoTemplateIntents: responseResult.infoTemplateIntents,
          totalMessages: 0,
        },
        classificationInfo: {
          category: analysis.classification.category,
          sentiment: analysis.classification.sentiment,
        },
      }
    }

    // 15. Build COMBINED output (deterministic templates + injected RAG).
    // somnio-v4-turn-ledger Plan 03 (R3): happy path con mensajes. Ledger COMPLETO
    // (D-17). v4-hybrid Plan 03: atendido[] combina las entradas deterministas
    // (sales_action / template_intent) + las RAG (kb_topic por slot generated) +
    // las handoff (un entry por slot escalado a humano). Single commitTurn.
    //
    // R1-A: cuando combinedMessages.length > 0 NUNCA emitimos messages:[] aunque
    // partialHandoff sea true — el slot resuelto DEBE enviarse (el runner manda
    // output.templates en 5h ANTES de storage.handoff).
    const newModeR3 = partialHandoff ? 'handoff' : computeMode(mergedState)
    const atendidoR3: Atendido[] = []
    if (salesResult.accion && salesResult.accion !== 'silence') {
      atendidoR3.push({
        kind: 'sales_action',
        accion: salesResult.accion,
        templateIds: responseResult.salesTemplateIntents,
      })
    }
    if (responseResult.infoTemplateIntents.length > 0) {
      atendidoR3.push({
        kind: 'template_intent',
        intent: analysis.intent.primary,
        templateIds: responseResult.infoTemplateIntents,
      })
    }
    // RAG slots (generated) → kb_topic; escalated slots → handoff. Combined per D-11.
    for (const a of ragAtendido) atendidoR3.push(a)
    for (const h of handoffSlots) atendidoR3.push({ kind: 'handoff', reason: h.reason })

    const ledgerR3: TurnLedger = {
      comprehension: {
        intent: analysis.intent.primary,
        secondary:
          analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
        confidence: analysis.intent.intent_confidence,
      },
      atendido: atendidoR3,
      // D-14 (Plan 06): user path usa los crmActions DERIVADOS del gate CRM
      // (origen:'rag', ground-truth del sub-loop) en vez de buildCrmActionsFromAcciones.
      crmActions: crmGateOut.crmActions,
      modeTransition: { from: prevMode, to: newModeR3 },
      messagesSent: combinedMessages.length,
    }
    const serialized = commitTurn(mergedState, ledgerR3)

    return {
      success: true,
      messages: combinedMessages.map((m) => m.content),
      templates: combinedMessages,
      newMode: newModeR3,
      // R1-A / D-07: partial handoff sends the resolved slot AND flags handoff.
      requiresHuman: partialHandoff ? true : undefined,
      intentsVistos: serialized.intentsVistos,
      templatesEnviados: serialized.templatesEnviados,
      datosCapturados: serialized.datosCapturados,
      packSeleccionado: serialized.packSeleccionado,
      accionesEjecutadas: serialized.accionesEjecutadas,
      turnLedgerDims: serialized.turnLedgerDims, // somnio-v4-turn-ledger Plan 03: commitTurn
      turnLedgerSummary: buildLedgerSummary(ledgerR3), // Plan 04 D-17b: emit a observability
      intentInfo: {
        intent: analysis.intent.primary,
        confidence: analysis.intent.confidence,
        intent_confidence: analysis.intent.intent_confidence,
        secondary:
          analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
        reasoning: analysis.intent.reasoning,
        timestamp: new Date().toISOString(),
      },
      subLoopReason: anyLowSlot ? (slotPlan.primary.reason ?? slotPlan.secondary?.reason ?? null) : null,
      threshold,
      subLoopDebug: capturedSubLoopDebug,
      totalTokens: tokensUsed,
      // D-06 big-bang: el runner ya NO crea (standalone #2 Plan 06). El runner lee
      // crmResult (Pitfall 6) que pobla el gate (createOrder cascaron ya ocurrio
      // dentro del sub-loop, NO en el runner). somnio-v4-consolidation D-13: el
      // campo legacy shouldCreateOrder/orderData fue borrado de V4AgentOutput.
      crmResult: crmGateOut.crmResult,
      timerSignals,
      decisionInfo: {
        action: partialHandoff
          ? 'handoff'
          : combinedMessages.length === 0
            ? 'silence'
            : crmGateOut.crmResult?.success
              ? 'create_order'
              : 'respond',
        reason: salesResult.reason,
        templateIntents: [
          ...responseResult.salesTemplateIntents,
          ...responseResult.infoTemplateIntents,
          ...ragMessages.map((m) => m.templateId),
        ],
        gates,
      },
      salesTrackInfo: {
        accion: salesResult.accion,
        reason: salesResult.reason,
        enterCaptura: salesResult.enterCaptura,
      },
      responseTrackInfo: {
        salesTemplateIntents: responseResult.salesTemplateIntents,
        infoTemplateIntents: responseResult.infoTemplateIntents,
        totalMessages: combinedMessages.length,
      },
      classificationInfo: {
        category: analysis.classification.category,
        sentiment: analysis.classification.sentiment,
      },
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 5).join(' | ') : undefined
    console.error('[SomnioV4] Error processing message:', errMsg, errStack ?? '')

    // Standalone v4-observability-completeness (Plan 02, D-01): cierra el agujero
    // negro del turno 1b561aaf. Emite el motivo REAL + stack truncado (5 frames) +
    // EL STAGE donde reventó + restart_iteration a observabilidad. PII-safe: el
    // errorMessage embebido va redactado vía bodyTruncate (T-obs02-01); el stack
    // crudo vive solo en stackFrames (DB, NUNCA al chat — Pitfall 5).
    // Los early-returns de interrupción (errorMessage 'interrupted_at_ckpt_*')
    // retornan ANTES del catch → NO pasan por aquí → NO emiten engine_error
    // (Pitfall 2: son Path A restarts normales, no errores).
    recordV4Event('engine_error', {
      stage: currentStage,
      errorMessage: bodyTruncate(errMsg, 200),
      stackFrames: errStack ?? null,
      agent: SOMNIO_V4_AGENT_ID,
    }, { restartIteration })

    return {
      success: false,
      messages: [],
      // KEEP — discriminador de drain del orchestrator (interrupted_at_ckpt_*).
      errorMessage: errStack ? `${errMsg} :: ${errStack}` : errMsg,
      // Plan 02 (D-01): el stage donde reventó viaja en el output para que el runner
      // (Plan 04) construya un mensaje limpio al chat del operador (SIN stack).
      errorStage: currentStage,
      intentsVistos: input.intentsVistos,
      templatesEnviados: input.templatesEnviados,
      datosCapturados: input.datosCapturados,
      packSeleccionado: input.packSeleccionado,
      accionesEjecutadas: input.accionesEjecutadas ?? [],
      // somnio-v4-turn-ledger Plan 01: catch descarta el turno → preserva dims del input.
      turnLedgerDims: input.turnLedgerDims ?? { atendido: [], crmActions: [] },
      totalTokens: 0,
      timerSignals: [],
      // Pitfall 7 option (a): closure var preserves payload across the throw
      // — surface it on the error output so the Sub-Loop tab can render the
      // catch-before-throw snapshot from runSubLoop.
      subLoopDebug: capturedSubLoopDebug,
    }
  }
}

// ============================================================================
// System Event Path (timers — no comprehension, no mergeAnalysis, no guards)
// ============================================================================

async function processSystemEvent(
  input: V4AgentInput,
  systemEvent: { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 },
): Promise<V4AgentOutput> {
  const timerSignals: TimerSignal[] = []

  // Restore state from session
  const state = deserializeState(
    input.datosCapturados,
    input.packSeleccionado,
    input.intentsVistos,
    input.templatesEnviados,
    input.accionesEjecutadas ?? [],
  )

  // somnio-v4-turn-ledger Plan 03 (R10, D-17): modo previo capturado ANTES de
  // registrar la acción del timer. modeTransition.from = este valor.
  const prevMode = computeMode(state)

  // Compute phase + gates directly from state (NO mergeAnalysis, NO turnCount++)
  const phase = derivePhase(state.accionesEjecutadas)
  const gates = computeGates(state)

  // Sales track with timer event
  const salesResult = resolveSalesTrack({
    phase,
    state,
    gates,
    event: { type: 'timer_expired', level: systemEvent.level },
  })

  getCollector()?.recordEvent('pipeline_decision', 'system_event_routed', {
    agent: SOMNIO_V4_AGENT_ID,
    eventType: 'timer_expired',
    level: systemEvent.level,
    action: salesResult.accion ?? 'none',
    reason: salesResult.reason,
    hasTimerSignal: !!salesResult.timerSignal,
  })

  if (salesResult.timerSignal) {
    timerSignals.push(salesResult.timerSignal)
  }

  if (salesResult.enterCaptura === true) state.enCapturaSilenciosa = true
  else if (salesResult.enterCaptura === false) state.enCapturaSilenciosa = false

  // Response track — NO intent (system events don't have intents)
  const responseResult = await resolveResponseTrack({
    salesAction: salesResult.accion,
    state,
    workspaceId: input.workspaceId,
  })

  // Register action with origen: 'timer'
  if (salesResult.accion && salesResult.accion !== 'silence') {
    state.accionesEjecutadas.push({
      tipo: salesResult.accion,
      turno: state.turnCount,
      origen: 'timer',
      ...(CRM_ACTIONS.has(salesResult.accion) && { crmAction: true }),
    })
  }

  // Update templatesMostrados
  for (const tid of responseResult.templateIdsSent) {
    if (!state.templatesMostrados.includes(tid)) {
      state.templatesMostrados.push(tid)
    }
  }

  // somnio-v4-turn-ledger Plan 03 (R10): ledger COMPLETO del turno-timer. Sin
  // intent (los timers no tienen comprehension) → comprehension sintético
  // 'timer_expired' confidence 1. atendido: sales_action si hubo acción no-silence;
  // template_intent si hubo info templates. crmActions origen 'timer' por cada
  // acción crmAction:true registrada este turno. messagesSent = nº templates.
  const newModeR10 = computeMode(state)
  const atendidoR10: Atendido[] = []
  if (salesResult.accion && salesResult.accion !== 'silence') {
    atendidoR10.push({
      kind: 'sales_action',
      accion: salesResult.accion,
      templateIds: responseResult.salesTemplateIntents,
    })
  }
  if (responseResult.infoTemplateIntents.length > 0) {
    atendidoR10.push({
      kind: 'template_intent',
      intent: 'timer_expired',
      templateIds: responseResult.infoTemplateIntents,
    })
  }
  const ledgerR10: TurnLedger = {
    comprehension: { intent: 'timer_expired', confidence: 1 },
    atendido: atendidoR10,
    crmActions: buildCrmActionsFromAcciones(
      state.accionesEjecutadas,
      'timer',
      state.turnCount,
    ),
    modeTransition: { from: prevMode, to: newModeR10 },
    messagesSent: responseResult.templateIdsSent.length,
  }
  const serialized = commitTurn(state, ledgerR10)

  return {
    success: true,
    messages: responseResult.messages.map((m) => m.content),
    templates: responseResult.messages.length > 0 ? responseResult.messages : undefined,
    newMode: newModeR10,
    intentsVistos: serialized.intentsVistos,
    templatesEnviados: serialized.templatesEnviados,
    datosCapturados: serialized.datosCapturados,
    packSeleccionado: serialized.packSeleccionado,
    accionesEjecutadas: serialized.accionesEjecutadas,
    turnLedgerDims: serialized.turnLedgerDims, // somnio-v4-turn-ledger Plan 03: commitTurn (origen timer)
    turnLedgerSummary: buildLedgerSummary(ledgerR10), // Plan 04 D-17b: emit a observability
    totalTokens: 0,
    timerSignals,
    decisionInfo: {
      action: responseResult.messages.length === 0 ? 'silence' : 'respond',
      reason: salesResult.reason,
      gates,
    },
    salesTrackInfo: {
      accion: salesResult.accion,
      reason: salesResult.reason,
      enterCaptura: salesResult.enterCaptura,
    },
    responseTrackInfo: {
      salesTemplateIntents: responseResult.salesTemplateIntents,
      infoTemplateIntents: responseResult.infoTemplateIntents,
      totalMessages: responseResult.messages.length,
    },
  }
}

// ============================================================================
// Mode Computation
// ============================================================================

/**
 * Compute the current mode from state (for session persistence).
 * Maps v4 internal state to engine-compatible mode names.
 */
function computeMode(state: AgentState): string {
  if (
    state.accionesEjecutadas.some((a: AccionRegistrada | string) => {
      const tipo = typeof a === 'string' ? a : a.tipo
      return CREATE_ORDER_ACTIONS.has(tipo)
    })
  )
    return 'orden_creada'
  if (hasAction(state.accionesEjecutadas, 'mostrar_confirmacion')) return 'confirmacion'
  if (hasAction(state.accionesEjecutadas, 'ofrecer_promos')) return 'promos'
  if (state.enCapturaSilenciosa) {
    return state.ofiInter ? 'captura_inter' : 'captura'
  }
  if (state.turnCount === 0) return 'nuevo'
  return 'conversacion'
}
