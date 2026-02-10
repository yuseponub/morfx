/**
 * Sandbox Process API Route
 * Phase 15: Agent Sandbox
 *
 * Server-side processing for sandbox messages.
 * Keeps Anthropic API key secure on the server.
 * Phase 15.6: CRM agent modes passed to engine.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SandboxEngine } from '@/lib/sandbox/sandbox-engine'
import type { SandboxState } from '@/lib/sandbox/types'
import { initializeTools } from '@/lib/tools/init'

// Import somnio module to trigger agent registration
import '@/lib/agents/somnio'
// Import CRM module to trigger CRM agent registration
import '@/lib/agents/crm'

// Initialize Action DSL tools (required for LIVE mode CRM execution)
initializeTools()

// Single engine instance per server (stateless processing)
const engine = new SandboxEngine()

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

    const result = await engine.processMessage(
      message,
      state,
      history ?? [],
      turnNumber ?? 1,
      crmAgents,
      workspaceId,
      forceIntent
    )

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
