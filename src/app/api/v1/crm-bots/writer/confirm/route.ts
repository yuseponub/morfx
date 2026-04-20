/**
 * POST /api/v1/crm-bots/writer/confirm
 *
 * CRM Writer Bot — CONFIRM phase. No LLM. Directly idempotent via optimistic
 * UPDATE in crm_bot_actions (Pitfall 3 — implemented in Plan 05 two-step.ts).
 * The action_id must have been issued by a prior propose call within TTL=5min
 * for the SAME workspace; cross-workspace action_id returns 'not_found'
 * (T-44-08-01 mitigation enforced inside writerConfirm).
 *
 * Gate stack mirrors propose route exactly:
 *   1. Kill-switch via platform_config.crm_bot_enabled (Pitfall 2 + Phase 44.1; cache TTL 30s)
 *   2. x-workspace-id header required (Pitfall 4 — body.workspaceId IGNORED)
 *   3. Rate limit on shared 'crm-bot' namespace (limit from platform_config — Phase 44.1)
 *   4. Observability-wrapped execution (conversationId=actionId for correlation)
 *
 * Body validation: { actionId: uuid } — UUID_REGEX defense-in-depth.
 *
 * Phase 44 Plan 08.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimiter } from '@/lib/tools/rate-limiter'
import {
  runWithCollector,
  ObservabilityCollector,
  isObservabilityEnabled,
} from '@/lib/observability'
import { confirm as writerConfirm, CRM_WRITER_AGENT_ID } from '@/lib/agents/crm-writer'
import {
  sendRunawayAlert,
  maybeSendApproachingLimitAlert,
} from '@/lib/agents/_shared/alerts'
import { getPlatformConfig } from '@/lib/domain/platform-config'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Gate 1: Kill-switch (Phase 44.1: via platform_config.crm_bot_enabled, cache TTL 30s).
  // Fallback true = fail-open si DB falla (Pitfall 6 de 44.1-RESEARCH).
  const enabled = await getPlatformConfig('crm_bot_enabled', true)
  if (enabled === false) {
    return NextResponse.json(
      { error: 'CRM bots globally disabled', code: 'KILL_SWITCH', retryable: false },
      { status: 503 },
    )
  }

  // Gate 2: Header extraction — Pitfall 4 + Warning #14 fallback.
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

  // Gate 3: Rate limit — shared 'crm-bot' namespace with reader + propose.
  // Phase 44.1: limit resuelto per-request via platform_config.crm_bot_rate_limit_per_min.
  const limit = await getPlatformConfig('crm_bot_rate_limit_per_min', 50)
  const rl = rateLimiter.check(workspaceId, 'crm-bot', { limit })
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
  // NOTE: body.workspaceId would be IGNORED even if present — workspace scope
  // is fixed from the authenticated header context.
  let body: { actionId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON', retryable: false },
      { status: 400 },
    )
  }

  const actionId = body.actionId
  if (typeof actionId !== 'string' || !UUID_REGEX.test(actionId)) {
    return NextResponse.json(
      { error: 'actionId (uuid) required', code: 'INVALID_INPUT', retryable: false },
      { status: 400 },
    )
  }

  // Gate 4: Observability-wrapped execution. Correlate turn to the action_id
  // (no new schema — conversationId is a uuid field and actionId is a uuid).
  const exec = async (): Promise<NextResponse> => {
    try {
      const result = await writerConfirm({ workspaceId, invoker }, actionId)
      return NextResponse.json({ status: 'ok', result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        {
          error: 'writer confirm failed',
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
    conversationId: actionId, // correlate turn → action_id
    workspaceId,
    agentId: CRM_WRITER_AGENT_ID,
    turnStartedAt: new Date(),
    triggerKind: 'api',
  })
  return await runWithCollector(collector, exec)
}
