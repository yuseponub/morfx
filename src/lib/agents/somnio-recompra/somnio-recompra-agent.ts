/**
 * Somnio Recompra Agent — Main Agent Pipeline
 *
 * Two-track architecture for returning clients:
 * C2: Comprehension (Claude Haiku)
 * C3: State Merge + StateChanges
 * C5: Compute Gates
 * Guards: R0 (low confidence), R1 (escape intents)
 * Sales Track: WHAT TO DO (pure state machine)
 * Response Track: WHAT TO SAY (template engine)
 *
 * Fork of somnio-v3/somnio-v3-agent.ts — simplified:
 * - No enCapturaSilenciosa logic
 * - No auto:datos_completos event
 * - Timer signals only L3, L4, L5
 * - All imports from local ./ (no somnio-v3 dependency)
 */

import { comprehend } from './comprehension'
import { mergeAnalysis, computeGates, serializeState, deserializeState, hasAction } from './state'
import { resolveSalesTrack } from './sales-track'
import { resolveResponseTrack } from './response-track'
import { checkGuards } from './guards'
import { derivePhase } from './phase'
import { CRM_ACTIONS, CREATE_ORDER_ACTIONS } from './constants'
import { getCollector } from '@/lib/observability'
import type { AgentState, V3AgentInput, V3AgentOutput, TimerSignal, AccionRegistrada } from './types'

// ============================================================================
// CRM Context Poll (standalone: somnio-recompra-crm-reader, D-13/D-14)
// ============================================================================

/**
 * Poll session_state for the CRM context marker written by the
 * `recompra-preload-context` Inngest function (see
 * src/inngest/functions/recompra-preload-context.ts).
 *
 * Fast path: if `datosFromInput` already contains a status marker, return
 * immediately (no DB hit). This happens when the dispatch + reader completed
 * BEFORE the runner took the snapshot (likely by turn 1+).
 *
 * Poll path (Pitfall 3 mitigation): `datosFromInput` is a snapshot taken at
 * turn start by v3-production-runner; the Inngest function may have written
 * AFTER that snapshot. Poll DB every `intervalMs` up to `timeoutMs`.
 *
 * Returns:
 * - `{ crmContext, status: 'ok' }`     reader wrote non-empty text.
 * - `{ crmContext: '', status: 'empty' }`  reader returned empty text.
 * - `{ crmContext: '', status: 'error' }`  reader threw (marker written in Plan 03 catch).
 * - `{ crmContext: null, status: 'timeout' }`  poll timed out, function still running or crashed.
 *
 * D-13: timeoutMs=3000, intervalMs=500 (6 iterations max).
 * D-14: on timeout, caller proceeds without context (comprehension falls back).
 */
export async function pollCrmContext(
  sessionId: string,
  datosFromInput: Record<string, string>,
  timeoutMs = 3000,
  intervalMs = 500,
): Promise<{
  crmContext: string | null
  status: 'ok' | 'empty' | 'error' | 'timeout'
}> {
  // Fast path: status already present in input snapshot (dispatch won race before turn 1+).
  const existingStatus = datosFromInput['_v3:crm_context_status']
  if (
    existingStatus === 'ok' ||
    existingStatus === 'empty' ||
    existingStatus === 'error'
  ) {
    return {
      crmContext: datosFromInput['_v3:crm_context'] ?? null,
      status: existingStatus as 'ok' | 'empty' | 'error',
    }
  }

  // Poll path: input snapshot is stale, read DB directly (Pitfall 3).
  const { SessionManager } = await import('@/lib/agents/session-manager')
  const sm = new SessionManager()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    try {
      const state = await sm.getState(sessionId)
      const datos = (state.datos_capturados ?? {}) as Record<string, string>
      const status = datos['_v3:crm_context_status']
      if (status === 'ok' || status === 'empty' || status === 'error') {
        return {
          crmContext: datos['_v3:crm_context'] ?? null,
          status: status as 'ok' | 'empty' | 'error',
        }
      }
    } catch {
      // Swallow transient DB errors and retry — if session doesn't exist
      // (shouldn't happen — v3-production-runner just created it) we fall
      // through to timeout and comprehension proceeds without context.
    }
  }

  return { crmContext: null, status: 'timeout' }
}

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process a customer message through the recompra pipeline.
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
  systemEvent: { type: 'timer_expired'; level: 3 | 4 | 5 },
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

  getCollector()?.recordEvent('pipeline_decision', 'system_event_routed', {
    agent: 'recompra',
    eventType: 'timer_expired',
    level: systemEvent.level,
    action: salesResult.accion ?? 'none',
    reason: salesResult.reason,
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
      && !state.accionesEjecutadas.some(a => a.crmAction),
    orderData: (!!salesResult.accion && CREATE_ORDER_ACTIONS.has(salesResult.accion)
      && !state.accionesEjecutadas.some(a => a.crmAction))
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

    // ★ CRM context poll (standalone: somnio-recompra-crm-reader, D-13/D-14)
    // Waits up to 3s (500ms intervals) for the recompra-preload-context Inngest
    // function to persist `_v3:crm_context*` into session_state. On fast path
    // (marker already in the snapshot) returns immediately without a DB hit.
    if (input.sessionId) {
      const fastPathHit = input.datosCapturados['_v3:crm_context_status'] !== undefined
      const { crmContext, status } = await pollCrmContext(
        input.sessionId,
        input.datosCapturados,
      )

      if (status === 'ok' && crmContext) {
        // Merge into input.datosCapturados so comprehension-prompt (Plan 06) picks it up.
        input.datosCapturados['_v3:crm_context'] = crmContext
        input.datosCapturados['_v3:crm_context_status'] = 'ok'

        // Emit `crm_context_used` only when we actually waited (not fast-path).
        if (!fastPathHit) {
          getCollector()?.recordEvent('pipeline_decision', 'crm_context_used', {
            agent: 'somnio-recompra-v1',
            sessionId: input.sessionId,
            contextLength: crmContext.length,
          })
        }
      } else if (status === 'timeout' || status === 'error' || status === 'empty') {
        // Emit `crm_context_missing_after_wait` only when we actually waited (not fast-path).
        if (!fastPathHit) {
          getCollector()?.recordEvent('pipeline_decision', 'crm_context_missing_after_wait', {
            agent: 'somnio-recompra-v1',
            sessionId: input.sessionId,
            status,
          })
        }
      }
    }

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
      getCollector()?.recordEvent('guard', 'blocked', {
        agent: 'recompra',
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

    getCollector()?.recordEvent('guard', 'passed', {
      agent: 'recompra',
      intent: analysis.intent.primary,
      confidence: analysis.intent.confidence,
    })

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

    getCollector()?.recordEvent('pipeline_decision', 'sales_track_result', {
      agent: 'recompra',
      intent: analysis.intent.primary,
      action: salesResult.accion ?? 'none',
      reason: salesResult.reason,
      phase,
    })

    if (salesResult.timerSignal) {
      timerSignals.push(salesResult.timerSignal)
    }

    // Check for order creation (skip if CRM already touched — prevents duplicate orders)
    const hasPriorOrder = mergedState.accionesEjecutadas.some(a => a.crmAction)
    const isCreateOrder = !!salesResult.accion && CREATE_ORDER_ACTIONS.has(salesResult.accion) && !hasPriorOrder

    getCollector()?.recordEvent('pipeline_decision', 'order_decision', {
      agent: 'recompra',
      willCreateOrder: isCreateOrder,
      action: salesResult.accion ?? 'none',
      hasPriorOrder,
    })

    // RESPONSE TRACK — WHAT TO SAY (no secondarySalesAction in recompra)
    const responseResult = await resolveResponseTrack({
      salesAction: salesResult.accion,
      intent: analysis.intent.primary,
      secondaryIntent: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
      state: mergedState,
      workspaceId: input.workspaceId,
    })

    getCollector()?.recordEvent('pipeline_decision', 'response_track_result', {
      agent: 'recompra',
      salesTemplateIntents: responseResult.salesTemplateIntents,
      infoTemplateIntents: responseResult.infoTemplateIntents,
      messageCount: responseResult.messages.length,
      templateIdsSent: responseResult.templateIdsSent,
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
      getCollector()?.recordEvent('pipeline_decision', 'natural_silence', {
        agent: 'recompra',
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
    console.error('[SomnioRecompra] Error processing message:', errMsg)
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
 * Maps recompra internal state to engine-compatible mode names.
 * No enCapturaSilenciosa logic (recompra has no silent capture mode).
 */
function computeMode(state: AgentState): string {
  if (state.accionesEjecutadas.some(a => {
    return CREATE_ORDER_ACTIONS.has(a.tipo)
  })) return 'orden_creada'
  if (hasAction(state.accionesEjecutadas, 'mostrar_confirmacion')) return 'confirmacion'
  if (hasAction(state.accionesEjecutadas, 'ofrecer_promos')) return 'promos'
  if (state.turnCount === 0) return 'nuevo'
  return 'conversacion'
}
