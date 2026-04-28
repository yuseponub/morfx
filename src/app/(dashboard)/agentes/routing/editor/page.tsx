// ============================================================================
// Surfaces 2 + 3 + 4 (D-06.2/3/4) — Editor de regla.
// Server component que carga datos iniciales (rule, facts catalog, tags) y
// pasa todo a un client component (editor-client.tsx) que mantiene el form.
//
// Modo:
//   ?id=<uuid>  → editar regla existente
//   ?new=1      → nueva regla
//   sin params  → nueva regla (default)
//
// Regla 3: este archivo solo usa el domain layer (Plan 02).
// ============================================================================

import {
  getRule,
  listFactsCatalog,
  type RoutingRule,
} from '@/lib/domain/routing'
import { listAllTags } from '@/lib/domain/tags'
import { listPipelines } from '@/lib/domain/pipelines'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { RoutingRuleEditorClient } from './_components/editor-client'
// Trigger agentRegistry side-effects so the editor can populate a dropdown
// of valid agent_ids (instead of a free-text input that's typo-prone).
import '@/lib/agents/somnio-recompra'
import '@/lib/agents/somnio-v3'
import '@/lib/agents/somnio'
import '@/lib/agents/godentist'
import '@/lib/agents/somnio-pw-confirmation' // Standalone: somnio-sales-v3-pw-confirmation (D-02)
import { agentRegistry } from '@/lib/agents/registry'

interface EditorPageProps {
  searchParams: Promise<{ id?: string; new?: string }>
}

export default async function RuleEditorPage({ searchParams }: EditorPageProps) {
  const params = await searchParams
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-muted-foreground">No hay workspace seleccionado.</p>
      </div>
    )
  }

  const factsResult = await listFactsCatalog()
  const facts = factsResult.success ? factsResult.data : []

  const tagsResult = await listAllTags({ workspaceId })
  const tags: string[] = (tagsResult.data ?? [])
    .map((t) => t.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)

  let initialRule: RoutingRule | null = null
  if (params.id) {
    const r = await getRule({ workspaceId }, params.id)
    if (r.success) initialRule = r.data
  }

  // Build the list of agents available to route to, sorted alphabetically.
  // The dropdown in editor-client.tsx renders these + a "Bot no responde
  // (human handoff)" entry for null.
  const agents = agentRegistry
    .list()
    .map((a) => ({ id: a.id, name: a.name ?? a.id }))
    .sort((a, b) => a.id.localeCompare(b.id))

  // Pipelines + nested stages for the workspace — populates the dropdowns for
  // facts `activeOrderPipeline` and `activeOrderStageRaw` in ConditionBuilder.
  const pipelinesResult = await listPipelines({ workspaceId, source: 'server-action' })
  const pipelines = (pipelinesResult.success && pipelinesResult.data ? pipelinesResult.data : []).map((p) => ({
    name: p.name,
    stages: p.stages
      .map((s) => s.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0),
  }))

  return (
    <RoutingRuleEditorClient
      initialRule={initialRule}
      facts={facts}
      tags={tags}
      workspaceId={workspaceId}
      agents={agents}
      pipelines={pipelines}
    />
  )
}
