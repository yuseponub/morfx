// src/app/api/agent-forensics/audit/route.ts
//
// Agent Forensics Auditor — multi-turn + hypothesis + persistence (Plan 05).
//
// Extends Plan 04 base (single-turn audit) with:
//   - First-round vs follow-up branching (auditSessionId === null detection).
//   - Multi-turn context assembly (loadConversationTurns + Promise.all per-turn detail).
//   - Token budgeting + truncate (drop oldest, keep audited).
//   - Hypothesis injection (D-16 dual placement system + user message).
//   - Persistence via agent_audit_sessions (D-17, Regla 5 strict — Task 2 applied SQL).
//   - Headers X-Audit-Session-Id (first round) + X-Forensics-Trimmed (when trimmed > 0).
//
// Pitfalls mitigated:
//   9  — useChat reset on transport change (handled UI-side Task 11)
//   10 — onFinish + Vercel timeout (maxOutputTokens: 4096 keeps response ~30s)
//   11 — assistant message during stream (UI disables input — Task 11)
//   12 — getTurnDetail × N → Promise.all paralelizacion
//   13 — snapshot mutable across rounds → persist system_prompt, follow-ups skip re-assembly
//   14 — token counting rate limit → estimateTokens local first, API only > 40K
//   15 — anti-false-positive directive in system prompt (RESEARCH §8)
//
// ENV VAR: uses `ANTHROPIC_API_KEY_TOOLS` — a DEDICATED key separate from
// `ANTHROPIC_API_KEY` (which the conversational bots in production consume).

import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { assertSuperUser } from '@/lib/auth/super-user'
import { createClient } from '@/lib/supabase/server'
import { getTurnDetail } from '@/lib/observability/repository'
import { loadAgentSpec } from '@/lib/agent-forensics/load-agent-spec'
import { loadSessionSnapshot } from '@/lib/agent-forensics/load-session-snapshot'
import { condenseTimeline } from '@/lib/agent-forensics/condense-timeline'
import { buildAuditorPromptV2 } from '@/lib/agent-forensics/auditor-prompt'
import { loadConversationTurns } from '@/lib/agent-forensics/load-conversation-turns'
import { condensePreviousTurn } from '@/lib/agent-forensics/condense-previous-turn'
import { estimateTokens, truncateContext } from '@/lib/agent-forensics/token-budget'
import {
  createAuditSession,
  appendToAuditSession,
  loadAuditSession,
} from '@/lib/agent-forensics/audit-session-store'
import { calculateAuditCost } from '@/lib/agent-forensics/pricing'

interface AuditRequestBody {
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string
  messages: UIMessage[]
  hypothesis: string | null
  auditSessionId: string | null
}

export async function POST(request: Request): Promise<Response> {
  try {
    await assertSuperUser()

    // Resolve current user id (needed for audit_session.user_id) — assertSuperUser
    // already verified the cookie maps to MORFX_OWNER_USER_ID.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userId = user?.id ?? ''

    const body = (await request.json()) as AuditRequestBody
    const {
      turnId,
      startedAt,
      respondingAgentId,
      conversationId,
      messages,
      hypothesis,
      auditSessionId,
    } = body

    // Normalize hypothesis empty-string → null
    const normalizedHypothesis =
      hypothesis && hypothesis.trim().length > 0 ? hypothesis.trim() : null

    const isFirstRound = auditSessionId === null
    const anthropicTools = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY_TOOLS,
    })

    if (isFirstRound) {
      // ============================================================
      // FIRST ROUND — heavy assembly + persist new audit session
      // ============================================================
      const detail = await getTurnDetail(turnId, startedAt)
      const effectiveAgentId = respondingAgentId ?? detail.turn.agentId

      const [spec, { snapshot }, conversationTurns] = await Promise.all([
        loadAgentSpec(effectiveAgentId),
        loadSessionSnapshot(conversationId),
        loadConversationTurns(conversationId, startedAt),
      ])

      // Condense previous turns in PARALLEL (Pitfall 12 mitigation)
      const previousTurnsRaw = conversationTurns.filter((t) => t.id !== turnId)
      const previousTurnsDetails = await Promise.all(
        previousTurnsRaw.map((t) => getTurnDetail(t.id, t.startedAt)),
      )
      const previousCondensedAll = previousTurnsDetails.map(condensePreviousTurn)

      // Audited turn — full timeline (Plan 04 condenseTimeline)
      const condensedAudited = condenseTimeline(detail, respondingAgentId)

      // Compute fixed cost for token budgeting
      const fixedCostTokens =
        estimateTokens(spec) +
        estimateTokens(JSON.stringify(snapshot)) +
        estimateTokens(JSON.stringify(condensedAudited)) +
        2_000 /* system prompt + meta */

      const { kept, trimmed } = truncateContext({
        previousTurns: previousCondensedAll,
        auditedTurnId: turnId,
        fixedCostTokens,
      })

      const { systemPrompt, userMessage } = buildAuditorPromptV2({
        spec,
        previousTurns: kept,
        condensed: condensedAudited,
        snapshot,
        turn: detail.turn,
        hypothesis: normalizedHypothesis,
      })

      // Replace messages[0] with the heavy first user message — useChat sent
      // a placeholder ('Auditar' or hypothesis text); we inject the full context.
      if (messages.length > 0) {
        messages[0] = {
          ...messages[0],
          parts: [{ type: 'text', text: userMessage }],
        } as UIMessage
      }

      // Pre-create audit session row so we have an id to return in headers BEFORE stream.
      // onFinish updates messages + cost when stream completes.
      const { id: newAuditSessionId } = await createAuditSession({
        turnId,
        workspaceId: detail.turn.workspaceId,
        userId,
        conversationId,
        respondingAgentId: respondingAgentId ?? detail.turn.agentId,
        hypothesis: normalizedHypothesis,
        messages, // user message only at this point; assistant will be added in onFinish
        systemPrompt,
        totalTurnsInContext: kept.length,
        trimmedCount: trimmed,
        costUsd: 0, // updated in onFinish
      })

      const modelMessages = await convertToModelMessages(messages)
      const result = streamText({
        model: anthropicTools('claude-sonnet-4-6'),
        system: systemPrompt,
        messages: modelMessages,
        temperature: 0.3,
        maxOutputTokens: 4096,
        onFinish: async ({ usage, response }) => {
          try {
            const inputTokens = usage?.inputTokens ?? 0
            const outputTokens = usage?.outputTokens ?? 0
            const turnCostUsd = calculateAuditCost(inputTokens, outputTokens)
            // Append assistant response message to the array we persisted
            const fullMessages = [
              ...messages,
              ...((response?.messages ?? []) as unknown[]),
            ]
            await appendToAuditSession(newAuditSessionId, {
              messages: fullMessages,
              costUsdDelta: turnCostUsd,
            })
          } catch (err) {
            console.error(
              '[agent-forensics/audit] onFinish persist failed (first round):',
              err,
            )
          }
        },
      })

      const response = result.toUIMessageStreamResponse()
      response.headers.set('X-Audit-Session-Id', newAuditSessionId)
      if (trimmed > 0) {
        response.headers.set(
          'X-Forensics-Trimmed',
          `${kept.length}/${kept.length + trimmed}`,
        )
      }
      return response
    } else {
      // ============================================================
      // FOLLOW-UP ROUND — load system_prompt from DB, pass-through messages
      // ============================================================
      const session = await loadAuditSession(auditSessionId!)
      if (!session) {
        return new Response('Audit session not found', { status: 404 })
      }

      const modelMessages = await convertToModelMessages(messages)
      const result = streamText({
        model: anthropicTools('claude-sonnet-4-6'),
        system: session.systemPrompt, // FROZEN ground truth (Pitfall 13)
        messages: modelMessages,
        temperature: 0.3,
        maxOutputTokens: 4096,
        onFinish: async ({ usage, response }) => {
          try {
            const inputTokens = usage?.inputTokens ?? 0
            const outputTokens = usage?.outputTokens ?? 0
            const turnCostUsd = calculateAuditCost(inputTokens, outputTokens)
            const fullMessages = [
              ...messages,
              ...((response?.messages ?? []) as unknown[]),
            ]
            await appendToAuditSession(auditSessionId!, {
              messages: fullMessages,
              costUsdDelta: turnCostUsd,
            })
          } catch (err) {
            console.error(
              '[agent-forensics/audit] onFinish persist failed (follow-up):',
              err,
            )
          }
        },
      })

      return result.toUIMessageStreamResponse()
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return new Response('Forbidden', { status: 403 })
    }
    console.error('[agent-forensics/audit] Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
