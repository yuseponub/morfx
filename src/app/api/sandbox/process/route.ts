/**
 * Sandbox Process API Route
 * Phase 15: Agent Sandbox
 *
 * Server-side processing for sandbox messages.
 * Keeps Anthropic API key secure on the server.
 */

import { NextRequest, NextResponse } from 'next/server'
import { SandboxEngine } from '@/lib/sandbox/sandbox-engine'
import type { SandboxState } from '@/lib/sandbox/types'

// Single engine instance per server (stateless processing)
const engine = new SandboxEngine()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, state, history, turnNumber } = body as {
      message: string
      state: SandboxState
      history: { role: 'user' | 'assistant'; content: string }[]
      turnNumber: number
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
      turnNumber ?? 1
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
