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
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { RoutingRuleEditorClient } from './_components/editor-client'

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

  return (
    <RoutingRuleEditorClient
      initialRule={initialRule}
      facts={facts}
      tags={tags}
      workspaceId={workspaceId}
    />
  )
}
