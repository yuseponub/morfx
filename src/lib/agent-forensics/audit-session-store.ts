/**
 * CRUD for `agent_audit_sessions` (D-17).
 *
 * Server-only — uses `createRawAdminClient` (sin RLS, sin obs wrapper recursion).
 * Caller must enforce super-user gate (assertSuperUser).
 *
 * Migration: supabase/migrations/20260428000000_agent_audit_sessions.sql
 *  applied via Plan 05 Task 2 checkpoint humano (Regla 5 strict).
 */

import { createRawAdminClient } from '@/lib/supabase/admin'

export interface AuditSessionRow {
  id: string
  turnId: string
  workspaceId: string
  userId: string
  respondingAgentId: string
  conversationId: string
  hypothesis: string | null
  messages: unknown[]
  systemPrompt: string
  totalTurnsInContext: number
  trimmedCount: number
  costUsd: number
  createdAt: string
  updatedAt: string
}

/**
 * Lightweight summary row for the AuditorTab v2 history dropdown (Plan 05
 * extension). Excludes `messages` (JSONB) and `system_prompt` (potentially
 * large text) to keep the listing payload small even with N audits per turn.
 *
 * Ordered by `updated_at DESC` (NOT `created_at`): an audit with recent
 * follow-ups should bubble to the top of the dropdown so the most-recently
 * touched audit is the auto-restore candidate.
 */
export interface AuditSessionSummary {
  id: string
  hypothesis: string | null
  messageCount: number
  costUsd: number
  totalTurnsInContext: number
  trimmedCount: number
  createdAt: string
  updatedAt: string
}

/**
 * Full audit row matching `AuditSessionRow` but typed for the UI side that
 * loads a previous audit and rehydrates the chat. `messages` is the raw
 * JSONB array exactly as persisted via Plan 05 Task 9 onFinish — it satisfies
 * the AI SDK `UIMessage[]` shape (validated in audit-message render) but we
 * keep `unknown[]` here to avoid coupling the store to a specific AI SDK
 * version in a server-only module.
 */
export type FullAuditSession = AuditSessionRow

export async function createAuditSession(args: {
  turnId: string
  workspaceId: string
  userId: string
  conversationId: string
  respondingAgentId: string
  hypothesis: string | null
  messages: unknown[]
  systemPrompt: string
  totalTurnsInContext: number
  trimmedCount: number
  costUsd: number
}): Promise<{ id: string }> {
  const supabase = createRawAdminClient()
  const { data, error } = await supabase
    .from('agent_audit_sessions')
    .insert({
      turn_id: args.turnId,
      workspace_id: args.workspaceId,
      user_id: args.userId,
      conversation_id: args.conversationId,
      responding_agent_id: args.respondingAgentId,
      hypothesis: args.hypothesis,
      messages: args.messages,
      system_prompt: args.systemPrompt,
      total_turns_in_context: args.totalTurnsInContext,
      trimmed_count: args.trimmedCount,
      cost_usd: args.costUsd,
    })
    .select('id')
    .single()

  if (error) throw error
  return { id: (data as { id: string }).id }
}

export async function appendToAuditSession(
  id: string,
  args: { messages: unknown[]; costUsdDelta: number },
): Promise<void> {
  const supabase = createRawAdminClient()

  // Read current cost_usd to add delta atomically-from-app perspective.
  // (Race: if 2 follow-ups race, the second loses cost; acceptable since
  // UI disables input during streaming — see Pitfall 11.)
  const { data: existing, error: readErr } = await supabase
    .from('agent_audit_sessions')
    .select('cost_usd')
    .eq('id', id)
    .maybeSingle()

  if (readErr) throw readErr
  if (!existing) throw new Error(`Audit session not found: ${id}`)

  const newCost = Number((existing as { cost_usd?: unknown }).cost_usd ?? 0) + args.costUsdDelta

  const { error: updateErr } = await supabase
    .from('agent_audit_sessions')
    .update({
      messages: args.messages,
      cost_usd: newCost,
      updated_at: new Date().toISOString(), // trigger also covers this; explicit for safety
    })
    .eq('id', id)

  if (updateErr) throw updateErr
}

export async function loadAuditSession(
  id: string,
): Promise<AuditSessionRow | null> {
  const supabase = createRawAdminClient()
  const { data, error } = await supabase
    .from('agent_audit_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const r = data as Record<string, unknown>
  return {
    id: r.id as string,
    turnId: r.turn_id as string,
    workspaceId: r.workspace_id as string,
    userId: r.user_id as string,
    respondingAgentId: r.responding_agent_id as string,
    conversationId: r.conversation_id as string,
    hypothesis: (r.hypothesis as string | null) ?? null,
    messages: (r.messages as unknown[]) ?? [],
    systemPrompt: r.system_prompt as string,
    totalTurnsInContext: (r.total_turns_in_context as number) ?? 0,
    trimmedCount: (r.trimmed_count as number) ?? 0,
    costUsd: Number(r.cost_usd ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/**
 * Plan 05 EXTENSION — listing previous audits for the AuditorTab v2 history
 * dropdown.
 *
 * Returns metadata only (id, hypothesis text, message count, cost, meta,
 * timestamps) — explicitly excludes `messages` JSONB + `system_prompt` to
 * keep the response small (~400 bytes per row vs. up to 100 KB if we shipped
 * the full chat).
 *
 * `message_count` is computed server-side via `jsonb_array_length(messages)`
 * — PostgREST supports computed columns through the `select` projection
 * syntax `column:expression` (see https://postgrest.org/en/stable/api.html#computed-columns).
 *
 * Ordered by `updated_at DESC` so an audit whose follow-ups landed minutes
 * ago bubbles above an audit created hours ago. The (turn_id, created_at DESC)
 * index from migration 20260428000000 still does the WHERE filter; the
 * ORDER BY happens in-memory on the (typically <10 row) result set.
 *
 * @param turnId  Canonical turn id from the master pane selection.
 * @returns       Array sorted by `updated_at DESC`. Empty array if no audits.
 *
 * Caller MUST enforce `assertSuperUser()` before invoking — see the server
 * action wrapper in `src/app/actions/observability.ts`.
 */
export async function listAuditSessionsForTurn(
  turnId: string,
): Promise<AuditSessionSummary[]> {
  const supabase = createRawAdminClient()
  const projection =
    'id, hypothesis, cost_usd, total_turns_in_context, trimmed_count, created_at, updated_at, message_count:messages'
  const { data, error } = await supabase
    .from('agent_audit_sessions')
    .select(projection)
    .eq('turn_id', turnId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  if (!data) return []

  // PostgREST `message_count:messages` projection alias returns the JSONB
  // value (the array itself) under the `message_count` key — we then take
  // `.length`. Postgres-side projection of `jsonb_array_length()` would
  // require a `messages->jsonb_array_length` function alias, which PostgREST
  // does not support without an RPC. Cheaper: ship the array length client-
  // side from the small projected payload (the array is ALREADY in memory
  // here because PostgREST cannot truly omit it given the alias trick).
  //
  // FUTURE (Plan 06 backlog): replace with an RPC `list_audits_for_turn`
  // that runs `jsonb_array_length(messages) AS message_count` server-side
  // so we never ship the JSONB array at all.
  return (data as unknown[]).map((row) => {
    const r = row as Record<string, unknown>
    const rawCount = r.message_count
    const messageCount = Array.isArray(rawCount)
      ? rawCount.length
      : typeof rawCount === 'number'
        ? rawCount
        : 0
    return {
      id: r.id as string,
      hypothesis: (r.hypothesis as string | null) ?? null,
      messageCount,
      costUsd: Number(r.cost_usd ?? 0),
      totalTurnsInContext: (r.total_turns_in_context as number) ?? 0,
      trimmedCount: (r.trimmed_count as number) ?? 0,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }
  })
}

/**
 * Plan 05 EXTENSION — load a full audit row by id for the dropdown's
 * "click to restore" flow.
 *
 * Returns `null` when the row does not exist (silences 404 — caller decides
 * UX, e.g. toast "audit no encontrado, posiblemente fue purgado").
 *
 * Caller MUST enforce `assertSuperUser()` before invoking — see server
 * action wrapper.
 */
export async function loadAuditSessionById(
  id: string,
): Promise<FullAuditSession | null> {
  const supabase = createRawAdminClient()
  const { data, error } = await supabase
    .from('agent_audit_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const r = data as Record<string, unknown>
  return {
    id: r.id as string,
    turnId: r.turn_id as string,
    workspaceId: r.workspace_id as string,
    userId: r.user_id as string,
    respondingAgentId: r.responding_agent_id as string,
    conversationId: r.conversation_id as string,
    hypothesis: (r.hypothesis as string | null) ?? null,
    messages: (r.messages as unknown[]) ?? [],
    systemPrompt: r.system_prompt as string,
    totalTurnsInContext: (r.total_turns_in_context as number) ?? 0,
    trimmedCount: (r.trimmed_count as number) ?? 0,
    costUsd: Number(r.cost_usd ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}
