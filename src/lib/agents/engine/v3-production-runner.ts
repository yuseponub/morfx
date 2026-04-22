/**
 * V3 Production Runner — Thin I/O Runner for Somnio Sales Agent v3
 * Quick-027: Integrar v3 a produccion - Fase 1 Foundation
 *
 * Equivalent to UnifiedEngine but for the v3 agent pipeline.
 * Uses the SAME production adapters (Storage, Timer, Messaging, Orders, Debug).
 *
 * Key differences from UnifiedEngine:
 * - No SomnioAgent instantiation — v3 uses processMessage() as pure function
 * - No block composition — v3 response-track already composes blocks
 * - No MessageClassifier — v3 uses comprehension + sales-track for silence
 * - No forceIntent — v3 uses systemEvent for timer-triggered processing
 *
 * Interruption handling (mirrors sandbox Path A / Path B):
 * - Path A (0 templates sent): discard turn, rollback intents_vistos, save pending
 *   message → next turn combines both messages into one comprehension call
 * - Path B (1+ templates sent): save only actually-sent IDs to templates_enviados,
 *   save unsent as pending_templates for next turn to send first
 */

import { getCollector } from '@/lib/observability'
import { VersionConflictError } from '../errors'
import type {
  EngineInput,
  EngineOutput,
  EngineConfig,
  EngineAdapters,
} from './types'
import type { V3AgentInput, V3AgentOutput, ProcessedMessage } from '../somnio-v3/types'

const MAX_VERSION_CONFLICT_RETRIES = 3

export class V3ProductionRunner {
  private adapters: EngineAdapters
  private config: EngineConfig

  constructor(adapters: EngineAdapters, config: EngineConfig) {
    this.adapters = adapters
    this.config = config
  }

  /**
   * Process a customer message through the v3 agent pipeline.
   *
   * This method is a thin I/O runner — it fetches data via adapters, delegates all
   * business logic to v3 processMessage(), and routes output back through adapters.
   */
  async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput> {
    try {
      // 1. Get session via storage adapter
      const session = input.sessionId
        ? await this.adapters.storage.getSession(input.sessionId)
        : await this.adapters.storage.getOrCreateSession(input.conversationId, input.contactId)

      // 1b. Set sessionId on V3 timer adapter (needs session for Inngest events)
      if ('setSessionId' in this.adapters.timer && typeof (this.adapters.timer as any).setSessionId === 'function') {
        (this.adapters.timer as any).setSessionId(session.id)
      }

      // 1c. Detect pending message from previous 0-send interruption (Path A accumulation)
      const currentDatos = session.state.datos_capturados ?? {}
      const pendingUserMessage = currentDatos['_v3:pendingUserMessage'] as string | undefined
      const effectiveMessage = pendingUserMessage
        ? `${pendingUserMessage}\n${input.message}`
        : input.message

      if (pendingUserMessage) {
        console.log(`[V3-RUNNER] Path A accumulation: combining pending="${pendingUserMessage}" + new="${input.message}"`)
      }

      // 2. Get history (production reads from DB)
      const history = input.history.length > 0
        ? input.history
        : await this.adapters.storage.getHistory(session.id)

      console.log(`[V3-RUNNER] msg="${effectiveMessage}" sessionId=${session.id} historyLen=${history.length}`)

      // 3. Build V3AgentInput from session state
      const turnNumber = input.turnNumber ?? (history.length + 1)

      // Snapshot pre-process state for potential Path A rollback
      const inputIntentsVistos = [...(session.state.intents_vistos ?? [])]
      const inputTemplatesEnviados = session.state.templates_enviados ?? []
      const inputDatosCapturados = { ...currentDatos }
      // Remove pending message from datos so pipeline doesn't see it
      delete inputDatosCapturados['_v3:pendingUserMessage']

      // Read acciones_ejecutadas: prefer dedicated column (new), fallback to _v3: key in datos_capturados
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawState = session.state as any
      const accionesEjecutadas = rawState.acciones_ejecutadas ??
        (() => {
          try {
            const raw = (session.state.datos_capturados ?? {})['_v3:accionesEjecutadas']
            return raw ? JSON.parse(raw) : []
          } catch { return [] }
        })()

      // V3 expects intentsVistos as string[], production stores IntentRecord[]
      // Extract just the intent names
      const intentsVistos: string[] = inputIntentsVistos.map(
        (r: { intent: string } | string) => typeof r === 'string' ? r : r.intent
      )

      const v3Input: V3AgentInput = {
        message: effectiveMessage,
        history,
        currentMode: session.current_mode,
        intentsVistos,
        templatesEnviados: inputTemplatesEnviados,
        datosCapturados: inputDatosCapturados,
        packSeleccionado: session.state.pack_seleccionado as string | null,
        accionesEjecutadas,
        turnNumber,
        workspaceId: this.config.workspaceId,
        sessionId: session.id,
        // systemEvent: undefined — only for timers, not user messages
      }

      // 3b. Preload data into session state for new sessions (recompra: last order datos)
      // Idempotent guard: `_v3:preloaded` marker. Previous `session.version === 0` guard
      // never fired because SessionManager.createSession inserts rows with version=1
      // (DB default is also 1), so preload silently never ran.
      const alreadyPreloaded = session.state.datos_capturados?.['_v3:preloaded'] === 'true'
      if (this.config.preloadedData && Object.keys(this.config.preloadedData).length > 0 && !alreadyPreloaded) {
        await this.adapters.storage.saveState(session.id, {
          datos_capturados: { ...this.config.preloadedData, '_v3:preloaded': 'true' },
        })
        // Also inject into current v3Input so first processMessage sees it
        Object.assign(v3Input.datosCapturados, this.config.preloadedData)
        console.log(`[V3-RUNNER] Preloaded data injected into new session: ${Object.keys(this.config.preloadedData).join(', ')}`)
      }

      // 3c. Store agent_module in session state for timer routing (read by agent-timers-v3)
      const agentModuleAlreadyStored = session.state.datos_capturados?.['_v3:agent_module'] !== undefined
      if (this.config.agentModule && this.config.agentModule !== 'somnio-v3' && !agentModuleAlreadyStored) {
        await this.adapters.storage.saveState(session.id, {
          '_v3:agent_module': this.config.agentModule,
        })
        console.log(`[V3-RUNNER] Stored _v3:agent_module=${this.config.agentModule} in session state`)
      }

      // 4. Call processMessage — route by agentModule
      let output: V3AgentOutput
      if (this.config.agentModule === 'godentist') {
        const { processMessage } = await import('../godentist/godentist-agent')
        // GoDentist uses same V3AgentInput shape minus packSeleccionado
        output = await processMessage(v3Input as any) as unknown as V3AgentOutput
      } else if (this.config.agentModule === 'somnio-recompra') {
        const { processMessage } = await import('../somnio-recompra/somnio-recompra-agent')
        output = await processMessage(v3Input as any) as unknown as V3AgentOutput
      } else {
        const { processMessage } = await import('../somnio-v3/somnio-v3-agent')
        output = await processMessage(v3Input)
      }

      getCollector()?.recordEvent('pipeline_decision', 'agent_routed', {
        agentModule: this.config.agentModule ?? 'somnio-v3',
        sessionId: session.id,
        success: output.success,
        action: output.salesTrackInfo?.accion ?? 'none',
        messageCount: output.messages.length,
        templateCount: output.templates?.length ?? 0,
      })

      // 4b. Side-effect: tag VAL on first datosCriticos completion (godentist only)
      // Quick-035 / Quick-036: feeds the metrics system (Conversation Tags to
      // Contact) which listens to tag.assigned events on contacts to count
      // valoraciones agendadas per day.
      await this.applyGodentistValTagIfNeeded(input, output, inputDatosCapturados)

      // 5. Route output to adapters
      // NOTE: State save is DEFERRED until after messaging to support Path A rollback.

      // 5f. Timer — cancel active timers (customer sent a message, always do this)
      if (this.adapters.timer.onCustomerMessage) {
        await this.adapters.timer.onCustomerMessage(session.id, input.conversationId, input.message)
      }

      // 5g. Orders — create if needed (deferred to after send decision for Path A)
      let orderResult: { success: boolean; orderId?: string; contactId?: string } | undefined

      // ================================================================
      // 5h. MESSAGING — send templates with interruption handling
      // ================================================================
      let messagesSent = 0
      let sentMessageContents: string[] = []
      const actuallySentIds: string[] = []
      let wasInterruptedWithZeroSends = false

      // 5h-pre. Load and send pending templates from previous interrupted block (Path B)
      if (this.adapters.storage.getPendingTemplates) {
        try {
          const pending = await this.adapters.storage.getPendingTemplates(session.id)
          if (pending && pending.length > 0) {
            console.log(`[V3-RUNNER] Sending ${pending.length} pending templates from interrupted block`)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pendingAsProcessed: ProcessedMessage[] = pending.map((p: any) => ({
              templateId: p.templateId,
              content: p.content,
              contentType: (p.contentType === 'template' ? 'texto' : p.contentType) as 'texto' | 'imagen',
              priority: p.priority ?? 'CORE',
              delayMs: 0,
            }))

            const pendingSendResult = await this.adapters.messaging.send({
              sessionId: session.id,
              conversationId: input.conversationId,
              messages: pendingAsProcessed.map(t => t.content),
              templates: pendingAsProcessed.map(t => ({
                id: t.templateId,
                content: t.content,
                contentType: t.contentType,
                delaySeconds: 0,
              })),
              workspaceId: this.config.workspaceId,
              contactId: input.contactId,
              phoneNumber: input.phoneNumber,
              triggerTimestamp: input.messageTimestamp,
            })

            const pendingSentIds = pendingAsProcessed
              .slice(0, pendingSendResult.messagesSent)
              .map(t => t.templateId)
              .filter((id): id is string => id != null && id.length > 0)
            actuallySentIds.push(...pendingSentIds)

            messagesSent += pendingSendResult.messagesSent
            sentMessageContents.push(
              ...pendingAsProcessed.slice(0, pendingSendResult.messagesSent).map(t => t.content)
            )

            if (pendingSendResult.interrupted) {
              const sentIdx = pendingSendResult.interruptedAtIndex ?? pendingSendResult.messagesSent
              const stillPending = pendingAsProcessed.slice(sentIdx)
              if (stillPending.length > 0 && this.adapters.storage.savePendingTemplates) {
                await this.adapters.storage.savePendingTemplates(session.id, stillPending as any)
              }
            } else if (this.adapters.storage.clearPendingTemplates) {
              await this.adapters.storage.clearPendingTemplates(session.id)
            }
          }
        } catch (pendingError) {
          console.error('[V3-RUNNER] Failed to send pending templates (fail-open):', pendingError)
          if (this.adapters.storage.clearPendingTemplates) {
            await this.adapters.storage.clearPendingTemplates(session.id)
          }
        }
      }

      // 5h-main. Send new templates from this turn's pipeline output
      if (output.templates && output.templates.length > 0) {
        let templatesToSend: ProcessedMessage[] = output.templates

        // No-repetition filter (if USE_NO_REPETITION=true)
        if (process.env.USE_NO_REPETITION === 'true') {
          try {
            const { NoRepetitionFilter } = await import('../somnio/no-repetition-filter')
            const { buildOutboundRegistry } = await import('../somnio/outbound-registry')

            const registry = await buildOutboundRegistry(
              input.conversationId,
              session.id,
              inputTemplatesEnviados,
            )

            const { generateMinifrases } = await import('../somnio/minifrase-generator')
            await generateMinifrases(registry)

            const noRepFilter = new NoRepetitionFilter(this.config.workspaceId)

            const blockForFilter = templatesToSend.map(t => ({
              templateId: t.templateId,
              content: t.content,
              contentType: t.contentType as 'texto' | 'template' | 'imagen',
              priority: t.priority,
              intent: output.intentInfo?.intent ?? 'unknown',
              orden: 0,
              isNew: true,
              delaySeconds: 0,
            }))

            const filterResult = await noRepFilter.filterBlock(
              blockForFilter,
              registry,
              inputTemplatesEnviados,
            )

            const survivingIds = new Set(filterResult.surviving.map(s => s.templateId))
            templatesToSend = templatesToSend.filter(t => survivingIds.has(t.templateId))

            if (filterResult.filtered.length > 0) {
              console.log(
                `[V3-RUNNER] No-rep filter: ${filterResult.filtered.length} filtered, ${filterResult.surviving.length} surviving`
              )
            }
          } catch (noRepError) {
            console.error('[V3-RUNNER] No-rep filter crashed, sending full block (fail-open):', noRepError)
            templatesToSend = output.templates
          }
        }

        if (templatesToSend.length > 0) {
          const sendResult = await this.adapters.messaging.send({
            sessionId: session.id,
            conversationId: input.conversationId,
            messages: templatesToSend.map(t => t.content),
            templates: templatesToSend.map(t => ({
              id: t.templateId,
              content: t.content,
              contentType: t.contentType,
              delaySeconds: 0,
            })),
            intent: output.intentInfo?.intent,
            workspaceId: this.config.workspaceId,
            contactId: input.contactId,
            phoneNumber: input.phoneNumber,
            triggerTimestamp: input.messageTimestamp,
          })

          messagesSent += sendResult.messagesSent
          sentMessageContents.push(
            ...templatesToSend.slice(0, sendResult.messagesSent).map(t => t.content)
          )

          const sentIds = templatesToSend
            .slice(0, sendResult.messagesSent)
            .map(t => t.templateId)
            .filter((id): id is string => id != null && id.length > 0)
          actuallySentIds.push(...sentIds)

          // Interruption handling
          if (sendResult.interrupted) {
            if (sendResult.messagesSent === 0) {
              // PATH A: 0 templates sent — discard turn, save pending message
              wasInterruptedWithZeroSends = true
              getCollector()?.recordEvent('pipeline_decision', 'interruption_path_a', {
                sessionId: session.id,
                pendingMessage: input.message.substring(0, 100),
              })
              console.log(`[V3-RUNNER] Path A: 0 sends, discarding turn, saving pending message`)
            } else {
              // PATH B: partial send — save unsent as pending_templates
              const sentIndex = sendResult.interruptedAtIndex ?? sendResult.messagesSent
              const unsent = templatesToSend.slice(sentIndex)
              if (unsent.length > 0 && this.adapters.storage.savePendingTemplates) {
                await this.adapters.storage.savePendingTemplates(session.id, unsent)
                console.log(`[V3-RUNNER] Path B: ${sendResult.messagesSent} sent, ${unsent.length} saved as pending`)
              }
            }
          } else {
            // No interruption — clear stale pending
            if (this.adapters.storage.clearPendingTemplates) {
              await this.adapters.storage.clearPendingTemplates(session.id)
            }
          }
        }
      } else if (output.messages.length > 0) {
        // Fallback: plain messages (no templates)
        const sendResult = await this.adapters.messaging.send({
          sessionId: session.id,
          conversationId: input.conversationId,
          messages: output.messages,
          workspaceId: this.config.workspaceId,
          contactId: input.contactId,
          phoneNumber: input.phoneNumber,
        })
        messagesSent += sendResult.messagesSent
        sentMessageContents.push(...output.messages)
      }

      // ================================================================
      // 5-post. POST-SEND: State save + turns (Path A vs Path B decision)
      // ================================================================

      if (wasInterruptedWithZeroSends) {
        // PATH A: Rollback intents_vistos, save pending message, skip turns
        // The turn is discarded — next message will combine and re-process
        await this.adapters.storage.saveState(session.id, {
          intents_vistos: inputIntentsVistos,
          datos_capturados: {
            ...inputDatosCapturados,
            '_v3:pendingUserMessage': input.message,
          },
          // Keep other fields from pipeline (pack, acciones) — harmless and avoids data loss
          pack_seleccionado: output.packSeleccionado,
          acciones_ejecutadas: output.accionesEjecutadas,
        })
        // Clear pending_templates on Path A (no partial send to resume)
        if (this.adapters.storage.clearPendingTemplates) {
          await this.adapters.storage.clearPendingTemplates(session.id)
        }
        console.log(`[V3-RUNNER] Path A: state rolled back, pending="${input.message}"`)
      } else {
        // PATH B / Normal: Save full state + turns

        // Save state (excluding templates_enviados, handled below)
        await this.adapters.storage.saveState(session.id, {
          datos_capturados: output.datosCapturados,
          intents_vistos: output.intentsVistos,
          pack_seleccionado: output.packSeleccionado,
          acciones_ejecutadas: output.accionesEjecutadas,
        })

        // Save templates_enviados with ONLY actually-sent IDs
        if (actuallySentIds.length > 0) {
          const updatedTemplatesEnviados = [...inputTemplatesEnviados, ...actuallySentIds]
          await this.adapters.storage.saveState(session.id, {
            templates_enviados: updatedTemplatesEnviados,
          })
          console.log(`[V3-RUNNER] templates_enviados: +${actuallySentIds.length} (total: ${updatedTemplatesEnviados.length})`)
        }

        getCollector()?.recordEvent('pipeline_decision', 'state_committed', {
          sessionId: session.id,
          messagesSent,
          templatesSent: actuallySentIds.length,
          newMode: output.newMode,
          orderCreated: !!orderResult?.success,
        })

        // Update mode (with optimistic locking)
        if (output.newMode && output.newMode !== session.current_mode) {
          await this.adapters.storage.updateMode(session.id, session.version, output.newMode)
        }

        // Timer signals (only on committed turns) — V3 uses emitSignals() directly
        if (output.timerSignals.length > 0 && 'emitSignals' in this.adapters.timer) {
          await (this.adapters.timer as any).emitSignals(output.timerSignals)
        }

        // User turn
        await this.adapters.storage.addTurn({
          sessionId: session.id,
          turnNumber,
          role: 'user',
          content: effectiveMessage,
          intentDetected: output.intentInfo?.intent,
          confidence: output.intentInfo?.confidence,
          tokensUsed: output.totalTokens,
        })

        // Add intent seen
        if (output.intentInfo?.intent) {
          await this.adapters.storage.addIntentSeen(session.id, output.intentInfo.intent)
        }

        // Handoff
        if (output.newMode === 'handoff') {
          await this.adapters.storage.handoff(session.id, session.version)
          if (this.adapters.storage.clearPendingTemplates) {
            await this.adapters.storage.clearPendingTemplates(session.id)
          }
        }

        // Orders (only on committed turns)
        if (output.shouldCreateOrder && output.orderData) {
          const isOfiInter = output.datosCapturados['_v3:ofiInter'] === 'true'
          const cedulaRecoge = output.datosCapturados.cedula_recoge

          console.log(`[V3-RUNNER] Creating order... isOfiInter=${isOfiInter} pack=${output.orderData.packSeleccionado}`)

          orderResult = await this.adapters.orders.createOrder({
            datosCapturados: output.orderData.datosCapturados,
            packSeleccionado: output.orderData.packSeleccionado,
            workspaceId: this.config.workspaceId,
            sessionId: session.id,
            valorOverride: output.orderData.valorOverride,
            isOfiInter,
            cedulaRecoge,
          })

          console.log(`[V3-RUNNER] Order result: success=${orderResult.success} orderId=${orderResult.orderId}`)
        }

        // Assistant turn recording (post-send)
        const assistantContent = sentMessageContents
          .filter(m => m.trim().length > 0)
          .join('\n')
        if (assistantContent.trim()) {
          try {
            await this.adapters.storage.addTurn({
              sessionId: session.id,
              turnNumber: turnNumber + 1,
              role: 'assistant',
              content: assistantContent,
            })
            console.log(`[V3-RUNNER] Assistant turn saved (${assistantContent.length} chars)`)
          } catch (turnError) {
            console.error('[V3-RUNNER] Failed to save assistant turn:', turnError)
          }
        }
      }

      // 5j. Debug adapter — always record (even on Path A, useful for diagnostics)
      this.adapters.debug.recordIntent(output.intentInfo)
      this.adapters.debug.recordTokens({
        turnNumber,
        tokensUsed: output.totalTokens,
        timestamp: new Date().toISOString(),
      })
      if (output.classificationInfo) this.adapters.debug.recordClassification(output.classificationInfo)
      if (output.salesTrackInfo) this.adapters.debug.recordOrchestration(output.salesTrackInfo)
      this.adapters.debug.recordTimerSignals(output.timerSignals)

      // 6. Return EngineOutput compatible with webhook-processor
      return {
        success: output.success,
        messages: output.messages,
        newMode: wasInterruptedWithZeroSends ? undefined : output.newMode,
        tokensUsed: output.totalTokens,
        sessionId: session.id,
        messagesSent,
        response: sentMessageContents.join('\n'),
        orderCreated: orderResult?.success,
        orderId: orderResult?.orderId,
        contactId: orderResult?.contactId ?? input.contactId,
        error: output.success ? undefined : {
          code: 'V3_AGENT_ERROR',
          message: 'V3 agent processing failed',
        },
      }
    } catch (error) {
      if (error instanceof VersionConflictError && retryCount < MAX_VERSION_CONFLICT_RETRIES) {
        console.warn(`[V3-RUNNER] Version conflict, retrying (${retryCount + 1}/${MAX_VERSION_CONFLICT_RETRIES})`)
        return this.processMessage(input, retryCount + 1)
      }

      const errorMessage = error instanceof Error
        ? `${error.message}\n${(error as Error).stack?.split('\n').slice(0, 3).join('\n')}`
        : 'Unknown error'
      console.error('[V3-RUNNER] CRASH:', errorMessage)

      return {
        success: false,
        messages: [],
        error: {
          code: 'V3_ENGINE_ERROR',
          message: errorMessage,
        },
      }
    }
  }

  /**
   * Quick-035 / Quick-036: GoDentist VAL tag side-effect.
   *
   * When the godentist agent captures all critical fields (datosCriticos —
   * nombre + telefono + sede_preferida) for the first time in a session,
   * tag the contact with 'VAL' to feed the metrics system (standalone
   * "Conversation Tags to Contact" — listens to tag.assigned on contacts to
   * count valoraciones agendadas per day).
   *
   * Decisions (see .planning/quick/035-.../035-PLAN.md + 036-PLAN.md):
   * - Injection point: runner (not agent) — keeps godentist agent pure/stateless
   * - Trigger: NEW datosCriticos completion (was incomplete before, complete now)
   *   Previous attempt (quick-035) used pedir_fecha action delta but failed due
   *   to a shared-reference mutation bug: godentist deserializeState reuses the
   *   accionesEjecutadas array and push()es to it in-place, so `previousAcciones`
   *   and `output.accionesEjecutadas` pointed to the same mutated array. Quick-036
   *   switches to datosCapturados comparison — `inputDatosCapturados` is a fresh
   *   spread copy (line 83) and `output.datosCapturados` is a fresh object from
   *   serializeState, so there is no shared-reference hazard.
   * - Critical fields hardcoded in runner to keep it agnostic from godentist
   *   internals (see godentist/constants.ts:126 CRITICAL_FIELDS — must stay in sync)
   * - Scope: ALL workspaces using agentModule === 'godentist'
   * - Idempotency: if contact already had all 3 fields before the turn,
   *   `hadCritical=true` short-circuits. Double-protected by assignTag handling
   *   23505 (already assigned) as success.
   * - Fail-open: log warn and continue if tag missing or DB error
   * - No feature flag: purely additive side-effect, zero conversational impact
   */
  private async applyGodentistValTagIfNeeded(
    input: EngineInput,
    output: V3AgentOutput,
    previousDatos: Record<string, string>,
  ): Promise<void> {
    if (this.config.agentModule !== 'godentist') return
    if (!input.contactId) return

    // Must stay in sync with src/lib/agents/godentist/constants.ts::CRITICAL_FIELDS
    const GODENTIST_CRITICAL_FIELDS = ['nombre', 'telefono', 'sede_preferida'] as const

    const hasAllCriticalFields = (datos: Record<string, string> | undefined): boolean => {
      if (!datos) return false
      return GODENTIST_CRITICAL_FIELDS.every(f => {
        const val = datos[f]
        return typeof val === 'string' && val.trim() !== ''
      })
    }

    const hadCritical = hasAllCriticalFields(previousDatos)
    const hasCritical = hasAllCriticalFields(output.datosCapturados)

    if (hadCritical || !hasCritical) return

    try {
      const { assignTag } = await import('@/lib/domain/tags')
      const result = await assignTag(
        { workspaceId: this.config.workspaceId, source: 'adapter', cascadeDepth: 0 },
        { entityType: 'contact', entityId: input.contactId, tagName: 'VAL' },
      )
      if (!result.success) {
        console.warn(
          `[V3-RUNNER][godentist] Could not assign VAL tag (fail-open): ${result.error} ` +
          `(workspace=${this.config.workspaceId}, contact=${input.contactId})`,
        )
      } else {
        console.log(
          `[V3-RUNNER][godentist] Assigned VAL tag to contact ${input.contactId} ` +
          `on datosCriticos completion (nombre+telefono+sede)`,
        )
      }
    } catch (err) {
      console.warn(
        `[V3-RUNNER][godentist] Exception applying VAL tag (fail-open):`,
        err,
      )
    }
  }
}
