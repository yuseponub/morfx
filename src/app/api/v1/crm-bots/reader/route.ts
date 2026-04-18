/**
 * POST /api/v1/crm-bots/reader
 *
 * CRM Reader Bot HTTP endpoint. Invoked by other agents as a tool provider.
 * Phase 44 Plan 07 (Wave 3).
 *
 * Request:
 *   Headers (set by middleware — see middleware.ts lines 61-91):
 *     - authorization: Bearer mfx_...
 *     - x-workspace-id: injected post validateApiKey
 *     - x-api-key-prefix: first 8 chars of API key, injected post validateApiKey
 *     - x-invoker: (optional) free-form caller identifier; falls back to
 *                  x-api-key-prefix if absent (Warning #14, revision 2026-04-18)
 *   Body:
 *     { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> }
 *
 * Response:
 *   200 { status: 'ok', output: { text, toolCalls, steps, agentId } }
 *   400 { error, code: 'INVALID_JSON' | 'INVALID_INPUT' }
 *   401 { error, code: 'MISSING_CONTEXT' }                  — workspace header missing
 *   429 { error, code: 'RATE_LIMITED', retry_after_ms }     — runaway limiter hit
 *   500 { error, code: 'INTERNAL' }                         — processReaderMessage threw
 *   503 { error, code: 'KILL_SWITCH' }                      — CRM_BOT_ENABLED=false
 *
 * CRITICAL RULES (from 44-RESEARCH.md + 44-PATTERNS.md):
 *   1. process.env.CRM_BOT_ENABLED read INSIDE handler (Pitfall 2).
 *   2. workspaceId read ONLY from x-workspace-id header set by middleware
 *      post validateApiKey (Pitfall 4). Body workspaceId is ignored.
 *   3. rateLimiter.check(workspaceId, 'crm-bot') — shared bucket with writer
 *      (44-01 decision — runaway detection works best with shared quota).
 *   4. Alerts are fire-and-forget via `void` — never awaited, never throw
 *      (fail-silent inside alerts module per 44-02).
 *   5. invoker falls back to x-api-key-prefix if x-invoker absent
 *      (Warning #14 — ensures the observability row always has an invoker).
 *   6. runWithCollector wraps processReaderMessage with triggerKind='api'
 *      (44-01 extended TriggerKind union for API-only bots).
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { rateLimiter } from '@/lib/tools/rate-limiter'
// Warning #11 grep precheck (2026-04-18): all three symbols are barrel-exported
// from @/lib/observability (see src/lib/observability/index.ts lines 22-51).
// Confirmed:
//   grep -E "^export \{.*(runWithCollector|ObservabilityCollector|isObservabilityEnabled)" \
//     src/lib/observability/index.ts
// Match count: 3/3 — safe to import from the barrel.
import {
  runWithCollector,
  ObservabilityCollector,
  isObservabilityEnabled,
} from '@/lib/observability'
import { processReaderMessage, CRM_READER_AGENT_ID } from '@/lib/agents/crm-reader'
import {
  sendRunawayAlert,
  maybeSendApproachingLimitAlert,
} from '@/lib/agents/_shared/alerts'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ==================== 1. KILL-SWITCH (per-request env read — Pitfall 2) ====================
  // NEVER cache CRM_BOT_ENABLED at module scope. Vercel warm lambdas would
  // keep stale values for ~15 min after a dashboard toggle.
  if (process.env.CRM_BOT_ENABLED === 'false') {
    return NextResponse.json(
      { error: 'CRM bots globally disabled', code: 'KILL_SWITCH', retryable: false },
      { status: 503 },
    )
  }

  // ==================== 2. HEADER EXTRACTION (Pitfall 4 + Warning #14) ====================
  // workspaceId MUST come from the middleware-set header. The middleware binds
  // it to the API key post validateApiKey — reading from the request body would
  // allow a caller with a valid key for workspace A to forge workspace_id=B.
  const workspaceId = request.headers.get('x-workspace-id')
  // Warning #14: invoker fallback chain — x-invoker (optional, free-form caller
  // tag) → x-api-key-prefix (middleware-set, always present for valid API keys)
  // → undefined. Guarantees observability rows + future audit rows (writer's
  // crm_bot_actions.invoker) have a consistent invoker value across Plans 07/08.
  const invoker =
    request.headers.get('x-invoker') ??
    request.headers.get('x-api-key-prefix') ??
    undefined

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'Missing workspace context', code: 'MISSING_CONTEXT', retryable: false },
      { status: 401 },
    )
  }

  // ==================== 3. RATE LIMIT (shared 'crm-bot' bucket — 44-01) ====================
  const limit = Number(process.env.CRM_BOT_RATE_LIMIT_PER_MIN ?? 50)
  const rl = rateLimiter.check(workspaceId, 'crm-bot')

  if (!rl.allowed) {
    // Fire-and-forget — sendRunawayAlert is defensive (try/catch + lazy client);
    // never throws. If we awaited it, a Resend outage would delay the 429 response.
    void sendRunawayAlert({
      workspaceId,
      agentId: CRM_READER_AGENT_ID,
      limit,
    })
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

  // Approaching-limit email alert at >80% budget consumed.
  // remaining/limit < 0.2 is equivalent to used/limit > 0.8.
  if (rl.remaining / limit < 0.2) {
    void maybeSendApproachingLimitAlert({
      workspaceId,
      agentId: CRM_READER_AGENT_ID,
      used: limit - rl.remaining,
      limit,
    })
  }

  // ==================== 4. PARSE BODY ====================
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

  // ==================== 5. EXECUTE WITH OBSERVABILITY WRAPPING ====================
  // Every call is wrapped in runWithCollector so Phase 42.1 observability
  // captures the turn end-to-end: AI calls, Supabase queries, errors, timing.
  //
  // conversationId: CRM bots are stateless at the conversation level (CONTEXT
  // Decision #9 — "no se guardan las conversaciones"). We generate a synthetic
  // per-request UUID so every call gets its own observability row.
  const conversationId = randomUUID()

  const executeAgent = async (): Promise<NextResponse> => {
    try {
      const output = await processReaderMessage({ workspaceId, messages, invoker })
      return NextResponse.json({ status: 'ok', output })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        {
          error: 'reader execution failed',
          code: 'INTERNAL',
          retryable: false,
          details: message,
        },
        { status: 500 },
      )
    }
  }

  // Fast path when observability is OFF — skip collector allocation entirely.
  // isObservabilityEnabled() reads OBSERVABILITY_ENABLED env var per-call
  // (not cached — see src/lib/observability/flag.ts), so this respects
  // runtime toggles the same way the kill-switch does.
  if (!isObservabilityEnabled()) {
    return await executeAgent()
  }

  const collector = new ObservabilityCollector({
    conversationId,
    workspaceId,
    agentId: CRM_READER_AGENT_ID,
    turnStartedAt: new Date(),
    triggerKind: 'api',
  })

  return await runWithCollector(collector, executeAgent)
}
