/**
 * V4 Production Runner — Thin I/O Runner for Somnio Sales Agent v4 (standalone: somnio-sales-v4-runtime-wiring, D-13)
 *
 * ⚠️ INTERRUPCIÓN: este runner es el lado PRODUCCIÓN del sistema de interrupción.
 * El mecanismo (Path A/B, dropOwnEntry, carryState, restart loop) DEBE ir alineado
 * con el lado sandbox (`somnio-v4/engine-v4.ts`) aunque el código no sea idéntico.
 * Antes de tocar la lógica de interrupción acá, leé el contrato de paridad:
 * `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md`.
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
import type { V4AgentInput, V4AgentOutput, ProcessedMessage, TurnLedgerDims } from '../somnio-v4/types'

// Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.3) —
// REVISION W3: channel/identifier come from input.lockChannel + input.lockIdentifier
// (populated by Plan 03 webhook → event.data). The runner does NOT introduce a
// Supabase conversations-table lookup (NO createAdminClient added here).
// D-06 (Plan 07): el skip-gate + lostLock throw de CKPT-0/6a/6b está factorizado
// en runCheckpointGate (specifier absoluto — el runner vive fuera de somnio-v4/).
import { runCheckpointGate } from '@/lib/agents/somnio-v4/core/checkpoint-gate'
import { releaseLockIfOwner, startHeartbeat } from '@/lib/agents/interruption-system-v2/lock'
import { readAndClearPending, clearInterrupt } from '@/lib/agents/interruption-system-v2/pending'
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

    // Bug 2026-05-28 (phantom self-message): the webhook RPUSHes the HOLDER's
    // OWN inbound message into the pending list (D-16) so it is crash-recoverable
    // until the first template is sent (the V4MessagingAdapter's
    // onFirstSendCompleted LREMs it). But ALL 4 Path A drain sites below fire
    // BEFORE the first send, so the holder's own entry is still present and would
    // be re-combined with itself (priorMsg === input.message === own entry's
    // content → "msg1\nmsg1\n…"). Parse the holder's own entry_uuid once and
    // EXCLUDE it from every Path A drain. Filtering by entry_uuid (vs byte-exact
    // removeOwnEntry) is robust against JSON drift and needs no Redis round-trip.
    let ownEntryUuid: string | null = null
    if (input.ownPendingEntryJson) {
      try {
        ownEntryUuid = (JSON.parse(input.ownPendingEntryJson) as { entry_uuid?: string }).entry_uuid ?? null
      } catch {
        ownEntryUuid = null
      }
    }
    const dropOwnEntry = <T extends { entry_uuid: string }>(entries: T[]): T[] =>
      ownEntryUuid ? entries.filter((e) => e.entry_uuid !== ownEntryUuid) : entries

    // Bug 2026-05-28 (Path B clean reprocess): when an interrupt aborts AFTER ≥1
    // template was already sent, the customer redirected — so we DISCARD the rest
    // of msg1's response and answer the interrupting message(s) cleanly in the
    // SAME lambda. `carryState` seeds the reprocess iteration from the aborted
    // iteration's resulting state so the agent does NOT re-greet and the
    // no-repetition filter does NOT re-send already-sent templates. Stays null on
    // Path A combine (which re-runs from the original session state, by design).
    // `accumulatedSentContents` preserves everything the customer already saw
    // across iterations for the final assistant-turn record + return payload.
    // The pending list is drained whole every time + the while loop re-runs on any
    // new interrupt, so N piled-up messages (msg2,msg3,…) and cascading interrupts
    // are handled structurally — no per-message special-casing.
    let carryState: {
      intentsVistos: string[]
      templatesEnviados: string[]
      datosCapturados: Record<string, string>
      packSeleccionado: string | null
      accionesEjecutadas: unknown[]
      currentMode: string
      // somnio-v4-turn-ledger Plan 04 (Task 1, P3): el reprocess Path B hereda las
      // dims del output de la iteración previa → no re-registra ni pierde efectos.
      // turnCount NO vive aquí (vive en mergeAnalysis) → cero double-increment.
      turnLedgerDims: TurnLedgerDims
    } | null = null
    const accumulatedSentContents: string[] = []

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
      {
        // D-06 (Plan 07): skip-gate + lostLock throw factorizados en
        // runCheckpointGate (SIN interruptEmit — este site emite en su drain).
        // La colocación CKPT-0 y el drain/restart NO se mueven.
        const ck0 = await runCheckpointGate({
          ckptId: 'ckpt_0_post_acquire',
          lockHandle: input.lockHandle,
          workspaceId: this.config.workspaceId,
          lockChannel: lockCtx?.channel,
          lockIdentifier: lockCtx?.identifier,
        })
        if (typeof ck0 === 'object' && lockCtx) {
          // ============================================================
          // Standalone: debounce-v2-interrupt-reprocess (D-04 + R-01).
          // Path A interrupt at CKPT-0 — restart turn with combined
          // effectiveMessage instead of silently persisting + returning
          // (BEFORE FIX: bot stayed mute until a third inbound arrived).
          // Pitfall 8: NO saveState during restart iterations — the
          // combined message lives in-memory in `effectiveMessage` until
          // the iteration completes successfully.
          // ============================================================
          const pending = dropOwnEntry(await readAndClearPending(
            this.config.workspaceId,
            lockCtx.channel,
            lockCtx.identifier,
          ))
          // Consume the interrupt signal too (bug 2026-05-28): else the next
          // iteration's CKPT-0 re-reads the still-set interrupt key and spins
          // Path A on an empty pending list until the 60s TTL expires.
          await clearInterrupt(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
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
          // Chronological order: priorMsg (older, was being processed) FIRST,
          // then pending entries (newer, arrived during processing) LAST.
          // Pending list is RPUSH-ordered by FOLLOWER arrival time.
          effectiveMessage = [priorMsg, ...pending.map((p) => p.content)].join('\n')
          shouldRestart = true
          continue
        }
      }

      // CRASH-RECOVERY LEGACY `_v3:pendingUserMessage` (D-18 somnio-v4-consolidation — CONSERVAR):
      // - Por qué existe: cubre el edge de interrupt con pending-list de Redis VACÍA y 0 sends
      //   (lambda murió tras consumir el mensaje pero antes de enviar nada) — el mensaje del usuario
      //   se persiste en session_state y se re-combina en la siguiente iteración.
      // - ORDEN CRÍTICO (Pitfall 7): el drain de CKPT-0 usa `effectiveMessage ?? input.message` ANTES
      //   de este combine. Reordenar causaría combine doble en interrupt-en-CKPT-0 con pending presente.
      // - Es funcional, NO código muerto. Borrable cuando v3 muera (D-38 / cosecha S-7).
      //
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
      const inputDatosCapturados = { ...currentDatos }
      // Remove pending message from datos so pipeline doesn't see it
      delete inputDatosCapturados['_v3:pendingUserMessage']

      // Read acciones_ejecutadas: prefer dedicated column (new), fallback to _v3: key in datos_capturados
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawState = session.state as any
      const sessionAccionesEjecutadas = rawState.acciones_ejecutadas ??
        (() => {
          try {
            const raw = (session.state.datos_capturados ?? {})['_v3:accionesEjecutadas']
            return raw ? JSON.parse(raw) : []
          } catch { return [] }
        })()

      // somnio-v4-turn-ledger Plan 04 (Task 1): restaurar dims persistidas del turno
      // previo desde la columna `turn_ledger_dims` (Plan 02). Default graceful para
      // sesiones legacy sin la columna o con `{}` (D-16). El carryState de un reprocess
      // Path B lo override más abajo (P3).
      const sessionTurnLedgerDims: TurnLedgerDims =
        (rawState.turn_ledger_dims as TurnLedgerDims | undefined) ?? { atendido: [], crmActions: [] }

      // V4 expects intentsVistos as string[], production stores IntentRecord[]
      // Extract just the intent names
      const sessionIntentsVistos: string[] = inputIntentsVistos.map(
        (r: { intent: string } | string) => typeof r === 'string' ? r : r.intent
      )

      // Seed = session-derived state by default. On a Path B reprocess (bug
      // 2026-05-28) `carryState` overrides it so the reprocess iteration knows the
      // saludo/templates were already sent (no re-greet, no re-send). On Path A
      // combine carryState stays null → original session state, by design.
      const seed: {
        intentsVistos: string[]
        templatesEnviados: string[]
        datosCapturados: Record<string, string>
        packSeleccionado: string | null
        accionesEjecutadas: unknown[]
        currentMode: string
        // somnio-v4-turn-ledger Plan 04 (Task 1): dims del turno previo (P3 — el
        // reprocess Path B hereda del output previo vía carryState; aquí default
        // desde la sesión).
        turnLedgerDims: TurnLedgerDims
      } = carryState ?? {
        intentsVistos: sessionIntentsVistos,
        templatesEnviados: session.state.templates_enviados ?? [],
        datosCapturados: inputDatosCapturados,
        packSeleccionado: session.state.pack_seleccionado as string | null,
        accionesEjecutadas: sessionAccionesEjecutadas,
        currentMode: session.current_mode,
        turnLedgerDims: sessionTurnLedgerDims,
      }
      // Used by the no-repetition filter + final state-save union. Points at the
      // seed so a Path B reprocess carries iter-1's already-sent IDs forward
      // (filter won't re-send them; final save records the full set).
      const inputTemplatesEnviados = seed.templatesEnviados

      const v4Input: V4AgentInput = {
        message: turnEffectiveMessage,
        history,
        currentMode: seed.currentMode,
        intentsVistos: seed.intentsVistos,
        templatesEnviados: seed.templatesEnviados,
        datosCapturados: seed.datosCapturados,
        packSeleccionado: seed.packSeleccionado,
        // seed.accionesEjecutadas es unknown[] (carryState lo arrastra así para evitar
        // import cross-módulo); en runtime es AccionRegistrada[]. Cast explícito —
        // error pre-existente al Plan 04 (línea ~350 en HEAD), formalizado aquí al
        // threadear dims sin introducir nuevos errores de tipo.
        accionesEjecutadas: seed.accionesEjecutadas as V4AgentInput['accionesEjecutadas'],
        // somnio-v4-turn-ledger Plan 04 (Task 1): dims restauradas → el agente las
        // recibe para coherencia del turno (passthrough en interrupt/error, D-07).
        turnLedgerDims: seed.turnLedgerDims,
        turnNumber,
        workspaceId: this.config.workspaceId,
        sessionId: session.id,
        // systemEvent: undefined — only for timers, not user messages
        // standalone v4-media-audio-image (Plan 04): thread vision context from
        // EngineInput → V4AgentInput. Only populated on v4 image-respond path.
        visionContext: input.visionContext,
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
      //   - sub-loop CKPT-3/4/5 propagated today via the slot resolver path
      //     (`resolveLowSlot`), which surfaces the `interrupted_at_ckpt_*`
      //     discriminator inline. (El antiguo mapper de outcome del agente fue
      //     borrado en somnio-v4-consolidation Plan 02; el mecanismo discriminator
      //     sigue vivo vía el slot resolver.)
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
        const pending = dropOwnEntry(await readAndClearPending(
          this.config.workspaceId,
          lockCtx.channel,
          lockCtx.identifier,
        ))
        // Consume the interrupt signal too (bug 2026-05-28) — see CKPT-0 site.
        await clearInterrupt(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
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
        // Chronological order: turnEffectiveMessage (older, was being processed)
        // FIRST, then pending entries (newer, arrived during processing) LAST.
        // Pending list is RPUSH-ordered by FOLLOWER arrival time.
        effectiveMessage = [turnEffectiveMessage, ...pending.map((p) => p.content)].join('\n')
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

      // 5g. Orders — D-06 big-bang (standalone somnio-v4-crm-subloop Plan 06): el
      // runner ya NO crea el pedido. El gate CRM (runCrmGate) lo hace DENTRO del
      // sub-loop GROUNDED y reporta el resultado en output.crmResult (Pitfall 6).
      // El bloque del orders-adapter createOrder fue eliminado; los consumidores
      // (state_committed.orderCreated + EngineOutput.orderCreated/orderId/contactId)
      // se re-cablean a output.crmResult mas abajo.

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
      {
        // D-06 (Plan 07): gate factorizado; opts hasSentAnything:false y
        // lostLockLabel _pending_templates preservados byte-exacto; drain intacto.
        const ck6a = await runCheckpointGate({
          ckptId: 'ckpt_6_pre_send_loop',
          lockHandle: input.lockHandle,
          workspaceId: this.config.workspaceId,
          lockChannel: lockCtx?.channel,
          lockIdentifier: lockCtx?.identifier,
          opts: { hasSentAnything: false },
          lostLockLabel: 'ckpt_6_pre_send_loop_pending_templates',
        })
        if (typeof ck6a === 'object' && lockCtx) {
          // ============================================================
          // Standalone: debounce-v2-interrupt-reprocess (D-04 + R-01).
          // Path A interrupt at CKPT-6a (pending-templates pre-send) —
          // restart turn with combined effectiveMessage instead of silently
          // persisting + returning. Pitfall 8: NO saveState during restart
          // iterations.
          // ============================================================
          const pending = dropOwnEntry(await readAndClearPending(
            this.config.workspaceId,
            lockCtx.channel,
            lockCtx.identifier,
          ))
          // Consume the interrupt signal too (bug 2026-05-28) — see CKPT-0 site.
          await clearInterrupt(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
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
          // Chronological order: turnEffectiveMessage (older, was being processed)
          // FIRST, then pending entries (newer, arrived during processing) LAST.
          // Pending list is RPUSH-ordered by FOLLOWER arrival time.
          effectiveMessage = [turnEffectiveMessage, ...pending.map((p) => p.content)].join('\n')
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
      {
        // D-06 (Plan 07): gate factorizado; opts hasSentAnything dinámico y
        // lostLockLabel _main preservados byte-exacto; Path A/B intactos.
        const ck6b = await runCheckpointGate({
          ckptId: 'ckpt_6_pre_send_loop',
          lockHandle: input.lockHandle,
          workspaceId: this.config.workspaceId,
          lockChannel: lockCtx?.channel,
          lockIdentifier: lockCtx?.identifier,
          opts: { hasSentAnything: actuallySentIds.length > 0 },
          lostLockLabel: 'ckpt_6_pre_send_loop_main',
        })
        if (typeof ck6b === 'object' && lockCtx) {
          const sentCount = actuallySentIds.length
          if (sentCount === 0) {
            // ============================================================
            // Standalone: debounce-v2-interrupt-reprocess (D-01 + D-05).
            // Path A — restart turn with combined effectiveMessage instead
            // of silently persisting + returning. Pitfall 8: NO saveState
            // during restart iterations.
            // ============================================================
            const pending = dropOwnEntry(await readAndClearPending(
              this.config.workspaceId,
              lockCtx.channel,
              lockCtx.identifier,
            ))
            // Consume the interrupt signal too (bug 2026-05-28) — see CKPT-0 site.
            await clearInterrupt(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
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
            // Chronological order: turnEffectiveMessage (older, was being processed)
            // FIRST, then pending entries (newer, arrived during processing) LAST.
            // Pending list is RPUSH-ordered by FOLLOWER arrival time.
            effectiveMessage = [turnEffectiveMessage, ...pending.map((p) => p.content)].join('\n')
            shouldRestart = true
            continue
          }
          // Path B (bug 2026-05-28 — clean reprocess): prior-turn pending
          // templates were just (re)sent and the customer interrupted. Discard
          // THIS turn's msg1 output (not yet sent — 5h-main runs after this) and
          // answer the new message(s) clean in-lambda. If nothing is queued,
          // finish (keep what was sent). The new message(s) were NOT drained in
          // the sentCount===0 branch above, so drain them here.
          const pendingB = dropOwnEntry(await readAndClearPending(
            this.config.workspaceId,
            lockCtx.channel,
            lockCtx.identifier,
          ))
          await clearInterrupt(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
          emitLockEvent('msg_aborted_path_b_solo', {
            at_step: 'ckpt_6_pre_send_loop_main',
            templates_sent_before_abort: sentCount,
          })
          if (pendingB.length > 0) {
            restartIteration++
            emitLockEvent('pending_list_combined', {
              at_step: 'ckpt_6_pre_send_loop_main',
              entries_count: pendingB.length,
              total_chars: pendingB.reduce((s, p) => s + p.content.length, 0),
              restart_iteration: restartIteration,
            })
            // msg1's output was NOT sent (only the prior-turn pending templates
            // were) → carry the SESSION state forward (not msg1's output) so the
            // reprocess does not mark msg1's intents as seen.
            accumulatedSentContents.push(...sentMessageContents)
            carryState = {
              intentsVistos: seed.intentsVistos,
              templatesEnviados: [...inputTemplatesEnviados, ...actuallySentIds],
              datosCapturados: seed.datosCapturados,
              packSeleccionado: seed.packSeleccionado,
              accionesEjecutadas: seed.accionesEjecutadas,
              currentMode: seed.currentMode,
              // somnio-v4-turn-ledger Plan 04 (P3): msg1's output NO se envió (solo
              // los templates pendientes del turno previo) → arrastrar las dims de la
              // SESIÓN (seed), no las del output de msg1.
              turnLedgerDims: seed.turnLedgerDims,
            }
            effectiveMessage = pendingB.map((p) => p.content).join('\n')
            shouldRestart = true
            continue
          }
          // Nothing queued → finish: keep what was sent (this + prior iterations).
          templatesSentCount = accumulatedSentContents.length + sentCount
          return {
            success: true,
            messages: [],
            sessionId: session.id,
            messagesSent: accumulatedSentContents.length + sentCount,
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
            // R4-B: rag:* messages are unique generative content; never filter them out.
            // The no-rep filter cannot meaningfully deduplicate generative text (it has no prior
            // templateId to compare against), so rag:* always passes through order-preservingly.
            templatesToSend = templatesToSend.filter(t => t.templateId.startsWith('rag:') || survivingIds.has(t.templateId))

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
            // T-7: rag:* pseudo-ids must never enter templates_enviados. The canonical RAG record
            // is the turn ledger (atendido[{kind:'kb_topic'}]), not the template-dedup store.
            // Filtering here covers all three persist sites (724, 892, 1076) since they all
            // consume actuallySentIds — single-point fix.
            .filter((id): id is string => id != null && id.length > 0 && !id.startsWith('rag:'))
          actuallySentIds.push(...sentIds)

          // Interruption handling (bug 2026-05-28 — clean in-lambda reprocess).
          // The customer interrupted mid-send. Instead of deferring the new
          // message to the next inbound (which orphans it if the customer goes
          // silent), we answer it in THIS lambda. Two cases:
          //   - 0 sent this turn  → Path A: nothing delivered, so recombine
          //     priorMsg + new message(s) and re-run from the top.
          //   - ≥1 sent this turn → Path B: the customer redirected, so DISCARD
          //     the rest of msg1's response and answer the new message(s) clean,
          //     carrying state forward (no re-greet, no re-send of sent IDs).
          // The pending list is drained whole + the while loop re-runs on any new
          // interrupt, so N piled-up messages + cascades are handled structurally.
          if (sendResult.interrupted && lockCtx) {
            // Customer redirected → discard any leftover msg1 templates.
            if (this.adapters.storage.clearPendingTemplates) {
              await this.adapters.storage.clearPendingTemplates(session.id)
            }
            const newMsgs = dropOwnEntry(await readAndClearPending(
              this.config.workspaceId, lockCtx.channel, lockCtx.identifier,
            ))
            await clearInterrupt(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)

            if (newMsgs.length > 0) {
              restartIteration++
              const newChars = newMsgs.reduce((s, p) => s + p.content.length, 0)
              if (sendResult.messagesSent === 0) {
                // Path A: nothing delivered → recombine prior + new, re-run.
                emitLockEvent('msg_aborted_path_a_combined', {
                  at_step: 'send_loop_ckpt7',
                  templates_sent_before_abort: 0,
                  combined_msg_count: newMsgs.length + 1,
                  total_chars: newChars + turnEffectiveMessage.length,
                  restart_iteration: restartIteration,
                })
                emitLockEvent('pending_list_combined', {
                  at_step: 'send_loop_ckpt7',
                  entries_count: newMsgs.length,
                  total_chars: newChars,
                  restart_iteration: restartIteration,
                })
                effectiveMessage = [turnEffectiveMessage, ...newMsgs.map(p => p.content)].join('\n')
              } else {
                // Path B: ≥1 delivered → answer the NEW message(s) clean.
                emitLockEvent('msg_aborted_path_b_solo', {
                  at_step: 'send_loop_ckpt7',
                  templates_sent_before_abort: sendResult.messagesSent,
                })
                emitLockEvent('pending_list_combined', {
                  at_step: 'send_loop_ckpt7',
                  entries_count: newMsgs.length,
                  total_chars: newChars,
                  restart_iteration: restartIteration,
                })
                // Preserve what the customer already saw + carry state forward so
                // the reprocess does not re-greet or re-send already-sent IDs.
                accumulatedSentContents.push(...sentMessageContents)
                carryState = {
                  intentsVistos: output.intentsVistos,
                  templatesEnviados: [...inputTemplatesEnviados, ...actuallySentIds],
                  datosCapturados: output.datosCapturados,
                  packSeleccionado: output.packSeleccionado as string | null,
                  accionesEjecutadas: output.accionesEjecutadas,
                  currentMode: output.newMode ?? seed.currentMode,
                  // somnio-v4-turn-ledger Plan 04 (P3): msg1's output SÍ se envió (≥1
                  // template) → heredar las dims del output de msg1 para que el
                  // reprocess no re-registre los efectos de atendido/crmActions.
                  turnLedgerDims: output.turnLedgerDims,
                }
                effectiveMessage = newMsgs.map(p => p.content).join('\n')
              }
              shouldRestart = true
              console.log(`[V4-RUNNER] send-loop interrupt: ${sendResult.messagesSent} sent, reprocessing ${newMsgs.length} new message(s)`)
            } else if (sendResult.messagesSent === 0) {
              // Interrupt fired but nothing queued + nothing sent → fall back to
              // the legacy cross-lambda defer (next inbound combines via R-03).
              // D-18: parte del crash-recovery _v3:pendingUserMessage — ver comentario en el site de lectura/combine
              wasInterruptedWithZeroSends = true
              getCollector()?.recordEvent('pipeline_decision', 'interruption_path_a', {
                sessionId: session.id,
                pendingMessage: input.message.substring(0, 100),
              })
            }
            // (≥1 sent + empty pending → nothing new to answer: finish normally;
            //  leftover msg1 templates already discarded above.)
          } else if (sendResult.interrupted) {
            // No lock (fail-open / pre-v4 path): preserve legacy defer behavior.
            if (sendResult.messagesSent === 0) {
              wasInterruptedWithZeroSends = true
              getCollector()?.recordEvent('pipeline_decision', 'interruption_path_a', {
                sessionId: session.id,
                pendingMessage: input.message.substring(0, 100),
              })
            } else {
              const sentIndex = sendResult.interruptedAtIndex ?? sendResult.messagesSent
              const unsent = templatesToSend.slice(sentIndex)
              if (unsent.length > 0 && this.adapters.storage.savePendingTemplates) {
                await this.adapters.storage.savePendingTemplates(session.id, unsent)
              }
            }
          } else {
            // No interruption — clear stale pending
            if (this.adapters.storage.clearPendingTemplates) {
              await this.adapters.storage.clearPendingTemplates(session.id)
            }
          }
        }
      } else if (output.messages.length > 0 && (!output.templates || output.templates.length === 0)) {
        // D-14 (somnio-v4-consolidation): el viejo branch fallback enviaba
        // `output.messages` sin templates — pero el messaging adapter (parent)
        // DROPEA todo send sin templates desde el passthrough `rag:*`, así que
        // ese send nunca llegaba a nada y el push a `sentMessageContents`
        // registraba texto JAMÁS enviado (bug G-3). Reemplazado por un warning
        // observable: si esto ocurre, queremos VERLO, no fallar en silencio.
        getCollector()?.recordEvent('pipeline_decision', 'v4_messages_without_templates', {
          sessionId: session.id,
          messageCount: output.messages.length,
          preview: output.messages[0]?.slice(0, 120) ?? '',
        })
        console.warn('[V4-RUNNER] output.messages sin templates — nunca debería ocurrir (post rag:* passthrough)')
      }

      // Bug 2026-05-28: a send-loop interrupt with queued message(s) set
      // `shouldRestart` above → jump to the next iteration to answer them
      // WITHOUT running the post-send state save for this (aborted) iteration.
      // Pitfall 8: no DB write across restart iterations; carryState +
      // accumulatedSentContents hold the in-memory continuity.
      if (shouldRestart) continue

      // Everything the customer saw across restart iterations (bug 2026-05-28):
      // prior iterations' sends (Path B reprocess) + this final iteration's sends.
      // Used for the assistant-turn record + the return payload so they reflect
      // the full conversation, not just the last iteration.
      const allSentContents = [...accumulatedSentContents, ...sentMessageContents]
      const totalMessagesSent = accumulatedSentContents.length + messagesSent

      // ================================================================
      // 5-post. POST-SEND: State save + turns (Path A vs Path B decision)
      // ================================================================

      // ============================================================
      // wasInterruptedWithZeroSends now fires only for the residual case: an
      // interrupt was detected at the first-byte send but the pending list was
      // EMPTY (nothing queued to answer) — fall back to the legacy cross-lambda
      // defer (`_v3:pendingUserMessage`) so the next inbound combines via the
      // R-03 iter-1 path. The common interrupt cases (a queued message exists)
      // restart in-lambda above and never reach this block (bug 2026-05-28).
      // ============================================================
      if (wasInterruptedWithZeroSends) {
        // D-18: parte del crash-recovery _v3:pendingUserMessage — ver comentario en el site de lectura/combine
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
        // somnio-v4-turn-ledger Plan 04 (Task 1): persistir el subset del ledger del
        // turno en la columna `turn_ledger_dims` (Plan 02). SOLO en PATH B (turno
        // commiteado). En PATH A (wasInterruptedWithZeroSends) NO se persisten las
        // dims — el turno se descarta (P6).
        await this.adapters.storage.saveState(session.id, {
          datos_capturados: output.datosCapturados,
          intents_vistos: output.intentsVistos,
          pack_seleccionado: output.packSeleccionado,
          acciones_ejecutadas: output.accionesEjecutadas,
          // Default vacío si el output legacy/mock omite las dims (contrato: commitTurn
          // siempre las produce; el default solo cubre robustez).
          turn_ledger_dims: output.turnLedgerDims ?? { atendido: [], crmActions: [] },
        })

        // ============================================================
        // somnio-v4-turn-ledger Plan 04 (Task 3, D-13/D-17b): emitir el ledger
        // COMPLETO a agent_observability_events. Almacén analítico cross-sesión
        // SEPARADO del blob per-sesión (turn_ledger_dims). Aquí se CONSUMEN los
        // campos del TurnLedger que NO se persisten (modeTransition/confidence/
        // messagesSent) — ninguno queda fantasma. SOLO en PATH B (turno commiteado;
        // Path A descarta el turno, no emite). Emit en el runner (que tiene el
        // collector) — commitTurn queda puro sin I/O (state.ts sin side-effects).
        // ============================================================
        {
          const collector = getCollector()
          // Defensive: turnLedgerDims es requerido por contrato (commitTurn siempre lo
          // produce), pero un output legacy/mock podría omitirlo → default vacío para
          // no crashear el turno completo en el emit (Rule 2 robustez).
          const ledgerDims = output.turnLedgerDims ?? { atendido: [], crmActions: [] }
          if (collector) {
            // 1 evento por cada kb_topic atendido (metadata queryable; NO el texto
            // completo — ya truncado en el blob; aquí solo topic/confidence/turno).
            for (const a of ledgerDims.atendido) {
              if (a.kind === 'kb_topic') {
                collector.recordEvent('pipeline_decision', 'kb_topic_registered', {
                  agent: this.config.agentModule ?? 'somnio-v4',
                  sessionId: session.id,
                  topic: a.topic,
                  confidence: a.confidence,
                  turno: a.turno,
                })
              }
            }
            // 1 evento por cada acción CRM registrada (args redactados — observabilidad
            // CRM completa diferida al standalone #2, D-08; aquí tool/result/origen/code).
            for (const ca of ledgerDims.crmActions) {
              collector.recordEvent('pipeline_decision', 'crm_action_recorded', {
                agent: this.config.agentModule ?? 'somnio-v4',
                sessionId: session.id,
                tool: ca.tool,
                result: ca.result,
                origen: ca.origen,
                ...(ca.code ? { code: ca.code } : {}),
              })
            }
            // 1 evento summary del turno: modeTransition + confidence + messagesSent +
            // intent (D-17b — los campos del ledger COMPLETO que NO se persisten).
            // turnLedgerSummary lo expone el AGENTE (fuente de verdad) desde el mismo
            // TurnLedger — el runner NO recalcula. Undefined en interrupt/error (turno
            // descartado) → no emite (no llega aquí en PATH B normal de todos modos).
            if (output.turnLedgerSummary) {
              collector.recordEvent('pipeline_decision', 'turn_ledger_committed', {
                agent: this.config.agentModule ?? 'somnio-v4',
                sessionId: session.id,
                intent: output.turnLedgerSummary.intent,
                confidence: output.turnLedgerSummary.confidence,
                modeTransition: output.turnLedgerSummary.modeTransition ?? null,
                messagesSent: output.turnLedgerSummary.messagesSent,
              })
            }
          }
        }

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
          // D-06 / Pitfall 6: re-cableado del orderResult eliminado a output.crmResult.
          orderCreated: output.crmResult?.success ?? false,
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

        // Orders — D-06 big-bang (standalone somnio-v4-crm-subloop Plan 06): el
        // bloque del orders-adapter createOrder fue ELIMINADO. El pedido (createOrder
        // cascaron / updateOrder pack / moveOrderToStage CONFIRMADO) ya se ejecuto
        // DENTRO del sub-loop GROUNDED via el gate CRM (runCrmGate en somnio-v4-agent),
        // con triple idempotencia (S1) + guards (idempotency/CAS/whitelist). El runner
        // solo LEE output.crmResult (Pitfall 6) — no muta. shouldCreateOrder/orderData
        // quedan @deprecated y el runner los ignora.

        // Assistant turn recording (post-send) — full set across restart
        // iterations so a Path B reprocess records msg1's partial reply + the
        // interrupting message's reply (bug 2026-05-28).
        const assistantContent = allSentContents
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

      // Update outer counter for finally-block lock_released_normal payload —
      // total across restart iterations (bug 2026-05-28).
      templatesSentCount = totalMessagesSent

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
        messagesSent: totalMessagesSent,
        response: allSentContents.join('\n'),
        // D-06 / Pitfall 6: re-cableado del orderResult eliminado a output.crmResult
        // (el sub-loop ejecuto la mutacion; el runner solo reporta el resultado).
        orderCreated: output.crmResult?.success,
        orderId: output.crmResult?.orderId,
        contactId: output.crmResult?.contactId ?? input.contactId,
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
