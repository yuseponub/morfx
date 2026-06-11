/**
 * turn-orchestrator.ts — el MECANISMO ÚNICO de turno v4 (D-04 somnio-v4-consolidation Plan 09).
 *
 * Extracción del while-loop del runner de producción (`engine/v4-production-runner.ts`), que es la
 * FUENTE DE VERDAD (D-04 — el lado más completo: CKPT-6a pending-templates cross-turn,
 * crash-recovery `_v3:pendingUserMessage`, no-repetición). El engine sandbox (`engine-v4.ts`) se
 * reescribe en el Plan 11 para consumir este core; el runner se reescribe en el Plan 10. Al cierre
 * de ESTE plan el orquestador compila SIN consumidores — el comportamiento del sistema no cambia.
 *
 * Motivación verbatim del usuario: "el sandbox debe ser producción con adapters falsos". Este
 * archivo ES el mecanismo que lo hace cierto por construcción: prod y sandbox corren el MISMO
 * restart loop / Path A/B / heartbeat / finally-release, parametrizado solo por `TurnCoreAdapters`.
 *
 * INVARIANTES del Divergence Map codificados aquí:
 *   - A1: lockCtx con THROW defensivo del runner (NO el null silencioso del engine).
 *   - A2: startHeartbeat fuera del loop; stop en el finally.
 *   - A3-A6: RestartContext (createRestartContext) — acumuladores cross-iteración.
 *   - A7: restart loop `while (ctx.shouldRestart)`.
 *   - A8: CKPT-0 → drain path_a en interrupt.
 *   - B1: getSeedState() per-iteración.
 *   - B2 (D-18): combine legacy DESPUÉS del seed (orden Pitfall 7).
 *   - B4: preloadOnce; C1: beforeAgentInvoke.
 *
 * SPECIFIERS (Pitfall 8): interruption-system-v2 SOLO con `@/lib/agents/interruption-system-v2/*`
 * (los vi.mock de las suites de paridad interceptan por specifier de módulo). PROHIBIDO importar
 * canales de mensajería / NDJSON / la base de datos (D-05).
 */

import { startHeartbeat, releaseLockIfOwner } from '@/lib/agents/interruption-system-v2/lock'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { getCollector } from '@/lib/observability'
import { processMessage as runAgentTurn } from '@/lib/agents/somnio-v4/somnio-v4-agent'
import type { V4AgentInput, V4AgentOutput, ProcessedMessage } from '@/lib/agents/somnio-v4/types'
// LostLockError vive en el messaging-adapter (no en interruption-system-v2) — el CKPT-7.N interno
// del send-adapter de prod lo lanza; el core lo deja burbujear al catch externo (zombie_exit OQ1).
import { LostLockError } from '@/lib/agents/engine-adapters/production/v4-messaging-adapter'
import { createRestartContext } from './restart-context'
import { drainPendingAndCombine } from './drain'
import { runCheckpointGate } from './checkpoint-gate'
import type { TurnCoreAdapters, TurnCoreInput, TurnResult, SendBlock } from './types'

/**
 * Corre UN turno completo a través del pipeline v4 (restart loop + Path A/B + heartbeat +
 * finally-release), extraído verbatim del runner de producción (D-04). Los efectos de entorno
 * (envío real vs memoria, DB vs memoria, timing real vs simulado) los inyecta `adapters`.
 *
 * Devuelve un `TurnResult` NEUTRAL (C5) — los wrappers (Plan 10/11) lo mapean a su shape.
 */
export async function runTurn(
  input: TurnCoreInput,
  adapters: TurnCoreAdapters,
): Promise<TurnResult> {
  const startMs = Date.now()

  // ============================================================
  // A1 — lockCtx con THROW defensivo (versión del RUNNER, D-04). El engine derivaba lockCtx
  // silenciosamente a null; el runner FALLA RUIDOSO si lockHandle está presente pero faltan
  // channel/identifier (violación del contrato del webhook). El core adopta el del runner.
  // ============================================================
  const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
    ? { channel: input.lockChannel, identifier: input.lockIdentifier }
    : null
  if (input.lockHandle && !lockCtx) {
    throw new Error(
      '[interruption-v2] lockHandle present but lockChannel/lockIdentifier missing — webhook contract violated',
    )
  }

  // ============================================================
  // A2 — heartbeat: startHeartbeat FUERA del loop (Pitfall 6 — no stacking); stop en el finally.
  // ============================================================
  let stopHeartbeat: (() => void) | null = null
  if (input.lockHandle) {
    stopHeartbeat = startHeartbeat(input.lockHandle)
  }

  // ============================================================
  // A3-A6 — RestartContext: struct ÚNICO de acumuladores cross-iteración (consolidado en Plan 08).
  // ownEntryUuid se parsea de input.ownPendingEntryJson (crash-recovery D-16); todos los drains
  // excluyen la entrada propia del holder por entry_uuid.
  // ============================================================
  const ctx = createRestartContext(input.ownPendingEntryJson)

  // ============================================================
  // A7 — restart loop, encapsulado en loopBody() para la estructura de cierre de Open Question 1:
  // el resultado se computa PRIMERO, luego se invoca onResultReady (C4 — el follower del sandbox
  // long-pollea sandbox-result y DEBE verlo ANTES de poder adquirir), y SOLO DESPUÉS el finally
  // libera el lock. Cualquier interrupt Path A en CKPT-0/1/2/3/4/5/6a/6b drena la pending list,
  // combina en effectiveMessage, y re-corre el turno en el MISMO lambda bajo el MISMO lock
  // (heartbeat lo mantiene vivo — A2). CKPT-7.N (send-loop) NO reinicia (Path B preservado).
  // ============================================================
  const loopBody = async (): Promise<TurnResult> => {
    while (ctx.shouldRestart) {
      ctx.shouldRestart = false

      // --- A8: CKPT-0 post-acquire (pre-todo). Nada se envió aún → solo Path A en interrupt. ---
      {
        const ck0 = await runCheckpointGate({
          ckptId: 'ckpt_0_post_acquire',
          lockHandle: input.lockHandle,
          workspaceId: input.workspaceId,
          lockChannel: lockCtx?.channel,
          lockIdentifier: lockCtx?.identifier,
        })
        if (typeof ck0 === 'object' && lockCtx) {
          // Path A interrupt en CKPT-0 — restart con effectiveMessage combinado.
          // Pitfall 7: priorMsg = effectiveMessage ?? input.message (drain ANTES del combine
          // legacy de abajo — NO reordenar). El drain consolida dropOwnEntry+readAndClearPending+
          // clearInterrupt+emit×2+combine cronológico+shouldRestart (Plan 08).
          await drainPendingAndCombine({
            ctx,
            lockCtx: { workspaceId: input.workspaceId, channel: lockCtx.channel, identifier: lockCtx.identifier },
            atStep: 'ckpt_0_post_acquire',
            priorMsg: ctx.effectiveMessage ?? input.message,
            mode: 'path_a',
          })
          continue
        }
      }

      // --- B1: getSeedState() per-iteración. Prod fetch DB fresh; sandbox input.state memoria. ---
      // ctx.carryState (Path B reprocess) se pasa al builder, que lo aplica encima del seed
      // derivado de la sesión (patrón carryState ?? sessionDerived del runner :296). El core lo
      // setea pero NO lo re-lee — el builder es quien conoce el shape (prod DB vs sandbox).
      const seed = await adapters.getSeedState(ctx.carryState)

      // ============================================================
      // B2 (D-18 crash-recovery `_v3:pendingUserMessage`) — DESPUÉS del seed (orden Pitfall 7).
      // - Por qué existe: cubre el edge de interrupt con pending-list de Redis VACÍA y 0 sends
      //   (lambda murió tras consumir el mensaje pero antes de enviar nada) — el mensaje del usuario
      //   se persiste vía savePathARollback y se re-combina en la siguiente iteración.
      // - ORDEN CRÍTICO (Pitfall 7): el drain de CKPT-0 (arriba) usa `effectiveMessage ?? input.message`
      //   ANTES de este combine. Reordenar causaría combine doble en interrupt-en-CKPT-0 con pending presente.
      // - Es funcional, NO código muerto. Borrable cuando v3 muera (D-38 / cosecha S-7).
      // R-03: en iter 1 effectiveMessage es null → fall back al legacy combine; en restart iterations
      // (effectiveMessage non-null) usa la string combinada en memoria (Pitfall 8: no DB write entre iters).
      // El legacy pending lo lee el adapter (prod implementa getLegacyPendingMessage; sandbox no → undefined).
      // ============================================================
      const legacyPendingMessage = adapters.getLegacyPendingMessage?.()
      const turnEffectiveMessage: string = ctx.effectiveMessage
        ?? (legacyPendingMessage ? `${legacyPendingMessage}\n${input.message}` : input.message)

      if (legacyPendingMessage) {
        console.log(`[V4-CORE] Path A accumulation: combining pending="${legacyPendingMessage}" + new="${input.message}"`)
      }

      // --- B4: preload + agent_module marker para sesiones nuevas (idempotente). Prod-only. ---
      await adapters.preloadOnce?.(seed.sessionId)

      // --- C1: thinking-sleep antes de invocar al agente (sandbox timing). Prod-only no-op. ---
      await adapters.beforeAgentInvoke?.(ctx.restartIteration)

      // ============================================================
      // Construir V4AgentInput desde el seed (lo que el runner arma en :310-333). El agente
      // recibe el mensaje efectivo del turno + el estado-semilla (carryState ya aplicado por el
      // adapter en getSeedState si fue un reprocess Path B).
      // ============================================================
      const v4Input: V4AgentInput = {
        message: turnEffectiveMessage,
        history: seed.history,
        currentMode: seed.currentMode,
        intentsVistos: seed.intentsVistos,
        templatesEnviados: seed.templatesEnviados,
        datosCapturados: seed.datosCapturados,
        packSeleccionado: seed.packSeleccionado,
        // seed.accionesEjecutadas es unknown[] (el core no acopla el shape); en runtime es
        // AccionRegistrada[]. Cast explícito (mismo patrón que el runner :322).
        accionesEjecutadas: seed.accionesEjecutadas as V4AgentInput['accionesEjecutadas'],
        turnLedgerDims: seed.turnLedgerDims,
        turnNumber: seed.turnNumber,
        workspaceId: input.workspaceId,
        sessionId: seed.sessionId,
        // lock fields threaded al agente — agente + sub-loop skip-guard en null.
        lockHandle: input.lockHandle ?? null,
        lockChannel: input.lockChannel ?? null,
        lockIdentifier: input.lockIdentifier ?? null,
        // Vision context del path image-respond v4 (runner viejo :332). El adapter lo resuelve en
        // getSeedState desde EngineInput.visionContext; sandbox lo arma desde input.visionContext.
        visionContext: seed.visionContext,
      }

      // ============================================================
      // d. Invocación del agente (A13 — import estático que engine-v4-lock.test.ts mockea).
      //    Acumular tokens cross-iteración en ctx (R-05 / Pitfall 2 — single source of truth).
      // ============================================================
      const output: V4AgentOutput = await runAgentTurn(v4Input)
      ctx.totalTokensAcrossRestarts += (output.totalTokens ?? 0)

      // ============================================================
      // e. Discriminator (A9): el agente/sub-loop surface un interrupt Path A vía
      //    output.errorMessage.startsWith('interrupted_at_ckpt_'). Throw si !lockCtx (imposible —
      //    el agente solo emite el discriminator bajo lock), si no drain path_a + continue.
      // ============================================================
      if (
        output.success === false &&
        typeof output.errorMessage === 'string' &&
        output.errorMessage.startsWith('interrupted_at_ckpt_')
      ) {
        if (!lockCtx) {
          throw new Error(`[V4-CORE] agent emitted ${output.errorMessage} but lockCtx is null`)
        }
        await drainPendingAndCombine({
          ctx,
          lockCtx: { workspaceId: input.workspaceId, channel: lockCtx.channel, identifier: lockCtx.identifier },
          atStep: output.errorMessage,
          priorMsg: turnEffectiveMessage,
          mode: 'path_a',
        })
        continue
      }

      getCollector()?.recordEvent('pipeline_decision', 'agent_routed', {
        agentModule: 'somnio-v4',
        sessionId: seed.sessionId,
        success: output.success,
        action: output.salesTrackInfo?.accion ?? 'none',
        messageCount: output.messages.length,
        templateCount: output.templates?.length ?? 0,
      })

      // ============================================================
      // MESSAGING — send con manejo de interrupción (extracción del runner :447-844).
      // ============================================================
      let messagesSent = 0
      const sentMessageContents: string[] = []
      const actuallySentIds: string[] = []
      let wasInterruptedWithZeroSends = false

      // --- f. CKPT-6a + envío de pending-templates de un turno previo (B3 — prod-only gate). ---
      // GATED en `if (adapters.getPendingTemplates)`: el sandbox NO lo implementa → rama saltada
      // (paridad exacta con el comportamiento actual). No es flag de entorno — es capability gate.
      if (adapters.getPendingTemplates) {
        // CKPT-6a: pending-templates pre-send. Aún nada enviado en ESTE turno → Path A en interrupt.
        const ck6a = await runCheckpointGate({
          ckptId: 'ckpt_6_pre_send_loop',
          lockHandle: input.lockHandle,
          workspaceId: input.workspaceId,
          lockChannel: lockCtx?.channel,
          lockIdentifier: lockCtx?.identifier,
          opts: { hasSentAnything: false },
          lostLockLabel: 'ckpt_6_pre_send_loop_pending_templates',
        })
        if (typeof ck6a === 'object' && lockCtx) {
          await drainPendingAndCombine({
            ctx,
            lockCtx: { workspaceId: input.workspaceId, channel: lockCtx.channel, identifier: lockCtx.identifier },
            atStep: 'ckpt_6_pre_send_loop_pending_templates',
            priorMsg: turnEffectiveMessage,
            mode: 'path_a',
            pathBEmitExtra: { templates_sent_before_abort: 0 },
          })
          continue
        }

        try {
          const pending = await adapters.getPendingTemplates(seed.sessionId)
          if (pending && pending.length > 0) {
            console.log(`[V4-CORE] Sending ${pending.length} pending templates from interrupted block`)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pendingAsProcessed: ProcessedMessage[] = pending.map((p: any) => ({
              templateId: p.templateId,
              content: p.content,
              contentType: (p.contentType === 'template' ? 'texto' : p.contentType) as 'texto' | 'imagen',
              priority: p.priority ?? 'CORE',
              delayMs: 0,
            }))

            const pendingBlock: SendBlock = {
              sessionId: seed.sessionId,
              conversationId: input.conversationId,
              messages: pendingAsProcessed.map(t => t.content),
              templates: pendingAsProcessed.map(t => ({
                id: t.templateId,
                content: t.content,
                contentType: t.contentType,
                delaySeconds: 0,
              })),
              workspaceId: input.workspaceId,
              contactId: input.contactId,
            }
            const pendingSendResult = await adapters.send(pendingBlock)

            const pendingSentIds = pendingAsProcessed
              .slice(0, pendingSendResult.messagesSent)
              .map(t => t.templateId)
              .filter((id): id is string => id != null && id.length > 0)
            actuallySentIds.push(...pendingSentIds)

            messagesSent += pendingSendResult.messagesSent
            sentMessageContents.push(
              ...pendingAsProcessed.slice(0, pendingSendResult.messagesSent).map(t => t.content),
            )

            if (pendingSendResult.interrupted) {
              const sentIdx = pendingSendResult.interruptedAtIndex ?? pendingSendResult.messagesSent
              const stillPending = pendingAsProcessed.slice(sentIdx)
              if (stillPending.length > 0 && adapters.savePendingTemplates) {
                await adapters.savePendingTemplates(seed.sessionId, stillPending)
              }
            } else if (adapters.clearPendingTemplates) {
              await adapters.clearPendingTemplates(seed.sessionId)
            }
          }
        } catch (pendingError) {
          console.error('[V4-CORE] Failed to send pending templates (fail-open):', pendingError)
          if (adapters.clearPendingTemplates) {
            await adapters.clearPendingTemplates(seed.sessionId)
          }
        }
      }

      // --- g. CKPT-6b (A10): hasSentAnything cubre ambos lados (el sandbox siempre llega con 0). ---
      {
        const ck6b = await runCheckpointGate({
          ckptId: 'ckpt_6_pre_send_loop',
          lockHandle: input.lockHandle,
          workspaceId: input.workspaceId,
          lockChannel: lockCtx?.channel,
          lockIdentifier: lockCtx?.identifier,
          opts: { hasSentAnything: actuallySentIds.length > 0 },
          lostLockLabel: 'ckpt_6_pre_send_loop_main',
        })
        if (typeof ck6b === 'object' && lockCtx) {
          const sentCount = actuallySentIds.length
          const lockArgs = { workspaceId: input.workspaceId, channel: lockCtx.channel, identifier: lockCtx.identifier }
          if (sentCount === 0) {
            // Path A — restart.
            await drainPendingAndCombine({
              ctx,
              lockCtx: lockArgs,
              atStep: 'ckpt_6_pre_send_loop_main',
              priorMsg: turnEffectiveMessage,
              mode: 'path_a',
              pathBEmitExtra: { templates_sent_before_abort: 0 },
            })
            continue
          }
          // Path B desde CKPT-6b (A11/A14 — carry desde SEED: el output de msg1 NO se envió, solo
          // los templates del turno previo). El drain setea effectiveMessage/shouldRestart si hay
          // pending; el carryState lo arma AQUÍ con la fuente SEED (Pitfall 6).
          const drainB = await drainPendingAndCombine({
            ctx,
            lockCtx: lockArgs,
            atStep: 'ckpt_6_pre_send_loop_main',
            priorMsg: turnEffectiveMessage,
            mode: 'path_b_solo',
            pathBEmitExtra: { templates_sent_before_abort: sentCount },
          })
          if (drainB.pendingCount > 0) {
            ctx.carrySource = 'seed'
            ctx.accumulatedSentContents.push(...sentMessageContents)
            ctx.carryState = {
              intentsVistos: seed.intentsVistos,
              templatesEnviados: [...seed.templatesEnviados, ...actuallySentIds],
              datosCapturados: seed.datosCapturados,
              packSeleccionado: seed.packSeleccionado,
              accionesEjecutadas: seed.accionesEjecutadas,
              currentMode: seed.currentMode,
              turnLedgerDims: seed.turnLedgerDims,
            }
            continue
          }
          // Nada en cola → terminar: conservar lo enviado (este turno + iteraciones previas).
          ctx.templatesSentCount = ctx.accumulatedSentContents.length + sentCount
          return {
            kind: 'completed',
            output,
            sessionId: seed.sessionId,
            templatesSentCount: ctx.accumulatedSentContents.length + sentCount,
            allSentContents: [...ctx.accumulatedSentContents, ...sentMessageContents],
            totalTokens: ctx.totalTokensAcrossRestarts,
            wasInterruptedWithZeroSends: false,
          }
        }
      }

      // --- h. Send-prep: filtro rag:* (B6) + warning D-14 (B10) + filterOutbound (B5). ---
      let templatesToSend: ProcessedMessage[] = output.templates ?? []
      if (templatesToSend.length > 0) {
        // B5 (no-repetición prod-only): el adapter filtra ya-enviados; rag:* siempre pasa (R4-B).
        if (adapters.filterOutbound) {
          try {
            templatesToSend = await adapters.filterOutbound(templatesToSend, {
              sessionId: seed.sessionId,
              conversationId: input.conversationId,
              intent: output.intentInfo?.intent ?? 'unknown',
              inputTemplatesEnviados: seed.templatesEnviados,
            })
          } catch (noRepError) {
            console.error('[V4-CORE] filterOutbound crashed, sending full block (fail-open):', noRepError)
            templatesToSend = output.templates ?? []
          }
        }

        // --- i. Send + manejo POST-HOC del interrupted (A12 — forma del runner, UN solo lugar). ---
        if (templatesToSend.length > 0) {
          const block: SendBlock = {
            sessionId: seed.sessionId,
            conversationId: input.conversationId,
            messages: templatesToSend.map(t => t.content),
            templates: templatesToSend.map(t => ({
              id: t.templateId,
              content: t.content,
              contentType: t.contentType,
              delaySeconds: 0,
            })),
            intent: output.intentInfo?.intent,
            workspaceId: input.workspaceId,
            contactId: input.contactId,
            phoneNumber: input.phoneNumber,
            triggerTimestamp: input.messageTimestamp,
          }
          const sendResult = await adapters.send(block)

          messagesSent += sendResult.messagesSent
          sentMessageContents.push(
            ...templatesToSend.slice(0, sendResult.messagesSent).map(t => t.content),
          )
          const sentIds = templatesToSend
            .slice(0, sendResult.messagesSent)
            .map(t => t.templateId)
            // T-7: rag:* pseudo-ids nunca entran a templates_enviados (la canónica es el turn ledger).
            .filter((id): id is string => id != null && id.length > 0 && !id.startsWith('rag:'))
          actuallySentIds.push(...sentIds)

          if (sendResult.interrupted && lockCtx) {
            if (adapters.clearPendingTemplates) {
              await adapters.clearPendingTemplates(seed.sessionId)
            }
            // A12: 0 sent → path_a; ≥1 sent → path_b_solo + carrySource='output' (A14).
            const sendMode = sendResult.messagesSent === 0 ? 'path_a' : 'path_b_solo'
            // El at_step replica byte-exacto el CKPT-7.N per-template donde el send se interrumpió
            // (`ckpt_7_pre_template_${i}`) — es el contrato de observabilidad que las suites de
            // paridad sandbox (E5/E6/E10 de engine-v4-lock.test.ts) asertan. El send-adapter (prod
            // messaging.send + sandbox loop sintético) ya retorna `interruptedAtIndex` = el índice
            // del template abortado; el core lo deriva aquí. Pre-Plan-11 el core hardcodeaba
            // 'send_loop_ckpt7' (label que ningún test de prod aserta — la extracción del Plan 09/10
            // dropeó el discriminador per-template que el lado sandbox necesita).
            const ckpt7AtStep = `ckpt_7_pre_template_${sendResult.interruptedAtIndex ?? sendResult.messagesSent}`
            const drainSL = await drainPendingAndCombine({
              ctx,
              lockCtx: { workspaceId: input.workspaceId, channel: lockCtx.channel, identifier: lockCtx.identifier },
              atStep: ckpt7AtStep,
              priorMsg: turnEffectiveMessage,
              mode: sendMode,
              pathBEmitExtra: sendMode === 'path_a'
                ? { templates_sent_before_abort: 0 }
                : { templates_sent_before_abort: sendResult.messagesSent },
            })

            if (drainSL.pendingCount > 0) {
              if (sendMode === 'path_b_solo') {
                ctx.carrySource = 'output'
                ctx.accumulatedSentContents.push(...sentMessageContents)
                ctx.carryState = {
                  intentsVistos: output.intentsVistos,
                  templatesEnviados: [...seed.templatesEnviados, ...actuallySentIds],
                  datosCapturados: output.datosCapturados,
                  packSeleccionado: output.packSeleccionado,
                  accionesEjecutadas: output.accionesEjecutadas,
                  currentMode: output.newMode ?? seed.currentMode,
                  turnLedgerDims: output.turnLedgerDims,
                }
              }
              console.log(`[V4-CORE] send-loop interrupt: ${sendResult.messagesSent} sent, reprocessing ${drainSL.pendingCount} new message(s)`)
            } else if (sendResult.messagesSent === 0) {
              // Interrupt + nada en cola + nada enviado → defer legacy cross-lambda (B2 / D-18).
              wasInterruptedWithZeroSends = true
              getCollector()?.recordEvent('pipeline_decision', 'interruption_path_a', {
                sessionId: seed.sessionId,
                pendingMessage: input.message.substring(0, 100),
              })
            }
          } else if (sendResult.interrupted) {
            // No lock (fail-open) — defer legacy.
            if (sendResult.messagesSent === 0) {
              wasInterruptedWithZeroSends = true
              getCollector()?.recordEvent('pipeline_decision', 'interruption_path_a', {
                sessionId: seed.sessionId,
                pendingMessage: input.message.substring(0, 100),
              })
            } else if (adapters.savePendingTemplates) {
              const sentIndex = sendResult.interruptedAtIndex ?? sendResult.messagesSent
              const unsent = templatesToSend.slice(sentIndex)
              if (unsent.length > 0) {
                await adapters.savePendingTemplates(seed.sessionId, unsent)
              }
            }
          } else if (adapters.clearPendingTemplates) {
            await adapters.clearPendingTemplates(seed.sessionId)
          }
        }
      } else if (output.messages.length > 0 && (!output.templates || output.templates.length === 0)) {
        // D-14 (B10 — warning viaja al CORE): output.messages sin templates nunca debería ocurrir
        // post rag:* passthrough (el adapter dropea sends sin templates). Si ocurre queremos VERLO.
        getCollector()?.recordEvent('pipeline_decision', 'v4_messages_without_templates', {
          sessionId: seed.sessionId,
          messageCount: output.messages.length,
          preview: output.messages[0]?.slice(0, 120) ?? '',
        })
        console.warn('[V4-CORE] output.messages sin templates — nunca debería ocurrir (post rag:* passthrough)')
      }

      // A15: un send-loop interrupt con pending seteó shouldRestart → saltar a la siguiente
      // iteración SIN persistir el estado del turno (abortado). carryState + accumulatedSentContents
      // mantienen la continuidad en memoria (Pitfall 8 — no DB write entre restart iterations).
      if (ctx.shouldRestart) continue

      // ============================================================
      // j. Commit del turno (B7) + recordDebug (B8) + construcción del TurnResult 'completed'.
      // ============================================================
      const allSentContents = [...ctx.accumulatedSentContents, ...sentMessageContents]
      const totalMessagesSent = ctx.accumulatedSentContents.length + messagesSent

      if (wasInterruptedWithZeroSends) {
        // Path A edge (CKPT-7.1): persistir el mensaje pendiente vía savePathARollback (D-18) y
        // saltar el commit. El próximo inbound lo re-combina vía getLegacyPendingMessage.
        await adapters.savePathARollback?.({
          sessionId: seed.sessionId,
          message: input.message,
          intentsVistos: seed.intentsVistos,
          datosCapturados: seed.datosCapturados,
          packSeleccionado: output.packSeleccionado,
          accionesEjecutadas: output.accionesEjecutadas,
        })
        if (adapters.clearPendingTemplates) {
          await adapters.clearPendingTemplates(seed.sessionId)
        }
        console.log(`[V4-CORE] Path A: rollback persisted, pending="${input.message}"`)
      } else {
        // Path B / normal: commit completo (saveState + addTurn + ledger emit) vía el adapter.
        await adapters.commitTurn?.({
          sessionId: seed.sessionId,
          turnNumber: seed.turnNumber,
          output,
          effectiveMessage: turnEffectiveMessage,
          actuallySentIds,
          inputTemplatesEnviados: seed.templatesEnviados,
          allSentContents,
          totalTokens: ctx.totalTokensAcrossRestarts,
        })
      }

      // B8: debug sink (prod log / sandbox no-op).
      adapters.recordDebug?.({
        output,
        turnNumber: seed.turnNumber,
        totalTokens: ctx.totalTokensAcrossRestarts,
      })

      ctx.templatesSentCount = totalMessagesSent
      return {
        kind: 'completed',
        output,
        sessionId: seed.sessionId,
        templatesSentCount: totalMessagesSent,
        allSentContents,
        totalTokens: ctx.totalTokensAcrossRestarts,
        wasInterruptedWithZeroSends,
      }
    }

    // Defensivo — exhaustividad: toda ruta dentro del while retorna o setea shouldRestart=true.
    throw new Error('[V4-CORE] restart loop exited without return — invariant violation')
  }

  // ============================================================
  // Estructura de cierre — Open Question 1 RESUELTA (A16):
  // 1. computar el resultado (loopBody / catch LostLockError → zombie_exit / else → error),
  // 2. onResultReady ANTES del finally-release (C4 — el follower long-pollea sandbox-result),
  // 3. finally: stopHeartbeat + releaseLockIfOwner (owner-checked Lua, verbatim del runner).
  // T-cons-13: onResultReady se envuelve en try/catch (console.error) — si lanza, el finally IGUAL
  // libera el lock (liveness preservada), no hay doble-respuesta por un fallo del write.
  // ============================================================
  try {
    let result: TurnResult
    try {
      result = await loopBody()
    } catch (error) {
      if (error instanceof LostLockError) {
        emitLockEvent('zombie_lambda_exit', {
          my_uuid: input.lockHandle?.holderUuid ?? 'unknown',
          current_holder_uuid: 'unknown', // Don't read lock value — racy.
          at_step: error.ckptId,
        })
        result = { kind: 'zombie_exit', ckptId: error.ckptId, message: error.message }
      } else {
        const message = error instanceof Error
          ? `${error.message}\n${error.stack?.split('\n').slice(0, 3).join('\n')}`
          : 'Unknown error'
        console.error('[V4-CORE] CRASH:', message)
        result = { kind: 'error', message, cause: error }
      }
    }

    // C4 (OQ1): onResultReady ANTES del finally-release — el follower del sandbox DEBE ver el
    // sandbox-result antes de poder adquirir el lock. Envuelto en try/catch (T-cons-13).
    try {
      await adapters.onResultReady?.(result)
    } catch (onResultErr) {
      console.error('[V4-CORE] onResultReady failed (lock se libera igual en finally):', onResultErr)
    }
    return result
  } finally {
    // A16: stop heartbeat ANTES del release (sino el heartbeat podría disparar una última
    // renovación entre nuestro DEL y el SET NX del próximo holder). releaseLockIfOwner es
    // owner-checked (Lua) — verbatim del runner (T-cons-12).
    if (stopHeartbeat) stopHeartbeat()
    if (input.lockHandle) {
      try {
        const released = await releaseLockIfOwner(input.lockHandle)
        if (released) {
          emitLockEvent('lock_released_normal', {
            holder_uuid: input.lockHandle.holderUuid,
            duration_ms: Date.now() - startMs,
            templates_sent: ctx.templatesSentCount,
          })
        }
      } catch (releaseError) {
        emitLockEvent('redis_unavailable_fallback_failed', {
          error_message: releaseError instanceof Error ? releaseError.message : String(releaseError),
          at_step: 'release_lock_in_finally',
        })
      }
    }
  }
}
