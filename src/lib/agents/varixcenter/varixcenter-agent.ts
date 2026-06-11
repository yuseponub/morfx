/**
 * Varixcenter Appointment Agent — Main Agent Pipeline
 *
 * Clonado en ESTRUCTURA de src/lib/agents/godentist/godentist-agent.ts.
 * Diferencias clave (write-path NUEVO — godentist NO escribe):
 *   - Availability vía getVarixAvailability (domain varix-clinic), NO robot HTTP, sin sede.
 *   - agendar_cita ESCRIBE la cita real vía bookVarixAppointment (patients + appointments),
 *     construyendo fechaHoraInicio/Fin con parseSlotToISO (offset literal -05:00 — Regla 2 / Pitfall 6).
 *   - slot_taken -> re-consulta availability y degrada a mostrar_disponibilidad (fail-open).
 *   - booking error / throw -> fail-open a handoff (NUNCA crashea — Pitfall 8 / Threat T-varix-08).
 *   - Observability con agent:'varixcenter' + PII redaction (cédula/teléfono últimos 4 — T-varix-06).
 *
 * Two-track architecture:
 * C2: Comprehension (Claude Haiku)
 * C3: State Merge + StateChanges
 * C5: Compute Gates
 * Guards: R0 (low confidence + otro), R1 (escape intents)
 * Sales Track: WHAT TO DO (pure state machine)
 * Response Track: WHAT TO SAY (template engine)
 */

import { comprehend } from './comprehension'
import { mergeAnalysis, computeGates, serializeState, deserializeState, hasAction } from './state'
import { resolveSalesTrack } from './sales-track'
import { resolveResponseTrack } from './response-track'
import { checkGuards } from './guards'
import { derivePhase } from './phase'
import { SCHEDULE_APPOINTMENT_ACTIONS } from './constants'
import { getVarixAvailability, parseSlotToISO } from '@/lib/domain/varix-clinic/availability'
import { bookVarixAppointment } from '@/lib/domain/varix-clinic/booking'
import { getCollector } from '@/lib/observability'
import type { AgentState, V3AgentInput, V3AgentOutput, TimerSignal, TipoAccion } from './types'
import type { StateChanges } from './transitions'

// ============================================================================
// PII Redaction (Threat T-varix-06 — patrón crm-mutation-tools: últimos 4 dígitos)
// ============================================================================

/** Devuelve solo los últimos 4 dígitos enmascarados (o '****' si no aplica). */
function redactTail(value: string | null | undefined): string {
  if (!value) return '****'
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 4) return `****`
  return `***${digits.slice(-4)}`
}

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process a customer message through the Varixcenter pipeline.
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

  const state = deserializeState(
    input.datosCapturados,
    input.intentsVistos,
    input.templatesEnviados,
    input.accionesEjecutadas ?? [],
  )

  const phase = derivePhase(state.accionesEjecutadas)
  const gates = computeGates(state)

  const salesResult = resolveSalesTrack({
    phase,
    state,
    gates,
    event: { type: 'timer_expired', level: systemEvent.level },
  })

  getCollector()?.recordEvent('pipeline_decision', 'system_event_routed', {
    agent: 'varixcenter',
    eventType: 'timer_expired',
    level: systemEvent.level,
    action: salesResult.accion ?? 'none',
    reason: salesResult.reason,
  })

  if (salesResult.timerSignal) {
    timerSignals.push(salesResult.timerSignal)
  }

  const responseResult = await resolveResponseTrack({
    salesAction: salesResult.accion,
    state,
    workspaceId: input.workspaceId,
  })

  if (salesResult.accion && salesResult.accion !== 'silence') {
    state.accionesEjecutadas.push({
      tipo: salesResult.accion,
      turno: state.turnCount,
      origen: 'timer',
    })
  }

  for (const tid of responseResult.templateIdsSent) {
    if (!state.templatesMostrados.includes(tid)) {
      state.templatesMostrados.push(tid)
    }
  }

  const isScheduleAppointment = !!salesResult.accion
    && SCHEDULE_APPOINTMENT_ACTIONS.has(salesResult.accion)

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
    totalTokens: 0,
    shouldScheduleAppointment: isScheduleAppointment,
    appointmentData: isScheduleAppointment
      ? { datosCapturados: serialized.datosCapturados }
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
  }
}

// ============================================================================
// User Message Path (real comprehension, mergeAnalysis, guards)
// ============================================================================

async function processUserMessage(input: V3AgentInput): Promise<V3AgentOutput> {
  const timerSignals: TimerSignal[] = []

  try {
    const state = deserializeState(
      input.datosCapturados,
      input.intentsVistos,
      input.templatesEnviados,
      input.accionesEjecutadas ?? [],
    )

    // C2: Comprehension (always real — user message)
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

    // C3: State Merge
    const { state: mergedState, changes: stateChanges } = mergeAnalysis(state, analysis)
    const changes: StateChanges = {
      ...stateChanges,
      filled: stateChanges.newFields.length,
    }

    // C5: Compute Gates
    const gates = computeGates(mergedState)

    // GUARDS (R0, R1)
    const guardResult = checkGuards(analysis)
    if (guardResult.blocked) {
      getCollector()?.recordEvent('guard', 'blocked', {
        agent: 'varixcenter',
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

    getCollector()?.recordEvent('guard', 'passed', {
      agent: 'varixcenter',
      intent: analysis.intent.primary,
      confidence: analysis.intent.confidence,
    })

    // ENGLISH DETECTION — short-circuit after guards
    if (analysis.classification.idioma === 'en') {
      getCollector()?.recordEvent('pipeline_decision', 'english_detected', {
        agent: 'varixcenter',
        intent: analysis.intent.primary,
      })
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

    getCollector()?.recordEvent('pipeline_decision', 'sales_track_result', {
      agent: 'varixcenter',
      intent: analysis.intent.primary,
      action: salesResult.accion ?? 'none',
      reason: salesResult.reason,
      phase,
    })

    if (salesResult.timerSignal) {
      timerSignals.push(salesResult.timerSignal)
    }

    // effectiveAction puede degradarse a mostrar_disponibilidad si la cita choca (slot_taken).
    let effectiveAction: TipoAccion | undefined = salesResult.accion
    let availabilitySlots: { manana: string[]; tarde: string[] } | undefined
    let availabilityFallback = false

    // ----------------------------------------------------------------
    // AVAILABILITY LOOKUP (mostrar_disponibilidad) — fail-open, sin sede
    // ----------------------------------------------------------------
    if (effectiveAction === 'mostrar_disponibilidad' && mergedState.datos.fecha_preferida) {
      try {
        availabilitySlots = await getVarixAvailability(mergedState.datos.fecha_preferida)
        if ((availabilitySlots.manana.length + availabilitySlots.tarde.length) === 0) {
          availabilityFallback = true
        }
      } catch (err) {
        console.error('[varixcenter] Availability lookup failed (fail-open):', err)
        availabilityFallback = true
      }

      getCollector()?.recordEvent('pipeline_decision', 'availability_lookup', {
        agent: 'varixcenter',
        fecha: mergedState.datos.fecha_preferida,
        hasSlots: !!availabilitySlots,
        fallback: availabilityFallback,
        totalSlots: availabilitySlots
          ? availabilitySlots.manana.length + availabilitySlots.tarde.length
          : 0,
      })
    }

    // ----------------------------------------------------------------
    // AGENDAR_CITA WRITE-PATH (NUEVO — godentist NO escribe)
    // ----------------------------------------------------------------
    if (effectiveAction === 'agendar_cita') {
      const { fecha_preferida, horario_seleccionado, nombre, cedula, telefono } = mergedState.datos

      getCollector()?.recordEvent('pipeline_decision', 'booking_attempt', {
        agent: 'varixcenter',
        fecha: fecha_preferida,
        horario: horario_seleccionado,
        cedula: redactTail(cedula),
        telefono: redactTail(telefono),
      })

      if (!fecha_preferida || !horario_seleccionado || !nombre || !cedula || !telefono) {
        // Datos incompletos para agendar -> degradar a handoff (fail-open, NUNCA crash).
        console.error('[varixcenter] agendar_cita con datos incompletos -> handoff')
        effectiveAction = 'handoff'
      } else {
        try {
          // Construir TIMESTAMPTZ EXCLUSIVAMENTE vía parseSlotToISO (offset -05:00, Regla 2 / Pitfall 6).
          const { inicio: fechaHoraInicio, fin: fechaHoraFin } = parseSlotToISO(
            fecha_preferida,
            horario_seleccionado,
          )

          const result = await bookVarixAppointment({
            nombre,
            cedula,
            telefono,
            fechaHoraInicio,
            fechaHoraFin,
          })

          if (result.ok) {
            getCollector()?.recordEvent('pipeline_decision', 'booking_ok', {
              agent: 'varixcenter',
              cedula: redactTail(cedula),
              // NO se loggea appointmentId/patientId crudos junto a PII; solo confirmación.
            })
            // effectiveAction permanece 'agendar_cita' -> template cita_agendada.
          } else if (result.reason === 'slot_taken') {
            getCollector()?.recordEvent('pipeline_decision', 'booking_slot_taken', {
              agent: 'varixcenter',
              fecha: fecha_preferida,
            })
            // Re-consultar availability y degradar a mostrar_disponibilidad (fail-open).
            availabilitySlots = await getVarixAvailability(fecha_preferida).catch(() => ({ manana: [], tarde: [] }))
            if ((availabilitySlots.manana.length + availabilitySlots.tarde.length) === 0) {
              availabilityFallback = true
            }
            effectiveAction = 'mostrar_disponibilidad'
          } else {
            // reason === 'error' -> fail-open a handoff.
            getCollector()?.recordEvent('pipeline_decision', 'booking_error', {
              agent: 'varixcenter',
              cedula: redactTail(cedula),
            })
            effectiveAction = 'handoff'
          }
        } catch (err) {
          console.error('[varixcenter] Booking failed (fail-open):', err)
          effectiveAction = 'handoff'
        }
      }
    }

    // Check for appointment scheduling (sobre la accion EFECTIVA tras el write-path)
    const isScheduleAppointment = !!effectiveAction
      && SCHEDULE_APPOINTMENT_ACTIONS.has(effectiveAction)

    // RESPONSE TRACK — WHAT TO SAY
    const responseResult = await resolveResponseTrack({
      salesAction: effectiveAction,
      intent: analysis.intent.primary,
      secondaryIntent: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
      state: mergedState,
      workspaceId: input.workspaceId,
      idioma: analysis.classification.idioma,
      availabilitySlots,
      availabilityFallback,
    })

    getCollector()?.recordEvent('pipeline_decision', 'response_track_result', {
      agent: 'varixcenter',
      salesTemplateIntents: responseResult.salesTemplateIntents,
      infoTemplateIntents: responseResult.infoTemplateIntents,
      messageCount: responseResult.messages.length,
    })

    // Register action (SINGLE registration point) — usa la accion EFECTIVA.
    if (effectiveAction && effectiveAction !== 'silence') {
      mergedState.accionesEjecutadas.push({
        tipo: effectiveAction,
        turno: mergedState.turnCount,
        origen: 'bot',
        crmAction: effectiveAction === 'agendar_cita' ? true : undefined,
      })
    }

    for (const tid of responseResult.templateIdsSent) {
      if (!mergedState.templatesMostrados.includes(tid)) {
        mergedState.templatesMostrados.push(tid)
      }
    }

    // NATURAL SILENCE: response track produced 0 messages
    if (responseResult.messages.length === 0) {
      getCollector()?.recordEvent('pipeline_decision', 'natural_silence', {
        agent: 'varixcenter',
        intent: analysis.intent.primary,
        action: effectiveAction ?? 'none',
      })

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
          accion: effectiveAction,
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
        ? { datosCapturados: serialized.datosCapturados }
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
        accion: effectiveAction,
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
    console.error('[varixcenter] Error processing message:', errMsg)
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
