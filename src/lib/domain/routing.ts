// ============================================================================
// Domain Layer — Routing (Single Source of Truth — Regla 3)
// Phase: agent-lifecycle-router (standalone) — Plan 02 Task 2.
//
// This module is the SOLE owner of all I/O against:
//   - routing_rules (CRUD + active-only loader + max-updated-at for cache)
//   - routing_facts_catalog (read-only — writes via SQL migration only)
//   - routing_audit_log (insert-only writes; reads via Plan 06 admin UI)
//
// NO module under src/lib/agents/routing/** may import createAdminClient —
// they MUST go through this file (Regla 3 enforcement, verifiable with grep).
//
// Schema source: src/lib/agents/routing/schema/rule-v1.schema.json
// Validation: validateRule() invoked BEFORE every write (defense-in-depth +
// Pitfall 2 / CVE-2025-1302 jsonpath-plus surface).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { validateRule } from '@/lib/agents/routing/schema/validate'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Narrow DomainContext local to the routing module. The wider DomainContext
 * in src/lib/domain/types.ts requires `source` (audit). This module's writes
 * (audit log) carry their own metadata, so we only need workspaceId here.
 * Callers passing the wider DomainContext are still accepted (extra fields ignored).
 */
export interface DomainContext {
  workspaceId: string
  userId?: string
  source?: 'user' | 'webhook' | 'agent' | 'system' | string
}

export type DomainResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// --- Rule shape (matches rule-v1.schema.json $defs) -------------------------

export interface LeafCondition {
  fact: string
  operator: string
  value: unknown
}
export interface AllCondition {
  all: AnyCondition[]
}
export interface AnyConditionGroup {
  any: AnyCondition[]
}
export interface NotCondition {
  not: AnyCondition
}
export type AnyCondition = AllCondition | AnyConditionGroup | NotCondition | LeafCondition
export type TopLevelCondition = AllCondition | AnyConditionGroup | NotCondition

export interface RoutingRule {
  id: string
  workspace_id: string
  schema_version: 'v1'
  rule_type: 'lifecycle_classifier' | 'agent_router'
  name: string
  priority: number
  conditions: TopLevelCondition
  event: {
    type: 'route'
    params: { lifecycle_state: string } | { agent_id: string | null }
  }
  active: boolean
  created_at: string
  updated_at: string
  created_by_user_id: string | null
  created_by_agent_id: string | null
}

// --- Audit log (D-16 — 4-value enum) ----------------------------------------

export type RoutingReason =
  | 'matched'
  | 'human_handoff'
  | 'no_rule_matched'
  | 'fallback_legacy'

const VALID_REASONS: ReadonlySet<RoutingReason> = new Set<RoutingReason>([
  'matched',
  'human_handoff',
  'no_rule_matched',
  'fallback_legacy',
])

export interface RoutingAuditEntry {
  workspace_id: string
  contact_id: string
  conversation_id: string | null
  inbound_message_id: string | null
  agent_id: string | null
  reason: RoutingReason
  lifecycle_state: string
  fired_classifier_rule_id: string | null
  fired_router_rule_id: string | null
  facts_snapshot: Record<string, unknown>
  rule_set_version_at_decision: string | null
  latency_ms: number
}

// --- Facts catalog (read-only) ----------------------------------------------

export interface RoutingFact {
  name: string
  return_type: 'string' | 'number' | 'boolean' | 'string[]' | 'null' | string
  description: string
  examples: unknown[]
  active: boolean
  valid_in_rule_types?: string[] | null
}

// ============================================================================
// RULES — CRUD
// ============================================================================

/**
 * Lists ALL rules (active + inactive) for a workspace, ordered by priority DESC.
 * Used by Plan 06 admin form (table view).
 */
export async function listRules(
  ctx: DomainContext,
): Promise<DomainResult<RoutingRule[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('routing_rules')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .order('priority', { ascending: false })
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as RoutingRule[] }
}

/**
 * Fetches a single rule by id, scoped to workspace.
 */
export async function getRule(
  ctx: DomainContext,
  ruleId: string,
): Promise<DomainResult<RoutingRule>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('routing_rules')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', ruleId)
    .single()
  if (error || !data) {
    return { success: false, error: error?.message ?? 'not_found' }
  }
  return { success: true, data: data as RoutingRule }
}

/**
 * Upsert a rule — validates against rule-v1.schema.json BEFORE write.
 * Validation failure short-circuits without DB call (Regla 3 + Pitfall 2 + Pitfall 5).
 *
 * `workspace_id` is always forced to `ctx.workspaceId` to prevent cross-tenant writes
 * even if the caller passes a stale or malicious workspace_id in the payload.
 */
export async function upsertRule(
  ctx: DomainContext,
  rule:
    | (Omit<RoutingRule, 'id' | 'created_at' | 'updated_at' | 'created_by_user_id' | 'created_by_agent_id'>
       & Partial<Pick<RoutingRule, 'id' | 'created_by_user_id' | 'created_by_agent_id'>>),
): Promise<DomainResult<{ id: string }>> {
  // Defense-in-depth: validate at write time.
  // The admin form (Plan 06) also validates client-side, but we never trust input.
  const validation = validateRule(rule)
  if (!validation.ok) {
    return {
      success: false,
      error: `schema validation failed: ${validation.errors.join('; ')}`,
    }
  }

  // Force workspace_id to ctx (multi-tenant safety — Regla 3) and bump updated_at.
  const payload = {
    ...rule,
    workspace_id: ctx.workspaceId,
    updated_at: new Date().toISOString(),
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('routing_rules')
    .upsert(payload as any, { onConflict: 'id' })
    .select('id')
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: { id: (data as { id: string }).id } }
}

/**
 * Soft delete via UPDATE active=false. Preserves the row for audit/forensics.
 * Hard delete is intentionally NOT exposed — schema migrations + audit trail
 * need historical rows (Pitfall 5).
 */
export async function deleteRule(
  ctx: DomainContext,
  ruleId: string,
): Promise<DomainResult<void>> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('routing_rules')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', ruleId)
  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined as unknown as void }
}

/**
 * Returns max(updated_at) across ALL rules (active + inactive) for the workspace.
 * Used by Plan 03 cache.ts for version-column revalidation (Pattern 3).
 * Returns null when no rules exist (PGRST116 = no rows).
 */
export async function getMaxUpdatedAt(
  ctx: DomainContext,
): Promise<DomainResult<string | null>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('routing_rules')
    .select('updated_at')
    .eq('workspace_id', ctx.workspaceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    return { success: false, error: error.message }
  }
  return { success: true, data: (data as { updated_at: string } | null)?.updated_at ?? null }
}

/**
 * Loads ACTIVE rules and splits them by rule_type. Used by Plan 03 cache + route.ts.
 * Sorted by priority DESC so cache + engine see highest-priority first.
 */
export async function loadActiveRulesForWorkspace(
  ctx: DomainContext,
): Promise<
  DomainResult<{
    classifierRules: RoutingRule[]
    routerRules: RoutingRule[]
  }>
> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('routing_rules')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .eq('active', true)
    .order('priority', { ascending: false })
  if (error) return { success: false, error: error.message }
  const rules = (data ?? []) as RoutingRule[]
  return {
    success: true,
    data: {
      classifierRules: rules.filter((r) => r.rule_type === 'lifecycle_classifier'),
      routerRules: rules.filter((r) => r.rule_type === 'agent_router'),
    },
  }
}

// ============================================================================
// FACTS CATALOG — read-only (writes via SQL migration only)
// ============================================================================

/**
 * Lists ACTIVE facts ordered by name. Used by Plan 06 admin form (fact picker)
 * and Plan 03 cache (fact validation on rule load).
 */
export async function listFactsCatalog(): Promise<DomainResult<RoutingFact[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('routing_facts_catalog')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as RoutingFact[] }
}

// ============================================================================
// AUDIT LOG — writes only (reads via UI in Plan 06)
// ============================================================================

/**
 * Insert a routing decision into routing_audit_log.
 * Validates `reason` against the 4-value enum BEFORE insert (defense-in-depth
 * vs DB CHECK constraint).
 *
 * Caller pattern: fire-and-forget. Failure is logged via console.error but
 * never throws (audit failures must not block routing decisions).
 */
export async function recordAuditLog(
  entry: RoutingAuditEntry,
): Promise<DomainResult<void>> {
  if (!VALID_REASONS.has(entry.reason)) {
    return { success: false, error: `invalid reason: ${entry.reason}` }
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('routing_audit_log').insert({
    workspace_id: entry.workspace_id,
    contact_id: entry.contact_id,
    conversation_id: entry.conversation_id,
    inbound_message_id: entry.inbound_message_id,
    agent_id: entry.agent_id,
    reason: entry.reason,
    lifecycle_state: entry.lifecycle_state,
    fired_classifier_rule_id: entry.fired_classifier_rule_id,
    fired_router_rule_id: entry.fired_router_rule_id,
    facts_snapshot: entry.facts_snapshot,
    rule_set_version_at_decision: entry.rule_set_version_at_decision,
    latency_ms: entry.latency_ms,
  })
  if (error) {
    console.error('[domain.routing] recordAuditLog failed:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true, data: undefined as unknown as void }
}
