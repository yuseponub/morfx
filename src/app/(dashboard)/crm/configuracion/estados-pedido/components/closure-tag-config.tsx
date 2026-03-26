'use client'

import * as React from 'react'
import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { addClosureTagConfig, removeClosureTagConfig } from '@/app/actions/order-states'
import type { ClosureTagConfig } from '@/app/actions/order-states'
import type { PipelineWithStages } from '@/lib/orders/types'
import type { Tag } from '@/lib/types/database'

interface ClosureTagConfigProps {
  configs: ClosureTagConfig[]
  pipelines: PipelineWithStages[]
  tags: Tag[]
}

export function ClosureTagConfigPanel({ configs, pipelines, tags }: ClosureTagConfigProps) {
  const [selectedPipeline, setSelectedPipeline] = React.useState<string>('')
  const [selectedTag, setSelectedTag] = React.useState<string>('')
  const [isAdding, setIsAdding] = React.useState(false)
  const [removingId, setRemovingId] = React.useState<string | null>(null)

  // Check if the selected combo already exists
  const isDuplicate = selectedPipeline && selectedTag
    ? configs.some(c => c.pipeline_id === selectedPipeline && c.tag_id === selectedTag)
    : false

  const canAdd = selectedPipeline && selectedTag && !isDuplicate && !isAdding

  async function handleAdd() {
    if (!selectedPipeline || !selectedTag) return

    setIsAdding(true)
    try {
      const result = await addClosureTagConfig(selectedPipeline, selectedTag)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Regla de cierre agregada')
        setSelectedPipeline('')
        setSelectedTag('')
      }
    } catch {
      toast.error('Error al agregar la regla')
    } finally {
      setIsAdding(false)
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id)
    try {
      const result = await removeClosureTagConfig(id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Regla eliminada')
      }
    } catch {
      toast.error('Error al eliminar la regla')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Tag de cierre por pipeline</h2>
        <p className="text-sm text-muted-foreground">
          Cuando un pedido en un pipeline tiene un tag especifico, se considera cerrado y no aparece como pedido activo.
        </p>
      </div>

      {/* Existing rules */}
      <div className="space-y-2">
        {configs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No hay reglas de cierre configuradas
          </p>
        ) : (
          configs.map((config) => (
            <div
              key={config.id}
              className="flex items-center justify-between border rounded-md p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{config.pipeline_name}</span>
                <span className="text-muted-foreground">&rarr;</span>
                <Badge
                  variant="outline"
                  style={{
                    borderColor: config.tag_color,
                    color: config.tag_color,
                  }}
                >
                  {config.tag_name}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(config.id)}
                disabled={removingId === config.id}
              >
                <Trash2Icon className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Add new rule */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Pipeline</label>
          <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Tag</label>
          <Select value={selectedTag} onValueChange={setSelectedTag}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar tag" />
            </SelectTrigger>
            <SelectContent>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleAdd}
          disabled={!canAdd}
          size="sm"
        >
          {isAdding ? 'Agregando...' : 'Agregar'}
        </Button>
      </div>

      {isDuplicate && (
        <p className="text-xs text-amber-600">
          Esta combinacion de pipeline y tag ya esta configurada.
        </p>
      )}
    </div>
  )
}
