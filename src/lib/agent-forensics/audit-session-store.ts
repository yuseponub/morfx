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
