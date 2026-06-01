/**
 * Agent Production Workflows
 * Phase 16: WhatsApp Agent Integration - Plan 02
 * Updated: Phase 32 - Media Processing (Plan 03)
 *
 * Inngest function for processing incoming WhatsApp messages through
 * the UnifiedEngine in production. Provides:
 * - Async processing (webhook returns 200 immediately)
 * - Concurrency control per conversation (prevents duplicate responses)
 * - Automatic retries on transient failures
 * - Media gate: routes non-text messages (audio, image, video, sticker, reaction)
 *   through transcription/vision/mapping before agent processing
 *
 * Flow: webhook -> Inngest event -> media-gate -> process-message / handoff / ignore
 */

import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import {
  isObservabilityEnabled,
  ObservabilityCollector,
  runWithCollector,
  type AgentId,
} from '@/lib/observability'
// Standalone: debounce-interruption-system-v2 (Plan 03, REVISION B4) —
// resolveAgentIdForWorkspace moved to a shared module so the webhook
// layer (whatsapp + manychat handlers) can STATIC-import it without
// pulling in the entire Inngest functions tree (circular-import risk).
// Behavior is unchanged for existing callers in this file.
import { resolveAgentIdForWorkspace } from '@/lib/agents/registry-helpers'

const logger = createModuleLogger('agent-production')

/**
 * WhatsApp Agent Message Processor
 *
 * Triggered by 'agent/whatsapp.message_received' event emitted from
 * the webhook handler after a message (text or media) is stored in DB.
 *
 * Concurrency limit of 1 per conversation prevents race conditions
 * when multiple messages arrive in quick succession -- each message
 * is processed sequentially for the same conversation.
 *
 * Phase 32 media gate flow:
 * 1. media-gate step: classify message type -> passthrough / handoff / notify_host / ignore
 * 2a. passthrough: process-message step (existing agent pipeline with transformed text)
 * 2b. handoff: execute-media-handoff + cancel-silence-timer (bypass engine)
 * 2c. notify_host: create notification task via domain layer (bot stays active)
 * 2d. ignore: return immediately
 */
export const whatsappAgentProcessor = inngest.createFunction(
  {
    id: 'whatsapp-agent-processor',
    name: 'WhatsApp Agent Message Processor',
    retries: 2,
    // ================================================================
    // Standalone: debounce-interruption-system-v2 (Plan 03, D-14 +
    // RESEARCH Inngest section lines 918-929):
    //
    // KEEP limit=1 — Inngest's per-key concurrency is strict per the
    // Inngest docs; this is belt-and-suspenders to the Redis SET NX in
    // interruption-system-v2/lock.ts. Do NOT raise to 10 or remove.
    // The lock subsystem handles the inter-lambda mutex; this clause
    // handles the same-lambda replay-storm case (cheaper for Inngest
    // than spinning N replicas just to discover the lock is held).
    // ================================================================
    concurrency: [
      {
        key: 'event.data.conversationId',
        limit: 1,
      },
    ],
  },
  { event: 'agent/whatsapp.message_received' },
  async ({ event, step }) => {
    // ================================================================
    // Standalone: debounce-interruption-system-v2 (Plan 03, D-03 + D-14
    // + REVISION W2 + W3):
    //
    // 6 new fields — all OPTIONAL — populated by the webhook layer
    // ONLY when the message is on the v4 path. Pre-v4 callers (v3 /
    // godentist / recompra / pw-confirmation) and tests that fabricate
    // events without these fields continue to work unchanged (Regla 6).
    //
    // REVISION W3 + W2 rationale:
    //   - lockChannel + lockIdentifier — eliminate a conversations-
    //     table lookup inside Plan 04's runner.
    //   - agentId (from webhook) — eliminate a race window where the
    //     workspace's routing could change between webhook acquire and
    //     Inngest dispatch.
    //
    // The runner (Plan 04) detects nulls in lockHolderUuid / lockKey /
    // ownPendingEntryJson and skips checkpoint logic in those cases
    // (fail-open path from the webhook).
    // ================================================================
    const {
      conversationId,
      contactId,
      messageContent,
      workspaceId,
      phone,
      messageId,
      messageTimestamp,
      lockHolderUuid,
      lockKey,
      ownPendingEntryJson,
      lockChannel,
      lockIdentifier,
      agentId: agentIdFromWebhook,
    } = event.data as typeof event.data & {
      lockHolderUuid?: string | null
      lockKey?: string | null
      ownPendingEntryJson?: string | null
      lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
      lockIdentifier?: string | null
      agentId?: AgentId | null
    }

    logger.info(
      { conversationId, phone, messageId, workspaceId, messageType: event.data.messageType ?? 'text' },
      'Processing WhatsApp message with agent'
    )

    // ================================================================
    // Standalone: debounce-interruption-system-v2 (Plan 03, REVISION W2)
    //
    // Race elimination: prefer agentIdFromWebhook when present (it's
    // what the webhook locked on). Fall back to a local resolve for
    // pre-v4 callers that don't populate the field. Emit a warning
    // when both are present and disagree — extremely rare (workspace
    // routing changed between webhook lock acquire and Inngest dispatch)
    // — and honor the webhook's choice (it gated the lock).
    // ================================================================
    const localAgentId = agentIdFromWebhook
      ? await resolveAgentIdForWorkspace(workspaceId)
      : null
    if (agentIdFromWebhook && localAgentId && localAgentId !== agentIdFromWebhook) {
      logger.warn(
        {
          agentIdFromWebhook,
          localAgentId,
          conversationId,
          workspaceId,
          messageId,
          label: 'pipeline_decision:agent_id_mismatch_webhook_vs_inngest',
        },
        '[interruption-v2] agent_id_mismatch_webhook_vs_inngest — using webhook value',
      )
    }
    const agentId: AgentId =
      agentIdFromWebhook ?? (await resolveAgentIdForWorkspace(workspaceId))

    // ================================================================
    // Phase 42.1: Observability collector (feature-flagged)
    //
    // When OBSERVABILITY_ENABLED is OFF, `collector` is null and the
    // handler runs identically to the baseline (REGLA 6: zero impact
    // on the production agent path). When ON, we wrap the entire turn
    // in `runWithCollector` so downstream code (domain layer queries,
    // Anthropic calls via the fetch wrapper, recordEvent injections in
    // the pipeline) can resolve the active collector via ALS without
    // threading it as a parameter.
    //
    // Plan 07 will add `await collector.flush()` inside a step.run
    // after the turn body resolves; for now flush() is a no-op.
    // ================================================================
    const collector = isObservabilityEnabled()
      ? new ObservabilityCollector({
          conversationId,
          workspaceId,
          agentId,
          turnStartedAt: new Date(),
          triggerMessageId: messageId,
          triggerKind: 'user_message',
        })
      : null

    const run = async () => {
    // Phase 42.1: register turn start + trigger metadata for the timeline.
    // debounce-interruption-system-v2 (Plan 03) — extended with lock
    // correlation fields so observability can join the webhook's lock
    // acquisition with the Inngest function's turn execution.
    collector?.recordEvent('session_lifecycle', 'turn_started', {
      action: 'turn_started',
      conversationId,
      messageId,
      messageType: event.data.messageType ?? 'text',
      lockHolderUuid: lockHolderUuid ?? null,
      lockKey: lockKey ?? null,
      lockChannel: lockChannel ?? null,
      lockIdentifier: lockIdentifier ?? null,
      hasOwnPendingEntry: !!ownPendingEntryJson,
      agentIdSource: agentIdFromWebhook ? 'webhook' : 'inngest_local_resolve',
    })

    // ================================================================
    // Step 1: Media Gate (Phase 32)
    // Routes message by type: text passes through unchanged, audio gets
    // transcribed, image/video trigger handoff, sticker gets interpreted,
    // reaction gets mapped. This runs BEFORE the agent engine.
    // ================================================================
    const gateResult = await step.run('media-gate', async () => {
      const { processMediaGate } = await import('@/lib/agents/media')
      return processMediaGate({
        messageType: event.data.messageType ?? 'text',
        messageContent: event.data.messageContent,
        mediaUrl: event.data.mediaUrl ?? null,
        mediaMimeType: event.data.mediaMimeType ?? null,
        workspaceId: event.data.workspaceId,
        conversationId: event.data.conversationId,
        phone: event.data.phone,
        // Plan 03 (v4-media-audio-image Wave 2): thread resolvedAgentId for
        // v4-only image/audio branches (D-01 / Regla 6).
        resolvedAgentId: agentId,
      })
    })

    // Phase 42.1: media gate decision is one of the pipeline's first
    // forks -- record it so the timeline shows the routing branch taken.
    collector?.recordEvent('media_gate', 'gate_decision', {
      kind: event.data.messageType ?? 'text',
      action: gateResult.action,
      reason: 'reason' in gateResult ? gateResult.reason : null,
      hasMediaUrl: Boolean(event.data.mediaUrl),
    })

    // The classifier runs at the rule layer inside processMediaGate
    // (audio/image/sticker/reaction routing). Surface it as a coarse
    // classifier event tied to the media gate result so the timeline
    // shows that the rule-based classifier ran here -- richer
    // classifier events for text messages live deeper in the Somnio
    // V3 pipeline (Task 3 will instrument those if/when reachable).
    collector?.recordEvent('classifier', 'rule-based media routing', {
      type: event.data.messageType ?? 'text',
      action: gateResult.action,
    })

    // ================================================================
    // Step 2: Branch based on media gate result
    // ================================================================

    // --- IGNORE: silently drop (unrecognized stickers, unmapped reactions) ---
    if (gateResult.action === 'ignore') {
      collector?.recordEvent('media_gate', 'ignored', {
        action: 'ignore',
        messageType: event.data.messageType,
      })
      logger.info(
        { conversationId, messageType: event.data.messageType },
        'Media gate: ignoring message'
      )
      return { success: true, ignored: true, mediaType: event.data.messageType }
    }

    // --- NOTIFY HOST: create task, bot stays active (negative reactions) ---
    if (gateResult.action === 'notify_host') {
      collector?.recordEvent('media_gate', 'notify_host', {
        reason: gateResult.reason,
        messageType: event.data.messageType,
      })
      await step.run('notify-host-media', async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const supabase = createAdminClient()
        const { createTask } = await import('@/lib/domain/tasks')

        // Fetch contact info for the notification description
        const { data: conv } = await supabase
          .from('conversations')
          .select('contact_id, profile_name, phone')
          .eq('id', conversationId)
          .single()

        const contactName = conv?.profile_name ?? conv?.phone ?? phone

        // Use domain layer for task creation (Rule 3: no raw inserts)
        await createTask(
          { workspaceId, source: 'inngest' },
          {
            title: `Notificacion: ${gateResult.reason}`,
            description: `Conversacion con ${contactName}. El bot sigue activo.`,
            priority: 'medium',
            status: 'pending',
            conversationId,
            contactId: conv?.contact_id ?? undefined,
          }
        )
      })

      logger.info(
        { conversationId, reason: gateResult.reason, messageType: event.data.messageType },
        'Media gate: host notified'
      )
      return { success: true, mediaType: event.data.messageType }
    }

    // --- HANDOFF: image/video/failed transcription -> hand off to human ---
    if (gateResult.action === 'handoff') {
      collector?.recordEvent('handoff', 'triggered', {
        reason: gateResult.reason,
        trigger: 'media_gate',
        messageType: event.data.messageType,
      })
      collector?.recordEvent('mode_transition', undefined, {
        from: null,
        to: 'handoff',
        reason: 'media_gate',
      })
      await step.run('execute-media-handoff', async () => {
        const { getWorkspaceAgentConfig } = await import('@/lib/agents/production/agent-config')
        const { executeHandoff } = await import('@/lib/agents/production/handoff-handler')
        const config = await getWorkspaceAgentConfig(workspaceId)
        await executeHandoff(conversationId, workspaceId, {
          handoffMessage: config?.handoff_message ?? 'Regalame 1 min, ya te comunico con un asesor',
        })
      })

      // Cancel any active silence timer.
      // WHY: For media handoff the UnifiedEngine is NOT invoked, so the engine's
      // natural agent/customer.message emission (step 6) never fires. Without this,
      // a stale retake message would fire after the human agent takes over.
      collector?.recordEvent('silence_timer', 'cancel', {
        reason: 'media_handoff',
        conversationId,
      })
      await step.run('cancel-silence-timer', async () => {
        const { inngest: inngestClient } = await import('@/inngest/client')
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const supabase = createAdminClient()

        const { data: session } = await supabase
          .from('agent_sessions')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('workspace_id', workspaceId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (session) {
          await (inngestClient.send as any)({
            name: 'agent/customer.message',
            data: {
              sessionId: session.id,
              conversationId,
              messageId: event.data.messageId,
              content: gateResult.reason,
            },
          })
        }
      })

      logger.info(
        { conversationId, reason: gateResult.reason, messageType: event.data.messageType },
        'Media gate: handoff executed'
      )
      return { success: true, newMode: 'handoff', mediaType: event.data.messageType }
    }

    // ================================================================
    // Plan 03 (v4-media-audio-image Wave 2):
    //
    // PASSTHROUGH handles two cases:
    //   a) gateResult.action === 'passthrough' — text/audio/sticker/reaction
    //   b) gateResult.action === 'vision_respond' — v4 image classify responder
    //      Both proceed INTO the engine. vision_respond additionally threads
    //      visionContext so the engine can use the classification result (Plan 04).
    //
    // PERSIST-TRANSCRIPTION step: v4 audio passthrough carries a `transcription`
    //   field → persisted via setMessageTranscription (Wave 1 domain fn, Regla 3).
    // ================================================================

    // --- PASSTHROUGH / VISION_RESPOND: proceed into the agent engine ---
    // All branches above (ignore/notify_host/handoff) have returned. Only
    // 'passthrough' and 'vision_respond' reach this point.

    // Determine the message content to send into the engine:
    // - passthrough: gateResult.text (transcribed audio, sticker gesture, or original text)
    // - vision_respond: use the client's caption (messageContent) or empty string;
    //   the engine uses visionContext.descripcion as the KB query (Plan 04).
    const engineMessageContent =
      gateResult.action === 'passthrough'
        ? gateResult.text
        : event.data.messageContent ?? ''  // vision_respond: caption or empty

    // Determine visionContext for the engine (vision_respond only; Plan 04 wires it through).
    const visionContext =
      gateResult.action === 'vision_respond'
        ? { descripcion: gateResult.descripcion, categoria: gateResult.categoria }
        : undefined

    collector?.recordEvent('media_gate', 'passthrough', {
      action: gateResult.action,
      messageType: event.data.messageType ?? 'text',
      transformedText: engineMessageContent !== event.data.messageContent,
    })

    if (gateResult.action === 'vision_respond') {
      collector?.recordEvent('media_gate', 'vision_respond', {
        categoria: gateResult.categoria,
      })
    }

    // ================================================================
    // Plan 03 (v4-media-audio-image Wave 2): persist-transcription step
    //
    // When v4 audio is transcribed, handleAudioV4 sets `transcription` in the
    // passthrough result. We persist it here via the Wave 1 domain function
    // (setMessageTranscription — Regla 3: UPDATE by wamid in the domain layer).
    //
    // Best-effort: failures are logged inside the step but do NOT block the
    // pipeline (the transcript is non-critical for message delivery).
    // ================================================================
    if (
      gateResult.action === 'passthrough' &&
      'transcription' in gateResult &&
      gateResult.transcription
    ) {
      await step.run('persist-transcription', async () => {
        try {
          const { setMessageTranscription } = await import('@/lib/domain/messages')
          const persistResult = await setMessageTranscription(
            { workspaceId, source: 'inngest', cascadeDepth: 0 },
            { wamid: event.data.messageId, transcription: gateResult.transcription as string }
          )
          if (!persistResult.success) {
            logger.warn(
              { conversationId, messageId: event.data.messageId, error: persistResult.error },
              '[media-gate] persist-transcription failed (non-blocking)'
            )
          }
        } catch (err) {
          logger.warn(
            { conversationId, messageId: event.data.messageId, err },
            '[media-gate] persist-transcription threw (non-blocking)'
          )
        }
      })
    }

    const stepResult = await step.run('process-message', async () => {
      // Dynamic import to avoid circular dependencies and reduce cold start
      const { processMessageWithAgent } = await import(
        '@/lib/agents/production/webhook-processor'
      )

      // Phase 42.1 fix (quick/039): Inngest replay boundary.
      //
      // A step.run callback runs in EXACTLY ONE Vercel lambda. Later
      // replay iterations (which execute the flush) return the CACHED
      // step output without re-running the callback, so any in-memory
      // state mutated inside the callback (e.g. a collector captured via
      // ALS) is garbage collected when that lambda returns and is never
      // visible to the flush iteration's collector.
      //
      // Fix: create a LOCAL collector scoped to this step, run the
      // pipeline under it, and return its captured arrays in the step
      // output so Inngest serializes + caches them. The outer handler
      // (below, post-step) merges the cached __obs into its own
      // per-iteration collector via `collector.mergeFrom(...)` before
      // calling flush. Because the step output is deterministic across
      // replays, every iteration ends up with identical merged state.
      const stepCollector = collector
        ? new ObservabilityCollector({
            conversationId: collector.conversationId,
            workspaceId: collector.workspaceId,
            agentId: collector.agentId,
            // D-10 (agent-forensics-panel Plan 01): seed the step-level
            // collector from the outer one so subsequent routing captures
            // still honor first-write-wins across the step boundary.
            respondingAgentId: collector.respondingAgentId,
            turnStartedAt: collector.turnStartedAt,
            triggerMessageId: collector.triggerMessageId,
            triggerKind: collector.triggerKind,
          })
        : null

      const invokePipeline = () => processMessageWithAgent({
        conversationId,
        contactId,
        messageContent: engineMessageContent,  // May be original text or transcribed audio
        workspaceId,
        phone,
        messageTimestamp,  // Phase 31: for pre-send check
        // ================================================================
        // Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.4)
        //
        // Thread the 5 lock-correlation fields from event.data → webhook
        // processor → V4ProductionRunner. Pre-v4 callers (v3/godentist/
        // recompra/pw-confirmation/godentist-fb-ig) destructure these as
        // null and the webhook-processor's v4 branch is the only consumer.
        // ================================================================
        lockHolderUuid: lockHolderUuid ?? null,
        lockKey: lockKey ?? null,
        ownPendingEntryJson: ownPendingEntryJson ?? null,
        lockChannel: lockChannel ?? null,
        lockIdentifier: lockIdentifier ?? null,
        // Plan 03 (v4-media-audio-image Wave 2): thread visionContext for v4 image path.
        // ProcessMessageInput declares this as optional stub (consumed in Plan 04).
        // undefined for non-vision paths (non-breaking for all existing callers).
        visionContext,
      })

      // Wrap with runWithCollector so fetch wrapper + deep pipeline
      // recordEvent/recordQuery/recordAiCall calls (which resolve their
      // target via ALS) push into stepCollector. When this lambda ends,
      // stepCollector is GC'd — but its captured arrays survive via the
      // __obs field in the step output (serialized by Inngest).
      const engineResult = stepCollector
        ? await runWithCollector(stepCollector, invokePipeline)
        : await invokePipeline()

      return {
        engineResult,
        __obs: stepCollector
          ? {
              events: stepCollector.events,
              queries: stepCollector.queries,
              aiCalls: stepCollector.aiCalls,
              // D-10 (Pitfall 1 fix — agent-forensics-panel Plan 01):
              // mutations to the in-memory stepCollector are lost across
              // Inngest replays because the step output is CACHED and
              // the callback never re-runs. Encode the responding agent
              // id in the return payload so it survives serialization
              // and the outer merge (below) can propagate it to the
              // flush iteration's collector.
              respondingAgentId: stepCollector.respondingAgentId,
            }
          : null,
      }
    })

    const result = stepResult.engineResult

    // Merge the step-captured observability into the outer collector so
    // it survives to the flush iteration. On every Inngest replay this
    // runs using the CACHED stepResult (step.run callback does NOT
    // re-execute), so even though `collector` is a brand-new instance
    // in each iteration, it always ends up with the same merged data
    // before flush.
    if (collector && stepResult.__obs) {
      collector.mergeFrom(stepResult.__obs)
      // D-10 belt-and-suspenders: mergeFrom already propagates the
      // respondingAgentId via setRespondingAgentId (first-write-wins),
      // but this explicit call documents the invariant at the merge
      // site and is idempotent-safe (the setter silently ignores a
      // second different value).
      if (stepResult.__obs.respondingAgentId) {
        collector.setRespondingAgentId(stepResult.__obs.respondingAgentId)
      }
    }

    // Phase 42.1: snapshot the engine result onto the timeline. The deep
    // pipeline events (classifier text branch, intent detection,
    // template selection, no_repetition decisions, block composition,
    // pre-send check, char_delay) are recorded inside their own files
    // by Task 3 via getCollector() and ALS -- here we just capture the
    // top-level outcome so the collector has the final mode + counts.
    collector?.recordEvent('mode_transition', undefined, {
      from: null,
      to: result.newMode ?? null,
      reason: result.success ? 'engine_result' : 'engine_error',
    })
    if (result.newMode === 'handoff') {
      collector?.recordEvent('handoff', 'engine_handoff', {
        trigger: 'engine',
        reason: result.error?.message ?? 'engine_signal',
      })
    }
    collector?.recordEvent('block_composition', 'turn_outbound_summary', {
      messagesSent: result.messagesSent ?? 0,
      success: result.success,
    })
    if (result.error) {
      collector?.recordEvent('intent', 'engine_error', {
        code: result.error.code,
        retryable: result.error.retryable,
      })
    }

    // Write error message to conversation for visibility (same as inline path)
    if (!result.success && result.error) {
      await step.run('write-error-message', async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const supabase = createAdminClient()
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          workspace_id: workspaceId,
          direction: 'outbound',
          type: 'text',
          content: { body: `[ERROR AGENTE] ${result.error?.code}: ${result.error?.message?.substring(0, 500)}` },
          timestamp: new Date().toISOString(),
        })
      })
    }

    collector?.recordEvent('session_lifecycle', 'turn_completed', {
      action: 'turn_completed',
      success: result.success,
      newMode: result.newMode ?? null,
      messagesSent: result.messagesSent ?? 0,
    })

    logger.info(
      {
        conversationId,
        messageId,
        success: result.success,
        newMode: result.newMode,
        messagesSent: result.messagesSent,
        mediaType: event.data.messageType,
      },
      'Agent processing complete'
    )

    return result
    }
    // ----------------------------------------------------------------
    // End of inner `run` arrow function. Below: collector wiring.
    // ----------------------------------------------------------------

    // ================================================================
    // Phase 42.1 Plan 07: turn execution + flush
    //
    // When `collector` is null (feature flag OFF) we just call `run()`
    // and return its result -- byte-identical to the pre-42.1 baseline
    // (REGLA 6).
    //
    // When `collector` is present we:
    //
    //   1. Run the inner `run()` inside `runWithCollector` so any code
    //      reachable from the pipeline can resolve the collector via
    //      ALS without parameter threading.
    //
    //   2. Capture any thrown error WITHOUT propagating it yet --
    //      `collector.recordError(...)` must run BEFORE the flush so
    //      the persisted turn row carries the failure cause.
    //
    //   3. Run the flush as the LAST `step.run` of the function. This
    //      MUST happen even when `run()` threw, otherwise the dropped
    //      turns would be the most interesting ones to inspect. The
    //      flush itself swallows its own errors (see flushCollector)
    //      so the step never fails -- Inngest will not retry the flush
    //      on a transient observability outage.
    //
    //   4. Re-throw the original turn error (if any) AFTER the flush so
    //      Inngest's standard retry/concurrency semantics still apply
    //      to real production failures.
    // ================================================================
    if (!collector) {
      return await run()
    }

    let turnResult: unknown
    let turnError: unknown = null
    try {
      turnResult = await runWithCollector(collector, run)
    } catch (err) {
      const e = err as Error
      collector.recordError({
        name: e?.name ?? 'Error',
        message: e?.message ?? String(err),
        stack: e?.stack,
      })
      turnError = err
    }

    await step.run('observability-flush', async () => {
      await collector.flush()
    })

    if (turnError) throw turnError
    return turnResult
  }
)

/**
 * All agent production functions for export.
 */
export const agentProductionFunctions = [whatsappAgentProcessor]
