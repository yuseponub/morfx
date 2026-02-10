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
import { UnifiedEngine } from '@/lib/agents/engine'
import { createSandboxAdapters } from '@/lib/agents/engine-adapters/sandbox'
import type { SandboxState } from '@/lib/sandbox/types'
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
    const { message, state, history, turnNumber, crmAgents, workspaceId, forceIntent } = body as {
      message: string
      state: SandboxState
      history: { role: 'user' | 'assistant'; content: string }[]
      turnNumber: number
      crmAgents?: { agentId: string; mode: 'dry-run' | 'live' }[]
      workspaceId?: string
      forceIntent?: string
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
