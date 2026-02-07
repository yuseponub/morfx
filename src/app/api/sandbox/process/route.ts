/**
 * Sandbox Process API Route
 * Phase 15: Agent Sandbox
 *
 * Server-side processing for sandbox messages.
 * Keeps Anthropic API key secure on the server.
 * Phase 15.6: CRM agent modes passed to engine.
 */

import { NextRequest, NextResponse } from 'next/server'
import { SandboxEngine } from '@/lib/sandbox/sandbox-engine'
import type { SandboxState } from '@/lib/sandbox/types'

// Import somnio module to trigger agent registration
import '@/lib/agents/somnio'
// Import CRM module to trigger CRM agent registration
import '@/lib/agents/crm'

// Single engine instance per server (stateless processing)
const engine = new SandboxEngine()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, state, history, turnNumber, crmAgents } = body as {
      message: string
      state: SandboxState
      history: { role: 'user' | 'assistant'; content: string }[]
      turnNumber: number
      crmAgents?: { agentId: string; mode: 'dry-run' | 'live' }[]
    }

    if (!message || !state) {
      return NextResponse.json(
        { error: 'Missing required fields: message, state' },
        { status: 400 }
      )
    }

    const result = await engine.processMessage(
      message,
      state,
      history ?? [],
      turnNumber ?? 1,
      crmAgents
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
