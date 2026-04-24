// src/app/api/agent-forensics/audit/route.ts
//
// Agent Forensics Auditor — streaming audit endpoint (D-03 manual invocation).
//
// Source: adapted from src/app/api/builder/chat/route.ts + RESEARCH.md §Pattern 4.
// D-08: claude-sonnet-4-6 locked.
// D-09: markdown output (no JSON).
// D-13: pointers file:line + prose.
// Pitfall 7: this is a normal Next.js API route, NOT an Inngest function —
// called once per user click; no retries, no replays, no step.run boundaries.
//
// ENV VAR: uses `ANTHROPIC_API_KEY_TOOLS` — a DEDICATED key separate from
// `ANTHROPIC_API_KEY` (which the conversational bots in production consume).
// Benefits: rate-limit isolation (auditor spikes don't throttle production
// bots), cost tracking separation, reduced blast radius on key rotation.

import { streamText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { assertSuperUser } from '@/lib/auth/super-user'
import { getTurnDetail } from '@/lib/observability/repository'
import { loadAgentSpec } from '@/lib/agent-forensics/load-agent-spec'
import { loadSessionSnapshot } from '@/lib/agent-forensics/load-session-snapshot'
import { condenseTimeline } from '@/lib/agent-forensics/condense-timeline'
import { buildAuditorPrompt } from '@/lib/agent-forensics/auditor-prompt'

interface AuditRequestBody {
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string
}

export async function POST(request: Request): Promise<Response> {
  try {
    await assertSuperUser() // throws Error('FORBIDDEN') if not the owner

    const body = (await request.json()) as AuditRequestBody
    const { turnId, startedAt, respondingAgentId, conversationId } = body

    // 1) Fetch turn first (we need turn.agentId for the spec fallback)
    const detail = await getTurnDetail(turnId, startedAt)
    const effectiveAgentId = respondingAgentId ?? detail.turn.agentId

    // 2) Assemble context in parallel (spec + snapshot — both read-only)
    const [spec, { snapshot }] = await Promise.all([
      loadAgentSpec(effectiveAgentId),
      loadSessionSnapshot(conversationId),
    ])

    // 3) Condense timeline (pure function — cheap, no I/O)
    const condensed = condenseTimeline(detail, respondingAgentId)

    // 4) Build prompt
    const { systemPrompt, userMessage } = buildAuditorPrompt({
      spec,
      condensed,
      snapshot,
      turn: detail.turn,
    })

    // 5) Stream Claude Sonnet 4.6 via tools-dedicated API key (NOT the
    //    conversational-bots key — see ENV VAR note at top of file).
    const anthropicTools = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY_TOOLS,
    })

    const result = streamText({
      model: anthropicTools('claude-sonnet-4-6'), // D-08
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.3,
      maxOutputTokens: 4096,
    })

    return result.toUIMessageStreamResponse()
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
