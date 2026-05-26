/**
 * V4 Production Runner — Thin I/O Runner for Somnio Sales Agent v4 (standalone: somnio-sales-v4-runtime-wiring, D-13)
 *
 * Equivalent to UnifiedEngine but for the v4 agent pipeline.
 * Uses the SAME production adapters (Storage, Timer, Messaging, Orders, Debug).
 *
 * D-13 razón: clon mecánico de v3-production-runner.ts. Cuando v3 muera, simplemente
 * se borra `v3-production-runner.ts` y queda v4 limpio. Cero refactor a v3 = cero
 * riesgo a Somnio prod durante desarrollo (Regla 6).
 *
 * Key differences from V3ProductionRunner:
 * - V4 runner SOLO atiende `somnio-sales-v4` (no godentist / godentist-fb-ig /
 *   somnio-recompra / somnio-pw-confirmation — esas siguen en v3-production-runner.ts).
 * - Default agentModule = 'somnio-v4' (vs v3 default).
 * - VAL tag side-effect (godentist-only) eliminado — v4 no atiende godentist.
 *
 * Key similarities (preserved from v3):
 * - Same EngineInput / EngineOutput / EngineAdapters / EngineConfig contract.
 * - `_v3:` namespace keys in datos_capturados preservados (DB compat — v4 reads same
 *   keys for parity. Si v3 sessions se cierran al flip — D-38 padre — v4 arranca con
 *   sessions nuevas y los keys nuevos son irrelevantes).
 * - Path A / Path B interruption handling clonado verbatim.
 * - NoRepetitionFilter wiring con flag `USE_NO_REPETITION_V4` (D-16 — flag separado
 *   de v3 prod, default OFF). Filter aplica a TODOS los templates emitidos en el turn
 *   (response-track + sub-loop template_match merged en `output.templates`) — D-17.
 *
 * Interruption handling (mirrors sandbox Path A / Path B):
 * - Path A (0 templates sent): restart turn with combined effectiveMessage in
 *   the SAME lambda via outer `while (shouldRestart)` loop (Standalone
 *   debounce-v2-interrupt-reprocess D-04 + R-01). The legacy CKPT-7.1 edge case
 *   (`wasInterruptedWithZeroSends`) preserves the save-pending-and-return
 *   behavior — see Pitfall 5 in standalone RESEARCH.md.
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
import type { V4AgentInput, V4AgentOutput, ProcessedMessage } from '../somnio-v4/types'

// Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.3) —
// REVISION W3: channel/identifier come from input.lockChannel + input.lockIdentifier
// (populated by Plan 03 webhook → event.data). The runner does NOT introduce a
// Supabase conversations-table lookup (NO createAdminClient added here).
import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
import { releaseLockIfOwner, startHeartbeat } from '@/lib/agents/interruption-system-v2/lock'
import { readAndClearPending } from '@/lib/agents/interruption-system-v2/pending'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { LostLockError } from '../engine-adapters/production/v4-messaging-adapter'

const MAX_VERSION_CONFLICT_RETRIES = 3

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
   * This method is a thin I/O runner — it fetches data via adapters, delegates all
   * business logic to v4 processMessage(), and routes output back through adapters.
   */
  async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput> {
    // ================================================================
    // Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.3)
    //
    // D-09 layer 1+2 lifecycle scaffolding. Runs in the main async flow,
    // NOT inside step.run (RESEARCH Pitfall 2 — heartbeats inside step.run
    // don't extend the live lock because Inngest replays cache the step
    // output and don't re-execute the callback).
    //
    // REVISION W3: channel + identifier come from input.lockChannel +
    // input.lockIdentifier (sourced from webhook event.data via Plan 03).
    // The runner does NOT query the conversations table — preserving
    // Regla 3 wrapper purity (no createAdminClient added).
    // ================================================================
    const startMs = Date.now()
    const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
      ? { channel: input.lockChannel, identifier: input.lockIdentifier }
      : null

    // Defensive: lockHandle present but channel/identifier missing should be
    // impossible since Plan 03 always populates all three or none. Fail loud
    // so the contract violation is visible.
    if (input.lockHandle && !lockCtx) {
      throw new Error(
        '[interruption-v2] lockHandle present but lockChannel/lockIdentifier missing — webhook contract violated',
      )
    }

    let stopHeartbeat: (() => void) | null = null
    if (input.lockHandle) {
      stopHeartbeat = startHeartbeat(input.lockHandle)
    }

    // Track templates sent so we can branch Path A / Path B on CKPT interrupt
    // and emit the correct event in the finally block.
    let templatesSentCount = 0

    // ============================================================
    // Standalone: debounce-v2-interrupt-reprocess outer-scope state.
    // These persist ACROSS restart-loop iterations within a single lambda
    // invocation; the restart loop body sets/reads them. The outer
    // declaration here keeps them alive across `continue` statements
    // (Pitfall 8: NO DB write during restart iterations — combined message
    // lives in-memory in `effectiveMessage` until the iteration commits).
    // ============================================================
    let totalTokensAcrossRestarts = 0  // R-05: accumulate output.totalTokens per iteration
    let restartIteration = 0           // observability — Pitfall 3 distinguishes restart 1 vs 5
    let effectiveMessage: string | null = null  // R-03: null on iter 1 (legacy v3 path), non-null after first restart

    try {
    try {
      // ============================================================
      // Standalone: debounce-v2-interrupt-reprocess restart loop (D-04 + R-01).
      // Wraps the entire turn body so any Path A interrupt at
      // CKPT-0/1/2/3/4/5/6a/6b drains pending, combines into
      // effectiveMessage, and re-runs the turn in the SAME lambda with the
      // SAME lock (heartbeat keeps it alive — Pitfall 6: outside loop).
      //
      // CKPT-7.N (send-loop per-template) does NOT restart (D-05) — once
      // we've sent ≥1 template, restarting would re-send what the customer
      // already saw. The existing send-loop branch and
      // wasInterruptedWithZeroSends block are PRESERVED for the rare
      // CKPT-7.1 first-byte abort case (Pitfall 5).
      // ============================================================
      let shouldRestart = true
      while (shouldRestart) {
        shouldRestart = false

      // 1. Get session via storage adapter
      const session = input.sessionId
        ? await this.adapters.storage.getSession(input.sessionId)
        : await this.adapters.storage.getOrCreateSession(input.conversationId, input.contactId)

      // 1b. Set sessionId on V4 timer adapter (needs session for Inngest events)
      if ('setSessionId' in this.adapters.timer && typeof (this.adapters.timer as any).setSessionId === 'function') {
        (this.adapters.timer as any).setSessionId(session.id)
      }

      // ============================================================
      // Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.3)
      // CKPT-0 — post-session-resolution, pre-everything-else
      // (RESEARCH line 845).
      //
      // At this point nothing has been sent yet, so Path A (no sends)
      // is the only possible branch on interrupt. We read the pending
      // list (which includes followers' messages + the holder's own
      // entry, RPUSHed by webhook D-16) and emit:
      //   - msg_aborted_path_a_combined (we're aborting before any send)
      //   - pending_list_combined (telemetry: how many entries + chars)
      // ============================================================
      if (input.lockHandle && lockCtx) {
        const ck0 = await checkpoint(
          'ckpt_0_post_acquire',
          input.lockHandle,
          this.config.workspaceId,
          lockCtx.channel,
          lockCtx.identifier,
        )
        if (ck0.lostLock) {
          throw new LostLockError('ckpt_0_post_acquire')
        }
        if (!ck0.proceed && ck0.interrupted) {
          // ============================================================
          // Standalone: debounce-v2-interrupt-reprocess (D-04 + R-01).
          // Path A interrupt at CKPT-0 — restart turn with combined
          // effectiveMessage instead of silently persisting + returning
          // (BEFORE FIX: bot stayed mute until a third inbound arrived).
          // Pitfall 8: NO saveState during restart iterations — the
          // combined message lives in-memory in `effectiveMessage` until
          // the iteration completes successfully.
          // ============================================================
          const pending = await readAndClearPending(
            this.config.workspaceId,
            lockCtx.channel,
            lockCtx.identifier,
          )
          restartIteration++
          const priorMsg: string = effectiveMessage ?? input.message
          const combinedTotalChars =
            pending.reduce((s, p) => s + p.content.length, 0) + priorMsg.length
          emitLockEvent('msg_aborted_path_a_combined', {
            at_step: 'ckpt_0_post_acquire',
            combined_msg_count: pending.length + 1,
            total_chars: combinedTotalChars,
            restart_iteration: restartIteration,
          })
          emitLockEvent('pending_list_combined', {
            at_step: 'ckpt_0_post_acquire',
            entries_count: pending.length,
            total_chars: pending.reduce((s, p) => s + p.content.length, 0),
            restart_iteration: restartIteration,
          })
          effectiveMessage = [...pending.map((p) => p.content), priorMsg].join('\n')
          shouldRestart = true
          continue
        }
      }

      // 1c. Detect pending message from previous 0-send interruption (Path A accumulation)
      //
      // R-03 (debounce-v2-interrupt-reprocess): on iter 1 of the restart
      // loop, `effectiveMessage` is null → fall back to legacy v3 path
      // (combine with `_v3:pendingUserMessage` from session state — used by
      // the Pitfall 5 wasInterruptedWithZeroSends edge case and by the
      // first-call-after-cold-start scenario). On restart iterations
      // (effectiveMessage non-null), use the in-memory combined string
      // (Pitfall 8: no DB write across iterations).
      const currentDatos = session.state.datos_capturados ?? {}
      const pendingUserMessage = currentDatos['_v3:pendingUserMessage'] as string | undefined
      const turnEffectiveMessage: string = effectiveMessage
        ?? (pendingUserMessage ? `${pendingUserMessage}\n${input.message}` : input.message)

      if (pendingUserMessage) {
        console.log(`[V4-RUNNER] Path A accumulation: combining pending="${pendingUserMessage}" + new="${input.message}"`)
      }

      // 2. Get history (production reads from DB)
      const history = input.history.length > 0
        ? input.history
        : await this.adapters.storage.getHistory(session.id)

      console.log(`[V4-RUNNER] msg="${turnEffectiveMessage}" sessionId=${session.id} historyLen=${history.length}`)

      // 3. Build V4AgentInput from session state
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

      // V4 expects intentsVistos as string[], production stores IntentRecord[]
      // Extract just the intent names
      const intentsVistos: string[] = inputIntentsVistos.map(
        (r: { intent: string } | string) => typeof r === 'string' ? r : r.intent
      )

      const v4Input: V4AgentInput = {
        message: turnEffectiveMessage,
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

      // 3b. Preload data + agent_module marker for new sessions
      // Idempotent guard: `_v3:preloaded` marker inside datos_capturados. Previous
      // `session.version === 0` guard never fired because SessionManager.createSession
      // inserts rows with version=1 (DB default is also 1), so preload silently never ran.
      //
      // Both markers live INSIDE `datos_capturados` (jsonb) because session_state has no
      // dedicated top-level columns for them — writing `{'_v3:agent_module': ...}` at
      // the top level would try to target a column that doesn't exist and Supabase
      // rejects the UPDATE ("Failed to update session state").
      //
      // NOTE: `_v3:` namespace keys preservados intencionalmente (DB compat — v4 lee los
      // mismos keys). Cuando v3 sessions se cierran al flip (D-38 padre), v4 arranca con
      // sessions nuevas y la convención queda como artefacto histórico inofensivo.
      const alreadyPreloaded = session.state.datos_capturados?.['_v3:preloaded'] === 'true'
      const agentModuleAlreadyStored = session.state.datos_capturados?.['_v3:agent_module'] !== undefined
      const shouldWriteAgentModule = this.config.agentModule && this.config.agentModule !== 'somnio-v4' && !agentModuleAlreadyStored

      if ((this.config.preloadedData && Object.keys(this.config.preloadedData).length > 0 && !alreadyPreloaded) || shouldWriteAgentModule) {
        const merged: Record<string, string> = {
          ...session.state.datos_capturados,
        }
        if (this.config.preloadedData && !alreadyPreloaded) {
          Object.assign(merged, this.config.preloadedData)
          merged['_v3:preloaded'] = 'true'
          Object.assign(v4Input.datosCapturados, this.config.preloadedData)
        }
        if (shouldWriteAgentModule) {
          merged['_v3:agent_module'] = this.config.agentModule!
        }
        await this.adapters.storage.saveState(session.id, { datos_capturados: merged })
        console.log(
          `[V4-RUNNER] Preload/agent_module write: preloaded=${!alreadyPreloaded && !!this.config.preloadedData} agentModule=${shouldWriteAgentModule ? this.config.agentModule : 'skip'}`
        )
      }

      // 4. Call processMessage — route directly to somnio-v4 (V4 runner solo atiende somnio-sales-v4 — Regla 6)
      let output: V4AgentOutput
      const { processMessage } = await import('../somnio-v4')
      output = await processMessage(v4Input)

      // R-05 (debounce-v2-interrupt-reprocess): accumulate per-call tokens
      // across restart iterations. The final return uses
      // `totalTokensAcrossRestarts` (NOT `output.totalTokens`) as the single
      // source of truth for cost accounting (Pitfall 2).
      totalTokensAcrossRestarts += (output.totalTokens ?? 0)

      // ============================================================
      // R-04 + Pitfall 7 (debounce-v2-interrupt-reprocess): detect Path A
      // interrupt surfaced by the agent's V4AgentOutput.errorMessage.
      // Sources of the discriminator prefix `interrupted_at_ckpt_`:
      //   - in-agent CKPT-1 (post-comprehension) — somnio-v4-agent.ts ~L142
      //   - in-agent CKPT-2 (post-state-machine) — somnio-v4-agent.ts ~L340
      //   - sub-loop CKPT-3/4/5 propagated via mapOutcomeToAgentOutput
      //     (Pitfall 7 fix in Task 1.1 — was silently converting to
      //     requiresHuman=true handoff before this standalone)
      // String prefix is the discriminator (NOT a typed boolean — see R-04:
      // greppable in Vercel logs).
      // ============================================================
      if (
        output.success === false &&
        typeof output.errorMessage === 'string' &&
        output.errorMessage.startsWith('interrupted_at_ckpt_')
      ) {
        if (!lockCtx) {
          // Should be impossible (agent only emits this discriminator when
          // invoked under a lock), but if it happens we fall through to
          // error handling rather than corrupting state.
          throw new Error(`[V4-RUNNER] agent emitted ${output.errorMessage} but lockCtx is null`)
        }
        const pending = await readAndClearPending(
          this.config.workspaceId,
          lockCtx.channel,
          lockCtx.identifier,
        )
        restartIteration++
        emitLockEvent('msg_aborted_path_a_combined', {
          at_step: output.errorMessage,
          combined_msg_count: pending.length + 1,
          total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
          restart_iteration: restartIteration,
        })
        emitLockEvent('pending_list_combined', {
          at_step: output.errorMessage,
          entries_count: pending.length,
          total_chars: pending.reduce((s, p) => s + p.content.length, 0),
          restart_iteration: restartIteration,
        })
        effectiveMessage = [...pending.map((p) => p.content), turnEffectiveMessage].join('\n')
        shouldRestart = true
        continue
      }

      getCollector()?.recordEvent('pipeline_decision', 'agent_routed', {
        agentModule: this.config.agentModule ?? 'somnio-v4',
        sessionId: session.id,
        success: output.success,
        action: output.salesTrackInfo?.accion ?? 'none',
        messageCount: output.messages.length,
        templateCount: output.templates?.length ?? 0,
      })

      // 4b. (V3-only) GoDentist VAL tag side-effect — eliminado en V4 runner.
      //     V4 runner NO atiende godentist / godentist-fb-ig (siguen en V3 runner).
      //     Si en el futuro un agente atendido por V4 requiere side-effect análogo,
      //     se añadirá explícitamente — D-13 mandata duplicación 100% sin shared helpers.

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

      // ============================================================
      // Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.3)
      // CKPT-6a — pre-send-loop (pending-templates Path B resume path)
      // (RESEARCH line 846).
      //
      // We're about to send pending templates from a previous interrupted
      // turn. No templates have been sent in THIS turn yet, but pending
      // templates from a prior turn count as "sent" for Path A/B purposes
      // — if interrupt detected now, Path A (no NEW sends in this turn but
      // previous turn already partially sent). The pending list also gets
      // accumulated by the heading checkpoint detection.
      // ============================================================
      if (input.lockHandle && lockCtx) {
        const ck6a = await checkpoint(
          'ckpt_6_pre_send_loop',
          input.lockHandle,
          this.config.workspaceId,
          lockCtx.channel,
          lockCtx.identifier,
          { hasSentAnything: false },
        )
        if (ck6a.lostLock) {
          throw new LostLockError('ckpt_6_pre_send_loop_pending_templates')
        }
        if (!ck6a.proceed && ck6a.interrupted) {
          // ============================================================
          // Standalone: debounce-v2-interrupt-reprocess (D-04 + R-01).
          // Path A interrupt at CKPT-6a (pending-templates pre-send) —
          // restart turn with combined effectiveMessage instead of silently
          // persisting + returning. Pitfall 8: NO saveState during restart
          // iterations.
          // ============================================================
          const pending = await readAndClearPending(
            this.config.workspaceId,
            lockCtx.channel,
            lockCtx.identifier,
          )
          restartIteration++
          emitLockEvent('msg_aborted_path_a_combined', {
            at_step: 'ckpt_6_pre_send_loop_pending_templates',
            templates_sent_before_abort: 0,
            combined_msg_count: pending.length + 1,
            total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
            restart_iteration: restartIteration,
          })
          emitLockEvent('pending_list_combined', {
            at_step: 'ckpt_6_pre_send_loop_pending_templates',
            entries_count: pending.length,
            total_chars: pending.reduce((s, p) => s + p.content.length, 0),
            restart_iteration: restartIteration,
          })
          effectiveMessage = [...pending.map((p) => p.content), turnEffectiveMessage].join('\n')
          shouldRestart = true
          continue
        }
      }

      // 5h-pre. Load and send pending templates from previous interrupted block (Path B)
      if (this.adapters.storage.getPendingTemplates) {
        try {
          const pending = await this.adapters.storage.getPendingTemplates(session.id)
          if (pending && pending.length > 0) {
            console.log(`[V4-RUNNER] Sending ${pending.length} pending templates from interrupted block`)
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
          console.error('[V4-RUNNER] Failed to send pending templates (fail-open):', pendingError)
          if (this.adapters.storage.clearPendingTemplates) {
            await this.adapters.storage.clearPendingTemplates(session.id)
          }
        }
      }

      // ============================================================
      // Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.3)
      // CKPT-6b — pre-send-loop (main send block)
      // (RESEARCH line 846).
      //
      // If pending templates from a prior turn were sent above, then
      // actuallySentIds.length > 0 → Path B (we already sent something).
      // Otherwise Path A (nothing sent in this turn).
      // ============================================================
      if (input.lockHandle && lockCtx) {
        const ck6b = await checkpoint(
          'ckpt_6_pre_send_loop',
          input.lockHandle,
          this.config.workspaceId,
          lockCtx.channel,
          lockCtx.identifier,
          { hasSentAnything: actuallySentIds.length > 0 },
        )
        if (ck6b.lostLock) {
          throw new LostLockError('ckpt_6_pre_send_loop_main')
        }
        if (!ck6b.proceed && ck6b.interrupted) {
          const sentCount = actuallySentIds.length
          if (sentCount === 0) {
            // ============================================================
            // Standalone: debounce-v2-interrupt-reprocess (D-01 + D-05).
            // Path A — restart turn with combined effectiveMessage instead
            // of silently persisting + returning. Pitfall 8: NO saveState
            // during restart iterations.
            // ============================================================
            const pending = await readAndClearPending(
              this.config.workspaceId,
              lockCtx.channel,
              lockCtx.identifier,
            )
            restartIteration++
            emitLockEvent('msg_aborted_path_a_combined', {
              at_step: 'ckpt_6_pre_send_loop_main',
              templates_sent_before_abort: 0,
              combined_msg_count: pending.length + 1,
              total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
              restart_iteration: restartIteration,
            })
            emitLockEvent('pending_list_combined', {
              at_step: 'ckpt_6_pre_send_loop_main',
              entries_count: pending.length,
              total_chars: pending.reduce((s, p) => s + p.content.length, 0),
              restart_iteration: restartIteration,
            })
            effectiveMessage = [...pending.map((p) => p.content), turnEffectiveMessage].join('\n')
            shouldRestart = true
            continue
          }
          // D-01 Path B — msg1 already had templates sent; do NOT restart,
          // do NOT re-include msg1. Preserve existing behavior verbatim.
          emitLockEvent('msg_aborted_path_b_solo', {
            at_step: 'ckpt_6_pre_send_loop_main',
            templates_sent_before_abort: sentCount,
          })
          // Update outer counter for finally block lock_released_normal payload.
          templatesSentCount = sentCount
          return {
            success: true,
            messages: [],
            sessionId: session.id,
            messagesSent: sentCount,
            tokensUsed: totalTokensAcrossRestarts,
          }
        }
      }

      // 5h-main. Send new templates from this turn's pipeline output
      if (output.templates && output.templates.length > 0) {
        let templatesToSend: ProcessedMessage[] = output.templates

        // No-repetition filter (if USE_NO_REPETITION_V4=true)
        // D-16: flag separado v4 (no compartir con v3 prod). Default OFF — activa SOLO
        //       cuando futuro standalone decida turn ON el filter en v4. Plan 06.
        // D-17: filter aplica a TODOS los templates emitidos en el turn (response-track +
        //       outputs sub-loop template_match merged en `output.templates`).
        if (process.env.USE_NO_REPETITION_V4 === 'true') {
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
                `[V4-RUNNER] No-rep filter: ${filterResult.filtered.length} filtered, ${filterResult.surviving.length} surviving`
              )
            }
          } catch (noRepError) {
            console.error('[V4-RUNNER] No-rep filter crashed, sending full block (fail-open):', noRepError)
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
              // PATH A (CKPT-7.1 edge case): 0 templates sent — save pending
              // message, next inbound's lambda combines via R-03 iter-1 legacy
              // path. Per D-05 (debounce-v2-interrupt-reprocess), CKPT-7.N
              // does NOT trigger the restart loop because we're already
              // mid-send-loop and re-running comprehension would race with
              // partial-delivery state.
              wasInterruptedWithZeroSends = true
              getCollector()?.recordEvent('pipeline_decision', 'interruption_path_a', {
                sessionId: session.id,
                pendingMessage: input.message.substring(0, 100),
              })
              console.log(`[V4-RUNNER] Path A (CKPT-7.1): 0 sends, saving pending for next lambda`)
            } else {
              // PATH B: partial send — save unsent as pending_templates
              const sentIndex = sendResult.interruptedAtIndex ?? sendResult.messagesSent
              const unsent = templatesToSend.slice(sentIndex)
              if (unsent.length > 0 && this.adapters.storage.savePendingTemplates) {
                await this.adapters.storage.savePendingTemplates(session.id, unsent)
                console.log(`[V4-RUNNER] Path B: ${sendResult.messagesSent} sent, ${unsent.length} saved as pending`)
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

      // ============================================================
      // Pitfall 5 (Standalone debounce-v2-interrupt-reprocess): this block
      // remains live for the CKPT-7.N Path A edge case (template_1 send
      // aborted at first byte by V4MessagingAdapter.shouldAbortBeforeTemplate).
      // Per D-05 explicit: CKPT-7.N does NOT trigger restart. The next
      // inbound's lambda will see `_v3:pendingUserMessage` in session state
      // and accumulate via R-03 iter-1 path. Do NOT collapse this into the
      // restart loop — once we've entered the send-loop, msg1 has either
      // been delivered or is mid-flight, and re-running comprehension on
      // the combined message would race with the partially-delivered turn.
      // ============================================================
      if (wasInterruptedWithZeroSends) {
        // PATH A (CKPT-7.1 edge case): Rollback intents_vistos, save pending
        // message, skip turns. The next inbound's lambda combines via R-03
        // iter-1 legacy path.
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
        console.log(`[V4-RUNNER] Path A: state rolled back, pending="${input.message}"`)
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
          console.log(`[V4-RUNNER] templates_enviados: +${actuallySentIds.length} (total: ${updatedTemplatesEnviados.length})`)
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

        // Timer signals (only on committed turns) — V4 uses emitSignals() directly
        if (output.timerSignals.length > 0 && 'emitSignals' in this.adapters.timer) {
          await (this.adapters.timer as any).emitSignals(output.timerSignals)
        }

        // User turn
        await this.adapters.storage.addTurn({
          sessionId: session.id,
          turnNumber,
          role: 'user',
          content: turnEffectiveMessage,
          intentDetected: output.intentInfo?.intent,
          confidence: output.intentInfo?.confidence,
          // Pitfall 2 (debounce-v2-interrupt-reprocess): accumulator across
          // restart iterations — captures total agent work for this lambda
          // invocation, not just the last iteration's per-call tokens.
          tokensUsed: totalTokensAcrossRestarts,
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

          console.log(`[V4-RUNNER] Creating order... isOfiInter=${isOfiInter} pack=${output.orderData.packSeleccionado}`)

          orderResult = await this.adapters.orders.createOrder({
            datosCapturados: output.orderData.datosCapturados,
            packSeleccionado: output.orderData.packSeleccionado,
            workspaceId: this.config.workspaceId,
            sessionId: session.id,
            valorOverride: output.orderData.valorOverride,
            isOfiInter,
            cedulaRecoge,
          })

          console.log(`[V4-RUNNER] Order result: success=${orderResult.success} orderId=${orderResult.orderId}`)
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
            console.log(`[V4-RUNNER] Assistant turn saved (${assistantContent.length} chars)`)
          } catch (turnError) {
            console.error('[V4-RUNNER] Failed to save assistant turn:', turnError)
          }
        }
      }

      // 5j. Debug adapter — always record (even on Path A, useful for diagnostics)
      this.adapters.debug.recordIntent(output.intentInfo)
      this.adapters.debug.recordTokens({
        turnNumber,
        // Pitfall 2 (debounce-v2-interrupt-reprocess): accumulator across
        // restart iterations.
        tokensUsed: totalTokensAcrossRestarts,
        timestamp: new Date().toISOString(),
      })
      if (output.classificationInfo) this.adapters.debug.recordClassification(output.classificationInfo)
      if (output.salesTrackInfo) this.adapters.debug.recordOrchestration(output.salesTrackInfo)
      this.adapters.debug.recordTimerSignals(output.timerSignals)

      // Update outer counter for finally-block lock_released_normal payload.
      templatesSentCount = actuallySentIds.length

      // 6. Return EngineOutput compatible with webhook-processor
      return {
        success: output.success,
        messages: output.messages,
        newMode: wasInterruptedWithZeroSends ? undefined : output.newMode,
        // Pitfall 2 (debounce-v2-interrupt-reprocess): single source of truth
        // for cost accounting across restart iterations — accumulator instead
        // of per-call output.totalTokens.
        tokensUsed: totalTokensAcrossRestarts,
        sessionId: session.id,
        messagesSent,
        response: sentMessageContents.join('\n'),
        orderCreated: orderResult?.success,
        orderId: orderResult?.orderId,
        contactId: orderResult?.contactId ?? input.contactId,
        error: output.success ? undefined : {
          code: 'V4_AGENT_ERROR',
          message: 'V4 agent processing failed',
        },
      }
      }  // end while (shouldRestart)

      // Defensive — exhaustiveness: every code path inside while must return
      // or set shouldRestart=true. Reaching here means a bug.
      // eslint-disable-next-line no-unreachable
      throw new Error('[V4-RUNNER] restart loop exited without return — invariant violation')
    } catch (error) {
      // ============================================================
      // Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.3)
      // LostLockError handling — D-15 zombie defense.
      //
      // V4MessagingAdapter throws LostLockError when its checkpoint
      // ('ckpt_7_pre_template') detects this lambda no longer owns
      // the lock. Propagate that signal as a clean failure (don't
      // retry — another holder owns the lock, retrying would race).
      // ============================================================
      if (error instanceof LostLockError) {
        emitLockEvent('zombie_lambda_exit', {
          my_uuid: input.lockHandle?.holderUuid ?? 'unknown',
          current_holder_uuid: 'unknown',  // Don't read lock value — racy.
          at_step: error.ckptId,
        })
        return {
          success: false,
          messages: [],
          error: {
            code: 'V4_ZOMBIE_LAMBDA_EXIT',
            message: error.message,
          },
        }
      }

      if (error instanceof VersionConflictError && retryCount < MAX_VERSION_CONFLICT_RETRIES) {
        console.warn(`[V4-RUNNER] Version conflict, retrying (${retryCount + 1}/${MAX_VERSION_CONFLICT_RETRIES})`)
        return this.processMessage(input, retryCount + 1)
      }

      const errorMessage = error instanceof Error
        ? `${error.message}\n${(error as Error).stack?.split('\n').slice(0, 3).join('\n')}`
        : 'Unknown error'
      console.error('[V4-RUNNER] CRASH:', errorMessage)

      return {
        success: false,
        messages: [],
        error: {
          code: 'V4_ENGINE_ERROR',
          message: errorMessage,
        },
      }
    }
    } finally {
      // ============================================================
      // Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.3)
      // D-09 layer 1+2 cleanup:
      //   - Layer 2: stop the heartbeat interval (prevents zombie keys)
      //   - Layer 1: release the lock atomically if we still own it
      //
      // Both gated on input.lockHandle — pre-v4 / fail-open callers
      // skip both ops entirely. Order matters: stop heartbeat BEFORE
      // release (otherwise the heartbeat could fire one last renewal
      // between our DEL and the next holder's SET NX, leaving a
      // brief inconsistent state).
      // ============================================================
      if (stopHeartbeat) stopHeartbeat()
      if (input.lockHandle) {
        try {
          const released = await releaseLockIfOwner(input.lockHandle)
          if (released) {
            emitLockEvent('lock_released_normal', {
              holder_uuid: input.lockHandle.holderUuid,
              duration_ms: Date.now() - startMs,
              templates_sent: templatesSentCount,
            })
          }
        } catch (releaseError) {
          // Fail-open: if Upstash is unreachable at release time, the
          // lock TTL (45s) will reap it naturally + the cron sweep
          // (Plan 06) is the backstop. Don't throw out of finally.
          emitLockEvent('redis_unavailable_fallback_failed', {
            error_message: releaseError instanceof Error ? releaseError.message : String(releaseError),
            at_step: 'release_lock_in_finally',
          })
        }
      }
    }
  }
}
