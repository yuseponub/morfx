/**
 * POST /api/v1/crm-bots/writer/propose
 *
 * CRM Writer Bot — PROPOSE phase. LLM-driven. Tool calls create proposed
 * rows in crm_bot_actions (status='proposed', 5-min TTL). Does NOT mutate
 * business entities. Caller must follow up with POST /confirm with the
 * action_id returned in proposedActions[].
 *
 * Gate stack (must mirror reader + confirm exactly):
 *   1. Kill-switch (per-request env read — Pitfall 2)
 *   2. x-workspace-id header required (Pitfall 4 — body.workspaceId IGNORED)
 *   3. Rate limit on shared 'crm-bot' namespace (same counter as reader)
 *   4. Observability-wrapped execution (agentId='crm-writer', triggerKind='api')
 *
 * Authentication: middleware validates API key and injects x-workspace-id +
 * x-api-key-prefix. invoker falls back to x-api-key-prefix (Warning #14).
 *
 * Phase 44 Plan 08.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { rateLimiter } from '@/lib/tools/rate-limiter'
import {
  runWithCollector,
  ObservabilityCollector,
  isObservabilityEnabled,
} from '@/lib/observability'
import { propose as writerPropose, CRM_WRITER_AGENT_ID } from '@/lib/agents/crm-writer'
import {
  sendRunawayAlert,
  maybeSendApproachingLimitAlert,
} from '@/lib/agents/_shared/alerts'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Gate 1: Kill-switch (per-request env read — Pitfall 2).
  if (process.env.CRM_BOT_ENABLED === 'false') {
    return NextResponse.json(
      { error: 'CRM bots globally disabled', code: 'KILL_SWITCH', retryable: false },
      { status: 503 },
    )
  }

  // Gate 2: Header extraction — Pitfall 4 + Warning #14 fallback.
  // workspaceId comes ONLY from x-workspace-id (middleware-injected). body is untrusted.
  const workspaceId = request.headers.get('x-workspace-id')
  const invoker =
    request.headers.get('x-invoker') ??
    (request.headers.get('x-api-key-prefix') ?? undefined)
  if (!workspaceId) {
    return NextResponse.json(
      { error: 'Missing workspace context', code: 'MISSING_CONTEXT', retryable: false },
      { status: 401 },
    )
  }

  // Gate 3: Rate limit — shared 'crm-bot' namespace with reader (one counter,
  // shared budget; prevents a writer loop from dodging the reader's budget).
  const limit = Number(process.env.CRM_BOT_RATE_LIMIT_PER_MIN ?? 50)
  const rl = rateLimiter.check(workspaceId, 'crm-bot')
  if (!rl.allowed) {
    void sendRunawayAlert({ workspaceId, agentId: CRM_WRITER_AGENT_ID, limit })
    return NextResponse.json(
      {
        error: 'Rate limited (suspected runaway loop)',
        code: 'RATE_LIMITED',
        retryable: true,
        retry_after_ms: rl.resetMs,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) },
      },
    )
  }
  if (rl.remaining / limit < 0.2) {
    void maybeSendApproachingLimitAlert({
      workspaceId,
      agentId: CRM_WRITER_AGENT_ID,
      used: limit - rl.remaining,
      limit,
    })
  }

  // Body parse + validation.
  let body: {
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON', retryable: false },
      { status: 400 },
    )
  }
  const messages = body.messages ?? []
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'messages[] required', code: 'INVALID_INPUT', retryable: false },
      { status: 400 },
    )
  }

  // Gate 4: Observability-wrapped execution.
  const conversationId = randomUUID()

  const exec = async (): Promise<NextResponse> => {
    try {
      const output = await writerPropose({ workspaceId, messages, invoker })
      return NextResponse.json({ status: 'ok', output })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        {
          error: 'writer propose failed',
          code: 'INTERNAL',
          retryable: false,
          details: message,
        },
        { status: 500 },
      )
    }
  }

  if (!isObservabilityEnabled()) return await exec()

  const collector = new ObservabilityCollector({
    conversationId,
    workspaceId,
    agentId: CRM_WRITER_AGENT_ID,
    turnStartedAt: new Date(),
    triggerKind: 'api',
  })
  return await runWithCollector(collector, exec)
}
