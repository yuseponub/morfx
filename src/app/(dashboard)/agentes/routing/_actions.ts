'use server'

// ============================================================================
// Server Actions — agent-lifecycle-router admin form (Plan 06).
//
// Regla 3 enforcement: TODAS las mutaciones contra routing_rules /
// routing_audit_log van via @/lib/domain/routing. Este archivo NO importa
// Supabase admin clients (verificable: grep VACIO).
//
// Pitfall 5 + D-12: validateRule (Ajv) corre client-side en el editor y
// REVALIDA aqui (defense-in-depth — nunca confiar del client).
//
// Pitfall 3: invalidateWorkspace borra el cache LRU same-lambda post-write.
// Cross-lambda eventual consistency bounded by 10s TTL + version-column
// revalidation.
//
// W-6 fix: validateRulePriorityUnique pre-check ANTES del DB upsert para
// evitar leak del DB UNIQUE constraint a la UI con un mensaje 500 generico.
// ============================================================================

import { revalidatePath } from 'next/cache'
import {
  upsertRule,
  deleteRule,
  listRules,
  type RoutingRule,
} from '@/lib/domain/routing'
import { dryRunReplay, type DryRunResult } from '@/lib/agents/routing/dry-run'
import { invalidateWorkspace } from '@/lib/agents/routing/cache'
import { validateRule } from '@/lib/agents/routing/schema/validate'
import { getActiveWorkspaceId } from '@/app/actions/workspace'

// ----------------------------------------------------------------------------
// W-6 fix: Server-side priority uniqueness pre-check.
// Returns inline error string if collision; null if priority is free.
// ----------------------------------------------------------------------------
async function validateRulePriorityUnique(
  workspaceId: string,
  ruleType: 'lifecycle_classifier' | 'agent_router',
  priority: number,
  excludeRuleId?: string,
): Promise<string | null> {
  const result = await listRules({ workspaceId })
  if (!result.success) return null // listRules failure surfaces elsewhere
  const collision = result.data.find(
    (r) =>
      r.active &&
      r.rule_type === ruleType &&
      r.priority === priority &&
      r.id !== excludeRuleId,
  )
  if (collision) {
    return `Ya existe una regla ${ruleType} con priority ${priority}: '${collision.name}'. Cambia la priority o desactiva la otra regla primero.`
  }
  return null
}

// ----------------------------------------------------------------------------
// createOrUpdateRuleAction
// ----------------------------------------------------------------------------
export async function createOrUpdateRuleAction(
  rule: Partial<RoutingRule>,
): Promise<{ success: true; ruleId: string } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) return { success: false, error: 'No workspace context' }

  // Defense-in-depth: validate again on server (D-12 + Pitfall 5).
  const v = validateRule(rule)
  if (!v.ok) {
    return { success: false, error: `Schema invalido: ${v.errors.join('; ')}` }
  }

  // W-6 fix: priority uniqueness pre-check ANTES del DB upsert.
  if (rule.rule_type && typeof rule.priority === 'number') {
    const collision = await validateRulePriorityUnique(
      workspaceId,
      rule.rule_type,
      rule.priority,
      rule.id, // exclude self when editing
    )
    if (collision) return { success: false, error: collision }
  }

  const result = await upsertRule(
    { workspaceId },
    rule as Parameters<typeof upsertRule>[1],
  )
  if (!result.success) return result

  // Invalidate same-lambda cache so next webhook sees fresh rules immediately.
  // Cross-lambda eventual consistency bounded by 10s TTL + version-column
  // revalidation in cache.ts.
  invalidateWorkspace(workspaceId)

  revalidatePath('/agentes/routing')
  revalidatePath('/agentes/routing/editor')

  return { success: true, ruleId: result.data.id }
}

// ----------------------------------------------------------------------------
// deleteRuleAction (soft delete via UPDATE active=false in domain)
// ----------------------------------------------------------------------------
export async function deleteRuleAction(
  ruleId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) return { success: false, error: 'No workspace context' }

  const result = await deleteRule({ workspaceId }, ruleId)
  if (!result.success) return result

  invalidateWorkspace(workspaceId)
  revalidatePath('/agentes/routing')
  return { success: true }
}

// ----------------------------------------------------------------------------
// simulateAction — dry-run preview (D-10) for "Simular cambio" button
// ----------------------------------------------------------------------------
export async function simulateAction(input: {
  candidateRules: RoutingRule[]
  daysBack: number
}): Promise<DryRunResult> {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) throw new Error('No workspace context')

  return dryRunReplay({
    workspaceId,
    candidateRules: input.candidateRules,
    daysBack: input.daysBack,
  })
}
