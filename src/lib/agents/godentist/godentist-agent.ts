/**
 * GoDentist Appointment Agent — Main Agent Pipeline
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
import { SCHEDULE_APPOINTMENT_ACTIONS } from './constants'
import type { AgentState, V3AgentInput, V3AgentOutput, TimerSignal, AccionRegistrada } from './types'
import type { StateChanges } from './transitions'

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process a customer message through the GoDentist pipeline.
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
  systemEvent: { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 },
): Promise<V3AgentOutput> {
  const timerSignals: TimerSignal[] = []

  // Restore state from session
  const state = deserializeState(
    input.datosCapturados,
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
    })
  }

  // Update templatesMostrados
  for (const tid of responseResult.templateIdsSent) {
    if (!state.templatesMostrados.includes(tid)) {
      state.templatesMostrados.push(tid)
    }
  }

  // Check for appointment scheduling
  const isScheduleAppointment = !!salesResult.accion
    && SCHEDULE_APPOINTMENT_ACTIONS.has(salesResult.accion)

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
    accionesEjecutadas: serialized.accionesEjecutadas,
    // intentInfo intentionally omitted — system events have no intent
    totalTokens: 0,
    shouldScheduleAppointment: isScheduleAppointment,
    appointmentData: isScheduleAppointment
      ? {
          datosCapturados: serialized.datosCapturados,
          sedePreferida: state.datos.sede_preferida,
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
    const { state: mergedState, changes: stateChanges } = mergeAnalysis(state, analysis)

    // Bridge StateChanges from state.ts to transitions.ts format (add filled field)
    const changes: StateChanges = {
      ...stateChanges,
      filled: stateChanges.newFields.length,
    }

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
        accionesEjecutadas: serialized.accionesEjecutadas,
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        totalTokens: tokensUsed,
        shouldScheduleAppointment: false,
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

    // ENGLISH DETECTION — short-circuit after guards
    if (analysis.classification.idioma === 'en') {
      const englishResponse = await resolveResponseTrack({
        state: mergedState,
        workspaceId: input.workspaceId,
        idioma: 'en',
      })

      const serialized = serializeState(mergedState)
      return {
        success: true,
        messages: englishResponse.messages.map(m => m.content),
        templates: englishResponse.messages.length > 0 ? englishResponse.messages : undefined,
        newMode: computeMode(mergedState),
        intentsVistos: serialized.intentsVistos,
        templatesEnviados: serialized.templatesEnviados,
        datosCapturados: serialized.datosCapturados,
        accionesEjecutadas: serialized.accionesEjecutadas,
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        totalTokens: tokensUsed,
        shouldScheduleAppointment: false,
        timerSignals: [{ type: 'cancel', reason: 'english message — no followup' }],
        decisionInfo: {
          action: 'respond',
          reason: 'English message detected — short-circuit',
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
      },
      changes,
    })

    if (salesResult.timerSignal) {
      timerSignals.push(salesResult.timerSignal)
    }

    // Check for appointment scheduling
    const isScheduleAppointment = !!salesResult.accion
      && SCHEDULE_APPOINTMENT_ACTIONS.has(salesResult.accion)

    // RESPONSE TRACK — WHAT TO SAY
    const responseResult = await resolveResponseTrack({
      salesAction: salesResult.accion,
      intent: analysis.intent.primary,
      secondaryIntent: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
      state: mergedState,
      workspaceId: input.workspaceId,
      idioma: analysis.classification.idioma,
      servicioDetectado: analysis.extracted_fields.servicio_interes ?? undefined,
    })

    // Register action (SINGLE registration point)
    if (salesResult.accion && salesResult.accion !== 'silence') {
      mergedState.accionesEjecutadas.push({
        tipo: salesResult.accion,
        turno: mergedState.turnCount,
        origen: 'bot',
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
        accionesEjecutadas: serialized.accionesEjecutadas,
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        totalTokens: tokensUsed,
        shouldScheduleAppointment: false,
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
      accionesEjecutadas: serialized.accionesEjecutadas,
      intentInfo: {
        intent: analysis.intent.primary,
        confidence: analysis.intent.confidence,
        secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
        reasoning: analysis.intent.reasoning,
        timestamp: new Date().toISOString(),
      },
      totalTokens: tokensUsed,
      shouldScheduleAppointment: isScheduleAppointment,
      appointmentData: isScheduleAppointment
        ? {
            datosCapturados: serialized.datosCapturados,
            sedePreferida: mergedState.datos.sede_preferida,
          }
        : undefined,
      timerSignals,
      decisionInfo: {
        action: responseResult.messages.length === 0 ? 'silence'
          : isScheduleAppointment ? 'schedule_appointment'
          : 'respond',
        reason: salesResult.reason,
        templateIntents: [...responseResult.salesTemplateIntents, ...responseResult.infoTemplateIntents],
        gates,
      },
      salesTrackInfo: {
        accion: salesResult.accion,
        reason: salesResult.reason,
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
    console.error('[GoDentist] Error processing message:', errMsg)
    return {
      success: false,
      messages: [],
      intentsVistos: input.intentsVistos,
      templatesEnviados: input.templatesEnviados,
      datosCapturados: input.datosCapturados,
      accionesEjecutadas: input.accionesEjecutadas ?? [],
      totalTokens: 0,
      shouldScheduleAppointment: false,
      timerSignals: [],
    }
  }
}

// ============================================================================
// Mode Computation
// ============================================================================

/**
 * Compute the current mode from state (for session persistence).
 * Maps GoDentist internal state to engine-compatible mode names.
 */
function computeMode(state: AgentState): string {
  if (hasAction(state.accionesEjecutadas, 'agendar_cita')) return 'cita_agendada'
  if (hasAction(state.accionesEjecutadas, 'mostrar_confirmacion')) return 'confirmacion'
  if (hasAction(state.accionesEjecutadas, 'mostrar_disponibilidad')) return 'mostrando_disponibilidad'
  if (hasAction(state.accionesEjecutadas, 'pedir_fecha')) return 'captura_fecha'
  if (hasAction(state.accionesEjecutadas, 'pedir_datos') || hasAction(state.accionesEjecutadas, 'pedir_datos_parcial')) return 'captura'
  if (state.turnCount === 0) return 'nuevo'
  return 'conversacion'
}
