/**
 * Sandbox Process API Route
 * Phase 16.1: Engine Unification - Plan 04
 *
 * Server-side processing for sandbox messages using the UnifiedEngine
 * with sandbox adapters. Keeps Anthropic API key secure on the server.
 *
 * Previous: Used SandboxEngine directly.
 * Now: Uses UnifiedEngine + createSandboxAdapters for unified pipeline.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UnifiedEngine } from '@/lib/agents/engine/unified-engine'
import { createSandboxAdapters } from '@/lib/agents/engine-adapters/sandbox'
import { SomnioV2Engine } from '@/lib/agents/somnio-v2/engine-v2'
import { SomnioV3Engine } from '@/lib/agents/somnio-v3/engine-v3'
import type { SandboxState } from '@/lib/sandbox/types'
import type { SystemEvent } from '@/lib/agents/somnio-v3/types'
import { initializeTools } from '@/lib/tools/init'

// Import somnio module to trigger agent registration
import '@/lib/agents/somnio'
// Import CRM module to trigger CRM agent registration
import '@/lib/agents/crm'

// Initialize Action DSL tools (required for LIVE mode CRM execution)
initializeTools()

export async function POST(request: NextRequest) {
  try {
    // Security #4: Require authentication for sandbox API
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { message, state, history, turnNumber, crmAgents, workspaceId, forceIntent, agentId, systemEvent, sandboxSessionId } = body as {
      message: string
      state: SandboxState
      history: { role: 'user' | 'assistant'; content: string }[]
      turnNumber: number
      crmAgents?: { agentId: string; mode: 'dry-run' | 'live' }[]
      workspaceId?: string
      forceIntent?: string
      agentId?: string
      systemEvent?: SystemEvent
      sandboxSessionId?: string  // Standalone: debounce-v2-sandbox-integration / Plan 02 (D-03).
                                  // Sólo consumido por la rama v4; resto de ramas lo ignoran (Regla 6 — campo neutral).
    }

    if (!message || !state) {
      return NextResponse.json(
        { error: 'Missing required fields: message, state' },
        { status: 400 }
      )
    }

    // Security #4: Validate workspace membership when LIVE mode CRM agents are used
    const hasLiveAgent = crmAgents?.some((a) => a.mode === 'live')
    if (hasLiveAgent && workspaceId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()
      if (!membership) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        )
      }
    }

    // ================================================================
    // V2 Agent: separate engine, completely isolated from v1
    // ================================================================
    if (agentId === 'somnio-sales-v2') {
      const v2Engine = new SomnioV2Engine()
      const v2Result = await v2Engine.processMessage({
        message,
        state,
        history: history ?? [],
        turnNumber: turnNumber ?? 1,
        workspaceId: workspaceId ?? 'sandbox-workspace',
      })
      return NextResponse.json(v2Result)
    }

    // ================================================================
    // V3 Agent: separate engine, completely isolated from v1/v2
    // ================================================================
    if (agentId === 'somnio-sales-v3') {
      const v3Engine = new SomnioV3Engine()
      const v3Result = await v3Engine.processMessage({
        message,
        state,
        history: history ?? [],
        turnNumber: turnNumber ?? 1,
        workspaceId: workspaceId ?? 'sandbox-workspace',
        systemEvent,
      })
      return NextResponse.json(v3Result)
    }

    // ================================================================
    // Recompra Agent: separate engine for returning clients
    // ================================================================
    if (agentId === 'somnio-recompra-v1') {
      const { SomnioRecompraEngine } = await import('@/lib/agents/somnio-recompra/engine-recompra')
      const recompraEngine = new SomnioRecompraEngine()
      const recompraResult = await recompraEngine.processMessage({
        message,
        state,
        history: history ?? [],
        turnNumber: turnNumber ?? 1,
        workspaceId: workspaceId ?? 'sandbox-workspace',
        systemEvent: systemEvent as any,
      })
      return NextResponse.json(recompraResult)
    }

    // ================================================================
    // V4 Agent: separate engine, completely isolated from v1/v2/v3/recompra
    // Standalone: somnio-sales-v4-runtime-wiring / Plan 03 (D-1, D-19)
    // Dynamic import — evita carga del agentRegistry de v4 en cold-start
    // cuando agentId !== 'somnio-sales-v4'.
    // ================================================================
    if (agentId === 'somnio-sales-v4') {
      // ============================================================
      // Standalone: debounce-v2-sandbox-integration / Plan 02
      // (D-01 + D-02 Option C + D-04 + D-06 + D-07 + D-09 + D-10).
      // Wires shipped interruption-system-v2 primitives into the sandbox
      // v4 path so behavior is paridad con WhatsApp production.
      // - Lock key: lock:{ws}:whatsapp:sandbox-{sandboxSessionId} (Option C).
      // - HOLDER processes restart-loop in engine (Plan 01).
      // - FOLLOWER returns deferred=true; UI long-polls sandbox-result:{id}.
      // ============================================================

      if (!sandboxSessionId) {
        return NextResponse.json(
          { error: 'sandboxSessionId required for v4 sandbox' },
          { status: 400 },
        )
      }

      const wsId = workspaceId ?? 'sandbox-workspace'

      // D-02 Option C: channel literal stays 'whatsapp' (existing union member, no module change);
      // identifier prefix 'sandbox-' isolates lock keys from real WhatsApp phones (D-09 + D-10).
      const lockChannel = 'whatsapp' as const
      const lockIdentifier = `sandbox-${sandboxSessionId}`

      // Dynamic imports (mirror existing v4 engine dynamic import pattern at this branch):
      const [
        { acquireLock },
        { pushToPending },
        { emitLockEvent },
        { redis },
        { randomUUID },
      ] = await Promise.all([
        import('@/lib/agents/interruption-system-v2/lock'),
        import('@/lib/agents/interruption-system-v2/pending'),
        import('@/lib/agents/interruption-system-v2/observability'),
        import('@/lib/agents/interruption-system-v2/redis-client'),
        import('crypto'),
      ])

      const { runWithCollector, ObservabilityCollector } = await import('@/lib/observability')

      let lockHandle: import('@/lib/agents/interruption-system-v2/lock').LockHandle | null = null
      let ownPendingEntryJson: string | null = null
      const entryUuid = randomUUID()
      const pendingEntry = {
        entry_uuid: entryUuid,
        content: message,
        received_at: new Date().toISOString(),
        msg_id: entryUuid,
      }

      try {
        lockHandle = await acquireLock(wsId, lockChannel, lockIdentifier)

        if (!lockHandle) {
          // ============================================================
          // FOLLOWER PATH (D-06 + D-07)
          // ============================================================
          const push = await pushToPending(wsId, lockChannel, lockIdentifier, pendingEntry)
          await redis.set(
            `interrupt:${wsId}:${lockChannel}:${lockIdentifier}`,
            entryUuid,
            { ex: 60 },
          )
          emitLockEvent('lock_acquire_failed_follower', {
            existing_holder_uuid: 'unknown',
            my_msg_id: entryUuid,
            key: `lock:${wsId}:${lockChannel}:${lockIdentifier}`,
          })
          emitLockEvent('interrupt_written', {
            msg_id: entryUuid,
            pending_list_length: push.pendingListLength,
          })
          return NextResponse.json({
            success: true,
            deferred: true,
            sandboxSessionId,
            reason: 'follower_appended_to_pending',
            pendingListLength: push.pendingListLength,
          })
        }

        // ============================================================
        // HOLDER PATH (D-06)
        // ============================================================
        const push = await pushToPending(wsId, lockChannel, lockIdentifier, pendingEntry)
        ownPendingEntryJson = push.exactJson
        emitLockEvent('lock_acquired', {
          holder_uuid: lockHandle.holderUuid,
          msg_id: entryUuid,
          key: lockHandle.key,
          ttl: 45,
          started_at: lockHandle.startedAt,
        })
      } catch (lockErr) {
        // Fail-open: Redis unavailable → emit event + fall through with lockHandle=null.
        // Engine skip-guards on null (D-04 — pre-this-standalone behavior preserved when Redis down).
        emitLockEvent('redis_unavailable_fallback_failed', {
          error_message: lockErr instanceof Error ? lockErr.message : String(lockErr),
          at_step: 'route_acquire_lock',
        })
        lockHandle = null
        ownPendingEntryJson = null
      }

      // ============================================================
      // Wrap engine call with ObservabilityCollector so emitLockEvent
      // writes to agent_observability_events (Pitfall 3 — without the
      // wrap, all event emits are silent no-ops).
      // triggerKind: 'sandbox' relies on Task 2.0's TriggerKind union extension
      // in src/lib/observability/types.ts (WARNING 1 fix landed in Wave 2).
      // ============================================================
      const collector = new ObservabilityCollector({
        workspaceId: wsId,
        conversationId: sandboxSessionId,  // sandbox: session ≡ conversation (Pitfall 4 RESOLVED — agent_observability_turns.conversation_id is UUID NOT NULL without FK)
        agentId: 'somnio-sales-v4',
        triggerKind: 'sandbox',  // Task 2.0 extended TriggerKind union with this literal.
        turnStartedAt: new Date(),
      })

      const { SomnioV4Engine } = await import('@/lib/agents/somnio-v4/engine-v4')
      const v4Engine = new SomnioV4Engine()
      const v4Result = await runWithCollector(collector, () => v4Engine.processMessage({
        message,
        state,
        history: history ?? [],
        turnNumber: turnNumber ?? 1,
        workspaceId: wsId,
        systemEvent,
        lockHandle,
        lockChannel,
        lockIdentifier,
        ownPendingEntryJson,
        sandboxSessionId,
      }))

      // PRESERVE the existing TEMP DEBUG block (lines 145-171 of pre-Plan-02 route.ts).
      // It is observability for v4-runtime-wiring smoke; not changed by this plan.
      try {
        const truncate = (s: string, n = 250) => s.length > n ? s.slice(0, n) + '...' : s
        const recentBotMsgs = (history ?? [])
          .filter((h) => h.role === 'assistant')
          .slice(-2)
          .map((h) => truncate(h.content))
        console.log('[V4 TURN] ' + JSON.stringify({
          ts: new Date().toISOString(),
          turn: turnNumber ?? 1,
          inMessage: message,
          inHistoryLength: (history ?? []).length,
          inHistory: (history ?? []).map((h) => ({ role: h.role, content: truncate(h.content) })),
          inSystemEvent: systemEvent ?? null,
          recentBotMsgs,
          outIntent: v4Result.debugTurn?.intent ?? null,
          outMessages: v4Result.messages?.map(truncate) ?? [],
          outAction: v4Result.debugTurn?.salesTrack?.accion ?? null,
          outNewMode: v4Result.newState?.currentMode ?? null,
          outIntentsVistos: v4Result.newState?.intentsVistos ?? [],
          outTemplatesEnviados: v4Result.newState?.templatesEnviados ?? [],
          outTimerSignal: v4Result.timerSignal ?? null,
          outError: v4Result.error ?? null,
          // NEW: lock state surfaced for smoke debugging
          lockAcquired: lockHandle !== null,
          sandboxSessionId,
        }))
      } catch (logErr) {
        console.log('[V4 TURN ERROR] failed to serialize debug log:', logErr)
      }

      return NextResponse.json(v4Result)
    }

    // ================================================================
    // V1 Agent: existing UnifiedEngine (unchanged)
    // ================================================================

    // Create per-request adapters with the incoming sandbox state
    const adapters = createSandboxAdapters({
      initialState: state,
      history: history ?? [],
      crmModes: crmAgents,
      workspaceId,
    })

    // Create engine with sandbox adapters and config
    const engine = new UnifiedEngine(adapters, {
      workspaceId: workspaceId ?? 'sandbox-workspace',
      crmModes: crmAgents,
    })

    // Process message through unified engine
    const engineOutput = await engine.processMessage({
      sessionId: 'sandbox-session',
      conversationId: 'sandbox-conversation',
      contactId: 'sandbox-contact',
      message,
      workspaceId: workspaceId ?? 'sandbox-workspace',
      history: history ?? [],
      turnNumber: turnNumber ?? 1,
      forceIntent,
    })

    // Map EngineOutput to SandboxEngineResult shape for frontend compatibility.
    // The frontend reads: success, messages, debugTurn, newState, error, timerSignal.
    // EngineOutput already has all these fields in compatible shapes.
    const result = {
      success: engineOutput.success,
      messages: engineOutput.messages,
      debugTurn: engineOutput.debugTurn,
      newState: engineOutput.newState,
      error: engineOutput.error
        ? { code: engineOutput.error.code, message: engineOutput.error.message }
        : undefined,
      timerSignal: engineOutput.timerSignal,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Sandbox API] Error processing message:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    )
  }
}
