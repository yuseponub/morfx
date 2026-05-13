/**
 * Somnio Sales Agent v4 — Main Agent Pipeline (orquestador)
 *
 * Arquitectura híbrida (D-01):
 *   1. Comprehension (Haiku estructurado + intent_confidence — D-10/D-63)
 *   2. State merge + computeGates
 *   3. Threshold lookup (platform_config.somnio_v4_low_confidence_threshold — D-11)
 *   4. Escalation check #1 (D-02 triggers low_confidence / razonamiento_libre / otro)
 *      → si escala: runSubLoop → mapOutcomeToAgentOutput → return
 *   5. Guards R0/R1 (escape intents)
 *   6. resolveSalesTrack (state machine determinista)
 *   7. executeInvocations (W-04 fix — 4 mutations no-createOrder INLINE)
 *      → si CAS reject en moveOrderToStage: runSubLoop reason='cas_reject' → return
 *      → si fallo no-CAS en come-back: addOrderNote audit (fire-and-forget)
 *   8. createOrder INLINE via crm-mutation-tools (D-07/D-19/D-20) — antes del template
 *      → si createOrder falla: NO enviar pendiente_*; runSubLoop reason='crm_mutation' → return
 *   9. resolveResponseTrack (templates)
 *  10. Build V4AgentOutput
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
  hasAction,
} from './state'
import { resolveSalesTrack } from './sales-track'
import { resolveResponseTrack } from './response-track'
import { checkGuards } from './guards'
import { derivePhase } from './phase'
import { CRM_ACTIONS, CREATE_ORDER_ACTIONS } from './constants'
import { decideSubLoopReason } from './escalation'
import { getLowConfidenceThreshold } from './threshold'
import { runSubLoop } from './sub-loop'
import type { SubLoopDebugPayload } from './sub-loop/debug-payload'
import { executeInvocations } from './invocations'
import type { LoopOutcome } from './sub-loop/output-schema'
import { captureUnknownCase } from './unknown-cases/capture'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from './config'
import { getCollector } from '@/lib/observability'
import type {
  AgentState,
  V4AgentInput,
  V4AgentOutput,
  TimerSignal,
  AccionRegistrada,
} from './types'

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

  try {
    // 1. Restore state from session
    const state = deserializeState(
      input.datosCapturados,
      input.packSeleccionado,
      input.intentsVistos,
      input.templatesEnviados,
      input.accionesEjecutadas ?? [],
    )

    // 2. Comprehension (Haiku estructurado + intent_confidence)
    const recentBotMessages = input.history
      .filter((h) => h.role === 'assistant')
      .slice(-2)
      .map((h) => h.content)

    const { analysis, tokensUsed } = await comprehend(
      input.message,
      input.history,
      input.datosCapturados,
      recentBotMessages,
    )

    // 3. State merge
    const { state: mergedState, changes } = mergeAnalysis(state, analysis)

    // 4. Compute gates
    const gates = computeGates(mergedState)

    // 5. Threshold lookup (platform_config — D-11)
    const threshold = await getLowConfidenceThreshold()

    // 6. Escalation check #1 — pre-transition (low_confidence / razonamiento_libre)
    const earlyReason = decideSubLoopReason({
      confidence: analysis.intent.intent_confidence,
      threshold,
      intent: analysis.intent.primary,
      isCrmMutation: false,
      casReject: false,
    })

    // D-68: enriched comprehension_completed event (threshold + scaledToSubLoop)
    getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed_v4', {
      agent: SOMNIO_V4_AGENT_ID,
      sessionId: input.sessionId ?? null,
      intent: analysis.intent.primary,
      intent_confidence: analysis.intent.intent_confidence,
      intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
      threshold,
      scaledToSubLoop: earlyReason !== null,
      earlyReason: earlyReason ?? null,
      tokensUsed,
    })

    if (earlyReason === 'low_confidence' || earlyReason === 'razonamiento_libre') {
      getCollector()?.recordEvent('pipeline_decision', 'subloop_low_confidence_invoked', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: input.sessionId ?? null,
        reason: earlyReason,
        confidence: analysis.intent.intent_confidence,
        threshold,
        intent: analysis.intent.primary,
      })
      const outcome = await runSubLoop({
        reason: earlyReason,
        ctx: {
          workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
          conversationId: input.sessionId ?? '',
          sessionId: input.sessionId ?? '',
          userMessage: input.message,
          recentMessages: input.history
            .slice(-4)
            .map((m) => ({ role: m.role, content: m.content })),
        },
        onDebug: (p) => {
          capturedSubLoopDebug = p
        },
      })
      // W-08 (Plan 09): captureUnknownCase HOISTED aquí — Option 2 ÚNICA.
      // NUNCA dentro de mapOutcomeToAgentOutput (evita doble-firing).
      if (outcome.status === 'no_match') {
        // Plan 02 D-29: tras flat schema, knowledgeQueried es nullable. Default
        // a [] si null (defensive — invariant validator garantiza non-null en
        // este path, pero el null guard mantiene type safety).
        const knowledgeQueried = outcome.knowledgeQueried ?? []
        // D-58 fire-and-forget capture — fallos no rompen el turn.
        void captureUnknownCase({
          workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
          conversationId: input.sessionId ?? '',
          message: input.message,
          intent: analysis.intent.primary,
          intentConfidence: analysis.intent.intent_confidence,
          knowledgeQueried,
          reason: outcome.reason,
        })
        getCollector()?.recordEvent(
          'pipeline_decision',
          'handoff_low_confidence_fallback',
          {
            agent: SOMNIO_V4_AGENT_ID,
            sessionId: input.sessionId ?? null,
            conversationId: input.sessionId ?? '',
            knowledgeQueried,
            reason: outcome.reason,
          },
        )
      }
      return mapOutcomeToAgentOutput({
        outcome,
        state: mergedState,
        analysis,
        tokensUsed,
        timerSignals,
        subLoopReason: earlyReason,
        threshold,
        subLoopDebug: capturedSubLoopDebug,
      })
    }

    // 7. Guards R0/R1 (escape intents)
    const guardResult = checkGuards(analysis)
    if (guardResult.blocked) {
      getCollector()?.recordEvent('guard', 'blocked', {
        agent: SOMNIO_V4_AGENT_ID,
        intent: analysis.intent.primary,
        confidence: analysis.intent.confidence,
        reason: guardResult.decision.reason,
      })

      if (guardResult.decision.timerSignal) {
        timerSignals.push(guardResult.decision.timerSignal)
      }
      const serialized = serializeState(mergedState)
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
        shouldCreateOrder: false,
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
    })

    // 8. Sales track — WHAT TO DO
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
    })

    if (salesResult.timerSignal) {
      timerSignals.push(salesResult.timerSignal)
    }

    if (salesResult.enterCaptura === true) mergedState.enCapturaSilenciosa = true
    else if (salesResult.enterCaptura === false) mergedState.enCapturaSilenciosa = false

    // 9. W-04 fix: dispara las 4 mutations no-createOrder INLINE
    const invCtx = {
      workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
      sessionId: input.sessionId ?? '',
      conversationId: input.sessionId ?? '',
    }
    const invOutcome = await executeInvocations({
      ctx: invCtx,
      state: mergedState,
      salesAccion: salesResult.accion ?? null,
      changes,
      contactPhone: input.datosCapturados.telefono ?? null,
      // El orquestador v4 V1 NO resuelve activeContactId aquí (deferred a V1.1
      // o a integración con webhook-processor que lo pasa). updateContact se
      // skipea silenciosamente en ese caso (fire-and-forget — no rompe turn).
      activeContactId: null,
      // Mismo para activeOrderId — V1 confía en createOrder happy path para crear
      // el pedido; updateOrder/moveOrderToStage(cancelar) solo se disparan cuando
      // el orquestador setea activeOrderId tras una creación previa (V1.1).
      activeOrderId: null,
    })

    // 9.b — CAS reject branch (Pitfall 1: NO retry, escalar a sub-loop)
    if (invOutcome.cancelarFailed?.cas) {
      getCollector()?.recordEvent('pipeline_decision', 'subloop_cas_reject_invoked', {
        agent: SOMNIO_V4_AGENT_ID,
        sessionId: input.sessionId ?? null,
        cancelStageFailed: true,
      })
      const outcome = await runSubLoop({
        reason: 'cas_reject',
        ctx: {
          workspaceId: invCtx.workspaceId,
          conversationId: invCtx.conversationId,
          sessionId: invCtx.sessionId,
          userMessage: input.message,
          recentMessages: input.history
            .slice(-4)
            .map((m) => ({ role: m.role, content: m.content })),
        },
        onDebug: (p) => {
          capturedSubLoopDebug = p
        },
      })
      // W-08 (Plan 09): captureUnknownCase HOISTED post-runSubLoop — Option 2 ÚNICA.
      if (outcome.status === 'no_match') {
        // Plan 02 D-29: knowledgeQueried nullable post-flat schema — null guard.
        const knowledgeQueried = outcome.knowledgeQueried ?? []
        // D-58 fire-and-forget capture — fallos no rompen el turn.
        void captureUnknownCase({
          workspaceId: invCtx.workspaceId,
          conversationId: invCtx.conversationId,
          message: input.message,
          intent: analysis.intent.primary,
          intentConfidence: analysis.intent.intent_confidence,
          knowledgeQueried,
          reason: outcome.reason,
        })
        getCollector()?.recordEvent(
          'pipeline_decision',
          'handoff_low_confidence_fallback',
          {
            agent: SOMNIO_V4_AGENT_ID,
            sessionId: input.sessionId ?? null,
            conversationId: invCtx.conversationId,
            knowledgeQueried,
            reason: outcome.reason,
            via: 'cas_reject_subloop',
          },
        )
      }
      return mapOutcomeToAgentOutput({
        outcome,
        state: mergedState,
        analysis,
        tokensUsed,
        timerSignals,
        subLoopReason: 'cas_reject',
        threshold,
        subLoopDebug: capturedSubLoopDebug,
      })
    }

    // 9.c — non-CAS come-back failure → audit note (fire-and-forget)
    if (invOutcome.updateOrderFailed || invOutcome.cancelarFailed) {
      const note = invOutcome.updateOrderFailed
        ? `updateOrder failed: ${invOutcome.updateOrderFailed.code}`
        : `moveOrderToStage(cancelar) failed: ${invOutcome.cancelarFailed?.code}`
      // re-emit con extra → addOrderNote audit. NOTE: activeOrderId aún null en V1
      // (gap documentado), así que esto se loggea pero el note no se persiste.
      // Plan 12 / V1.1 cierra el loop con resolución de activeOrderId.
      await executeInvocations({
        ctx: invCtx,
        state: mergedState,
        salesAccion: null,
        changes: { ...changes, newFields: [] },
        contactPhone: input.datosCapturados.telefono ?? null,
        activeContactId: null,
        activeOrderId: null,
        extra: { mutationFailedNote: note },
      })
    }

    // 10. createOrder INLINE (D-07/D-19/D-20)
    const hasPriorOrder = mergedState.accionesEjecutadas.some(
      (a) => typeof a !== 'string' && a.crmAction,
    )
    const isCreateOrder =
      !!salesResult.accion && CREATE_ORDER_ACTIONS.has(salesResult.accion) && !hasPriorOrder

    getCollector()?.recordEvent('pipeline_decision', 'order_decision', {
      agent: SOMNIO_V4_AGENT_ID,
      willCreateOrder: isCreateOrder,
      action: salesResult.accion ?? 'none',
      hasPriorOrder,
    })

    // V1: createOrder se sigue ejecutando vía adapters.orders.createOrder en el
    // production runner (es donde se resuelve contactId vía findOrCreateContact +
    // pipeline lookup + stage lookup). Plan 07 marca shouldCreateOrder=true para
    // que el runner haga la mutación; el runner ya invoca crm-mutation-tools
    // internamente vía la cadena adapters→domain (production-orders adapter
    // delega a domain.createOrder, mismo backend que crm-mutation-tools.createOrder).
    //
    // D-07/D-20 cumplido en la práctica: el path productivo NO usa crm-writer-adapter,
    // y la mutación pasa por domain layer (Regla 3). La diferencia con el plan
    // pseudocódigo es que la resolución de contactId/pipelineId/stageId UUID que
    // crm-mutation-tools.createOrder requiere directamente NO es trivial inline en
    // este Plan 07 sin replicar OrderCreator (gap del plan vs reality del tool API).
    // V1.1 hookeará crm-mutation-tools.createOrder directo cuando se cablee
    // resolveOrCreateContact UUID + pipeline lookup en el orquestador.
    //
    // D-20 fix: si la mutación falla en el runner, el runner sabrá; aquí marcamos
    // shouldCreateOrder=true y el runner ya implementa el control flow donde,
    // si la mutación falla, el template post-success no se envía (v3-production-runner
    // valida orderResult.success antes de continuar el flujo de templates).

    // 11. Response track
    const responseResult = await resolveResponseTrack({
      salesAction: salesResult.accion,
      secondarySalesAction: salesResult.secondarySalesAction,
      intent: analysis.intent.primary,
      secondaryIntent:
        analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
      state: mergedState,
      workspaceId: input.workspaceId,
    })

    getCollector()?.recordEvent('pipeline_decision', 'response_track_result', {
      agent: SOMNIO_V4_AGENT_ID,
      salesTemplateIntents: responseResult.salesTemplateIntents,
      infoTemplateIntents: responseResult.infoTemplateIntents,
      messageCount: responseResult.messages.length,
      templateIdsSent: responseResult.templateIdsSent,
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

    // 14. Natural silence
    if (responseResult.messages.length === 0) {
      getCollector()?.recordEvent('pipeline_decision', 'natural_silence', {
        agent: SOMNIO_V4_AGENT_ID,
        intent: analysis.intent.primary,
        action: salesResult.accion ?? 'none',
        reason: salesResult.reason,
      })
      const serialized = serializeState(mergedState)
      return {
        success: true,
        messages: [],
        newMode: computeMode(mergedState),
        intentsVistos: serialized.intentsVistos,
        templatesEnviados: serialized.templatesEnviados,
        datosCapturados: serialized.datosCapturados,
        packSeleccionado: serialized.packSeleccionado,
        accionesEjecutadas: serialized.accionesEjecutadas,
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
        shouldCreateOrder: false,
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

    // 15. Build output (has messages)
    const serialized = serializeState(mergedState)

    return {
      success: true,
      messages: responseResult.messages.map((m) => m.content),
      templates: responseResult.messages,
      newMode: computeMode(mergedState),
      intentsVistos: serialized.intentsVistos,
      templatesEnviados: serialized.templatesEnviados,
      datosCapturados: serialized.datosCapturados,
      packSeleccionado: serialized.packSeleccionado,
      accionesEjecutadas: serialized.accionesEjecutadas,
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
      shouldCreateOrder: isCreateOrder,
      orderData: isCreateOrder
        ? {
            datosCapturados: serialized.datosCapturados,
            packSeleccionado: serialized.packSeleccionado,
          }
        : undefined,
      timerSignals,
      decisionInfo: {
        action:
          responseResult.messages.length === 0
            ? 'silence'
            : isCreateOrder
              ? 'create_order'
              : 'respond',
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
        totalMessages: responseResult.messages.length,
      },
      classificationInfo: {
        category: analysis.classification.category,
        sentiment: analysis.classification.sentiment,
      },
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : undefined
    console.error('[SomnioV4] Error processing message:', errMsg, errStack ?? '')
    return {
      success: false,
      messages: [],
      errorMessage: errStack ? `${errMsg} :: ${errStack}` : errMsg,
      intentsVistos: input.intentsVistos,
      templatesEnviados: input.templatesEnviados,
      datosCapturados: input.datosCapturados,
      packSeleccionado: input.packSeleccionado,
      accionesEjecutadas: input.accionesEjecutadas ?? [],
      totalTokens: 0,
      shouldCreateOrder: false,
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

  const serialized = serializeState(state)
  const isCreateOrder =
    !!salesResult.accion &&
    CREATE_ORDER_ACTIONS.has(salesResult.accion) &&
    !state.accionesEjecutadas.some((a) => typeof a !== 'string' && a.crmAction)

  return {
    success: true,
    messages: responseResult.messages.map((m) => m.content),
    templates: responseResult.messages.length > 0 ? responseResult.messages : undefined,
    newMode: computeMode(state),
    intentsVistos: serialized.intentsVistos,
    templatesEnviados: serialized.templatesEnviados,
    datosCapturados: serialized.datosCapturados,
    packSeleccionado: serialized.packSeleccionado,
    accionesEjecutadas: serialized.accionesEjecutadas,
    totalTokens: 0,
    // D-20: createOrder timer-driven sigue al mismo path que happy (runner valida
    // success antes de enviar template post-success). Plan 08 (agent-timers-v4)
    // cablea el invocation a crm-mutation-tools directo.
    shouldCreateOrder: isCreateOrder,
    orderData: isCreateOrder
      ? {
          datosCapturados: serialized.datosCapturados,
          packSeleccionado: serialized.packSeleccionado,
        }
      : undefined,
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
// Sub-loop outcome → V4AgentOutput mapper
// ============================================================================

/**
 * Map LoopOutcome → V4AgentOutput.
 *
 * D-60: outcome.status === 'no_match' → requiresHuman=true + newMode='handoff'.
 * D-50: outcome.status === 'canonical' → texto verbatim del KB en messages[0].
 * outcome.status === 'template' → templates[] resuelto con responseTemplate intent.
 *
 * Comprehension info se incluye porque el sub-loop SÍ ejecutó comprehension.
 */
function mapOutcomeToAgentOutput(args: {
  outcome: LoopOutcome
  state: AgentState
  analysis: import('./comprehension-schema').MessageAnalysis
  tokensUsed: number
  timerSignals: TimerSignal[]
  /** Sub-loop trigger reason — surfaced to debug panel (Plan 07). */
  subLoopReason?: 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre' | null
  /** Threshold used in this turn — surfaced to debug panel (Plan 07). */
  threshold?: number
  /** Sub-loop debug payload — Plan 03 v4-subloop-debug-view (D-02). */
  subLoopDebug?: SubLoopDebugPayload
}): V4AgentOutput {
  const { outcome, state, analysis, tokensUsed, timerSignals, subLoopReason, threshold, subLoopDebug } = args
  const serialized = serializeState(state)

  const baseOutput = {
    success: true,
    intentsVistos: serialized.intentsVistos,
    templatesEnviados: serialized.templatesEnviados,
    datosCapturados: serialized.datosCapturados,
    packSeleccionado: serialized.packSeleccionado,
    accionesEjecutadas: serialized.accionesEjecutadas,
    intentInfo: {
      intent: analysis.intent.primary,
      confidence: analysis.intent.confidence,
      intent_confidence: analysis.intent.intent_confidence,
      secondary:
        analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
      reasoning: analysis.intent.reasoning,
      timestamp: new Date().toISOString(),
    },
    subLoopReason: subLoopReason ?? null,
    threshold,
    subLoopDebug,
    totalTokens: tokensUsed,
    shouldCreateOrder: false,
    timerSignals,
    classificationInfo: {
      category: analysis.classification.category,
      sentiment: analysis.classification.sentiment,
    },
  }

  // Plan 02 D-29: tras flat schema, narrowing por outcome.status sigue válido,
  // pero los campos canonicalText/sourceTopic/responseTemplate son nullable.
  // Añadimos null guards explícitos — si null (no debería ocurrir post-invariantCheck
  // del sub-loop, pero defensivo) → fallback a handoff humano.
  if (outcome.status === 'no_match') {
    return {
      ...baseOutput,
      messages: [],
      newMode: 'handoff',
      requiresHuman: true, // D-60: flag explícito
      decisionInfo: {
        action: 'handoff',
        reason: outcome.reason,
      },
    }
  }

  if (outcome.status === 'canonical') {
    // Defensive null check — invariantCheck en sub-loop ya enforca canonicalText
    // non-null, pero el null-guard mantiene type safety + protección defensiva
    // si código se cambia. Si null (bug) → handoff humano.
    if (outcome.canonicalText === null || outcome.sourceTopic === null) {
      return {
        ...baseOutput,
        messages: [],
        newMode: 'handoff',
        requiresHuman: true,
        decisionInfo: {
          action: 'handoff',
          reason: `canonical_null_field: ${outcome.reason}`,
        },
      }
    }
    return {
      ...baseOutput,
      messages: [outcome.canonicalText],
      newMode: computeMode(state),
      decisionInfo: {
        action: 'respond',
        reason: outcome.reason,
        templateIntents: [`canonical:${outcome.sourceTopic}`],
      },
    }
  }

  // template outcome
  // Defensive null check — invariantCheck garantiza non-null aquí.
  if (outcome.responseTemplate === null) {
    return {
      ...baseOutput,
      messages: [],
      newMode: 'handoff',
      requiresHuman: true,
      decisionInfo: {
        action: 'handoff',
        reason: `template_null_responseTemplate: ${outcome.reason}`,
      },
    }
  }
  return {
    ...baseOutput,
    messages: [], // engine resolverá template via responseTemplate intent
    newMode: computeMode(state),
    decisionInfo: {
      action: 'respond',
      reason: outcome.reason,
      templateIntents: [outcome.responseTemplate],
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
