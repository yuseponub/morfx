/**
 * Observability Events API Route
 * Standalone: debounce-interruption-system-v2 / Plan 06 / Task 6.2 (REVISION W5).
 *
 * GET /api/observability/events?session_id=...&conversation_id=...&labels=a,b&limit=200
 *
 * Returns rows from `agent_observability_events` filtered by:
 *   - turn(session_id|conversation_id) → resolved via JOIN to agent_observability_turns
 *     (the events table is partitioned by recorded_at and only carries turn_id;
 *     session/conversation lives on the parent turn row).
 *   - label IN (CSV list) — optional; defaults to all labels.
 *   - hard cap: 200 rows (override with `limit`, max 500).
 *
 * Consumed by:
 *   src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx
 *   (the Plan 06 sandbox tab) — post-turn fetch only (RESEARCH Open Question 3:
 *   NO live SSE).
 *
 * Auth: mirrors the pattern from src/app/api/sandbox/process/route.ts — require
 * an authenticated supabase user; workspace scoping is enforced by the
 * agent_observability_turns row's workspace_id when the caller passes a
 * conversation/session id they own (sandbox debug panel can only show turns
 * the user can see in the UI).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

export async function GET(req: NextRequest) {
  try {
    // Auth — mirror sandbox/process auth pattern.
    const supabaseUser = await createClient()
    const {
      data: { user },
    } = await supabaseUser.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      )
    }

    const sessionId = req.nextUrl.searchParams.get('session_id')
    const conversationId = req.nextUrl.searchParams.get('conversation_id')
    const labelsParam = req.nextUrl.searchParams.get('labels') ?? ''
    const labels = labelsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const limitRaw = req.nextUrl.searchParams.get('limit')
    const limit = limitRaw
      ? Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limitRaw, 10) || DEFAULT_LIMIT))
      : DEFAULT_LIMIT

    if (!sessionId && !conversationId) {
      return NextResponse.json(
        { error: 'session_id or conversation_id required' },
        { status: 400 },
      )
    }

    // Use the raw admin client (un-instrumented) to avoid polluting future
    // observability data — see src/lib/observability/repository.ts rationale.
    const supabase = createRawAdminClient()

    // Step 1: resolve turn_ids for the session/conversation. The events table
    // doesn't carry session_id/conversation_id directly — those live on the
    // parent agent_observability_turns row.
    let turnsQuery = supabase
      .from('agent_observability_turns')
      .select('id, conversation_id, workspace_id')
      .order('started_at', { ascending: true })
      .limit(limit)

    if (sessionId) {
      // Sessions table FK to conversations; the observability turn carries
      // conversation_id. Resolve session → conversation first.
      const { data: sess, error: sessErr } = await supabase
        .from('agent_sessions')
        .select('conversation_id')
        .eq('id', sessionId)
        .maybeSingle()
      if (sessErr) {
        return NextResponse.json({ error: sessErr.message }, { status: 500 })
      }
      if (!sess) {
        return NextResponse.json({ events: [] })
      }
      turnsQuery = turnsQuery.eq('conversation_id', sess.conversation_id)
    } else if (conversationId) {
      turnsQuery = turnsQuery.eq('conversation_id', conversationId)
    }

    const { data: turns, error: turnsErr } = await turnsQuery
    if (turnsErr) {
      return NextResponse.json({ error: turnsErr.message }, { status: 500 })
    }
    const turnIds = (turns ?? []).map((t) => t.id as string)
    if (turnIds.length === 0) {
      return NextResponse.json({ events: [] })
    }

    // Step 2: fetch the events for those turns, optionally filtered by label.
    let eventsQuery = supabase
      .from('agent_observability_events')
      .select('id, turn_id, recorded_at, category, label, payload')
      .in('turn_id', turnIds)
      .order('recorded_at', { ascending: true })
      .limit(limit)

    if (labels.length > 0) {
      eventsQuery = eventsQuery.in('label', labels)
    }

    const { data: events, error: eventsErr } = await eventsQuery
    if (eventsErr) {
      return NextResponse.json({ error: eventsErr.message }, { status: 500 })
    }

    return NextResponse.json({ events: events ?? [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
