// ============================================================================
// Domain Layer — Agent Templates (Regla 3)
// Single source of truth for mutations on `agent_templates`.
//
// Standalone: ui-agent-content-editor — Plan 03 (Wave 2).
//
// Context:
//   `agent_templates` had NO domain layer until now — `TemplateManager`
//   (src/lib/agents/somnio/template-manager.ts) hits `createAdminClient`
//   directly for the RUNTIME READ path. That runtime read stays as-is; this
//   domain file is the MUTATION gateway the UI must use (Regla 3 mandates a
//   domain layer before any UI write).
//
// Decisions enforced here:
//   - D-02 / Regla 6: ONLY agent_id='somnio-sales-v4' is mutable. Every other
//     agent is read-only (production agents must not be edited from the UI).
//   - D-03: the UI edits the exact rows v4 uses in place (global workspace_id
//     NULL + workspace match), no per-workspace override rows are created.
//   - D-04: READS are allowed for ANY agent (read-only visibility / grouping).
//   - D-08 (B-acotado): addTemplate may only insert into an intent that ALREADY
//     exists for the agent. Creating brand-new intents requires agent code.
//   - Pitfall 3: reorder must never transiently violate the
//     UNIQUE(agent_id,intent,visit_type,orden,workspace_id) constraint.
//
// All queries filter explicitly by agent_id (and id for update/delete) even
// though the admin client bypasses RLS — defense in depth, no cross-agent write.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Types
// ============================================================================

/**
 * Full agent_templates row as edited by the UI.
 *
 * Mirrors the live schema (RESEARCH §Domain Layer Shape — VERIFIED):
 *   id, agent_id, intent, visit_type, orden, content_type, content, delay_s,
 *   workspace_id (NULL = global), priority, minifrase, created_at, updated_at.
 *
 * Note: this is a superset of `src/lib/agents/types.ts:AgentTemplateRow`, which
 * predates the `minifrase` column — we redefine here to include it.
 */
export interface AgentTemplateRow {
  id: string
  agent_id: string
  intent: string
  visit_type: string
  orden: number
  content_type: string
  content: string
  delay_s: number
  workspace_id: string | null
  priority: string
  minifrase: string | null
  created_at: string
  updated_at: string
}

export type TemplateContentType = 'texto' | 'template' | 'imagen'
export type TemplatePriority = 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'
export type TemplateVisitType = 'primera_vez' | 'siguientes'

// ============================================================================
// Read functions (D-04 — allowed for ANY agent, no edit-gate)
// ============================================================================

/**
 * List all templates for an agent, ordered intent→visit_type→orden, scoped to
 * global (workspace_id IS NULL) + the caller's workspace.
 *
 * Read is allowed for ANY agent (D-04 — read-only visibility). Mirrors the
 * runtime lookup shape in template-manager.ts:272-294 so the UI shows exactly
 * the rows the agent dispatches.
 */
export async function listTemplatesByAgent(
  ctx: DomainContext,
  agentId: string,
): Promise<DomainResult<AgentTemplateRow[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_templates')
    .select('*')
    .eq('agent_id', agentId)
    .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspaceId}`)
    .order('intent')
    .order('visit_type')
    .order('orden')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as AgentTemplateRow[] }
}

/**
 * Distinct sorted list of intents present for an agent (global + workspace
 * scope). Used by the D-08 guard (addTemplate) and by the UI for grouping.
 */
export async function listIntents(
  ctx: DomainContext,
  agentId: string,
): Promise<DomainResult<string[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_templates')
    .select('intent')
    .eq('agent_id', agentId)
    .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspaceId}`)

  if (error) return { success: false, error: error.message }
  const rows = (data ?? []) as { intent: string }[]
  const unique = Array.from(new Set(rows.map((r) => r.intent))).sort()
  return { success: true, data: unique }
}
