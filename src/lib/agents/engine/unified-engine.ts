/**
 * Unified Engine — Thin I/O Runner
 * Phase 16.1: Engine Unification - Plan 04
 *
 * The engine connects input -> agent -> adapters. It contains NO business logic.
 * All Somnio-specific decisions (intents, transitions, ingest, templates, orders)
 * live in SomnioAgent. The engine only routes data through adapters.
 *
 * Flow:
 * 1. Get session via storage adapter
 * 2. Get history via storage adapter (or use provided history)
 * 3. Call SomnioAgent.processMessage()
 * 4. Route agent output to adapters (storage, timer, messaging, orders, debug)
 * 5. Build and return EngineOutput
 */

import { SomnioAgent } from '../somnio/somnio-agent'
import { isCollectingDataMode } from '../somnio/constants'
import { getCollector } from '@/lib/observability'
import { VersionConflictError } from '../errors'
import { composeBlock, type PrioritizedTemplate } from '../somnio/block-composer'
import { NoRepetitionFilter } from '../somnio/no-repetition-filter'
import { buildOutboundRegistry } from '../somnio/outbound-registry'
import { generateMinifrases } from '../somnio/minifrase-generator'
import type { ClaudeModelId } from '../types'
import type {
  EngineInput,
  EngineOutput,
  EngineConfig,
  EngineAdapters,
} from './types'

const MAX_VERSION_CONFLICT_RETRIES = 3

export class UnifiedEngine {
  private somnioAgent: SomnioAgent
  private adapters: EngineAdapters
  private config: EngineConfig

  constructor(adapters: EngineAdapters, config: EngineConfig) {
    this.adapters = adapters
    this.config = config
    this.somnioAgent = new SomnioAgent()
  }

  /**
   * Process a customer message through the unified pipeline.
   *
   * This method is a thin runner — it fetches data via adapters, delegates all
   * business logic to SomnioAgent, and routes agent output back through adapters.
   */
  async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput> {
    try {
      // 1. Get session via storage adapter
      // Production passes empty sessionId — use getOrCreateSession via conversationId
      const session = input.sessionId
        ? await this.adapters.storage.getSession(input.sessionId)
        : await this.adapters.storage.getOrCreateSession(input.conversationId, input.contactId)

      // 2. Get history (sandbox passes it in; production reads from DB)
      const history = input.history.length > 0
        ? input.history
        : await this.adapters.storage.getHistory(session.id)

      console.log(`[ENGINE] msg="${input.message}" sessionId=${session.id} historyLen=${history.length} roles=${history.map(h => h.role).join(',')}`)

      // 3. Call SomnioAgent — ALL business logic happens here
      const agentOutput = await this.somnioAgent.processMessage({
        message: input.message,
        session,
        history,
        turnNumber: input.turnNumber ?? (history.length + 1),
        forceIntent: input.forceIntent,
      })

      // 4. Route agent output to adapters

      // 4a. Storage: persist state updates
      if (agentOutput.stateUpdates.newMode && agentOutput.stateUpdates.newMode !== session.current_mode) {
        await this.adapters.storage.updateMode(
          session.id,
          session.version,
          agentOutput.stateUpdates.newMode
        )
      }

      // Only save columns that exist in session_state table
      // (ingestStatus is sandbox-only, not a DB column)
      await this.adapters.storage.saveState(session.id, {
        datos_capturados: agentOutput.stateUpdates.newDatosCapturados,
        templates_enviados: agentOutput.stateUpdates.newTemplatesEnviados,
        pack_seleccionado: agentOutput.stateUpdates.newPackSeleccionado,
      })

      // Storage: record turns (production writes to DB; sandbox is no-op)
      await this.adapters.storage.addTurn({
        sessionId: session.id,
        turnNumber: input.turnNumber ?? (history.length + 1),
        role: 'user',
        content: input.message,
        intentDetected: agentOutput.intentInfo?.intent,
        confidence: agentOutput.intentInfo?.confidence,
        tokensUsed: agentOutput.totalTokens,
      })

      // Storage: add intent to intents_vistos
      if (agentOutput.intentInfo?.intent) {
        await this.adapters.storage.addIntentSeen(session.id, agentOutput.intentInfo.intent)
      }

      // Storage: handle handoff
      if (agentOutput.stateUpdates.newMode === 'handoff') {
        await this.adapters.storage.handoff(session.id, session.version)
        // Phase 31: Clear pending templates on HANDOFF
        if (this.adapters.storage.clearPendingTemplates) {
          await this.adapters.storage.clearPendingTemplates(session.id)
        }
      }

      // 4b. Timer: emit signals
      for (const signal of agentOutput.timerSignals) {
        this.adapters.timer.signal(signal)
      }

      // Timer: lifecycle hooks (production emits Inngest events)
      // 1. Customer message → cancels pending timers
      if (this.adapters.timer.onCustomerMessage && !input.forceIntent) {
        await this.adapters.timer.onCustomerMessage(
          session.id,
          input.conversationId,
          input.message
        )
      }

      const hasIngestStart = agentOutput.timerSignals.some(s => s.type === 'start')
      const hasIngestCancel = agentOutput.timerSignals.some(s => s.type === 'cancel' && s.reason === 'ingest_complete')
      const newMode = agentOutput.stateUpdates.newMode
      const modeChanged = newMode && newMode !== session.current_mode

      // 2. Ingest cancel → all fields collected, cancel data timer
      if (hasIngestCancel && this.adapters.timer.onIngestCompleted) {
        await this.adapters.timer.onIngestCompleted(session.id, 'all_fields')
      }

      // 3. Ingest start → start data collection timer (ONLY for collecting_data modes)
      //    Skip if also cancelling (two-step cancel+start → promos via onModeTransition)
      //    Skip if mode is NOT a collecting mode (e.g., forceIntent ofrecer_promos uses onModeTransition)
      const effectiveMode = newMode || session.current_mode
      if (
        hasIngestStart &&
        !hasIngestCancel &&
        isCollectingDataMode(effectiveMode) &&
        this.adapters.timer.onIngestStarted
      ) {
        const hasPartialData = Object.keys(agentOutput.stateUpdates.newDatosCapturados).length > 0
        await this.adapters.timer.onIngestStarted(session, hasPartialData)
      }

      // 4. Mode transition → only for non-collecting modes (collecting_data is handled by ingest hooks above)
      //    This covers both: direct transition to promos AND two-step cancel+start pattern
      if (modeChanged) {
        getCollector()?.recordEvent('pipeline_decision', 'mode_transition', {
          agent: 'somnio-v1',
          sessionId: session.id,
          from: session.current_mode,
          to: newMode,
          modeChanged,
        })
      }
      if (
        this.adapters.timer.onModeTransition &&
        modeChanged &&
        !isCollectingDataMode(newMode)
      ) {
        await this.adapters.timer.onModeTransition(
          session.id,
          session.current_mode,
          newMode,
          input.conversationId
        )
      }

      // 5. Silence detected → start retake timer (Phase 30)
      if (agentOutput.silenceDetected && this.adapters.timer.onSilenceDetected) {
        getCollector()?.recordEvent('silence_timer', 'start', {
          reason: 'silence_detected',
          sessionId: session.id,
          conversationId: input.conversationId,
          intent: agentOutput.intentInfo?.intent ?? 'unknown',
        })
        await this.adapters.timer.onSilenceDetected(
          session.id,
          input.conversationId,
          input.message,
          agentOutput.intentInfo?.intent ?? 'unknown'
        )
      }

      // 4c. Orders: create order if agent signals it
      let orderResult: {
        success: boolean
        orderId?: string
        contactId?: string
        toolCalls?: unknown[]
        tokensUsed?: unknown[]
        error?: { message: string }
      } | undefined

      console.log(`[ENGINE-ORDER] shouldCreateOrder=${agentOutput.shouldCreateOrder} hasOrderData=${!!agentOutput.orderData} pack=${agentOutput.orderData?.packSeleccionado} datos=${JSON.stringify(Object.keys(agentOutput.orderData?.datosCapturados ?? {}))}`)

      getCollector()?.recordEvent('pipeline_decision', 'order_decision', {
        agent: 'somnio-v1',
        shouldCreateOrder: agentOutput.shouldCreateOrder,
        hasOrderData: !!agentOutput.orderData,
        pack: agentOutput.orderData?.packSeleccionado,
      })

      if (agentOutput.shouldCreateOrder && agentOutput.orderData) {
        const orderMode = this.config.crmModes?.find(m => m.agentId === 'order-manager')?.mode
        console.log(`[ENGINE-ORDER] Creating order... orderMode=${orderMode} datosCapturados=${JSON.stringify(agentOutput.orderData.datosCapturados)}`)

        // Determine ofi inter status from session mode or state updates
        const isOfiInter = agentOutput.stateUpdates.newMode === 'collecting_data_inter' ||
          session.current_mode === 'collecting_data_inter'
        const cedulaRecoge = agentOutput.stateUpdates.newDatosCapturados?.cedula_recoge

        orderResult = await this.adapters.orders.createOrder(
          {
            datosCapturados: agentOutput.orderData.datosCapturados,
            packSeleccionado: agentOutput.orderData.packSeleccionado,
            workspaceId: this.config.workspaceId,
            sessionId: session.id,
            valorOverride: agentOutput.orderData.valorOverride,
            isOfiInter,
            cedulaRecoge,
          },
          orderMode
        )

        console.log(`[ENGINE-ORDER] Result: success=${orderResult.success} orderId=${orderResult.orderId} contactId=${orderResult.contactId} error=${orderResult.error?.message}`)

        // Add CRM tool calls and tokens to agent output for debug
        if (orderResult.toolCalls) {
          agentOutput.tools.push(...orderResult.toolCalls)
        }
        if (orderResult.tokensUsed) {
          agentOutput.tokenDetails.push(
            ...(orderResult.tokensUsed as Array<{ model: ClaudeModelId; inputTokens: number; outputTokens: number }>)
          )
          const extraTokens = (orderResult.tokensUsed as Array<{ inputTokens: number; outputTokens: number }>)
            .reduce((sum, t) => sum + t.inputTokens + t.outputTokens, 0)
          agentOutput.totalTokens += extraTokens
        }

        // Add order result messages
        if (orderMode) {
          const modeLabel = orderMode === 'dry-run' ? 'DRY-RUN' : 'LIVE'
          if (orderResult.success) {
            agentOutput.messages.push(`[SANDBOX: CRM ${modeLabel} - Order created via order-manager]`)
          } else {
            agentOutput.messages.push(
              `[SANDBOX: CRM ${modeLabel} - Order creation failed: ${orderResult.error?.message ?? 'Unknown error'}]`
            )
          }
        } else {
          // No CRM agents enabled - show placeholder
          agentOutput.messages.push(
            `[SANDBOX: Order would be created here with pack: ${agentOutput.orderData.packSeleccionado}]`
          )
        }
      }

      // 4d. Messaging: send via block composition pipeline (Phase 31)
      let messagesSent = 0
      const hasTemplates = agentOutput.templates && agentOutput.templates.length > 0
      const useBlockComposition = hasTemplates && !input.forceIntent
      // Track which messages were actually sent for assistant turn recording
      let sentMessageContents: string[] = []

      if (useBlockComposition) {
        // ================================================================
        // PHASE 31+34: Block Composition Pipeline
        // compose block -> no-rep filter -> send -> post-send tracking
        // ================================================================
        const storageAdapter = this.adapters.storage

        // 1. Get pending templates from previous interrupted block
        const pending: PrioritizedTemplate[] = storageAdapter.getPendingTemplates
          ? await storageAdapter.getPendingTemplates(session.id) as PrioritizedTemplate[]
          : []

        // 2. Build new templates map grouped by intent
        const intent = agentOutput.orchestratorIntent ?? 'unknown'
        const newByIntent = new Map<string, PrioritizedTemplate[]>()
        const prioritizedNew: PrioritizedTemplate[] = (agentOutput.templates as Array<{
          id: string; content: string; contentType: 'texto' | 'template' | 'imagen';
          priority?: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'; orden: number
        }>).map(t => ({
          templateId: t.id,
          content: t.content,
          contentType: t.contentType,
          priority: t.priority ?? 'CORE',
          intent,
          orden: t.orden,
          isNew: true,
          delaySeconds: 0,
        }))
        newByIntent.set(intent, prioritizedNew)

        // 3. Compose block (merges new + pending per priority rules)
        // Exception: hola+x combos skip the 3-template cap (greeting + all x templates)
        const isHolaCombo = intent.startsWith('hola+')
        const composed = composeBlock(newByIntent, pending, isHolaCombo ? Infinity : undefined)

        // Debug Panel v4.0: record block composition
        this.adapters.debug.recordBlockComposition({
          newTemplates: prioritizedNew.map(t => ({ id: t.templateId, intent: t.intent, priority: t.priority })),
          pendingFromPrev: pending.map(t => ({ id: t.templateId, priority: t.priority })),
          composedBlock: [
            ...composed.block.map(t => ({ id: t.templateId, name: t.content?.substring(0, 50) ?? t.templateId, priority: t.priority, status: 'sent' as const })),
            ...composed.pending.map(t => ({ id: t.templateId, name: t.content?.substring(0, 50) ?? t.templateId, priority: t.priority, status: 'pending' as const })),
            ...composed.dropped.map(t => ({ id: t.templateId, name: t.content?.substring(0, 50) ?? t.templateId, priority: t.priority, status: 'dropped' as const })),
          ],
          overflow: { pending: composed.pending.length, dropped: composed.dropped.length },
        })

        // ================================================================
        // PHASE 34: No-Repetition Filter (between compose and send)
        // Feature flag: USE_NO_REPETITION=true to enable (disabled by default)
        // ================================================================
        const templatesEnviados = agentOutput.stateUpdates.newTemplatesEnviados
        let filteredBlock = composed.block

        if (process.env.USE_NO_REPETITION === 'true') {
          try {
            // 3a. Build outbound registry from conversation history
            const outboundRegistry = await buildOutboundRegistry(
              input.conversationId,
              session.id,
              templatesEnviados
            )

            // 3b. Generate minifrases for human/AI entries (modifies in-place)
            await generateMinifrases(outboundRegistry)

            // 3c. Filter block through 3-level no-repetition check
            const noRepFilter = new NoRepetitionFilter(this.config.workspaceId)
            const filterResult = await noRepFilter.filterBlock(
              composed.block,
              outboundRegistry,
              templatesEnviados
            )

            filteredBlock = filterResult.surviving

            if (filterResult.filtered.length > 0) {
              console.log(
                `[ENGINE] No-rep filter: ${filterResult.filtered.length} templates filtered, ${filterResult.surviving.length} surviving` +
                ` (L1=${filterResult.filtered.filter(f => f.level === 1).length}` +
                ` L2=${filterResult.filtered.filter(f => f.level === 2).length}` +
                ` L3=${filterResult.filtered.filter(f => f.level === 3).length})`
              )
            }

            // Debug Panel v4.0: record no-repetition filter result
            this.adapters.debug.recordNoRepetition({
              enabled: true,
              perTemplate: [
                ...filterResult.surviving.map(t => ({
                  templateId: t.templateId,
                  templateName: t.content?.substring(0, 50) ?? t.templateId,
                  level1: 'pass' as const,
                  level2: null as string | null,
                  level3: null as string | null,
                  result: 'sent' as const,
                })),
                ...filterResult.filtered.map(f => ({
                  templateId: f.template.templateId,
                  templateName: f.template.content?.substring(0, 50) ?? f.template.templateId,
                  level1: f.level === 1 ? 'filtered' as const : 'pass' as const,
                  level2: f.level === 2 ? ('NO_ENVIAR' as string | null) : (f.level === 3 ? ('PARCIAL' as string | null) : null),
                  level3: f.level === 3 ? ('NO_ENVIAR' as string | null) : null,
                  result: 'filtered' as const,
                  filteredAtLevel: f.level as 1 | 2 | 3,
                })),
              ],
              summary: { surviving: filterResult.surviving.length, filtered: filterResult.filtered.length },
            })
          } catch (noRepError) {
            // Fail-open: if the entire no-rep pipeline crashes, send the full block
            console.error('[ENGINE] No-rep filter crashed, sending full block (fail-open):', noRepError)
            filteredBlock = composed.block
          }
        } else {
          // Debug Panel v4.0: record no-repetition as disabled
          this.adapters.debug.recordNoRepetition({ enabled: false, perTemplate: [], summary: { surviving: 0, filtered: 0 } })
        }

        // ================================================================
        // PHASE 34: Handle empty filtered block (all templates filtered)
        // ================================================================
        if (filteredBlock.length === 0) {
          console.log(`[ENGINE] All templates filtered by no-rep — sending nothing, sessionId=${session.id}`)
          // Clear stale pending since there's nothing to send or save
          if (storageAdapter.clearPendingTemplates) {
            await storageAdapter.clearPendingTemplates(session.id)
          }
          // messagesSent stays 0, sentMessageContents stays empty
        } else {
          // 4. Convert filtered block to templates array for messaging adapter
          const blockTemplates = filteredBlock.map(t => ({
            id: t.templateId,
            content: t.content,
            contentType: t.contentType,
            delaySeconds: 0,
          }))

          // 5. Send filtered block via messaging adapter
          const sendResult = await this.adapters.messaging.send({
            sessionId: session.id,
            conversationId: input.conversationId,
            messages: filteredBlock.map(t => t.content),
            templates: blockTemplates,
            intent: agentOutput.orchestratorIntent,
            workspaceId: this.config.workspaceId,
            contactId: input.contactId,
            phoneNumber: input.phoneNumber,
            triggerTimestamp: input.messageTimestamp,
          })
          messagesSent = sendResult.messagesSent

          // Debug Panel v4.0: record pre-send check results
          this.adapters.debug.recordPreSendCheck({
            perTemplate: filteredBlock.map((_, idx) => ({
              index: idx,
              checkResult: (idx < sendResult.messagesSent) ? 'ok' as const : 'interrupted' as const,
              newMessageFound: (idx >= sendResult.messagesSent && sendResult.interrupted) ? true : undefined,
            })),
            interrupted: sendResult.interrupted ?? false,
            pendingSaved: sendResult.interrupted ? (filteredBlock.length - sendResult.messagesSent) : 0,
          })

          // Track sent content for assistant turn (only templates that were actually sent)
          sentMessageContents = filteredBlock
            .slice(0, sendResult.messagesSent)
            .map(t => t.content)

          // ================================================================
          // PHASE 34: Post-send — append actually-sent template IDs
          // This is the TWO-PHASE SAVE that fixes the over-count bug:
          // Pre-send saveState (above) saved base templates_enviados.
          // Post-send: append only IDs of templates that were actually sent.
          // ================================================================
          const sentTemplateIds = filteredBlock
            .slice(0, sendResult.messagesSent)
            .map(t => t.templateId)
            .filter((id): id is string => id != null && id.length > 0)

          if (sentTemplateIds.length > 0) {
            const updatedTemplatesEnviados = [...templatesEnviados, ...sentTemplateIds]
            await storageAdapter.saveState(session.id, {
              templates_enviados: updatedTemplatesEnviados,
            })
            console.log(`[ENGINE] Post-send: appended ${sentTemplateIds.length} sent template IDs to templates_enviados`)
          }

          // 6. Handle interruption
          if (sendResult.interrupted) {
            const sentIndex = sendResult.interruptedAtIndex ?? sendResult.messagesSent

            if (sendResult.messagesSent === 0) {
              // Interrupted before any template sent: discard all, don't save pending
              // The next Inngest invocation will process the new message fresh
              console.log(`[ENGINE] Block interrupted at index 0 — discarding all templates, sessionId=${session.id}`)
              if (storageAdapter.clearPendingTemplates) {
                await storageAdapter.clearPendingTemplates(session.id)
              }
            } else {
              // Interrupted after sending some: save unsent templates as pending
              const unsentFromBlock = filteredBlock.slice(sentIndex)
              const newPending = [...unsentFromBlock, ...composed.pending]
              if (storageAdapter.savePendingTemplates) {
                await storageAdapter.savePendingTemplates(session.id, newPending)
              }
              console.log(`[ENGINE] Block interrupted — pending saved, sessionId=${session.id} sentCount=${sendResult.messagesSent} newPendingCount=${newPending.length}`)
            }
          } else {
            // Block sent successfully — save overflow as pending for next cycle
            if (composed.pending.length > 0 && storageAdapter.savePendingTemplates) {
              await storageAdapter.savePendingTemplates(session.id, composed.pending)
            } else if (storageAdapter.clearPendingTemplates) {
              // No overflow — clear any stale pending
              await storageAdapter.clearPendingTemplates(session.id)
            }
          }
        }

        // Log dropped templates
        if (composed.dropped.length > 0) {
          console.log(`[ENGINE] OPC templates dropped: count=${composed.dropped.length} ids=${composed.dropped.map(d => d.templateId).join(',')}`)
        }
      } else if (agentOutput.messages.length > 0) {
        // ================================================================
        // No block composition (empty response, forceIntent, handoff, silence, no templates)
        // Send messages directly (existing behavior for sandbox + timer-triggered)
        // ================================================================
        const sendResult = await this.adapters.messaging.send({
          sessionId: session.id,
          conversationId: input.conversationId,
          messages: agentOutput.messages,
          templates: agentOutput.templates,
          intent: agentOutput.orchestratorIntent,
          workspaceId: this.config.workspaceId,
          contactId: input.contactId,
          phoneNumber: input.phoneNumber,
        })
        messagesSent = sendResult.messagesSent
        sentMessageContents = agentOutput.messages
      }

      // Record assistant turn so production history includes bot responses
      // (critical for intent detection context on subsequent messages)
      const assistantContent = (sentMessageContents.length > 0 ? sentMessageContents : agentOutput.messages)
        .filter(m => !m.startsWith('[SANDBOX:') && !m.startsWith('[No response'))
        .join('\n')
      if (assistantContent.trim()) {
        try {
          await this.adapters.storage.addTurn({
            sessionId: session.id,
            turnNumber: (input.turnNumber ?? (history.length + 1)) + 1,
            role: 'assistant',
            content: assistantContent,
          })
          console.log(`[ENGINE] Assistant turn saved (${assistantContent.length} chars)`)
        } catch (turnError) {
          // Non-blocking: don't crash main flow if turn recording fails
          console.error('[ENGINE] Failed to save assistant turn:', turnError)
        }
      }

      // 4e. Debug: record all info
      this.adapters.debug.recordIntent(agentOutput.intentInfo)
      this.adapters.debug.recordTools(agentOutput.tools as unknown[])
      this.adapters.debug.recordTokens({
        turnNumber: input.turnNumber ?? (history.length + 1),
        tokensUsed: agentOutput.totalTokens,
        models: agentOutput.tokenDetails,
        timestamp: new Date().toISOString(),
      })

      // Debug Panel v4.0: record agent pipeline data
      if (agentOutput.classification) {
        this.adapters.debug.recordClassification(agentOutput.classification)
      }
      if (agentOutput.ofiInter) {
        this.adapters.debug.recordOfiInter(agentOutput.ofiInter)
      }
      if (agentOutput.ingestDetails) {
        this.adapters.debug.recordIngestDetails(agentOutput.ingestDetails)
      }
      if (agentOutput.templateSelection) {
        this.adapters.debug.recordTemplateSelection(agentOutput.templateSelection)
      }
      if (agentOutput.transitionValidation) {
        this.adapters.debug.recordTransitionValidation(agentOutput.transitionValidation)
      }
      if (agentOutput.orchestration) {
        this.adapters.debug.recordOrchestration(agentOutput.orchestration)
      }
      if (agentOutput.disambiguationLog) {
        this.adapters.debug.recordDisambiguationLog(agentOutput.disambiguationLog)
      }
      // Timer signals always present (may be empty array)
      this.adapters.debug.recordTimerSignals(agentOutput.timerSignals ?? [])

      // Build new sandbox state for debug stateAfter snapshot
      // The storage adapter already has the updated state internally
      const storageAdapter = this.adapters.storage as { getState?: () => unknown }
      const newState = storageAdapter.getState ? storageAdapter.getState() : undefined

      // Apply final mode update to state snapshot (for sandbox, the state already
      // reflects saveState calls, but the mode update needs to be consistent)
      if (newState && agentOutput.stateUpdates.newMode) {
        const sandboxState = newState as { currentMode: string; intentsVistos: string[] }
        sandboxState.currentMode = agentOutput.stateUpdates.newMode
        // Ensure intentsVistos includes the current intent
        if (agentOutput.intentInfo?.intent && !sandboxState.intentsVistos.includes(agentOutput.intentInfo.intent)) {
          sandboxState.intentsVistos.push(agentOutput.intentInfo.intent)
        }
      }

      this.adapters.debug.recordState(newState)

      const debugTurn = this.adapters.debug.getDebugTurn(input.turnNumber ?? (history.length + 1))
      const timerSignal = this.adapters.timer.getLastSignal()

      // 5. Build EngineOutput
      return {
        success: agentOutput.success,
        messages: agentOutput.messages,
        newState,
        debugTurn,
        timerSignal,
        orderCreated: orderResult?.success,
        orderId: orderResult?.orderId,
        contactId: orderResult?.contactId ?? input.contactId,
        newMode: agentOutput.stateUpdates.newMode,
        tokensUsed: agentOutput.totalTokens,
        sessionId: session.id,
        messagesSent,
        response: agentOutput.messages.join('\n'),
        silenceDetected: !!agentOutput.silenceDetected,
        error: agentOutput.error,
      }
    } catch (error) {
      if (error instanceof VersionConflictError && retryCount < MAX_VERSION_CONFLICT_RETRIES) {
        console.warn(`[ENGINE] Version conflict, retrying (${retryCount + 1}/${MAX_VERSION_CONFLICT_RETRIES})`)
        return this.processMessage(input, retryCount + 1)
      }

      const errorMessage = error instanceof Error
        ? `${error.message}\n${(error as Error).stack?.split('\n').slice(0, 3).join('\n')}`
        : 'Unknown error'
      console.error('[ENGINE] CRASH:', errorMessage)

      return {
        success: false,
        messages: [],
        error: {
          code: 'ENGINE_ERROR',
          message: errorMessage,
        },
      }
    }
  }
}
