/**
 * /agentes/crm-tools — Workspace config for crm-query-tools shared module.
 *
 * Standalone crm-query-tools Wave 4 (Plan 05).
 *
 * Operator chooses:
 *   1. Pipeline scope (single pipeline or "all pipelines" = null) — D-16.
 *   2. Stages activos (multi-select grouped by pipeline) — D-11, D-13.
 *
 * Reads via Plan 02's domain `getCrmQueryToolsConfig` + `listPipelines`.
 * Writes via the server action in `_actions.ts` → `updateCrmQueryToolsConfig`.
 */

import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { getCrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'
import { listPipelines } from '@/lib/domain/pipelines'
import { ConfigEditor } from './_components/ConfigEditor'

export default async function CrmToolsConfigPage() {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-muted-foreground">No hay workspace seleccionado.</p>
      </div>
    )
  }

  const ctx = { workspaceId, source: 'server-action' as const }
  const [config, pipelinesResult] = await Promise.all([
    getCrmQueryToolsConfig(ctx),
    listPipelines(ctx),
  ])

  const pipelines = pipelinesResult.success ? pipelinesResult.data : []
  const errorMessage: string | null = pipelinesResult.success ? null : (pipelinesResult.error ?? 'Unknown error')

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Herramientas CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configura que stages cuentan como pedidos activos y el pipeline scope para las tools de consulta CRM.
          Los agentes leen esta config en cada llamada (sin cache).
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          No se pudieron cargar los pipelines: {errorMessage}
        </div>
      )}

      <ConfigEditor initialConfig={config} pipelines={pipelines ?? []} />
    </div>
  )
}
