'use client'

import { useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateClientActivation } from '@/app/actions/client-activation'
import type { ClientActivationConfig } from '@/lib/domain/client-activation'
import type { PipelineWithStages } from '@/lib/orders/types'

interface ActivationConfigFormProps {
  config: ClientActivationConfig | null
  pipelines: PipelineWithStages[]
}

export function ActivationConfigForm({ config, pipelines }: ActivationConfigFormProps) {
  const [isPending, startTransition] = useTransition()

  const [enabled, setEnabled] = useState(config?.enabled ?? false)
  const [allAreClients, setAllAreClients] = useState(config?.all_are_clients ?? false)
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>(
    config?.activation_stage_ids ?? []
  )

  const toggleStage = (stageId: string) => {
    setSelectedStageIds(prev =>
      prev.includes(stageId)
        ? prev.filter(id => id !== stageId)
        : [...prev, stageId]
    )
  }

  const hasStages = pipelines.some(p => p.stages.length > 0)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateClientActivation({
        enabled,
        all_are_clients: allAreClients,
        activation_stage_ids: selectedStageIds,
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Configuracion actualizada correctamente')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Main toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activar badge de cliente</CardTitle>
          <CardDescription>
            Muestra un badge dorado en el avatar de contactos marcados como cliente en el inbox
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              id="enabled"
            />
            <Label htmlFor="enabled">
              {enabled ? 'Activado' : 'Desactivado'}
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* All are clients toggle */}
      {enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Todos son clientes</CardTitle>
            <CardDescription>
              Muestra el badge para todos los contactos sin necesidad de que tengan ordenes en etapas especificas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Switch
                checked={allAreClients}
                onCheckedChange={setAllAreClients}
                id="all-are-clients"
              />
              <Label htmlFor="all-are-clients">
                {allAreClients ? 'Todos son clientes' : 'Solo contactos con ordenes en etapas seleccionadas'}
              </Label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stage selector */}
      {enabled && !allAreClients && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Etapas de activacion</CardTitle>
            <CardDescription>
              Un contacto se marca como cliente cuando una de sus ordenes llega a alguna de estas etapas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasStages ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No hay etapas configuradas en los pipelines
              </p>
            ) : (
              <div className="space-y-4 max-h-[300px] overflow-y-auto border rounded-md p-3">
                {pipelines.map(pipeline => {
                  if (pipeline.stages.length === 0) return null
                  return (
                    <div key={pipeline.id}>
                      <h4 className="text-sm font-medium mb-2">{pipeline.name}</h4>
                      <div className="space-y-1 ml-2">
                        {pipeline.stages.map(stage => {
                          const isChecked = selectedStageIds.includes(stage.id)
                          return (
                            <label
                              key={stage.id}
                              className="flex items-center gap-2 py-1 cursor-pointer"
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => toggleStage(stage.id)}
                              />
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: stage.color }}
                              />
                              <span>{stage.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
