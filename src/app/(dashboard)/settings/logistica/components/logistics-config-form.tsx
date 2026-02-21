'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Loader2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { updateDispatchConfig } from '@/app/actions/logistics-config'
import type { CarrierConfig } from '@/lib/domain/carrier-configs'
import type { PipelineWithStages } from '@/lib/orders/types'

// ============================================================================
// Types
// ============================================================================

interface LogisticsConfigFormProps {
  config: CarrierConfig | null
  pipelines: PipelineWithStages[]
}

// ============================================================================
// Constants
// ============================================================================

const KNOWN_CARRIERS = [
  { id: 'coordinadora', name: 'Coordinadora', available: true },
  { id: 'interrapidisimo', name: 'Inter Rapidisimo', available: false },
  { id: 'envia', name: 'Envia', available: false },
  { id: 'servientrega', name: 'Servientrega', available: false },
] as const

// ============================================================================
// Component
// ============================================================================

export function LogisticsConfigForm({ config, pipelines }: LogisticsConfigFormProps) {
  const [isPending, startTransition] = useTransition()

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    config?.dispatch_pipeline_id ?? null
  )
  const [selectedStageId, setSelectedStageId] = useState<string | null>(
    config?.dispatch_stage_id ?? null
  )
  const [isEnabled, setIsEnabled] = useState(config?.is_enabled ?? false)

  // Get stages for the selected pipeline
  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId)
  const availableStages = selectedPipeline?.stages ?? []

  const handlePipelineChange = (value: string) => {
    setSelectedPipelineId(value)
    setSelectedStageId(null)
  }

  const handleStageChange = (value: string) => {
    setSelectedStageId(value)
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateDispatchConfig({
        carrier: 'coordinadora',
        dispatchPipelineId: selectedPipelineId,
        dispatchStageId: selectedStageId,
        isEnabled,
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Configuracion de logistica actualizada')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Active Carrier: Coordinadora */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Coordinadora</CardTitle>
                <CardDescription>
                  Robot de despacho automatico al portal de Coordinadora
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="coord-enabled" className="text-sm text-muted-foreground">
                {isEnabled ? 'Activo' : 'Inactivo'}
              </Label>
              <Switch
                id="coord-enabled"
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={`space-y-4 ${!isEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Pipeline Select */}
            <div className="space-y-2">
              <Label>Pipeline de despacho</Label>
              <Select
                value={selectedPipelineId ?? undefined}
                onValueChange={handlePipelineChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar pipeline..." />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map(pipeline => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stage Select */}
            <div className="space-y-2">
              <Label>Etapa que activa el despacho</Label>
              <Select
                value={selectedStageId ?? undefined}
                onValueChange={handleStageChange}
                disabled={!selectedPipelineId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    selectedPipelineId
                      ? 'Seleccionar etapa...'
                      : 'Primero selecciona un pipeline'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableStages.map(stage => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Future Carriers (disabled placeholders) */}
      {KNOWN_CARRIERS.filter(c => !c.available).map(carrier => (
        <Card key={carrier.id} className="opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Truck className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-lg">{carrier.name}</CardTitle>
                </div>
              </div>
              <Badge variant="secondary">Proximamente</Badge>
            </div>
          </CardHeader>
        </Card>
      ))}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
