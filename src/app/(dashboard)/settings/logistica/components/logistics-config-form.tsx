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
import { Label } from '@/components/ui/label'
import { Loader2, Truck, Search, ScanLine, FileText, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { updateDispatchConfig, updateGuideLookupConfig, updateOcrConfig, updateGuideGenConfig } from '@/app/actions/logistics-config'
import type { CarrierConfig } from '@/lib/domain/carrier-configs'
import type { PipelineWithStages } from '@/lib/orders/types'
import type { LucideIcon } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface LogisticsConfigFormProps {
  config: CarrierConfig | null
  pipelines: PipelineWithStages[]
}

interface GuideGenCardProps {
  icon: LucideIcon
  title: string
  description: string
  carrierType: 'inter' | 'bogota' | 'envia'
  pipelineId: string | null
  stageId: string | null
  onPipelineChange: (value: string) => void
  onStageChange: (value: string) => void
  pipelines: PipelineWithStages[]
  isPending: boolean
  onSave: () => void
}

// ============================================================================
// Sub-component: GuideGenCard
// ============================================================================

function GuideGenCard({
  icon: Icon,
  title,
  description,
  pipelineId,
  stageId,
  onPipelineChange,
  onStageChange,
  pipelines,
  isPending,
  onSave,
}: GuideGenCardProps) {
  const selectedPipeline = pipelines.find(p => p.id === pipelineId)
  const availableStages = selectedPipeline?.stages ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Pipeline Select */}
          <div className="space-y-2">
            <Label>Pipeline</Label>
            <Select
              value={pipelineId ?? undefined}
              onValueChange={onPipelineChange}
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

          {/* Source Stage Select */}
          <div className="space-y-2">
            <Label>Etapa origen (activa la generacion)</Label>
            <Select
              value={stageId ?? undefined}
              onValueChange={onStageChange}
              disabled={!pipelineId}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  pipelineId
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

        <div className="flex justify-end mt-4">
          <Button onClick={onSave} disabled={isPending} size="sm">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function LogisticsConfigForm({ config, pipelines }: LogisticsConfigFormProps) {
  const [isPending, startTransition] = useTransition()

  // Coordinadora dispatch config
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    config?.dispatch_pipeline_id ?? null
  )
  const [selectedStageId, setSelectedStageId] = useState<string | null>(
    config?.dispatch_stage_id ?? null
  )
  const [isEnabled, setIsEnabled] = useState(config?.is_enabled ?? false)

  // Guide lookup config (buscar guias coord)
  const [guideLookupPipelineId, setGuideLookupPipelineId] = useState<string | null>(
    config?.guide_lookup_pipeline_id ?? null
  )
  const [guideLookupStageId, setGuideLookupStageId] = useState<string | null>(
    config?.guide_lookup_stage_id ?? null
  )

  // OCR config
  const [ocrPipelineId, setOcrPipelineId] = useState<string | null>(
    config?.ocr_pipeline_id ?? null
  )
  const [ocrStageId, setOcrStageId] = useState<string | null>(
    config?.ocr_stage_id ?? null
  )

  // Inter Rapidisimo config
  const [interPipelineId, setInterPipelineId] = useState<string | null>(
    config?.pdf_inter_pipeline_id ?? null
  )
  const [interStageId, setInterStageId] = useState<string | null>(
    config?.pdf_inter_stage_id ?? null
  )

  // Bogota config
  const [bogotaPipelineId, setBogotaPipelineId] = useState<string | null>(
    config?.pdf_bogota_pipeline_id ?? null
  )
  const [bogotaStageId, setBogotaStageId] = useState<string | null>(
    config?.pdf_bogota_stage_id ?? null
  )

  // Envia config
  const [enviaPipelineId, setEnviaPipelineId] = useState<string | null>(
    config?.pdf_envia_pipeline_id ?? null
  )
  const [enviaStageId, setEnviaStageId] = useState<string | null>(
    config?.pdf_envia_stage_id ?? null
  )

  // Get stages for the selected pipelines (Coordinadora + OCR)
  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId)
  const availableStages = selectedPipeline?.stages ?? []

  const guideLookupPipeline = pipelines.find(p => p.id === guideLookupPipelineId)
  const guideLookupAvailableStages = guideLookupPipeline?.stages ?? []

  const ocrPipeline = pipelines.find(p => p.id === ocrPipelineId)
  const ocrAvailableStages = ocrPipeline?.stages ?? []

  const handlePipelineChange = (value: string) => {
    setSelectedPipelineId(value)
    setSelectedStageId(null)
  }

  const handleStageChange = (value: string) => {
    setSelectedStageId(value)
  }

  const handleGuideLookupPipelineChange = (value: string) => {
    setGuideLookupPipelineId(value)
    setGuideLookupStageId(null)
  }

  const handleGuideLookupStageChange = (value: string) => {
    setGuideLookupStageId(value)
  }

  const handleSaveGuideLookup = () => {
    startTransition(async () => {
      const result = await updateGuideLookupConfig({
        guideLookupPipelineId,
        guideLookupStageId,
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Configuracion de busqueda de guias actualizada')
      }
    })
  }

  const handleOcrPipelineChange = (value: string) => {
    setOcrPipelineId(value)
    setOcrStageId(null)
  }

  const handleOcrStageChange = (value: string) => {
    setOcrStageId(value)
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

  const handleSaveOcr = () => {
    startTransition(async () => {
      const result = await updateOcrConfig({
        ocrPipelineId,
        ocrStageId,
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Configuracion OCR actualizada')
      }
    })
  }

  // Guide generation save handlers
  const handleSaveGuideGen = (carrierType: 'inter' | 'bogota' | 'envia', label: string) => {
    return () => {
      startTransition(async () => {
        const pipelineMap = { inter: interPipelineId, bogota: bogotaPipelineId, envia: enviaPipelineId }
        const stageMap = { inter: interStageId, bogota: bogotaStageId, envia: enviaStageId }

        const result = await updateGuideGenConfig({
          carrierType,
          pipelineId: pipelineMap[carrierType],
          stageId: stageMap[carrierType],
        })

        if ('error' in result) {
          toast.error(result.error)
        } else {
          toast.success(`Configuracion ${label} actualizada`)
        }
      })
    }
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

          <div className="flex justify-end mt-4">
            <Button onClick={handleSave} disabled={isPending} size="sm">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Guide Lookup (buscar guias coord) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Search className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Busqueda de Guias</CardTitle>
              <CardDescription>
                Etapa donde buscar ordenes pendientes de guia (buscar guias coord)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pipeline</Label>
              <Select
                value={guideLookupPipelineId ?? undefined}
                onValueChange={handleGuideLookupPipelineChange}
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

            <div className="space-y-2">
              <Label>Etapa de ordenes pendientes de guia</Label>
              <Select
                value={guideLookupStageId ?? undefined}
                onValueChange={handleGuideLookupStageChange}
                disabled={!guideLookupPipelineId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    guideLookupPipelineId
                      ? 'Seleccionar etapa...'
                      : 'Primero selecciona un pipeline'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {guideLookupAvailableStages.map(stage => (
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

          <div className="flex justify-end mt-4">
            <Button onClick={handleSaveGuideLookup} disabled={isPending} size="sm">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* OCR Guide Reading */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ScanLine className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Lectura OCR de Guias</CardTitle>
              <CardDescription>
                Lee guias fisicas o PDF y las asigna a pedidos en la etapa seleccionada
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* OCR Pipeline Select */}
            <div className="space-y-2">
              <Label>Pipeline</Label>
              <Select
                value={ocrPipelineId ?? undefined}
                onValueChange={handleOcrPipelineChange}
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

            {/* OCR Stage Select */}
            <div className="space-y-2">
              <Label>Etapa de ordenes esperando guia</Label>
              <Select
                value={ocrStageId ?? undefined}
                onValueChange={handleOcrStageChange}
                disabled={!ocrPipelineId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    ocrPipelineId
                      ? 'Seleccionar etapa...'
                      : 'Primero selecciona un pipeline'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {ocrAvailableStages.map(stage => (
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

          <div className="flex justify-end mt-4">
            <Button onClick={handleSaveOcr} disabled={isPending} size="sm">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inter Rapidisimo - PDF Guide Generation */}
      <GuideGenCard
        icon={FileText}
        title="Inter Rapidisimo"
        description="Generar guias PDF 4x6 para Interrapidisimo"
        carrierType="inter"
        pipelineId={interPipelineId}
        stageId={interStageId}
        onPipelineChange={(value) => { setInterPipelineId(value); setInterStageId(null) }}
        onStageChange={setInterStageId}
        pipelines={pipelines}
        isPending={isPending}
        onSave={handleSaveGuideGen('inter', 'Inter Rapidisimo')}
      />

      {/* Bogota - PDF Guide Generation */}
      <GuideGenCard
        icon={FileText}
        title="Bogota"
        description="Generar guias PDF 4x6 para envios Bogota"
        carrierType="bogota"
        pipelineId={bogotaPipelineId}
        stageId={bogotaStageId}
        onPipelineChange={(value) => { setBogotaPipelineId(value); setBogotaStageId(null) }}
        onStageChange={setBogotaStageId}
        pipelines={pipelines}
        isPending={isPending}
        onSave={handleSaveGuideGen('bogota', 'Bogota')}
      />

      {/* Envia - Excel Guide Generation */}
      <GuideGenCard
        icon={FileSpreadsheet}
        title="Envia"
        description="Generar archivo Excel para carga masiva Envia"
        carrierType="envia"
        pipelineId={enviaPipelineId}
        stageId={enviaStageId}
        onPipelineChange={(value) => { setEnviaPipelineId(value); setEnviaStageId(null) }}
        onStageChange={setEnviaStageId}
        pipelines={pipelines}
        isPending={isPending}
        onSave={handleSaveGuideGen('envia', 'Envia')}
      />
    </div>
  )
}
