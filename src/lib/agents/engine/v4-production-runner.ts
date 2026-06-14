/**
 * V4 Production Runner — WRAPPER DELGADO del core de turno v4 (somnio-v4-consolidation Plan 10, D-04).
 *
 * ⚠️ INTERRUPCIÓN: el MECANISMO de interrupción (Path A/B, dropOwnEntry, carryState, restart loop,
 * heartbeat, finally-release) YA NO vive aquí — vive en `somnio-v4/core/turn-orchestrator.ts`
 * (`runTurn`). Este archivo es el lado PRODUCCIÓN del core: implementa los `TurnCoreAdapters` con
 * los efectos de entorno reales (DB vía SessionManager, WhatsApp vía V4MessagingAdapter, Inngest
 * timers) + mapea `TurnResult` → `EngineOutput`. El contrato de paridad sigue vigente:
 * `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` (prod y sandbox corren el MISMO runTurn).
 *
 * D-04 (la dirección): el runner de producción ERA la fuente de verdad del mecanismo; el Plan 09 lo
 * extrajo verbatim al core. Este Plan 10 lo reescribe como primer consumidor → si las suites de
 * caracterización del runner siguen verdes, el core reproduce producción byte-equivalente.
 *
 * Capabilities prod implementadas como métodos del adapter (B1-B11 del Divergence Map):
 * - B1 getSeedState: fetch sesión per-iteración + extracción `_v3:` keys + carryState aplicado.
 * - B2/D-18 getLegacyPendingMessage/savePathARollback: crash-recovery `_v3:pendingUserMessage`.
 * - B3 getPendingTemplates/savePendingTemplates/clearPendingTemplates: storage adapter.
 * - B4 preloadOnce: preloadedData + `_v3:agent_module` marker (idempotente).
 * - B5 filterOutbound: NoRepetitionFilter gated `USE_NO_REPETITION_V4` + registry + minifrases.
 * - B7 commitTurn: post-send completo (saveState + ledger emit + templates_enviados + updateMode +
 *   timer signals + addTurn user/assistant + handoff).
 * - B8 recordDebug: debug adapter (recordIntent/recordTokens/recordClassification/...).
 * - B9 VersionConflictError retry (máx 3): EN EL WRAPPER alrededor del core (el core no lo conoce).
 * - B11 EngineOutput + agent_routed: mapeo del TurnResult al shape de producción + evento.
 *
 * Lo que NO se implementa: beforeAgentInvoke / onResultReady (sandbox-only — su ausencia salta esas
 * ramas del core, paridad exacta).
 *
 * Key differences from V3ProductionRunner (sin cambios vs HEAD):
 * - V4 runner SOLO atiende `somnio-sales-v4` (no godentist / recompra / pw-confirmation).
 * - VAL tag side-effect (godentist-only) eliminado — v4 no atiende godentist.
 */

import { getCollector } from '@/lib/observability'
import { VersionConflictError } from '../errors'
import type {
  EngineInput,
  EngineOutput,
  EngineConfig,
  EngineAdapters,
} from './types'
import type { V4AgentOutput, ProcessedMessage, TurnLedgerDims } from '../somnio-v4/types'

// El MECANISMO único de turno v4 (restart loop + Path A/B + heartbeat + finally) vive en el core
// (D-04 Plan 09). El runner lo CONSUME con adapters de producción (Plan 10).
import { runTurn } from '@/lib/agents/somnio-v4/core/turn-orchestrator'
import type {
  TurnCoreAdapters,
  TurnCoreInput,
  TurnResult,
  CoreSeedState,
  CommittedTurn,
} from '@/lib/agents/somnio-v4/core/types'
import type { CarryState } from '@/lib/agents/somnio-v4/core/restart-context'
import { bodyTruncate } from '@/lib/agents/shared/crm-mutation-tools/helpers'

const MAX_VERSION_CONFLICT_RETRIES = 3

/**
 * Standalone v4-observability-completeness (D-01): construye el motivo LIMPIO para el chat
 * del operador a partir de output.errorMessage (que es `errMsg :: errStack`). SIN stack
 * (Pitfall 5). Formato: `V4_AGENT_ERROR @ {stage}: {motivo}` o `V4_AGENT_ERROR: {motivo}`
 * si no hay stage. PII-safe vía bodyTruncate (~150).
 *
 * El stack vive SOLO en observabilidad (evento engine_error de Plan 02), NUNCA en el chat.
 */
export function buildCleanErrorMessage(output: V4AgentOutput): string {
  const raw = output.errorMessage ?? 'V4 agent processing failed'
  // strip stack: el errorMessage es `errMsg :: errStack` — quedarnos con errMsg (antes del ::).
  const firstSegment = raw.split(' :: ')[0]
  const reason = bodyTruncate(firstSegment, 150)
  const stage = output.errorStage
  return stage ? `V4_AGENT_ERROR @ ${stage}: ${reason}` : `V4_AGENT_ERROR: ${reason}`
}

export class V4ProductionRunner {
  private adapters: EngineAdapters
  private config: EngineConfig

  constructor(adapters: EngineAdapters, config: EngineConfig) {
    this.adapters = adapters
    this.config = config
  }

  /**
   * Process a customer message through the v4 agent pipeline.
   *
   * Wrapper delgado: threading de lock fields desde EngineInput + construcción de los
   * `TurnCoreAdapters` de producción + retry de VersionConflictError (B9) alrededor de `runTurn` +
   * mapeo del `TurnResult` neutral al `EngineOutput` (B11). El mecanismo de turno vive en el core.
   */
  async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput> {
    // ----------------------------------------------------------------
    // Input neutral del core (derivado de EngineInput — SIN tipos de WhatsApp). El THROW
    // defensivo del contrato del webhook (A1) vive ahora en el core (runTurn).
    // ----------------------------------------------------------------
    const coreInput: TurnCoreInput = {
      message: input.message,
      conversationId: input.conversationId,
      contactId: input.contactId,
      workspaceId: this.config.workspaceId,
      phoneNumber: input.phoneNumber,
      messageTimestamp: input.messageTimestamp,
      lockHandle: input.lockHandle,
      lockChannel: input.lockChannel,
      lockIdentifier: input.lockIdentifier,
      ownPendingEntryJson: input.ownPendingEntryJson,
    }

    const prodAdapters = this.buildProdAdapters(input)

    // ----------------------------------------------------------------
    // B9 — retry de VersionConflictError (máx 3) EN EL WRAPPER, alrededor del core. El core NO
    // conoce VersionConflictError (es un error de la capa de persistencia prod). El re-entry usa el
    // MISMO lockHandle: releaseLockIfOwner es owner-checked (Lua) → el release doble del finally del
    // core es un no-op safe (T-cons-14). Idéntico al comportamiento del runner viejo (:1124).
    //
    // H-01 (review): el `commitTurn` (fuente del VersionConflictError vía `storage.updateMode`
    // optimistic-lock) corre DENTRO de `loopBody()` del core; el catch del core convierte TODO lo
    // que no es LostLockError a `{ kind:'error', cause }` SIN re-lanzar. Por eso el `catch (error)`
    // de abajo NUNCA veía el VersionConflictError (era código muerto). El core deja el error original
    // en `result.cause` precisamente para esto → inspeccionamos el RESULTADO, no solo el throw.
    // Nota: el re-entry ocurre con el lock YA liberado por el finally del core (a diferencia del
    // runner viejo que retryaba bajo el mismo lock); releaseLockIfOwner owner-checked hace el doble
    // release un no-op safe, y el re-fetch de sesión en getSeedState toma la versión fresca.
    // ----------------------------------------------------------------
    let result: TurnResult
    try {
      result = await runTurn(coreInput, prodAdapters)
    } catch (error) {
      // Defensivo: throw que escape del core (no debería — el core captura todo en su try/catch).
      // El retry de VersionConflictError se maneja ABAJO inspeccionando result.cause (H-01), pero
      // conservamos esta rama por si una futura ruta re-lanza el error sin envolverlo.
      if (error instanceof VersionConflictError && retryCount < MAX_VERSION_CONFLICT_RETRIES) {
        console.warn(`[V4-RUNNER] Version conflict (thrown), retrying (${retryCount + 1}/${MAX_VERSION_CONFLICT_RETRIES})`)
        return this.processMessage(input, retryCount + 1)
      }
      const errorMessage = error instanceof Error
        ? `${error.message}\n${error.stack?.split('\n').slice(0, 3).join('\n')}`
        : 'Unknown error'
      console.error('[V4-RUNNER] CRASH (escaped core):', errorMessage)
      return {
        success: false,
        messages: [],
        error: { code: 'V4_ENGINE_ERROR', message: errorMessage },
      }
    }

    // H-01 — retry de VersionConflictError inspeccionando el RESULTADO del core. El core convierte
    // el throw de commitTurn en `kind:'error'` con `cause` = el error original; aquí lo detectamos
    // y reintentamos hasta MAX_VERSION_CONFLICT_RETRIES (restaura el retry del runner viejo :1124).
    if (
      result.kind === 'error' &&
      result.cause instanceof VersionConflictError &&
      retryCount < MAX_VERSION_CONFLICT_RETRIES
    ) {
      console.warn(`[V4-RUNNER] Version conflict, retrying (${retryCount + 1}/${MAX_VERSION_CONFLICT_RETRIES})`)
      return this.processMessage(input, retryCount + 1)
    }

    // ----------------------------------------------------------------
    // B11 — mapeo TurnResult neutral → EngineOutput (shape de producción). Divergencia intencional
    // del error prod (success:false) vs sandbox (success:true) — C5; el runner mapea su lado.
    // ----------------------------------------------------------------
    return this.mapResult(result, input)
  }

  // ==================================================================
  // Adapters de producción (B1-B11) — closures sobre this.adapters / this.config.
  // ==================================================================

  private buildProdAdapters(input: EngineInput): TurnCoreAdapters {
    const adapters = this.adapters
    const config = this.config

    // Resolución de sesión + estado-semilla per-iteración (B1). Se memoiza el agent_module write
    // (B4) y se cachea la sesión resuelta para que commitTurn/preloadOnce vean el mismo id.
    let resolvedVersion = 0
    let resolvedCurrentMode = ''
    // Timer onCustomerMessage: cancela timers activos UNA vez por invocación de processMessage
    // (el cliente envió un mensaje). Idempotente — cancelar timers una sola vez es correcto aunque
    // el restart loop itere. Se dispara en getSeedState (siempre corre ≥1 vez, antes del agente +
    // del send) para cubrir también los turnos que commitean con 0 templates (ej: handoff).
    let customerTimerCancelled = false
    // B2 (D-18): el mensaje pendiente legacy se lee en getSeedState (necesita la sesión) y se
    // expone al core vía getLegacyPendingMessage (que NO recibe la sesión).
    let legacyPendingMessage: string | undefined

    const getSeedState = async (carry?: CarryState | null): Promise<CoreSeedState> => {
      // B1: fetch sesión per-iteración (prod lee DB fresh).
      const session = input.sessionId
        ? await adapters.storage.getSession(input.sessionId)
        : await adapters.storage.getOrCreateSession(input.conversationId, input.contactId)

      resolvedVersion = session.version
      resolvedCurrentMode = session.current_mode

      // Timer cancellation (runner viejo :436) — una vez por processMessage, antes del agente.
      if (!customerTimerCancelled && adapters.timer.onCustomerMessage) {
        customerTimerCancelled = true
        await adapters.timer.onCustomerMessage(session.id, input.conversationId, input.message)
      }

      // 1b. Set sessionId on V4 timer adapter (needs session for Inngest events).
      if ('setSessionId' in adapters.timer && typeof (adapters.timer as { setSessionId?: unknown }).setSessionId === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (adapters.timer as any).setSessionId(session.id)
      }

      // B2 (D-18 crash-recovery): leer `_v3:pendingUserMessage` (lo combina el core DESPUÉS del
      // seed, orden Pitfall 7 — aquí solo se lee y se expone vía getLegacyPendingMessage).
      const currentDatos = session.state.datos_capturados ?? {}
      legacyPendingMessage = currentDatos['_v3:pendingUserMessage'] as string | undefined

      // Historia: production lee de DB si no viene en el input.
      const history = input.history.length > 0
        ? input.history
        : await adapters.storage.getHistory(session.id)

      const turnNumber = input.turnNumber ?? (history.length + 1)

      // Snapshot del estado de la sesión (sin el pending message — el pipeline no debe verlo).
      const inputDatosCapturados = { ...currentDatos }
      delete inputDatosCapturados['_v3:pendingUserMessage']

      // acciones_ejecutadas: preferir la columna dedicada; fallback al `_v3:` key legacy.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawState = session.state as any
      const sessionAccionesEjecutadas = rawState.acciones_ejecutadas ??
        (() => {
          try {
            const raw = (session.state.datos_capturados ?? {})['_v3:accionesEjecutadas']
            return raw ? JSON.parse(raw) : []
          } catch { return [] }
        })()

      // turn_ledger_dims persistidas del turno previo (default graceful para sesiones legacy).
      const sessionTurnLedgerDims: TurnLedgerDims =
        (rawState.turn_ledger_dims as TurnLedgerDims | undefined) ?? { atendido: [], crmActions: [] }

      // intents_vistos: producción almacena IntentRecord[]; v4 espera string[].
      const sessionIntentsVistos: string[] = (session.state.intents_vistos ?? []).map(
        (r: { intent: string } | string) => typeof r === 'string' ? r : r.intent,
      )

      // Seed = carryState (Path B reprocess) ?? estado derivado de la sesión (patrón del runner
      // viejo :296). El carry lo computó el core en la iteración previa desde seed/output.
      const seed = carry ?? {
        intentsVistos: sessionIntentsVistos,
        templatesEnviados: session.state.templates_enviados ?? [],
        datosCapturados: inputDatosCapturados,
        packSeleccionado: session.state.pack_seleccionado as string | null,
        accionesEjecutadas: sessionAccionesEjecutadas,
        currentMode: session.current_mode,
        turnLedgerDims: sessionTurnLedgerDims,
      }

      return {
        sessionId: session.id,
        currentMode: seed.currentMode,
        intentsVistos: seed.intentsVistos,
        templatesEnviados: seed.templatesEnviados,
        datosCapturados: seed.datosCapturados,
        packSeleccionado: seed.packSeleccionado,
        accionesEjecutadas: seed.accionesEjecutadas,
        turnLedgerDims: seed.turnLedgerDims,
        history,
        turnNumber,
        visionContext: input.visionContext,
      }
    }

    // B7 — commit del turno (post-send completo): saveState + ledger emit + templates_enviados +
    // updateMode + timer signals + addTurn user/assistant + handoff. Solo PATH B (turno
    // commiteado) — el core llama commitTurn únicamente cuando NO fue wasInterruptedWithZeroSends.
    const commitTurn = async (turn: CommittedTurn): Promise<void> => {
      const { sessionId, turnNumber, output, effectiveMessage, actuallySentIds, inputTemplatesEnviados, allSentContents, totalTokens } = turn

      // Save state (excluding templates_enviados, handled below). Persiste turn_ledger_dims
      // del turno (Plan 04 Task 1). Default vacío si el output legacy/mock las omite.
      await adapters.storage.saveState(sessionId, {
        datos_capturados: output.datosCapturados,
        intents_vistos: output.intentsVistos,
        pack_seleccionado: output.packSeleccionado,
        acciones_ejecutadas: output.accionesEjecutadas,
        turn_ledger_dims: output.turnLedgerDims ?? { atendido: [], crmActions: [] },
      })

      // Emit del ledger COMPLETO a agent_observability_events (Plan 04 Task 3). Almacén analítico
      // cross-sesión SEPARADO del blob per-sesión. Solo PATH B. Emit en el runner (que tiene el
      // collector) — commitTurn queda puro sin I/O en state.ts.
      {
        const collector = getCollector()
        const ledgerDims = output.turnLedgerDims ?? { atendido: [], crmActions: [] }
        if (collector) {
          for (const a of ledgerDims.atendido) {
            if (a.kind === 'kb_topic') {
              collector.recordEvent('pipeline_decision', 'kb_topic_registered', {
                agent: config.agentModule ?? 'somnio-v4',
                sessionId,
                topic: a.topic,
                confidence: a.confidence,
                turno: a.turno,
              })
            }
          }
          for (const ca of ledgerDims.crmActions) {
            collector.recordEvent('pipeline_decision', 'crm_action_recorded', {
              agent: config.agentModule ?? 'somnio-v4',
              sessionId,
              tool: ca.tool,
              result: ca.result,
              origen: ca.origen,
              ...(ca.code ? { code: ca.code } : {}),
            })
          }
          if (output.turnLedgerSummary) {
            collector.recordEvent('pipeline_decision', 'turn_ledger_committed', {
              agent: config.agentModule ?? 'somnio-v4',
              sessionId,
              intent: output.turnLedgerSummary.intent,
              confidence: output.turnLedgerSummary.confidence,
              modeTransition: output.turnLedgerSummary.modeTransition ?? null,
              messagesSent: output.turnLedgerSummary.messagesSent,
            })
          }
        }
      }

      // Save templates_enviados con SOLO los IDs realmente enviados.
      if (actuallySentIds.length > 0) {
        const updatedTemplatesEnviados = [...inputTemplatesEnviados, ...actuallySentIds]
        await adapters.storage.saveState(sessionId, {
          templates_enviados: updatedTemplatesEnviados,
        })
        console.log(`[V4-RUNNER] templates_enviados: +${actuallySentIds.length} (total: ${updatedTemplatesEnviados.length})`)
      }

      getCollector()?.recordEvent('pipeline_decision', 'state_committed', {
        sessionId,
        messagesSent: allSentContents.length,
        templatesSent: actuallySentIds.length,
        newMode: output.newMode,
        // D-06 / Pitfall 6: orderCreated viene de output.crmResult (el sub-loop ejecutó la mutación).
        orderCreated: output.crmResult?.success ?? false,
      })

      // Update mode (con optimistic locking).
      if (output.newMode && output.newMode !== resolvedCurrentMode) {
        await adapters.storage.updateMode(sessionId, resolvedVersion, output.newMode)
      }

      // Timer signals (solo en turnos commiteados) — V4 usa emitSignals() directo.
      if (output.timerSignals.length > 0 && 'emitSignals' in adapters.timer) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (adapters.timer as any).emitSignals(output.timerSignals)
      }

      // User turn.
      await adapters.storage.addTurn({
        sessionId,
        turnNumber,
        role: 'user',
        content: effectiveMessage,
        intentDetected: output.intentInfo?.intent,
        confidence: output.intentInfo?.confidence,
        tokensUsed: totalTokens,
      })

      // Add intent seen.
      if (output.intentInfo?.intent) {
        await adapters.storage.addIntentSeen(sessionId, output.intentInfo.intent)
      }

      // Handoff.
      // v4-handoff-soft-signal (D-04): storage.handoff() + clearPendingTemplates() REMOVIDOS.
      // En soft mode, la sesión SIGUE ACTIVA (storage.handoff apagaba la sesión vía
      // sessionManager.handoffSession → status='handed_off'). El modo SÍ se actualiza a 'handoff'
      // arriba vía updateMode (línea 350-352) — señaliza que la sesión está en consideración de
      // handoff sin apagarla irreversiblemente. El handoff agent futuro tomará la decisión dura.

      // Orders — D-06 big-bang: el bloque del orders-adapter createOrder fue ELIMINADO. El pedido
      // ya se ejecutó DENTRO del sub-loop GROUNDED (runCrmGate); el runner solo LEE output.crmResult.

      // Assistant turn recording (post-send) — full set across restart iterations.
      const assistantContent = allSentContents
        .filter(m => m.trim().length > 0)
        .join('\n')
      if (assistantContent.trim()) {
        try {
          await adapters.storage.addTurn({
            sessionId,
            turnNumber: turnNumber + 1,
            role: 'assistant',
            content: assistantContent,
          })
          console.log(`[V4-RUNNER] Assistant turn saved (${assistantContent.length} chars)`)
        } catch (turnError) {
          console.error('[V4-RUNNER] Failed to save assistant turn:', turnError)
        }
      }
    }

    // B5 — no-repetición (prod-only): filtra templates ya-enviados antes del send. Gated por
    // USE_NO_REPETITION_V4 (D-16 — flag separado v4, default OFF). rag:* siempre pasa (R4-B).
    const filterOutbound = async (
      templatesToSend: ProcessedMessage[],
      fctx: { sessionId: string; conversationId: string; intent: string; inputTemplatesEnviados: string[] },
    ): Promise<ProcessedMessage[]> => {
      if (process.env.USE_NO_REPETITION_V4 !== 'true') return templatesToSend
      const { NoRepetitionFilter } = await import('../somnio/no-repetition-filter')
      const { buildOutboundRegistry } = await import('../somnio/outbound-registry')

      const registry = await buildOutboundRegistry(
        fctx.conversationId,
        fctx.sessionId,
        fctx.inputTemplatesEnviados,
      )

      const { generateMinifrases } = await import('../somnio/minifrase-generator')
      await generateMinifrases(registry)

      const noRepFilter = new NoRepetitionFilter(config.workspaceId)

      const blockForFilter = templatesToSend.map(t => ({
        templateId: t.templateId,
        content: t.content,
        contentType: t.contentType as 'texto' | 'template' | 'imagen',
        priority: t.priority,
        intent: fctx.intent,
        orden: 0,
        isNew: true,
        delaySeconds: 0,
      }))

      const filterResult = await noRepFilter.filterBlock(
        blockForFilter,
        registry,
        fctx.inputTemplatesEnviados,
      )

      const survivingIds = new Set(filterResult.surviving.map(s => s.templateId))
      // R4-B: rag:* messages are unique generative content; never filter them out.
      const filtered = templatesToSend.filter(t => t.templateId.startsWith('rag:') || survivingIds.has(t.templateId))

      if (filterResult.filtered.length > 0) {
        console.log(
          `[V4-RUNNER] No-rep filter: ${filterResult.filtered.length} filtered, ${filterResult.surviving.length} surviving`,
        )
      }
      return filtered
    }

    // B4 — preload + agent_module marker para sesiones nuevas (idempotente).
    const preloadOnce = async (sessionId: string): Promise<void> => {
      // El estado fresco para los guards se lee de la sesión ya resuelta en getSeedState. Re-fetch
      // mínimo para no asumir staleness (idempotente vía los markers `_v3:preloaded`/`_v3:agent_module`).
      const session = await adapters.storage.getSession(sessionId)
      const alreadyPreloaded = session.state.datos_capturados?.['_v3:preloaded'] === 'true'
      const agentModuleAlreadyStored = session.state.datos_capturados?.['_v3:agent_module'] !== undefined
      const shouldWriteAgentModule = config.agentModule && config.agentModule !== 'somnio-v4' && !agentModuleAlreadyStored

      if (
        (config.preloadedData && Object.keys(config.preloadedData).length > 0 && !alreadyPreloaded) ||
        shouldWriteAgentModule
      ) {
        const merged: Record<string, string> = { ...session.state.datos_capturados }
        if (config.preloadedData && !alreadyPreloaded) {
          Object.assign(merged, config.preloadedData)
          merged['_v3:preloaded'] = 'true'
        }
        if (shouldWriteAgentModule) {
          merged['_v3:agent_module'] = config.agentModule!
        }
        await adapters.storage.saveState(sessionId, { datos_capturados: merged })
        console.log(
          `[V4-RUNNER] Preload/agent_module write: preloaded=${!alreadyPreloaded && !!config.preloadedData} agentModule=${shouldWriteAgentModule ? config.agentModule : 'skip'}`,
        )
      }
    }

    // B8 — debug adapter (prod log). Always record (incl. Path A).
    const recordDebug = (args: { output: V4AgentOutput; turnNumber: number; totalTokens: number }): void => {
      const { output, turnNumber, totalTokens } = args
      adapters.debug.recordIntent(output.intentInfo)
      adapters.debug.recordTokens({
        turnNumber,
        tokensUsed: totalTokens,
        timestamp: new Date().toISOString(),
      })
      if (output.classificationInfo) adapters.debug.recordClassification(output.classificationInfo)
      if (output.salesTrackInfo) adapters.debug.recordOrchestration(output.salesTrackInfo)
      adapters.debug.recordTimerSignals(output.timerSignals)
    }

    // B2 (D-18) — savePathARollback: persiste el mensaje pendiente + cancela timers en el edge
    // Path A 0-sends (CKPT-7.1). El próximo inbound lo re-combina vía getLegacyPendingMessage.
    const savePathARollback = async (turn: {
      sessionId: string
      message: string
      intentsVistos: string[]
      datosCapturados: Record<string, string>
      packSeleccionado: string | null
      accionesEjecutadas: unknown[]
    }): Promise<void> => {
      await adapters.storage.saveState(turn.sessionId, {
        intents_vistos: turn.intentsVistos,
        datos_capturados: {
          ...turn.datosCapturados,
          '_v3:pendingUserMessage': turn.message,
        },
        pack_seleccionado: turn.packSeleccionado,
        acciones_ejecutadas: turn.accionesEjecutadas,
      })
      console.log(`[V4-RUNNER] Path A: state rolled back, pending="${turn.message}"`)
    }

    // send — delega al messaging adapter de prod (V4MessagingAdapter hace CKPT-7.N internamente).
    const send: TurnCoreAdapters['send'] = async (block) => {
      return adapters.messaging.send({
        sessionId: block.sessionId,
        conversationId: block.conversationId,
        messages: block.messages,
        templates: block.templates,
        intent: block.intent,
        workspaceId: block.workspaceId,
        contactId: block.contactId,
        phoneNumber: block.phoneNumber,
        triggerTimestamp: block.triggerTimestamp,
      })
    }

    return {
      // OBLIGATORIOS
      send,
      getSeedState,
      // OPCIONALES prod-only
      commitTurn,
      getPendingTemplates: adapters.storage.getPendingTemplates
        ? (sessionId: string) => adapters.storage.getPendingTemplates!(sessionId)
        : undefined,
      savePendingTemplates: adapters.storage.savePendingTemplates
        ? (sessionId: string, templates: unknown[]) => adapters.storage.savePendingTemplates!(sessionId, templates)
        : undefined,
      clearPendingTemplates: adapters.storage.clearPendingTemplates
        ? (sessionId: string) => adapters.storage.clearPendingTemplates!(sessionId)
        : undefined,
      getLegacyPendingMessage: () => legacyPendingMessage,
      savePathARollback,
      filterOutbound,
      preloadOnce,
      recordDebug,
      // sandbox-only (beforeAgentInvoke / onResultReady) — NO implementados (prod no los necesita).
    }
  }

  // ==================================================================
  // B11 — mapeo TurnResult neutral → EngineOutput (shape de producción).
  // ==================================================================

  private mapResult(result: TurnResult, input: EngineInput): EngineOutput {
    if (result.kind === 'zombie_exit') {
      // D-15 zombie defense: el send-adapter detectó que esta lambda ya no posee el lock.
      return {
        success: false,
        messages: [],
        error: {
          code: 'V4_ZOMBIE_LAMBDA_EXIT',
          message: result.message,
        },
      }
    }

    if (result.kind === 'error') {
      // Contrato prod C5: error → success:false (divergencia intencional vs sandbox success:true).
      return {
        success: false,
        messages: [],
        error: {
          code: 'V4_ENGINE_ERROR',
          message: result.message,
        },
      }
    }

    // kind === 'completed'
    // B11 — el evento `agent_routed` lo emite el CORE dentro del loop (post-agent-invoke), NO el
    // wrapper: emitirlo aquí de nuevo sería un doble-emit (regresión de observabilidad). El runner
    // viejo lo emitía una sola vez por invocación del agente; el core conserva esa cardinalidad.
    const output: V4AgentOutput = result.output

    // M-01 (review): en el early-return de CKPT-6b Path B con pending vacío, `output` es el de msg1
    // DESCARTADO (no enviado ni commiteado — solo se enviaron los pending-templates del turno previo).
    // El runner viejo retornaba `{ success:true, messages:[] }` SIN newMode/orderCreated. Suprimir
    // esos campos del output descartado evita que webhook-processor:1053 ejecute un handoff fantasma
    // de un turno que el sistema decidió no persistir.
    const outputDiscarded = result.outputDiscarded === true
    // newMode también se suprime en el edge Path A 0-sends (wasInterruptedWithZeroSends, D-18).
    const suppressTurnEffects = outputDiscarded || result.wasInterruptedWithZeroSends

    // v4-handoff-soft-signal (D-03 + D-04): derive the D-03 gate from the handoff reason string.
    // Called only when output.newMode === 'handoff' && !suppressTurnEffects.
    type HandoffGate = NonNullable<EngineOutput['handoffSignal']>['gate']
    const deriveHandoffGate = (reason: string | undefined): HandoffGate => {
      if (!reason) return 'no_kb'
      if (reason.startsWith('low_response_confidence')) return 'low_confidence'
      if (reason.startsWith('binary_backstop_')) return 'binary_backstop'
      if (reason.startsWith('escalation_trigger_match:')) return 'escalation_trigger'
      if (reason.startsWith('nunca_decir_violation:')) return 'nunca_decir'
      if (reason.startsWith('imagen ') || reason.startsWith('imagen_')) return 'vision'
      if (reason.startsWith('no_relevant_hit') || reason === 'no_relevant_hit') return 'no_kb'
      // Guard R0/R1 reasons contain strings like "asesor", "queja", "cancelar" etc.
      // They don't match any content-gap prefix → guard_r0_r1.
      return 'guard_r0_r1'
    }

    return {
      success: output.success,
      messages: outputDiscarded ? [] : output.messages,
      newMode: suppressTurnEffects ? undefined : output.newMode,
      tokensUsed: result.totalTokens,
      sessionId: result.sessionId,
      messagesSent: result.templatesSentCount,
      response: result.allSentContents.join('\n'),
      // D-06 / Pitfall 6: re-cableado del orderResult eliminado a output.crmResult.
      orderCreated: outputDiscarded ? undefined : output.crmResult?.success,
      orderId: outputDiscarded ? undefined : output.crmResult?.orderId,
      contactId: output.crmResult?.contactId ?? input.contactId,
      error: output.success ? undefined : {
        code: 'V4_AGENT_ERROR',                      // UNCHANGED — Pitfall 4 / Regla 6
        message: buildCleanErrorMessage(output),     // D-01: motivo real, limpio, SIN stack
      },
      // v4-handoff-soft-signal (D-03 + D-04): soft handoff signal for v4.
      // suppressTurnEffects covers the outputDiscarded + wasInterruptedWithZeroSends edges
      // where newMode is already suppressed — soft signal must also be absent in those cases.
      ...(output.newMode === 'handoff' && !suppressTurnEffects
        ? {
            handoffSuggested: true,
            handoffSignal: {
              reason: output.decisionInfo?.reason ?? 'unknown',
              gate: deriveHandoffGate(output.decisionInfo?.reason),
              // topic is intentionally undefined at the runner level: the runner does NOT
              // have the per-slot KB sourceTopic in scope (subLoopReason is a coarse
              // classifier 'low_confidence'|'razonamiento_libre'|null, NOT a KB topic).
              // The granular per-gate handoff_suggested events emitted in Task 3 Part D
              // carry the real topic via outcome.sourceTopic. This runner-level signal is
              // the secondary/summary signal used only for the inbox note (D-05).
              topic: undefined,
            },
          }
        : {}),
    }
  }
}
