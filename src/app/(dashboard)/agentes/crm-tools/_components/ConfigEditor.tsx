'use client'

/**
 * ConfigEditor — Client Component for /agentes/crm-tools.
 *
 * Standalone crm-query-tools Wave 4 (Plan 05).
 *
 * Renderiza:
 *   1. Pipeline scope picker (single <select>, "Todas las pipelines" = null) — D-16.
 *   2. Multi-select de stages activos agrupados por pipeline — D-11, D-13.
 *   3. Boton "Guardar" que invoca saveCrmQueryToolsConfigAction via useTransition.
 *
 * Toast feedback con sonner (success/error). E2E selectors (Plan 06) usan
 * aria-label="Pipeline" / "Stages activos" + role="combobox" + texto
 * "Configuracion guardada".
 */

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  saveCrmQueryToolsConfigAction,
  type SaveCrmQueryToolsConfigInput,
} from '../_actions'
import { MultiSelectStages, type StageGroup } from './MultiSelectStages'
import type { CrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'

interface Pipeline {
  id: string
  name: string
  stages: Array<{ id: string; name: string; position: number | null }>
}

interface Props {
  initialConfig: CrmQueryToolsConfig
  pipelines: Pipeline[]
}

export function ConfigEditor({ initialConfig, pipelines }: Props) {
  const [pipelineId, setPipelineId] = useState<string | null>(initialConfig.pipelineId)
  const [activeStageIds, setActiveStageIds] = useState<string[]>(initialConfig.activeStageIds)
  const [isPending, startTransition] = useTransition()

  const groups: StageGroup[] = useMemo(() => {
    return pipelines.map((p) => ({
      label: p.name,
      options: p.stages
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((s) => ({ value: s.id, label: s.name })),
    }))
  }, [pipelines])

  const onSave = () => {
    startTransition(async () => {
      const input: SaveCrmQueryToolsConfigInput = { pipelineId, activeStageIds }
      const result = await saveCrmQueryToolsConfigAction(input)
      if (result.success) {
        toast.success('Configuracion guardada')
      } else {
        toast.error(`Error al guardar: ${result.error}`)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <section className="rounded-lg border p-4">
        <h2 className="text-lg font-semibold mb-1">Pipeline scope</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Restringe getActiveOrderByPhone a un pipeline. Vacio = busca en todas las pipelines.
        </p>
        <select
          aria-label="Pipeline"
          role="combobox"
          className="w-full rounded-md border px-3 py-2 bg-background text-sm"
          value={pipelineId ?? ''}
          onChange={(e) => setPipelineId(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">Todas las pipelines</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-lg font-semibold mb-1">Stages activos</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Stages que cuentan como pedido activo. Vacio = config_not_set (los agentes lo detectan).
        </p>
        <MultiSelectStages
          value={activeStageIds}
          onChange={setActiveStageIds}
          groups={groups}
          placeholder="Selecciona stages..."
        />
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={isPending}>
          {isPending ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
