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

// ============================================================================
// Edit-gate (D-02 / Regla 6) — ONLY somnio-sales-v4 is mutable
// ============================================================================

const EDITABLE_AGENT_ID = 'somnio-sales-v4'

/**
 * Returns a failed DomainResult if the agent is NOT editable, or `null` if it
 * is. Every mutation calls this FIRST, before touching the DB (D-02).
 */
function assertEditable(agentId: string): DomainResult | null {
  return agentId === EDITABLE_AGENT_ID
    ? null
    : { success: false, error: 'Solo somnio-sales-v4 es editable (Regla 6 / D-02).' }
}

// ============================================================================
// Mutations (D-02 v4-gated)
// ============================================================================

/**
 * Update a template's editable fields in place (D-03 — edits the exact row the
 * agent uses). Gated to v4 (D-02). Filters by id + agent_id (no cross-agent write).
 */
export async function updateTemplateContent(
  ctx: DomainContext,
  params: {
    id: string
    agentId: string
    content: string
    content_type: TemplateContentType
    delay_s: number
    priority: TemplatePriority
    minifrase: string | null
  },
): Promise<DomainResult> {
  const gate = assertEditable(params.agentId)
  if (gate) return gate

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agent_templates')
    .update({
      content: params.content,
      content_type: params.content_type,
      delay_s: params.delay_s,
      priority: params.priority,
      minifrase: params.minifrase,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('agent_id', params.agentId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Insert a new template row. Gated to v4 (D-02). D-08: the target intent MUST
 * already exist for the agent — creating brand-new intents requires agent code.
 *
 * Inserts as a GLOBAL row (workspace_id: NULL) to match the scope v4's rows use
 * (D-03 — no per-workspace override rows).
 */
export async function addTemplate(
  ctx: DomainContext,
  params: {
    agentId: string
    intent: string
    visit_type: TemplateVisitType
    orden: number
    content_type: TemplateContentType
    content: string
    delay_s: number
    priority: TemplatePriority
    minifrase: string | null
  },
): Promise<DomainResult<AgentTemplateRow>> {
  const gate = assertEditable(params.agentId)
  if (gate) return gate as DomainResult<AgentTemplateRow>

  // D-08 guard: only existing intents are addable.
  const intents = await listIntents(ctx, params.agentId)
  if (!intents.success) {
    return { success: false, error: intents.error ?? 'No se pudo verificar el intent.' }
  }
  if (!intents.data?.includes(params.intent)) {
    return {
      success: false,
      error: 'Intent inexistente. Crear intents nuevos requiere código del agente (D-08).',
    }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_templates')
    .insert({
      agent_id: params.agentId,
      intent: params.intent,
      visit_type: params.visit_type,
      orden: params.orden,
      content_type: params.content_type,
      content: params.content,
      delay_s: params.delay_s,
      priority: params.priority,
      minifrase: params.minifrase,
      workspace_id: null, // D-03: global row, same scope v4 uses
    })
    .select('*')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: data as AgentTemplateRow }
}

/**
 * Delete a template row. Gated to v4 (D-02). Filters by id + agent_id.
 */
export async function deleteTemplate(
  ctx: DomainContext,
  params: { id: string; agentId: string },
): Promise<DomainResult> {
  const gate = assertEditable(params.agentId)
  if (gate) return gate

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agent_templates')
    .delete()
    .eq('id', params.id)
    .eq('agent_id', params.agentId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
