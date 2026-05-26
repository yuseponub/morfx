/**
 * Shared helpers around the agent registry.
 *
 * Standalone: debounce-interruption-system-v2 / Plan 03 / REVISION B4.
 *
 * Extracted from src/inngest/functions/agent-production.ts so webhook
 * handlers (whatsapp + manychat) can STATIC-import without pulling in
 * the entire Inngest functions tree (circular-import risk).
 *
 * Behavior is byte-identical to the original local function in
 * agent-production.ts:39, with ONE additive change: 'somnio-sales-v4'
 * is now recognized as its own bucket so the webhook layer can gate
 * the new lock-based interruption system on the v4 path only (Regla 6 —
 * v3/godentist/recompra/pw-confirmation paths remain unchanged).
 *
 * The internal `await import('@/lib/agents/production/agent-config')`
 * is intentional: it isolates the production agent-config tree from
 * webhook startup cost. REVISION B4 only forbids dynamic imports FROM
 * webhook handlers (callers); this helper's own internal lazy import
 * is allowed.
 */

import type { AgentId } from '@/lib/observability'

/**
 * Resolve the canonical observability AgentId for a workspace.
 *
 * Reads `workspace_agent_config.conversational_agent_id` and maps the
 * string id ('somnio-sales-v3', 'godentist', 'somnio-sales-v1',
 * 'somnio-sales-v4', etc.) to the narrow AgentId union used by
 * ObservabilityCollector + the new interruption-system-v2 webhook gate.
 *
 * Fallbacks defensively to 'somnio-v2' so the wrapper never throws
 * (Regla 6 — protect the production agent path).
 */
export async function resolveAgentIdForWorkspace(workspaceId: string): Promise<AgentId> {
  try {
    const { getWorkspaceAgentConfig } = await import('@/lib/agents/production/agent-config')
    const config = await getWorkspaceAgentConfig(workspaceId)
    const id = config?.conversational_agent_id ?? 'somnio-sales-v1'
    if (id === 'somnio-sales-v3') return 'somnio-v3'
    if (id === 'godentist') return 'godentist'
    if (id === 'somnio-recompra' || id === 'somnio-recompra-v1') return 'somnio-recompra'
    // Standalone: debounce-interruption-system-v2 (Plan 03, REVISION B4) —
    // recognize v4 as its own bucket so the webhook layer can gate the
    // new lock-based interruption system on the v4 path only.
    if (id === 'somnio-sales-v4') return 'somnio-sales-v4'
    // 'somnio-sales-v1', 'somnio-sales-v2', or anything else -> v2 bucket
    return 'somnio-v2'
  } catch {
    return 'somnio-v2'
  }
}
