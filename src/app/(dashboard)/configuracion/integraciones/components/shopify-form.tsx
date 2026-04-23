'use client'

// ============================================================================
// Phase 11: Shopify Configuration Form
// Form for configuring Shopify integration with test connection
// ============================================================================

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import {
  testConnection,
  saveShopifyIntegration,
  toggleShopifyIntegration,
  deleteShopifyIntegration,
} from '@/app/actions/shopify'
import { updateShopifyAutoSync } from '@/app/actions/integrations'
import type { ShopifyIntegration, IntegrationFormData } from '@/lib/shopify/types'
import type { Pipeline, PipelineStage } from '@/lib/orders/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, Plug, Trash2, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface ShopifyFormProps {
  integration: ShopifyIntegration | null
  pipelines: Array<Pipeline & { stages: PipelineStage[] }>
  v2?: boolean
}

export function ShopifyForm({ integration, pipelines, v2: v2Prop }: ShopifyFormProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; shopName?: string; error?: string } | null>(null)
  const [showSecrets, setShowSecrets] = useState(false)
  const [selectedPipelineId, setSelectedPipelineId] = useState(
    integration?.config.default_pipeline_id || pipelines[0]?.id || ''
  )
  const [autoSyncOrders, setAutoSyncOrders] = useState(
    (integration?.config as unknown as Record<string, unknown> | undefined)?.auto_sync_orders !== false
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<IntegrationFormData>({
    defaultValues: {
      name: integration?.name || '',
      shop_domain: integration?.config.shop_domain || '',
      access_token: integration?.config.access_token || '',
      api_secret: integration?.config.api_secret || '',
      default_pipeline_id: integration?.config.default_pipeline_id || pipelines[0]?.id || '',
      default_stage_id: integration?.config.default_stage_id || pipelines[0]?.stages[0]?.id || '',
      enable_fuzzy_matching: integration?.config.enable_fuzzy_matching ?? true,
      product_matching: integration?.config.product_matching || 'sku',
    },
  })

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId)
  const stages = selectedPipeline?.stages || []

  // Handle pipeline change
  const handlePipelineChange = (pipelineId: string) => {
    setSelectedPipelineId(pipelineId)
    setValue('default_pipeline_id', pipelineId)
    // Reset stage to first stage of new pipeline
    const newPipeline = pipelines.find(p => p.id === pipelineId)
    if (newPipeline?.stages[0]) {
      setValue('default_stage_id', newPipeline.stages[0].id)
    }
  }

  // Test connection
  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)

    const formData = watch()
    const result = await testConnection(formData)

    setTestResult(result)
    setIsTesting(false)

    if (result.success) {
      toast.success(`Conexion exitosa con ${result.shopName}`)
    } else {
      toast.error(result.error || 'Error de conexion')
    }
  }

  // Save integration
  const onSubmit = (data: IntegrationFormData) => {
    startTransition(async () => {
      const result = await saveShopifyIntegration(data)

      if (result.success) {
        toast.success(integration ? 'Integracion actualizada' : 'Integracion creada')
        router.refresh()
      } else {
        toast.error(result.error || 'Error al guardar')
      }
    })
  }

  // Toggle active status
  const handleToggleActive = () => {
    if (!integration) return

    startTransition(async () => {
      const result = await toggleShopifyIntegration(!integration.is_active)

      if (result.success) {
        toast.success(integration.is_active ? 'Integracion desactivada' : 'Integracion activada')
        router.refresh()
      } else {
        toast.error(result.error || 'Error al actualizar')
      }
    })
  }

  // Delete integration
  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteShopifyIntegration()

      if (result.success) {
        toast.success('Integracion eliminada')
        router.refresh()
      } else {
        toast.error(result.error || 'Error al eliminar')
      }
    })
  }

  // Toggle auto-sync orders
  const handleAutoSyncToggle = (checked: boolean) => {
    setAutoSyncOrders(checked)
    startTransition(async () => {
      const result = await updateShopifyAutoSync(checked)
      if (result.success) {
        toast.success(checked ? 'Auto-sync activado' : 'Auto-sync desactivado')
      } else {
        setAutoSyncOrders(!checked) // Revert on error
        toast.error(result.error || 'Error al actualizar')
      }
    })
  }

  // Editorial token classes (applied only when v2)
  const inputV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
    : ''
  const labelV2 = v2 ? 'text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]' : ''
  const hintV2 = v2 ? 'text-[11px] text-[var(--ink-3)]' : 'text-xs text-muted-foreground'
  const errorV2 = v2 ? 'text-[12px] text-[oklch(0.45_0.14_28)]' : 'text-sm text-destructive'
  const sectionHeadingV2 = v2 ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--rubric-2)] m-0' : 'text-sm font-medium'
  const switchV2 = v2
    ? 'data-[state=checked]:bg-[oklch(0.58_0.14_150)] data-[state=unchecked]:bg-[var(--paper-3)] data-[state=unchecked]:border data-[state=unchecked]:border-[var(--border)]'
    : ''
  const selectTriggerV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] text-[13px] text-[var(--ink-1)] rounded-[var(--radius-3)] focus:border-[var(--ink-1)] focus:ring-0 focus:shadow-[0_0_0_3px_var(--paper-3)]'
    : ''
  const selectContentV2 = v2 ? 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]' : ''
  const selectItemV2 = v2 ? 'text-[13px] text-[var(--ink-1)] focus:bg-[var(--paper-2)]' : ''
  const btnGhostV2 = v2 ? 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]' : ''
  const btnSecondaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold shadow-none hover:bg-[var(--paper-2)]'
    : ''
  const btnPrimaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)] text-[13px] font-semibold'
    : ''
  const btnDangerV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !border !border-[oklch(0.75_0.10_28)] !bg-[var(--paper-0)] !text-[oklch(0.38_0.14_28)] !shadow-[0_1px_0_oklch(0.75_0.10_28)] hover:!bg-[oklch(0.98_0.02_28)] text-[13px] font-semibold'
    : ''
  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const v2FontMono = v2 ? { fontFamily: 'var(--font-mono)' } : undefined

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Status Badge */}
      {integration && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {v2 ? (
              <span className={cn('mx-tag', integration.is_active ? 'mx-tag--verdigris' : 'mx-tag--ink')}>
                {integration.is_active ? 'Activa' : 'Inactiva'}
              </span>
            ) : (
              <Badge variant={integration.is_active ? 'default' : 'secondary'}>
                {integration.is_active ? 'Activa' : 'Inactiva'}
              </Badge>
            )}
            {integration.config.shop_domain && (
              <span className={cn('text-sm text-muted-foreground', v2 && '!text-[12px] !text-[var(--ink-3)]')} style={v2FontMono}>
                {integration.config.shop_domain}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={integration.is_active}
              onCheckedChange={handleToggleActive}
              disabled={isPending}
              className={switchV2}
            />
          </div>
        </div>
      )}

      {/* Integration Name Section */}
      <div className="space-y-4">
        <h3 className={sectionHeadingV2} style={v2FontSans}>Identificacion</h3>

        <div className="space-y-2">
          <Label htmlFor="name" className={labelV2} style={v2FontSans}>Nombre de la integracion</Label>
          <Input
            id="name"
            placeholder="Mi Tienda Shopify"
            className={inputV2}
            style={v2FontSans}
            {...register('name', { required: 'Requerido' })}
          />
          {errors.name && (
            <p className={errorV2} style={v2FontSans}>{errors.name.message}</p>
          )}
          <p className={hintV2} style={v2FontSans}>
            Un nombre para identificar esta integracion en el sistema
          </p>
        </div>
      </div>

      {/* Credentials Section */}
      <div className="space-y-4">
        <h3 className={sectionHeadingV2} style={v2FontSans}>Credenciales</h3>

        <div className="space-y-2">
          <Label htmlFor="shop_domain" className={labelV2} style={v2FontSans}>Dominio de la tienda</Label>
          <Input
            id="shop_domain"
            placeholder="mitienda.myshopify.com"
            className={inputV2}
            style={v2FontSans}
            {...register('shop_domain', { required: 'Requerido' })}
          />
          {errors.shop_domain && (
            <p className={errorV2} style={v2FontSans}>{errors.shop_domain.message}</p>
          )}
          <p className={hintV2} style={v2FontSans}>
            Solo el subdominio de Shopify (ej: mitienda.myshopify.com)
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="access_token" className={labelV2} style={v2FontSans}>Access Token</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets(!showSecrets)}
              className={btnGhostV2}
            >
              {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <Input
            id="access_token"
            type={showSecrets ? 'text' : 'password'}
            placeholder="shpat_xxxxx"
            className={inputV2}
            style={v2FontMono}
            {...register('access_token', { required: 'Requerido' })}
          />
          {errors.access_token && (
            <p className={errorV2} style={v2FontSans}>{errors.access_token.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="api_secret" className={labelV2} style={v2FontSans}>API Secret Key</Label>
          <Input
            id="api_secret"
            type={showSecrets ? 'text' : 'password'}
            placeholder="shpss_xxxxx"
            className={inputV2}
            style={v2FontMono}
            {...register('api_secret', { required: 'Requerido' })}
          />
          {errors.api_secret && (
            <p className={errorV2} style={v2FontSans}>{errors.api_secret.message}</p>
          )}
        </div>

        {/* Test Connection */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting}
            className={btnSecondaryV2}
            style={v2FontSans}
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plug className="h-4 w-4 mr-2" />
            )}
            Probar conexion
          </Button>
          {testResult && (
            <div className="flex items-center gap-1">
              {testResult.success ? (
                <>
                  <CheckCircle2 className={cn('h-4 w-4', v2 ? 'text-[oklch(0.55_0.14_150)]' : 'text-green-500')} />
                  <span className={cn('text-sm', v2 ? 'text-[13px] text-[oklch(0.35_0.10_150)]' : 'text-green-600')} style={v2FontSans}>{testResult.shopName}</span>
                </>
              ) : (
                <>
                  <XCircle className={cn('h-4 w-4', v2 ? 'text-[oklch(0.55_0.18_28)]' : 'text-red-500')} />
                  <span className={cn('text-sm', v2 ? 'text-[13px] text-[oklch(0.45_0.14_28)]' : 'text-red-600')} style={v2FontSans}>{testResult.error}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Configuration Section */}
      <div className="space-y-4">
        <h3 className={sectionHeadingV2} style={v2FontSans}>Configuracion de pedidos</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className={labelV2} style={v2FontSans}>Pipeline destino</Label>
            <Select
              value={selectedPipelineId}
              onValueChange={handlePipelineChange}
            >
              <SelectTrigger className={selectTriggerV2} style={v2FontSans}>
                <SelectValue placeholder="Seleccionar pipeline" />
              </SelectTrigger>
              <SelectContent className={selectContentV2}>
                {pipelines.map(pipeline => (
                  <SelectItem key={pipeline.id} value={pipeline.id} className={selectItemV2} style={v2FontSans}>
                    {pipeline.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className={labelV2} style={v2FontSans}>Etapa inicial</Label>
            <Select
              value={watch('default_stage_id')}
              onValueChange={(value) => setValue('default_stage_id', value)}
            >
              <SelectTrigger className={selectTriggerV2} style={v2FontSans}>
                <SelectValue placeholder="Seleccionar etapa" />
              </SelectTrigger>
              <SelectContent className={selectContentV2}>
                {stages.map(stage => (
                  <SelectItem key={stage.id} value={stage.id} className={selectItemV2} style={v2FontSans}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
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

        <div className="space-y-2">
          <Label className={labelV2} style={v2FontSans}>Matching de productos</Label>
          <Select
            value={watch('product_matching')}
            onValueChange={(value: 'sku' | 'name' | 'value') => setValue('product_matching', value)}
          >
            <SelectTrigger className={selectTriggerV2} style={v2FontSans}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentV2}>
              <SelectItem value="sku" className={selectItemV2} style={v2FontSans}>Por SKU (exacto)</SelectItem>
              <SelectItem value="name" className={selectItemV2} style={v2FontSans}>Por nombre (aproximado)</SelectItem>
              <SelectItem value="value" className={selectItemV2} style={v2FontSans}>Por precio (exacto)</SelectItem>
            </SelectContent>
          </Select>
          <p className={hintV2} style={v2FontSans}>
            Como se vinculan los productos de Shopify con tu catalogo
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className={labelV2} style={v2FontSans}>Matching inteligente de contactos</Label>
            <p className={hintV2} style={v2FontSans}>
              Busca contactos similares por nombre y ciudad si no hay coincidencia por telefono
            </p>
          </div>
          <Switch
            checked={watch('enable_fuzzy_matching')}
            onCheckedChange={(checked) => setValue('enable_fuzzy_matching', checked)}
            className={switchV2}
          />
        </div>

        {/* Auto-sync toggle - only shown when integration is configured and active */}
        {integration && integration.is_active && (
          <div className={cn('flex items-center justify-between pt-2 border-t', v2 && 'border-[var(--border)]')}>
            <div className="space-y-0.5">
              <Label className={labelV2} style={v2FontSans}>Crear ordenes automaticamente</Label>
              <p className={cn(hintV2, 'max-w-md')} style={v2FontSans}>
                Cuando esta activado, las ordenes de Shopify crean automaticamente contactos y
                pedidos en MorfX. Cuando esta desactivado, solo se disparan automatizaciones.
              </p>
            </div>
            <Switch
              checked={autoSyncOrders}
              onCheckedChange={handleAutoSyncToggle}
              disabled={isPending}
              className={switchV2}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={cn('flex items-center justify-between pt-4 border-t', v2 && 'border-[var(--border)]')}>
        <div>
          {integration && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm" className={btnDangerV2} style={v2FontSans}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className={cn(v2 && 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]')}>
                <AlertDialogHeader>
                  <AlertDialogTitle className={cn(v2 && 'text-[20px] font-bold tracking-[-0.01em]')} style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}>Eliminar integracion</AlertDialogTitle>
                  <AlertDialogDescription className={cn(v2 && 'text-[13px] text-[var(--ink-2)]')} style={v2FontSans}>
                    Se desconectara la tienda Shopify. Los pedidos ya importados no se eliminaran.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className={btnSecondaryV2} style={v2FontSans}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className={btnDangerV2} style={v2FontSans}>
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Button type="submit" disabled={isPending} className={btnPrimaryV2} style={v2FontSans}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {integration ? 'Guardar cambios' : 'Conectar tienda'}
        </Button>
      </div>
    </form>
  )
}
