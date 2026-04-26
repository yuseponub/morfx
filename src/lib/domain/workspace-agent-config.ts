// ============================================================================
// Domain Layer — Workspace Agent Config (read-only extension)
// Phase: agent-lifecycle-router (standalone) — Plan 02 Task 3 (B-1 fix).
//
// SOLO expone reads necesarios por el router engine. Los writes a
// workspace_agent_config los gestiona src/lib/agents/production/agent-config.ts
// (modulo existente preservado — Regla 6: no tocar agente productivo).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Returns workspace_agent_config.recompra_enabled. Default `true` if no config
 * row exists (matches the legacy fallback in webhook-processor.ts:172 —
 * `recompraEnabled = config?.recompra_enabled ?? true`).
 *
 * Used by:
 *   - Plan 03 facts.ts → `recompraEnabled` fact resolver
 *   - Plan 07 legacy parity rule (priority 900) for Somnio rollout
 *
 * NOT for writes — see `src/lib/agents/production/agent-config.ts` for the
 * full config CRUD (Regla 6: that path remains the source of truth for the
 * production agent until lifecycle_routing_enabled flips ON per-workspace).
 */
export async function getWorkspaceRecompraEnabled(workspaceId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('workspace_agent_config')
    .select('recompra_enabled')
    .eq('workspace_id', workspaceId)
    .single()
  if (error || !data) return true // legacy default — preserve current behavior
  return Boolean((data as { recompra_enabled: boolean | null }).recompra_enabled)
}
