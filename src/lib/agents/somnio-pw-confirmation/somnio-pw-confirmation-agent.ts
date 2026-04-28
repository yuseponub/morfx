/**
 * Somnio Sales v3 — PW Confirmation Agent — Entry Point
 *
 * processMessage orchestrates the 11-step flow per Plan 11 §objective:
 *   1. Hydrate state from session.datos_capturados (deserializeState).
 *   2. Read CRM context (`_v3:crm_context_status`, `_v3:active_order`) preloaded
 *      by the Inngest function `pw-confirmation/preload-and-invoke` step 1
 *      (D-05 BLOQUEANTE — never polled here).
 *   3. Degradation: if `crm_context_status === 'error'` → emit fallback handoff
 *      response and return (graceful degradation per CONTEXT.md D-05).
 *   4. If state.phase === 'nuevo' (first turn after createSession) →
 *      createInitialState({activeOrder, contact:null, crmContextStatus}).
 *   5. Comprehension via Haiku (analyzeMessage).
 *   6. Guards (R0 low confidence + R1 escape intent pedir_humano). If blocked →
 *      override accion='handoff' + state.requires_human=true.
 *   7. Sales-track (resolveSalesTrack — pre-merges analysis + delegates to
 *      transitions + post-processes counters/flags in-place).
 *   8. Mutaciones CRM via crm-writer-adapter (Plan 10):
 *      - confirmar_compra        → moveOrderToConfirmado
 *      - actualizar_direccion    → updateOrderShipping
 *      - mover_a_falta_confirmar → moveOrderToFaltaConfirmar
 *      Si retorna error con `code='stage_changed_concurrently'` (D-06) →
 *      override accion='handoff' + state.requires_human=true.
 *   9. Response-track (resolveResponseTrack → templates con extraContext).
 *  10. Push accion + intent_history a state, derivePhase, persist via
 *      SessionManager.updateCapturedData(serializeState(state)).
 *  11. Return v3-compatible V3AgentOutput (the shape V3ProductionRunner expects).
 *
 * State machine PURE (D-25): the only I/O here is reading session state +
 * comprehension Haiku call + crm-writer adapter (which itself goes through
 * two-step → domain layer per Regla 3) + persisting state. NO direct DB writes.
 *
 * Pre-condition: when running via webhook → Inngest, session.datos_capturados
 * already contains `_v3:crm_context`, `_v3:crm_context_status`, `_v3:active_order`
 * (Plan 09 step 1 BLOQUEANTE wrote them). The agent reads them directly — no
 * polling, no race (this is the key difference vs recompra which polls).
 *
 * Differences vs recompra/somnio-recompra-agent.ts (the cloning template):
 *   - PW reads CRM context as authoritative (no poll): D-05 BLOQUEANTE.
 *   - PW state machine has phase + active_order + cancelacion_intent_count +
 *     requires_human (no pack, no negaciones, no L3-L5 timer signals).
 *   - PW invokes crm-writer-adapter directly for 3 mutations (no orderData out;
 *     order already exists — PW only updates / moves stage).
 *   - PW always returns shouldCreateOrder=false (D-18 — no createOrder).
 *   - PW returns timerSignals=[] always (V1 has no timers).
 */

import { createModuleLogger } from '@/lib/audit/logger'
import { getCollector } from '@/lib/observability'

import { analyzeMessage } from './comprehension'
import { checkGuards } from './guards'
import { resolveSalesTrack } from './sales-track'
import { resolveResponseTrack } from './response-track'
import {
  createInitialState,
  extractActiveOrder,
  serializeState,
  deserializeState,
  type AgentState,
  type CrmContextStatus,
} from './state'
import { derivePhase } from './phase'
import { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './constants'
import type { V3AgentInput, V3AgentOutput, TipoAccion, AccionRegistrada } from './types'
import {
  updateOrderShipping,
  moveOrderToConfirmado,
  moveOrderToFaltaConfirmar,
} from '@/lib/agents/engine-adapters/production/crm-writer-adapter'

const logger = createModuleLogger('somnio-pw-confirmation-agent')

// ============================================================================
// Helpers
// ============================================================================

/**
 * Reads CRM context markers from datosCapturados snapshot (preloaded by the
 * Inngest function `pw-confirmation/preload-and-invoke` step 1).
 *
 * No polling — D-05 is BLOQUEANTE: the dispatcher Inngest function persisted
 * these keys BEFORE invoking the agent, so they are guaranteed present when
 * processMessage runs (modulo error path which sets `_v3:crm_context_status='error'`).
 */
function readCrmContext(datosCapturados: Record<string, string>): {
  crmContextText: string
  status: CrmContextStatus
  activeOrderJson: string
} {
  const crmContextText = datosCapturados['_v3:crm_context'] ?? ''
  const rawStatus = datosCapturados['_v3:crm_context_status']
  const status: CrmContextStatus =
    rawStatus === 'ok' || rawStatus === 'empty' || rawStatus === 'error'
      ? (rawStatus as CrmContextStatus)
      : 'missing'
  const activeOrderJson = datosCapturados['_v3:active_order'] ?? '{}'
  return { crmContextText, status, activeOrderJson }
}

/**
 * Convert AgentState.acciones (TipoAccion[]) into AccionRegistrada[] for the
 * v3-style V3AgentOutput shape that V3ProductionRunner persists. Each accion
 * gets origen='bot' and `crmAction=true` for the 3 mutating actions.
 */
function toAccionesRegistradas(
  acciones: TipoAccion[],
  startTurn: number,
): AccionRegistrada[] {
  const CRM_MUTATING: ReadonlySet<TipoAccion> = new Set([
    'confirmar_compra',
    'actualizar_direccion',
    'mover_a_falta_confirmar',
  ])
  return acciones.map((tipo, i) => ({
    tipo,
    turno: startTurn + i,
    origen: 'bot',
    ...(CRM_MUTATING.has(tipo) && { crmAction: true }),
  }))
}

/**
 * Build the v3-compatible V3AgentOutput from the PW state + sales/response
 * results. The runner reads `messages[]`, `templates[]`, state fields,
 * `intentInfo`, and ignores PW-specific extensions.
 */
function buildOutput(args: {
  success: boolean
  state: AgentState
  messages: { templateId: string; content: string; contentType: 'texto' | 'imagen'; delayMs: number; priority: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL' }[]
  templateIdsSent: string[]
  intent: string
  intentConfidence: number
  intentReasoning?: string | null
  newPhase: string
  salesAccion: TipoAccion
  salesReason: string
  enterCaptura?: boolean
  totalTokens: number
}): V3AgentOutput {
  const {
    success,
    state,
    messages,
    templateIdsSent,
    intent,
    intentConfidence,
    intentReasoning,
    newPhase,
    salesAccion,
    salesReason,
    enterCaptura,
    totalTokens,
  } = args

  const messageContents = messages.map(m => m.content)
  const templates = messages.length > 0
    ? messages.map(m => ({
        templateId: m.templateId,
        content: m.content,
        contentType: m.contentType,
        delayMs: m.delayMs,
        priority: m.priority,
      }))
    : undefined

  // Map PW phase → v3-engine `newMode` so V3ProductionRunner's mode persistence
  // and handoff path (line 457-461) work without modification.
  const newMode = state.requires_human
    ? 'handoff'
    : newPhase === 'confirmed' ? 'orden_creada'
    : newPhase === 'closed' ? 'cerrado'
    : newPhase === 'capturing_data' ? 'capturing_data'
    : newPhase === 'awaiting_address' ? 'awaiting_address'
    : newPhase === 'awaiting_schedule_decision' ? 'awaiting_schedule_decision'
    : newPhase === 'waiting_decision' ? 'waiting_decision'
    : 'conversacion'

  // Re-serialize state so the runner persists it — every key with `_v3:` prefix
  // travels back into session_state.datos_capturados via storage.saveState.
  const serialized = serializeState(state)

  // intentsVistos: keep the v3-style string[] shape (the runner converts
  // back to IntentRecord[] internally). PW state.intent_history already capped to 6.
  const intentsVistos = [...state.intent_history]

  // templatesEnviados: append newly-sent template IDs to whatever the runner
  // tracks (the runner persists this and it gets re-fed on the next turn).
  // PW does NOT use templatesEnviados internally for anti-loop (Plan 07 passes []
  // to TemplateManager) — but persist for audit / cross-agent correlation.
  const templatesEnviados = templateIdsSent

  return {
    success,
    messages: messageContents,
    templates,
    newMode,
    intentsVistos,
    templatesEnviados,
    datosCapturados: serialized,
    packSeleccionado: null, // D-18: PW never uses pack
    accionesEjecutadas: toAccionesRegistradas(state.acciones, 0),
    intentInfo: {
      intent,
      confidence: intentConfidence,
      reasoning: intentReasoning ?? undefined,
      timestamp: new Date().toISOString(),
    },
    totalTokens,
    shouldCreateOrder: false, // D-18: PW never creates orders
    timerSignals: [], // V1: PW has no timer system
    salesTrackInfo: {
      accion: salesAccion,
      reason: salesReason,
      enterCaptura,
    },
    responseTrackInfo: {
      salesTemplateIntents: [],
      infoTemplateIntents: [],
      totalMessages: messages.length,
    },
    decisionInfo: {
      action: messages.length === 0 ? 'silence' : 'respond',
      reason: salesReason,
    },
    classificationInfo: {
      category: 'RESPONDIBLE',
      sentiment: 'neutral',
    },
  }
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * Process a customer message in post-purchase context (Somnio Sales v3 PW
 * Confirmation agent). 11-step flow per Plan 11 §objective.
 */
export async function processMessage(input: V3AgentInput): Promise<V3AgentOutput> {
  const sessionId = input.sessionId ?? ''
  const workspaceId = input.workspaceId
  const message = input.message
  const history = input.history ?? []
  const datosCapturados = input.datosCapturados ?? {}

  try {
    // ----------------------------------------------------------------------
    // 1. Hydrate state from session snapshot.
    // ----------------------------------------------------------------------
    let state = deserializeState(datosCapturados)

    // ----------------------------------------------------------------------
    // 2. Read CRM context preloaded by Inngest function step 1 (D-05).
    // ----------------------------------------------------------------------
    const { crmContextText, status: crmContextStatus, activeOrderJson } =
      readCrmContext(datosCapturados)

    // Update state's status (it may have been 'missing' from a stale snapshot,
    // but the runner just loaded fresh datos_capturados from DB before the call).
    state.crm_context_status = crmContextStatus

    // ----------------------------------------------------------------------
    // 3. Degradation: if reader failed (status='error') → emit fallback +
    //    handoff. We still emit a response (intent='fallback') so the
    //    customer is acknowledged; the response-track will fall through to
    //    `templates_not_found_in_catalog` empty result if `error_carga_pedido`
    //    template is not in catalog (Plan 07 emptyReason). Engine returns
    //    silent handoff in that case (per CONTEXT.md D-05 graceful policy).
    // ----------------------------------------------------------------------
    if (crmContextStatus === 'error') {
      getCollector()?.recordEvent('pipeline_decision', 'crm_context_missing_proceeding_blind', {
        agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
        sessionId,
        workspaceId,
      })

      // Initialize a degraded state with no active_order and force handoff.
      state = createInitialState({
        activeOrder: null,
        contact: null,
        crmContextStatus: 'error',
      })
      state.requires_human = true
      state.acciones.push('handoff')

      // Best-effort response-track call to emit error_carga_pedido / fallback
      // template if catalog has it. The response-track returns empty if the
      // catalog gap is real — engine silent-handoffs in that case.
      let degradedMessages: Awaited<ReturnType<typeof resolveResponseTrack>>['messages'] = []
      let degradedTemplateIds: string[] = []
      try {
        const degradedResult = await resolveResponseTrack({
          salesAction: 'handoff',
          intent: 'fallback',
          state,
          workspaceId,
        })
        degradedMessages = degradedResult.messages
        degradedTemplateIds = degradedResult.templateIdsSent
      } catch (degradeErr) {
        logger.warn(
          {
            sessionId,
            err: degradeErr instanceof Error ? degradeErr.message : String(degradeErr),
          },
          'CRM context error path: response-track call failed (silent handoff)',
        )
      }

      // Persist degraded state.
      await persistState(sessionId, state)

      return buildOutput({
        success: true,
        state,
        messages: degradedMessages,
        templateIdsSent: degradedTemplateIds,
        intent: 'fallback',
        intentConfidence: 0,
        intentReasoning: 'CRM reader returned error — degraded handoff',
        newPhase: 'handoff',
        salesAccion: 'handoff',
        salesReason: 'crm_context_error_degraded_handoff',
        enterCaptura: false,
        totalTokens: 0,
      })
    }

    // ----------------------------------------------------------------------
    // 4. Initialize state on first turn (phase='nuevo' from defaults).
    //    deserializeState defaults phase='nuevo' when no prior state exists.
    //    The Inngest function persisted active_order JSON; createInitialState
    //    will set phase='awaiting_confirmation' if status='ok' AND activeOrder
    //    parsed (D-26).
    // ----------------------------------------------------------------------
    if (state.phase === 'nuevo' || !state.active_order) {
      const activeOrder = extractActiveOrder(crmContextText, activeOrderJson)
      state = createInitialState({
        activeOrder,
        contact: null, // contact data lives inside activeOrder.customer*
        crmContextStatus: crmContextStatus === 'ok' || crmContextStatus === 'empty'
          ? crmContextStatus
          : 'missing', // 'missing' means no preload happened — degraded but not error
      })

      // Carry forward acciones / intent_history if the runner re-invoked us
      // mid-conversation (e.g. Inngest retry). Defensive — should be empty on
      // the very first turn after createSession.
      const prior = deserializeState(datosCapturados)
      if (prior.acciones.length > 0) state.acciones = [...prior.acciones]
      if (prior.intent_history.length > 0) state.intent_history = [...prior.intent_history]
      if (prior.cancelacion_intent_count > 0) {
        state.cancelacion_intent_count = prior.cancelacion_intent_count
      }
    }

    // ----------------------------------------------------------------------
    // 5. Comprehension (single Haiku call; never throws — returns fallback
    //    intent on error per Plan 05 contract).
    // ----------------------------------------------------------------------
    const analysis = await analyzeMessage({
      message,
      state,
      history,
      crmContext: crmContextText,
    })

    // ----------------------------------------------------------------------
    // 6. Guards (R0 low confidence + R1 escape intent pedir_humano).
    // ----------------------------------------------------------------------
    const guardResult = checkGuards(analysis)
    if (guardResult.blocked) {
      state.requires_human = true
      state.acciones.push('handoff')

      getCollector()?.recordEvent('pipeline_decision', 'handoff_triggered', {
        agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
        sessionId,
        reason: guardResult.reason ?? 'guard_blocked',
        intent: analysis.intent,
        confidence: analysis.confidence,
      })

      // Best-effort handoff template (typically returns empty per ACTION_TEMPLATE_MAP).
      let hoMessages: Awaited<ReturnType<typeof resolveResponseTrack>>['messages'] = []
      let hoTemplateIds: string[] = []
      try {
        const hoResult = await resolveResponseTrack({
          salesAction: 'handoff',
          intent: analysis.intent,
          state,
          workspaceId,
        })
        hoMessages = hoResult.messages
        hoTemplateIds = hoResult.templateIdsSent
      } catch (hoErr) {
        logger.warn(
          {
            sessionId,
            err: hoErr instanceof Error ? hoErr.message : String(hoErr),
          },
          'Guard handoff: response-track call failed (silent handoff)',
        )
      }

      await persistState(sessionId, state)

      return buildOutput({
        success: true,
        state,
        messages: hoMessages,
        templateIdsSent: hoTemplateIds,
        intent: analysis.intent,
        intentConfidence: analysis.confidence,
        intentReasoning: analysis.notas,
        newPhase: 'handoff',
        salesAccion: 'handoff',
        salesReason: guardResult.reason ?? 'guard_blocked',
        enterCaptura: false,
        totalTokens: 0,
      })
    }

    // ----------------------------------------------------------------------
    // 7. Sales-track (pre-merges analysis, delegates to transitions,
    //    post-mutates state.cancelacion_intent_count + requires_human flags).
    // ----------------------------------------------------------------------
    const salesResult = resolveSalesTrack({
      phase: state.phase,
      intent: analysis.intent,
      state, // mutable — sales-track updates counters / merges datos in-place
      analysis,
      lastTemplate: undefined, // D-26 — state.phase is the guard, not template_name
    })
    let accion: TipoAccion = salesResult.accion
    let salesReason = salesResult.reason

    // ----------------------------------------------------------------------
    // 8. Mutaciones CRM via crm-writer-adapter (Plan 10).
    //    Each operation propagates `stage_changed_concurrently` (D-06)
    //    verbatim — engine catches and overrides accion='handoff'.
    // ----------------------------------------------------------------------
    let mutationError: { code: string; message: string } | null = null

    if (accion === 'confirmar_compra' && state.active_order?.orderId) {
      const result = await moveOrderToConfirmado(workspaceId, state.active_order.orderId, {
        agentId: SOMNIO_PW_CONFIRMATION_AGENT_ID,
      })
      if (result.status === 'failed') mutationError = result.error
    } else if (accion === 'actualizar_direccion' && state.active_order?.orderId) {
      // Only invoke updateOrder when ALL 3 shipping fields are present in state.
      // If sales-track emitted actualizar_direccion but data is incomplete, we
      // skip the mutation (response-track still emits confirmar_direccion_post_compra
      // with whatever direccion_completa we have — defensive).
      if (state.datos.direccion && state.datos.ciudad && state.datos.departamento) {
        const result = await updateOrderShipping(
          workspaceId,
          state.active_order.orderId,
          {
            shippingAddress: state.datos.direccion,
            shippingCity: state.datos.ciudad,
            shippingDepartment: state.datos.departamento,
          },
          { agentId: SOMNIO_PW_CONFIRMATION_AGENT_ID },
        )
        if (result.status === 'failed') mutationError = result.error
      } else {
        logger.info(
          { sessionId, datos: state.datos },
          'actualizar_direccion accion emitted but shipping incomplete — skipping crm-writer call',
        )
      }
    } else if (accion === 'mover_a_falta_confirmar' && state.active_order?.orderId) {
      const result = await moveOrderToFaltaConfirmar(workspaceId, state.active_order.orderId, {
        agentId: SOMNIO_PW_CONFIRMATION_AGENT_ID,
      })
      if (result.status === 'failed') mutationError = result.error
    }

    // D-06 trigger c: any mutation failure → handoff humano (engine never
    // retries automatically, per agent-scope.md §Somnio Sales V3 PW).
    if (mutationError) {
      getCollector()?.recordEvent('pipeline_decision', 'stage_changed_concurrently_caught', {
        agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
        sessionId,
        errorCode: mutationError.code,
        originalAction: accion,
      })
      logger.warn(
        {
          sessionId,
          errorCode: mutationError.code,
          errorMessage: mutationError.message,
          originalAction: accion,
        },
        'CRM mutation failed — escalating to handoff humano (D-06 / D-21 trigger c)',
      )
      accion = 'handoff'
      salesReason = `crm_mutation_failed_${mutationError.code}`
      state.requires_human = true
    }

    // ----------------------------------------------------------------------
    // 9. Response-track — emit templates with extraContext (zone-based for
    //    confirmar_compra, direccion_completa for actualizar_direccion, etc.).
    // ----------------------------------------------------------------------
    const responseResult = await resolveResponseTrack({
      salesAction: accion,
      intent: analysis.intent,
      state,
      workspaceId,
    })

    // ----------------------------------------------------------------------
    // 10. Update state: push accion + intent (already in intent_history via
    //     mergeAnalysis), increment templatesMostrados counter, derivePhase,
    //     persist via SessionManager.updateCapturedData.
    // ----------------------------------------------------------------------
    if (accion !== 'noop') {
      state.acciones.push(accion)
    }

    // Track templates emitted per-intent (anti-loop signal for future plans).
    if (responseResult.intent_emitted) {
      const k = responseResult.intent_emitted
      state.templatesMostrados[k] = (state.templatesMostrados[k] ?? 0) + responseResult.templateIdsSent.length
    }

    const newPhase = derivePhase(state.acciones)
    state.phase = newPhase

    await persistState(sessionId, state)

    // ----------------------------------------------------------------------
    // 11. Return v3-compatible V3AgentOutput.
    // ----------------------------------------------------------------------
    getCollector()?.recordEvent('pipeline_decision', 'pw_confirmation_turn_complete', {
      agent: SOMNIO_PW_CONFIRMATION_AGENT_ID,
      sessionId,
      intent: analysis.intent,
      accion,
      newPhase,
      messageCount: responseResult.messages.length,
      requires_human: state.requires_human,
    })

    return buildOutput({
      success: true,
      state,
      messages: responseResult.messages,
      templateIdsSent: responseResult.templateIdsSent,
      intent: analysis.intent,
      intentConfidence: analysis.confidence,
      intentReasoning: analysis.notas,
      newPhase,
      salesAccion: accion,
      salesReason,
      enterCaptura: salesResult.enterCaptura,
      totalTokens: 0, // comprehension does not return token count today
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error(
      {
        sessionId,
        err: errorMsg,
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 3).join('\n') : undefined,
      },
      '[somnio-pw-confirmation] processMessage CRASH — returning silent failure',
    )

    return {
      success: false,
      messages: [],
      intentsVistos: input.intentsVistos ?? [],
      templatesEnviados: input.templatesEnviados ?? [],
      datosCapturados: input.datosCapturados ?? {},
      packSeleccionado: null,
      accionesEjecutadas: input.accionesEjecutadas ?? [],
      totalTokens: 0,
      shouldCreateOrder: false,
      timerSignals: [],
    }
  }
}

// ============================================================================
// Persistence helper (kept private — only the agent persists state)
// ============================================================================

/**
 * Persist the AgentState back to session_state.datos_capturados via
 * SessionManager.updateCapturedData (merge-safe).
 *
 * Best-effort: on persistence failure, log and continue — the runner will
 * also persist state via storage.saveState(...) using the V3AgentOutput
 * fields, so a single failure here is not fatal.
 */
async function persistState(sessionId: string, state: AgentState): Promise<void> {
  if (!sessionId) return
  try {
    const { SessionManager } = await import('@/lib/agents/session-manager')
    const sm = new SessionManager()
    await sm.updateCapturedData(sessionId, serializeState(state))
  } catch (err) {
    logger.warn(
      {
        sessionId,
        err: err instanceof Error ? err.message : String(err),
      },
      'persistState: SessionManager.updateCapturedData failed (fail-open)',
    )
  }
}
