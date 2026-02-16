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

interface ShopifyFormProps {
  integration: ShopifyIntegration | null
  pipelines: Array<Pipeline & { stages: PipelineStage[] }>
}

export function ShopifyForm({ integration, pipelines }: ShopifyFormProps) {
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Status Badge */}
      {integration && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={integration.is_active ? 'default' : 'secondary'}>
              {integration.is_active ? 'Activa' : 'Inactiva'}
            </Badge>
            {integration.config.shop_domain && (
              <span className="text-sm text-muted-foreground">
                {integration.config.shop_domain}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={integration.is_active}
              onCheckedChange={handleToggleActive}
              disabled={isPending}
            />
          </div>
        </div>
      )}

      {/* Integration Name Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Identificacion</h3>

        <div className="space-y-2">
          <Label htmlFor="name">Nombre de la integracion</Label>
          <Input
            id="name"
            placeholder="Mi Tienda Shopify"
            {...register('name', { required: 'Requerido' })}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Un nombre para identificar esta integracion en el sistema
          </p>
        </div>
      </div>

      {/* Credentials Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Credenciales</h3>

        <div className="space-y-2">
          <Label htmlFor="shop_domain">Dominio de la tienda</Label>
          <Input
            id="shop_domain"
            placeholder="mitienda.myshopify.com"
            {...register('shop_domain', { required: 'Requerido' })}
          />
          {errors.shop_domain && (
            <p className="text-sm text-destructive">{errors.shop_domain.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Solo el subdominio de Shopify (ej: mitienda.myshopify.com)
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="access_token">Access Token</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets(!showSecrets)}
            >
              {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <Input
            id="access_token"
            type={showSecrets ? 'text' : 'password'}
            placeholder="shpat_xxxxx"
            {...register('access_token', { required: 'Requerido' })}
          />
          {errors.access_token && (
            <p className="text-sm text-destructive">{errors.access_token.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="api_secret">API Secret Key</Label>
          <Input
            id="api_secret"
            type={showSecrets ? 'text' : 'password'}
            placeholder="shpss_xxxxx"
            {...register('api_secret', { required: 'Requerido' })}
          />
          {errors.api_secret && (
            <p className="text-sm text-destructive">{errors.api_secret.message}</p>
          )}
        </div>

        {/* Test Connection */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting}
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
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600">{testResult.shopName}</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600">{testResult.error}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Configuration Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Configuracion de pedidos</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Pipeline destino</Label>
            <Select
              value={selectedPipelineId}
              onValueChange={handlePipelineChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar pipeline" />
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
            <Label>Etapa inicial</Label>
            <Select
              value={watch('default_stage_id')}
              onValueChange={(value) => setValue('default_stage_id', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages.map(stage => (
                  <SelectItem key={stage.id} value={stage.id}>
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
          <Label>Matching de productos</Label>
          <Select
            value={watch('product_matching')}
            onValueChange={(value: 'sku' | 'name' | 'value') => setValue('product_matching', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sku">Por SKU (exacto)</SelectItem>
              <SelectItem value="name">Por nombre (aproximado)</SelectItem>
              <SelectItem value="value">Por precio (exacto)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Como se vinculan los productos de Shopify con tu catalogo
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Matching inteligente de contactos</Label>
            <p className="text-xs text-muted-foreground">
              Busca contactos similares por nombre y ciudad si no hay coincidencia por telefono
            </p>
          </div>
          <Switch
            checked={watch('enable_fuzzy_matching')}
            onCheckedChange={(checked) => setValue('enable_fuzzy_matching', checked)}
          />
        </div>

        {/* Auto-sync toggle - only shown when integration is configured and active */}
        {integration && integration.is_active && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="space-y-0.5">
              <Label>Crear ordenes automaticamente</Label>
              <p className="text-xs text-muted-foreground max-w-md">
                Cuando esta activado, las ordenes de Shopify crean automaticamente contactos y
                pedidos en MorfX. Cuando esta desactivado, solo se disparan automatizaciones.
              </p>
            </div>
            <Switch
              checked={autoSyncOrders}
              onCheckedChange={handleAutoSyncToggle}
              disabled={isPending}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div>
          {integration && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar integracion</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se desconectara la tienda Shopify. Los pedidos ya importados no se eliminaran.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {integration ? 'Guardar cambios' : 'Conectar tienda'}
        </Button>
      </div>
    </form>
  )
}
