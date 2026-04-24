/**
 * Load the current `session_state` snapshot for a conversation.
 *
 * Resolution: find the most recent ACTIVE `agent_session` for the
 * conversation, then read the full `session_state` row.
 *
 * D-06 (agent-forensics-panel DISCUSSION-LOG.md): no filtering / no
 * projection — returns the raw JSON, which may contain PII. Documented in
 * `src/lib/agent-specs/README.md` §Pitfall 6.
 *
 * A7 LIMITATION (RESEARCH.md): `session_state` is mutated in-place by the
 * agent. For a turn being analyzed NOW, this is accurate. For a HISTORICAL
 * turn this is the CURRENT state (possibly mutated by later turns). The
 * UI labels this "snapshot actual, no historico".
 *
 * Uses `createRawAdminClient` to avoid re-entering the observability fetch
 * wrapper (Pitfall 1 avoidance — same rationale as
 * `src/lib/observability/repository.ts`).
 *
 * Source: PATTERNS.md §load-session-snapshot.ts NEW (agent-forensics-panel).
 */

import { createRawAdminClient } from '@/lib/supabase/admin'

export async function loadSessionSnapshot(
  conversationId: string,
): Promise<{ snapshot: unknown; sessionId: string | null }> {
  const supabase = createRawAdminClient()

  // Step 1: find most recent active session for this conversation.
  const { data: session, error: sessionErr } = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sessionErr) {
    // Don't throw — return empty so the UI can show "error loading snapshot".
    return { snapshot: null, sessionId: null }
  }
  if (!session) {
    return { snapshot: null, sessionId: null }
  }

  // Step 2: read full session_state row (no projection — D-06).
  const { data: state, error: stateErr } = await supabase
    .from('session_state')
    .select('*')
    .eq('session_id', session.id)
    .maybeSingle()

  if (stateErr) {
    return { snapshot: null, sessionId: session.id }
  }

  return { snapshot: state ?? null, sessionId: session.id }
}
