/**
 * Somnio Sales Agent v3 — Main Agent Pipeline
 *
 * Two-track architecture:
 * C2: Comprehension (Claude Haiku)
 * C3: State Merge + StateChanges
 * C5: Compute Gates
 * Guards: R0 (low confidence), R1 (escape intents)
 * Sales Track: WHAT TO DO (pure state machine)
 * Response Track: WHAT TO SAY (template engine)
 *
 * Layers C0, C0.5, C8-C11 are handled by the engine/adapters.
 */

import { comprehend } from './comprehension'
import { mergeAnalysis, computeGates, serializeState, deserializeState, hasAction } from './state'
import { resolveSalesTrack } from './sales-track'
import { resolveResponseTrack } from './response-track'
import { checkGuards } from './guards'
import { derivePhase } from './phase'
import { CRM_ACTIONS, CREATE_ORDER_ACTIONS } from './constants'
import type { AgentState, V3AgentInput, V3AgentOutput, TimerSignal, TipoAccion, AccionRegistrada } from './types'

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process a customer message through the v3 pipeline.
 *
 * @param input - Message + session state from engine
 * @returns V3AgentOutput with response, state updates, signals
 */
export async function processMessage(input: V3AgentInput): Promise<V3AgentOutput> {
  if (input.systemEvent && input.systemEvent.type === 'timer_expired') {
    return processSystemEvent(input, input.systemEvent)
  }
  return processUserMessage(input)
}

// ============================================================================
// System Event Path (timers — no comprehension, no mergeAnalysis, no guards)
// ============================================================================

async function processSystemEvent(
  input: V3AgentInput,
  systemEvent: { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 },
): Promise<V3AgentOutput> {
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

  if (salesResult.timerSignal) {
    timerSignals.push(salesResult.timerSignal)
  }

  // Apply captura mode from sales track
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

  // Serialize state — intentsVistos and turnCount UNCHANGED
  const serialized = serializeState(state)

  return {
    success: true,
    messages: responseResult.messages.map(m => m.content),
    templates: responseResult.messages.length > 0 ? responseResult.messages : undefined,
    newMode: computeMode(state),
    intentsVistos: serialized.intentsVistos,
    templatesEnviados: serialized.templatesEnviados,
    datosCapturados: serialized.datosCapturados,
    packSeleccionado: serialized.packSeleccionado,
    accionesEjecutadas: serialized.accionesEjecutadas,
    // intentInfo intentionally omitted — system events have no intent
    totalTokens: 0,
    shouldCreateOrder: !!salesResult.accion && CREATE_ORDER_ACTIONS.has(salesResult.accion)
      && !state.accionesEjecutadas.some(a => typeof a !== 'string' && a.crmAction),
    orderData: (!!salesResult.accion && CREATE_ORDER_ACTIONS.has(salesResult.accion)
      && !state.accionesEjecutadas.some(a => typeof a !== 'string' && a.crmAction))
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
    // classificationInfo intentionally omitted — no analysis ran
  }
}

// ============================================================================
// User Message Path (real comprehension, mergeAnalysis, guards)
// ============================================================================

async function processUserMessage(input: V3AgentInput): Promise<V3AgentOutput> {
  const timerSignals: TimerSignal[] = []

  try {
    // Restore state from session
    const state = deserializeState(
      input.datosCapturados,
      input.packSeleccionado,
      input.intentsVistos,
      input.templatesEnviados,
      input.accionesEjecutadas ?? [],
    )

    // C2: Comprehension (always real — this is a user message)
    const recentBotMessages = input.history
      .filter(h => h.role === 'assistant')
      .slice(-2)
      .map(h => h.content)

    const { analysis, tokensUsed } = await comprehend(
      input.message,
      input.history,
      input.datosCapturados,
      recentBotMessages,
    )

    // C3: State Merge (pushes real intent, increments turnCount)
    const { state: mergedState, changes } = mergeAnalysis(state, analysis)

    // C5: Compute Gates
    const gates = computeGates(mergedState)

    // GUARDS (R0, R1) — always run for user messages
    const guardResult = checkGuards(analysis)
    if (guardResult.blocked) {
      if (guardResult.decision.timerSignal) {
        timerSignals.push(guardResult.decision.timerSignal)
      }
      const serialized = serializeState(mergedState)
      return {
        success: true,
        messages: [],
        newMode: 'handoff',
        intentsVistos: serialized.intentsVistos,
        templatesEnviados: serialized.templatesEnviados,
        datosCapturados: serialized.datosCapturados,
        packSeleccionado: serialized.packSeleccionado,
        accionesEjecutadas: serialized.accionesEjecutadas,
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
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

    // SALES TRACK — WHAT TO DO
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

    if (salesResult.timerSignal) {
      timerSignals.push(salesResult.timerSignal)
    }

    // Apply captura mode from sales track
    if (salesResult.enterCaptura === true) mergedState.enCapturaSilenciosa = true
    else if (salesResult.enterCaptura === false) mergedState.enCapturaSilenciosa = false

    // Check for order creation (skip if CRM already touched — prevents duplicate orders)
    const hasPriorOrder = mergedState.accionesEjecutadas.some(a => typeof a !== 'string' && a.crmAction)
    const isCreateOrder = !!salesResult.accion && CREATE_ORDER_ACTIONS.has(salesResult.accion) && !hasPriorOrder

    // RESPONSE TRACK — WHAT TO SAY
    const responseResult = await resolveResponseTrack({
      salesAction: salesResult.accion,
      secondarySalesAction: salesResult.secondarySalesAction,
      intent: analysis.intent.primary,
      secondaryIntent: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
      state: mergedState,
      workspaceId: input.workspaceId,
    })

    // Register action (SINGLE registration point — D3)
    if (salesResult.accion && salesResult.accion !== 'silence') {
      mergedState.accionesEjecutadas.push({
        tipo: salesResult.accion,
        turno: mergedState.turnCount,
        origen: 'bot',
        ...(CRM_ACTIONS.has(salesResult.accion) && { crmAction: true }),
      })
    }

    // Update templatesMostrados
    for (const tid of responseResult.templateIdsSent) {
      if (!mergedState.templatesMostrados.includes(tid)) {
        mergedState.templatesMostrados.push(tid)
      }
    }

    // NATURAL SILENCE: response track produced 0 messages
    if (responseResult.messages.length === 0) {
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
          secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        totalTokens: tokensUsed,
        shouldCreateOrder: false,
        timerSignals,
        decisionInfo: {
          action: 'silence',
          reason: salesResult.reason,
          templateIntents: [...responseResult.salesTemplateIntents, ...responseResult.infoTemplateIntents],
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

    // Build output (has messages)
    const serialized = serializeState(mergedState)

    return {
      success: true,
      messages: responseResult.messages.map(m => m.content),
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
        secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
        reasoning: analysis.intent.reasoning,
        timestamp: new Date().toISOString(),
      },
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
        action: responseResult.messages.length === 0 ? 'silence'
          : isCreateOrder ? 'create_order'
          : 'respond',
        reason: salesResult.reason,
        templateIntents: [...responseResult.salesTemplateIntents, ...responseResult.infoTemplateIntents],
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
    console.error('[SomnioV3] Error processing message:', errMsg)
    return {
      success: false,
      messages: [],
      intentsVistos: input.intentsVistos,
      templatesEnviados: input.templatesEnviados,
      datosCapturados: input.datosCapturados,
      packSeleccionado: input.packSeleccionado,
      accionesEjecutadas: input.accionesEjecutadas ?? [],
      // intentInfo omitted — error state has no real intent
      totalTokens: 0,
      shouldCreateOrder: false,
      timerSignals: [],
    }
  }
}

// ============================================================================
// Mode Computation
// ============================================================================

/**
 * Compute the current mode from state (for session persistence).
 * Maps v3 internal state to engine-compatible mode names.
 */
function computeMode(state: AgentState): string {
  if (state.accionesEjecutadas.some(a => {
    const tipo = typeof a === 'string' ? a : a.tipo
    return CREATE_ORDER_ACTIONS.has(tipo)
  })) return 'orden_creada'
  if (hasAction(state.accionesEjecutadas, 'mostrar_confirmacion')) return 'confirmacion'
  if (hasAction(state.accionesEjecutadas, 'ofrecer_promos')) return 'promos'
  if (state.enCapturaSilenciosa) {
    return state.ofiInter ? 'captura_inter' : 'captura'
  }
  if (state.turnCount === 0) return 'nuevo'
  return 'conversacion'
}
