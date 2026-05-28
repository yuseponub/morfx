/**
 * Somnio v4 Engine - Minimal Sandbox Runner
 *
 * Thin engine for sandbox-only v4 agent testing.
 * Handles bidirectional mapping: SandboxState <-> V4AgentInput
 * via `_v3:` prefixed keys in datosCapturados (preservados por compatibilidad
 * con sessions productivas — D-19 mantiene namespace; sessions v3 que se
 * cierren al flip pasan a v4 sin re-mapear keys legacy).
 *
 * Standalone: somnio-sales-v4-runtime-wiring / Plan 03.
 * Cloned mecánicamente desde somnio-v3/engine-v3.ts (D-13 — duplicado 100%).
 *
 * Diferencias intencionales con engine-v3:
 * - import processMessage desde './somnio-v4-agent' (NO somnio-v3)
 * - V4EngineInput / V4EngineOutput types
 * - DebugTurn extendido con campos opcionales subLoopReason / kbHits /
 *   nuncaDecirMatches / threshold (D-20). El sub-loop expone esa metadata
 *   solo via observability events; cuando V4AgentOutput la suba al top-level
 *   (Plan 06+), el wrapper los mapea aquí. Mientras tanto los campos quedan
 *   undefined y la UI renderiza condicional.
 * - KB real (D-22) — workspaceId propagado al agent que internamente queries
 *   Supabase prod (workspace Somnio).
 * - Retomas simuladas (D-21) — systemEvent propagado igual que v3.
 * - debugTurn.tokens.models[].model = 'gemini-2.5-flash-lite' (B-2 fix +
 *   D-30 — swap at clone time; refleja el provider real que Plan 05 wirea
 *   para comprehension donde nace `output.totalTokens`). Cero TODO comments.
 */

import { processMessage } from './somnio-v4-agent'
import type { SandboxState, DebugTurn } from '@/lib/sandbox/types'
import type { PackSelection } from '@/lib/agents/types'
import type { SystemEvent } from './types'

// Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 + D-05 + D-06 + D-15).
// Wire shipped interruption-system-v2 primitives into the sandbox engine.
// Module is IMPORTED ONLY — never modified (D-15).
import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
import {
  releaseLockIfOwner,
  startHeartbeat,
  type LockHandle,
  type LockChannel,
} from '@/lib/agents/interruption-system-v2/lock'
import { readAndClearPending, clearInterrupt } from '@/lib/agents/interruption-system-v2/pending'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
import { LostLockError } from '@/lib/agents/engine-adapters/production/v4-messaging-adapter'

export interface V4EngineInput {
  message: string
  state: SandboxState
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
  // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 + D-15).
  // All 5 fields OPTIONAL — pre-this-standalone callers (existing tests, dev workflows
  // that bypass the sandbox lock branch) continue to work without modification.
  // When null/undefined, the engine skip-guards every checkpoint + heartbeat + release
  // (sandbox keeps the same behavior as before this standalone).
  // Plan 02 (sandbox/process/route.ts v4 branch) is the FIRST caller that populates these.
  lockHandle?: LockHandle | null
  lockChannel?: LockChannel | null  // 'whatsapp' | 'facebook' | 'instagram' — sandbox uses 'whatsapp' per D-02 Option C
  lockIdentifier?: string | null   // sandbox uses `sandbox-{sandboxSessionId}` per D-02 Option C
  ownPendingEntryJson?: string | null
  sandboxSessionId?: string         // for Pitfall 5 sandbox-result:{id} write before finally release
  /**
   * When > 0 AND lockHandle is non-null, the engine inserts ARTIFICIAL DELAYS to
   * simulate production timing inside the lock-hold window:
   *
   *   1. After CKPT-0 (post-acquire) succeeds, sleep `simulateProdTimingMs` ms
   *      BEFORE invoking the agent's processMessage. This represents the
   *      production LLM "thinking" time and gives msg2 a window to arrive
   *      as FOLLOWER → be detected at CKPT-6 (pre-send-loop) → Path A combined
   *      restart.
   *
   *   2. Between CKPT-7.N iterations (per-template), sleep proportional to
   *      message length. This represents the production template-send pacing
   *      and gives msg2 a window to arrive during the send loop → be detected
   *      at the next CKPT-7.N iteration → Path B abort.
   *
   * Without these delays the engine completes in microseconds and Path A / B
   * cannot be triggered from the sandbox UI (the user cannot click "send" fast
   * enough to overlap a 3-second lock hold).
   *
   * Default 0 (no simulation — backward compatible with existing tests and
   * non-sandbox callers).
   *
   * Added post-`debounce-v2-sandbox-integration` smoke discovery 2026-05-27:
   * users reported that "the system does not interrupt even after 6+ seconds"
   * because the sandbox engine returns before the second message can land.
   */
  simulateProdTimingMs?: number
  /**
   * Optional callback fired once per template AFTER CKPT-7.N succeeds for that
   * template AND the per-template send-pacing sleep has elapsed. Used by the
   * streaming sandbox route to flush each template to the browser as it is
   * "sent" by the engine — matching the production behavior where each
   * V4MessagingAdapter.send() call is observable client-side immediately.
   *
   * The callback runs WITH THE LOCK STILL HELD (engine is mid-loop). It MUST
   * NOT release the lock or perform other lifecycle operations — those are
   * the engine's responsibility in `finally`.
   *
   * Added post-`debounce-v2-sandbox-integration` smoke discovery 2026-05-27:
   * before the callback, the engine returned only the final messages array at
   * the end of processMessage, so the user saw all templates appear at once
   * after the entire lock-hold window completed (~15-25s of nothing then a
   * burst). The callback enables progressive reveal matching WhatsApp prod.
   */
  onMessage?: (content: string, index: number) => Promise<void> | void
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface V4EngineOutput {
  success: boolean
  messages: string[]
  newState: SandboxState
  debugTurn: DebugTurn
  error?: { code: string; message: string }
  timerSignal?: unknown
}

export class SomnioV4Engine {
  async processMessage(input: V4EngineInput): Promise<V4EngineOutput> {
    const timestamp = new Date().toISOString()

    // ============================================================
    // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 + D-05 + D-06).
    // Outer-scope state for restart-loop semantics (mirror V4ProductionRunner
    // post-`debounce-v2-interrupt-reprocess` shipped 2026-05-26 + chronological-fix
    // commit 494d3bb4 on 2026-05-27).
    // These persist ACROSS restart-loop iterations within a single processMessage
    // invocation; reset to zero at the top of each new processMessage call.
    // ============================================================
    const startMs = Date.now()
    const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
      ? { channel: input.lockChannel as LockChannel, identifier: input.lockIdentifier as string }
      : null
    let stopHeartbeat: (() => void) | null = null
    if (input.lockHandle) {
      // D-05: heartbeat lifecycle OUTSIDE the while loop (Pitfall 6 — no heartbeat stacking).
      stopHeartbeat = startHeartbeat(input.lockHandle)
    }
    let totalTokensAcrossRestarts = 0
    let restartIteration = 0
    let effectiveMessage: string | null = null
    let templatesSentCount = 0
    // Accumulates templates actually streamed to the client ACROSS restart
    // iterations. On a Path B reprocess (abort remaining + answer the
    // interrupting message), iter-1's already-sent templates live here so the
    // final result/state record reflects everything the customer saw, not just
    // the last iteration's output.
    const accumulatedSentMessages: string[] = []

    try {
    try {
      // ============================================================
      // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-06 + R-01).
      // Restart-loop mirrors V4ProductionRunner post-debounce-v2-interrupt-reprocess
      // (shipped 2026-05-26) + chronological-fix commit 494d3bb4 (2026-05-27).
      //
      // Path A restart sites in this sandbox engine: 3 total (CKPT-0,
      // agent-discriminator, CKPT-6). V4ProductionRunner has 4 (it additionally
      // has a CKPT-6a pending-templates pre-send branch at v4-production-runner.ts:464
      // — N/A in sandbox because sandbox does not pre-send templates from a prior
      // turn). CKPT-7.N (post-send) does NOT restart in either runner (D-05 from
      // parent: Path B preserved after first send).
      // ============================================================
      let shouldRestart = true
      let lastV4Result: V4EngineOutput | null = null
      while (shouldRestart) {
        shouldRestart = false
        const turnEffectiveMessage: string = effectiveMessage ?? input.message

        // === CKPT-0 post-acquire ===
        if (input.lockHandle && lockCtx) {
          const ck0 = await checkpoint(
            'ckpt_0_post_acquire',
            input.lockHandle,
            input.workspaceId,
            lockCtx.channel,
            lockCtx.identifier,
          )
          if (ck0.lostLock) throw new LostLockError('ckpt_0_post_acquire')
          if (!ck0.proceed && ck0.interrupted) {
            const pending = await readAndClearPending(input.workspaceId, lockCtx.channel, lockCtx.identifier)
            // Consume the interrupt signal too (bug 2026-05-28): without this the
            // next iteration's CKPT-0 re-reads the still-set interrupt key and
            // spins Path A on an empty pending list until the 60s TTL expires.
            await clearInterrupt(input.workspaceId, lockCtx.channel, lockCtx.identifier)
            restartIteration++
            emitLockEvent('msg_aborted_path_a_combined', {
              at_step: 'ckpt_0_post_acquire',
              combined_msg_count: pending.length + 1,
              total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
              restart_iteration: restartIteration,
            })
            emitLockEvent('pending_list_combined', {
              at_step: 'ckpt_0_post_acquire',
              entries_count: pending.length,
              total_chars: pending.reduce((s, p) => s + p.content.length, 0),
              restart_iteration: restartIteration,
            })
            // Chronological order (commit 494d3bb4): priorMsg FIRST, pending APPENDED.
            effectiveMessage = [turnEffectiveMessage, ...pending.map(p => p.content)].join('\n')
            shouldRestart = true
            continue
          }
        }

        // Simulate production LLM "thinking" delay (post-smoke fix 2026-05-27).
        // Lock stays held during this sleep. If msg2 arrives meanwhile, it becomes
        // FOLLOWER and CKPT-6 (post-processMessage) will detect it for Path A
        // combined restart. Without this delay, sandbox engine completes in
        // microseconds and Path A is untestable.
        // Only sleep on the FIRST iteration (restartIteration === 0): the user
        // sends msg2 during this window. On Path A restart iterations we must
        // NOT re-sleep — doing so doubled total latency past the follower's
        // long-poll window (bug 2026-05-28: combine took ~36s, timed out at 30s).
        if (
          input.lockHandle &&
          (input.simulateProdTimingMs ?? 0) > 0 &&
          restartIteration === 0
        ) {
          await sleep(input.simulateProdTimingMs!)
        }

        const output = await processMessage({
          message: turnEffectiveMessage,
          currentMode: input.state.currentMode,
          intentsVistos: input.state.intentsVistos ?? [],
          templatesEnviados: input.state.templatesEnviados ?? [],
          datosCapturados: input.state.datosCapturados ?? {},
          packSeleccionado: input.state.packSeleccionado ?? null,
          accionesEjecutadas: input.state.accionesEjecutadas ?? [],
          history: input.history,
          turnNumber: input.turnNumber,
          workspaceId: input.workspaceId,
          systemEvent: input.systemEvent,
          // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04).
          // Thread lock fields through to the agent — agent + sub-loop already
          // skip-guard on null (shipped by parent standalone Plan 05).
          lockHandle: input.lockHandle ?? null,
          lockChannel: input.lockChannel ?? null,
          lockIdentifier: input.lockIdentifier ?? null,
        })

        // R-05 (debounce-v2-interrupt-reprocess): accumulate per-call tokens
        // across restart iterations. The final return uses
        // `totalTokensAcrossRestarts` (NOT `output.totalTokens`) as the single
        // source of truth for cost accounting (Pitfall 2).
        totalTokensAcrossRestarts += (output.totalTokens ?? 0)

        // ============================================================
        // R-04 + Pitfall 7 (debounce-v2-interrupt-reprocess): detect Path A
        // interrupt surfaced by the agent's V4AgentOutput.errorMessage.
        // Sources of the discriminator prefix `interrupted_at_ckpt_`:
        //   - in-agent CKPT-1 (post-comprehension)
        //   - in-agent CKPT-2 (post-state-machine)
        //   - sub-loop CKPT-3/4/5 propagated via mapOutcomeToAgentOutput
        // ============================================================
        if (
          output.success === false &&
          typeof output.errorMessage === 'string' &&
          output.errorMessage.startsWith('interrupted_at_ckpt_')
        ) {
          if (!lockCtx) {
            throw new Error(`[SomnioV4Engine] agent emitted ${output.errorMessage} but lockCtx is null`)
          }
          const pending = await readAndClearPending(input.workspaceId, lockCtx.channel, lockCtx.identifier)
          // Consume the interrupt signal too (bug 2026-05-28) — see CKPT-0 site.
          await clearInterrupt(input.workspaceId, lockCtx.channel, lockCtx.identifier)
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
          effectiveMessage = [turnEffectiveMessage, ...pending.map(p => p.content)].join('\n')
          shouldRestart = true
          continue
        }

        // === CKPT-6 pre-send-loop ===
        // Note: V4ProductionRunner has a CKPT-6a pending-templates pre-send branch
        // (at v4-production-runner.ts:464) that we do NOT mirror here — sandbox has
        // no pending-templates pre-send (sandbox doesn't carry pending templates
        // across turns). See top-of-while comment block for the full rationale.
        if (input.lockHandle && lockCtx) {
          const ck6 = await checkpoint(
            'ckpt_6_pre_send_loop',
            input.lockHandle,
            input.workspaceId,
            lockCtx.channel,
            lockCtx.identifier,
            { hasSentAnything: false },
          )
          if (ck6.lostLock) throw new LostLockError('ckpt_6_pre_send_loop')
          if (!ck6.proceed && ck6.interrupted) {
            // In sandbox, sentCount is always 0 at this point (the CKPT-7.N
            // synthetic loop runs AFTER CKPT-6). Always Path A → restart.
            const pending = await readAndClearPending(input.workspaceId, lockCtx.channel, lockCtx.identifier)
            // Consume the interrupt signal too (bug 2026-05-28) — see CKPT-0 site.
            await clearInterrupt(input.workspaceId, lockCtx.channel, lockCtx.identifier)
            restartIteration++
            emitLockEvent('msg_aborted_path_a_combined', {
              at_step: 'ckpt_6_pre_send_loop',
              templates_sent_before_abort: 0,
              combined_msg_count: pending.length + 1,
              total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
              restart_iteration: restartIteration,
            })
            emitLockEvent('pending_list_combined', {
              at_step: 'ckpt_6_pre_send_loop',
              entries_count: pending.length,
              total_chars: pending.reduce((s, p) => s + p.content.length, 0),
              restart_iteration: restartIteration,
            })
            effectiveMessage = [turnEffectiveMessage, ...pending.map(p => p.content)].join('\n')
            shouldRestart = true
            continue
          }
        }

        // ============================================================
        // CKPT-7.N synthetic per-template filter (D-04 + D-05).
        // Sandbox does not call MessagingProductionAdapter.send — the route returns
        // output.messages directly to the client UI. To preserve paridad with
        // WhatsApp's CKPT-7.N (which fires per template in
        // V4MessagingAdapter.shouldAbortBeforeTemplate), we synthesize the
        // per-message abort gate here. NO restart on interrupt at CKPT-7.N
        // (D-05 from parent: post-send is Path B).
        // ============================================================
        const finalMessages: string[] = []
        for (let i = 0; i < output.messages.length; i++) {
          // Simulate production per-template send pacing (post-smoke fix 2026-05-27).
          // Lock stays held during these sleeps. If msg2 arrives during a gap, the
          // NEXT iteration's CKPT-7.N checkpoint detects the interrupt and breaks
          // (Path B abort). Skip on iteration 0 — match the production behavior where
          // pacing happens BETWEEN sends, not before the first.
          if (
            i > 0 &&
            input.lockHandle &&
            (input.simulateProdTimingMs ?? 0) > 0
          ) {
            // ~2-6s per template proportional to length (capped). Production
            // V4MessagingAdapter has variable typing-speed delays in this range.
            const perTemplateMs = Math.max(
              2000,
              Math.min(6000, output.messages[i].length * 25),
            )
            await sleep(perTemplateMs)
          }
          if (input.lockHandle && lockCtx) {
            const ck7 = await checkpoint(
              'ckpt_7_pre_template',
              input.lockHandle,
              input.workspaceId,
              lockCtx.channel,
              lockCtx.identifier,
              { templateIndex: i, hasSentAnything: i > 0 },
            )
            if (ck7.lostLock) throw new LostLockError(`ckpt_7_pre_template_${i}`)
            if (!ck7.proceed && ck7.interrupted) {
              const pending = await readAndClearPending(input.workspaceId, lockCtx.channel, lockCtx.identifier)
              await clearInterrupt(input.workspaceId, lockCtx.channel, lockCtx.identifier)
              if (i === 0) {
                // Nothing sent yet this iteration → Path A: combine prior msg
                // with the interrupting message(s) and re-run from the top.
                restartIteration++
                emitLockEvent('msg_aborted_path_a_combined', {
                  at_step: `ckpt_7_pre_template_${i}`,
                  templates_sent_before_abort: 0,
                  combined_msg_count: pending.length + 1,
                  total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
                  restart_iteration: restartIteration,
                })
                emitLockEvent('pending_list_combined', {
                  at_step: `ckpt_7_pre_template_${i}`,
                  entries_count: pending.length,
                  total_chars: pending.reduce((s, p) => s + p.content.length, 0),
                  restart_iteration: restartIteration,
                })
                effectiveMessage = [turnEffectiveMessage, ...pending.map(p => p.content)].join('\n')
                shouldRestart = true
                break
              }
              // Path B (i > 0): templates already sent for the prior message.
              // Abort the rest, KEEP what was sent, and ANSWER the interrupting
              // message(s) so the customer's question is never dropped. Re-run
              // with the NEW message(s) ONLY — the prior message was already
              // (partially) answered, so re-combining it would re-send templates.
              emitLockEvent('msg_aborted_path_b_solo', {
                at_step: `ckpt_7_pre_template_${i}`,
                templates_sent_before_abort: i,
              })
              if (pending.length > 0) {
                // Preserve what was already sent, then re-run with the new
                // message(s) only. Push here (not in the post-loop block, which
                // is skipped by `continue` below) so the count isn't doubled.
                accumulatedSentMessages.push(...finalMessages)
                restartIteration++
                emitLockEvent('pending_list_combined', {
                  at_step: `ckpt_7_pre_template_${i}`,
                  entries_count: pending.length,
                  total_chars: pending.reduce((s, p) => s + p.content.length, 0),
                  restart_iteration: restartIteration,
                })
                effectiveMessage = pending.map(p => p.content).join('\n')
                shouldRestart = true
              }
              break
            }
          }
          finalMessages.push(output.messages[i])
          // Progressive reveal hook (post-smoke fix 2026-05-27). Invoked AFTER
          // CKPT-7.N succeeds for this template AND the per-template pacing
          // sleep has elapsed. Streaming sandbox route uses this to flush the
          // template chunk to the browser immediately, mirroring the per-template
          // observability of WhatsApp prod's V4MessagingAdapter.send().
          if (input.onMessage) {
            await input.onMessage(output.messages[i], i)
          }
        }
        // Path B reprocess (or Path A combine at CKPT-7.1): jump to the next
        // restart iteration WITHOUT building/returning state for this partial
        // iteration. The already-sent templates are preserved in
        // accumulatedSentMessages (pushed in the CKPT-7.N branch for Path B).
        if (shouldRestart) continue
        accumulatedSentMessages.push(...finalMessages)
        templatesSentCount = accumulatedSentMessages.length

        const newState: SandboxState = {
          currentMode: output.newMode ?? input.state.currentMode,
          intentsVistos: output.intentsVistos,
          templatesEnviados: output.templatesEnviados,
          datosCapturados: output.datosCapturados,
          packSeleccionado: output.packSeleccionado as PackSelection | null,
          accionesEjecutadas: output.accionesEjecutadas,
        }

        // Clean stale `_v3:` keys from datosCapturados (now flow as own fields).
        // El namespace `_v3:` se preserva para DB compat (sessions productivas);
        // estas keys específicas se reconstruyen desde first-class fields.
        delete newState.datosCapturados['_v3:accionesEjecutadas']
        delete newState.datosCapturados['_v3:templatesMostrados']

        // Pick the last timer signal (most relevant)
        const lastTimerSignal = output.timerSignals.length > 0
          ? output.timerSignals[output.timerSignals.length - 1]
          : undefined

        lastV4Result = {
          success: output.success,
          messages: accumulatedSentMessages,
          newState,
          timerSignal: lastTimerSignal,
          debugTurn: {
            turnNumber: input.turnNumber,
            intent: output.intentInfo ? {
              intent: output.intentInfo.intent,
              confidence: output.intentInfo.confidence,
              intent_confidence: output.intentInfo.intent_confidence,
              reasoning: output.intentInfo.reasoning,
              timestamp: output.intentInfo.timestamp,
            } : output.errorMessage ? {
              // Standalone: somnio-sales-v4-runtime-wiring / Plan 07 debug.
              // Surface real catch-block errors instead of the misleading
              // "Timer event - no comprehension" fallback.
              intent: 'error',
              confidence: 0,
              reasoning: `ERROR: ${output.errorMessage}`,
              timestamp,
            } : {
              intent: 'system_event',
              confidence: 0,
              reasoning: 'Timer event - no comprehension',
              timestamp,
            },
            tools: [],
            tokens: {
              turnNumber: input.turnNumber,
              tokensUsed: totalTokensAcrossRestarts,
              models: [{
                model: 'gemini-2.5-flash' as const,
                inputTokens: Math.round(totalTokensAcrossRestarts * 0.7),
                outputTokens: Math.round(totalTokensAcrossRestarts * 0.3),
              }],
              timestamp,
            },
            stateAfter: newState,
            classification: output.decisionInfo ? {
              category: output.timerSignals.some(s => s.level === 'L5') ? 'SILENCIOSO'
                : output.newMode === 'handoff' ? 'HANDOFF'
                : 'RESPONDIBLE',
              reason: output.decisionInfo.reason,
              rulesChecked: { rule1: false, rule1_5: false, rule2: false, rule3: false },
            } : undefined,
            orchestration: output.decisionInfo ? {
              nextMode: output.newMode ?? input.state.currentMode,
              previousMode: input.state.currentMode,
              modeChanged: !!output.newMode && output.newMode !== input.state.currentMode,
              shouldCreateOrder: output.shouldCreateOrder,
              templatesCount: output.messages.length,
            } : undefined,
            salesTrack: output.salesTrackInfo ? {
              accion: output.salesTrackInfo.accion,
              reason: output.salesTrackInfo.reason,
              enterCaptura: output.salesTrackInfo.enterCaptura,
            } : undefined,
            responseTrack: output.responseTrackInfo ? {
              salesIntents: output.responseTrackInfo.salesTemplateIntents,
              infoIntents: output.responseTrackInfo.infoTemplateIntents,
              totalMessages: output.responseTrackInfo.totalMessages,
            } : undefined,
            // V4 escalation visibility (Plan 03 D-20 TODO honored in Plan 07 debug):
            // subLoopReason populated when sub-loop fired (otherwise null/undefined).
            // threshold = platform_config.somnio_v4_low_confidence_threshold value used.
            subLoopReason: output.subLoopReason ?? undefined,
            threshold: output.threshold,
            // Standalone: v4-subloop-debug-view / Plan 03 (D-02).
            // Sub-loop debug payload propagated when sub-loop fired (otherwise undefined).
            subLoopDebug: output.subLoopDebug,
            timerSignals: output.timerSignals.map(s => ({
              type: s.type,
              level: s.level,
              reason: s.reason,
            })),
          },
        }
        break  // exit while loop (we have a result)
      }  // end while (shouldRestart)

      if (!lastV4Result) {
        throw new Error('[SomnioV4Engine] restart loop exited without lastV4Result — invariant violation')
      }

      // ============================================================
      // Pitfall 5 (debounce-v2-sandbox-integration RESEARCH §Pitfall 5):
      // Write sandbox-result:{id} to Redis BEFORE the outer finally
      // releases the lock. FOLLOWER long-polls this key after seeing the
      // HOLDER's lock — if we released the lock before writing the result,
      // FOLLOWER could acquire the lock as new HOLDER and never see the
      // previous turn's output (UI would timeout).
      // ============================================================
      if (input.sandboxSessionId && input.lockHandle && lastV4Result) {
        try {
          await redis.set(
            `sandbox-result:${input.sandboxSessionId}`,
            JSON.stringify(lastV4Result),
            { ex: 60 },
          )
        } catch (resultWriteErr) {
          // Non-fatal — log only; finally still releases lock;
          // FOLLOWER will time out long-poll.
          console.error('[SomnioV4Engine] sandbox-result write failed', resultWriteErr)
        }
      }

      return lastV4Result
    } catch (error) {
      // ============================================================
      // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 LostLockError path).
      // Detect LostLockError before falling through to the existing non-lock
      // error fallback (which is preserved verbatim for backward compat).
      // ============================================================
      if (error instanceof LostLockError) {
        emitLockEvent('zombie_lambda_exit', {
          my_uuid: input.lockHandle?.holderUuid ?? 'unknown',
          current_holder_uuid: 'unknown',  // Don't read lock value — racy.
          at_step: error.ckptId,
        })
        const zombieResult: V4EngineOutput = {
          success: false,
          messages: [],
          newState: input.state,
          debugTurn: {
            turnNumber: input.turnNumber,
            intent: {
              intent: 'error',
              confidence: 0,
              reasoning: `LOST_LOCK at ${error.ckptId}`,
              timestamp,
            },
            tools: [],
            tokens: {
              turnNumber: input.turnNumber,
              tokensUsed: totalTokensAcrossRestarts,
              models: [],
              timestamp,
            },
            stateAfter: input.state,
          },
          error: { code: 'V4_ZOMBIE_LAMBDA_EXIT', message: error.message },
        }
        // Still write sandbox-result so FOLLOWER long-poll does not hang.
        if (input.sandboxSessionId && input.lockHandle) {
          try {
            await redis.set(
              `sandbox-result:${input.sandboxSessionId}`,
              JSON.stringify(zombieResult),
              { ex: 60 },
            )
          } catch (resultWriteErr) {
            console.error('[SomnioV4Engine] sandbox-result zombie write failed', resultWriteErr)
          }
        }
        return zombieResult
      }

      // Existing fallback for non-lock errors — UNCHANGED.
      // The pre-existing inner-catch fallback (non-LostLockError) preserves its
      // existing tokensUsed shape; do NOT modify it during this plan — the
      // totalTokensAcrossRestarts accumulator is for the success-path return only.
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[SomnioV4Engine] Error:', error)

      return {
        success: true,
        messages: [`[Error v4] ${errorMsg}`],
        newState: input.state,
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: {
            intent: 'error',
            confidence: 0,
            reasoning: errorMsg,
            timestamp,
          },
          tools: [],
          tokens: {
            turnNumber: input.turnNumber,
            tokensUsed: 0,
            models: [],
            timestamp,
          },
          stateAfter: input.state,
        },
        error: {
          code: 'V4_ENGINE_ERROR',
          message: errorMsg,
        },
      }
    }
    } finally {
      // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-05 + Pitfall 6).
      // Lock + heartbeat lifecycle ALWAYS released exactly once per processMessage,
      // regardless of which iteration of the restart loop returned/threw.
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
          emitLockEvent('redis_unavailable_fallback_failed', {
            error_message: releaseError instanceof Error ? releaseError.message : String(releaseError),
            at_step: 'release_lock_in_finally',
          })
        }
      }
    }
  }
}
