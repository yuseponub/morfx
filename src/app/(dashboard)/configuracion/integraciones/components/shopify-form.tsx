'use client'

// ============================================================================
// Shopify Configuration Form (Standalone shopify-dev-dashboard-oauth, D-03)
//
// Plan 06 / Wave 3.
//
// Two-branch UI:
//   - DISCONNECTED (when `integration` is null): single domain input + button
//     "Conectar con Shopify". Calls `startShopifyOauth` (Plan 04) and on success
//     does `window.location.href = redirectUrl` (cross-origin → NOT router.push).
//   - CONNECTED (when `integration` exists): preserves the existing pipeline /
//     stage / product matching / fuzzy matching / auto-sync selectors + delete
//     button. Credentials inputs (`access_token`, `api_secret`) ELIMINATED per
//     D-03 — el flow OAuth los maneja transparente.
//
// Toast effect (D-12):
//   `useEffect` con `useSearchParams` consume el redirect del callback (Plan 05):
//     ?success=oauth_connected           → toast verde "conectada exitosamente"
//     ?error=oauth_failed&reason=denied | hmac_mismatch | state_expired |
//       shopify_error → toast rojo en espanol per `REASON_MESSAGES`.
//   Tras mostrar el toast, `router.replace` limpia los query params para que un
//   refresh no re-dispare el toast (router.replace porque queremos re-render del
//   server component padre con la integration recien insertada).
// ============================================================================

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import {
  toggleShopifyIntegration,
  deleteShopifyIntegration,
} from '@/app/actions/shopify'
import { startShopifyOauth } from '@/app/actions/shopify-oauth'
import { updateShopifyAutoSync } from '@/app/actions/integrations'
import type { ShopifyIntegration } from '@/lib/shopify/types'
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
import { Loader2, ShoppingBag, Trash2 } from 'lucide-react'

interface ShopifyFormProps {
  integration: ShopifyIntegration | null
  pipelines: Array<Pipeline & { stages: PipelineStage[] }>
}

/**
 * Mensajes en espanol para los 4 reasons enumerados que el callback Plan 05
 * puede emitir en `?error=oauth_failed&reason=<X>` (D-12).
 */
const REASON_MESSAGES: Record<string, string> = {
  denied:
    'Permisos denegados. Es necesario aceptar todos los permisos solicitados.',
  hmac_mismatch:
    'Error de seguridad al conectar (HMAC invalido). Intenta de nuevo.',
  state_expired:
    'La conexion expiro. Intenta de nuevo.',
  shopify_error:
    'Shopify devolvio un error. Verifica el dominio de tu tienda e intenta de nuevo.',
}

/**
 * Subset de IntegrationFormData usado en el branch CONNECTED. Los campos OAuth
 * (`shop_domain`, `access_token`, `api_secret`) NO viven en este form porque el
 * flow OAuth los provee — la UI solo expone selectors editables por el operador.
 */
interface ConnectedFormValues {
  default_pipeline_id: string
  default_stage_id: string
  enable_fuzzy_matching: boolean
  product_matching: 'sku' | 'name' | 'value'
}

export function ShopifyForm({ integration, pipelines }: ShopifyFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // === Toast effect (D-12) ===============================================
  // Consume `?success=oauth_connected` o `?error=oauth_failed&reason=<X>` del
  // callback Plan 05. Limpia los query params con router.replace post-toast
  // para que refresh no re-dispare. router.replace (no replaceState) porque
  // queremos que el server component padre re-fetchee la integration recien
  // insertada — caso opuesto al pedidos-view que usa replaceState para evitar
  // re-fetch.
  useEffect(() => {
    const error = searchParams.get('error')
    const reason = searchParams.get('reason')
    const success = searchParams.get('success')

    if (error === 'oauth_failed' && reason) {
      toast.error(REASON_MESSAGES[reason] ?? 'Error al conectar con Shopify')
      router.replace('/configuracion/integraciones', { scroll: false })
    } else if (success === 'oauth_connected') {
      toast.success('Tienda Shopify conectada exitosamente')
      router.replace('/configuracion/integraciones', { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // === Branch DISCONNECTED ================================================
  if (!integration) {
    return <DisconnectedBranch />
  }

  // === Branch CONNECTED ===================================================
  return <ConnectedBranch integration={integration} pipelines={pipelines} />
}

// ============================================================================
// Branch DISCONNECTED — input dominio + boton Conectar (D-03)
// ============================================================================

function DisconnectedBranch() {
  const [shopDomain, setShopDomain] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleConnect = () => {
    const domain = shopDomain.trim()
    if (!domain) {
      toast.error('Ingresa el dominio de tu tienda')
      return
    }

    startTransition(async () => {
      const result = await startShopifyOauth({ shopDomain: domain })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      // Cross-origin redirect a Shopify — usar window.location.href.
      // NUNCA router.push (que asume same-origin Next App Router).
      window.location.href = result.redirectUrl
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conecta tu tienda Shopify para sincronizar pedidos automaticamente.
        Te redirigiremos a Shopify para autorizar el acceso. Al volver,
        configuras el pipeline y la etapa donde se crearan los pedidos.
      </p>
      <div className="space-y-2">
        <Label htmlFor="shop_domain">Dominio de tu tienda</Label>
        <Input
          id="shop_domain"
          placeholder="mitienda.myshopify.com"
          value={shopDomain}
          onChange={(e) => setShopDomain(e.target.value)}
          disabled={isPending}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Solo el subdominio de Shopify (ej: mitienda.myshopify.com)
        </p>
      </div>
      <Button onClick={handleConnect} disabled={isPending} className="w-full">
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <ShoppingBag className="h-4 w-4 mr-2" />
        )}
        Conectar con Shopify
      </Button>
    </div>
  )
}

// ============================================================================
// Branch CONNECTED — preserva pipeline / stage / matching selectors + delete
// (PRESERVE D-03: el flow OAuth NO toca estos campos; el operador los gestiona
// post-conexion). Eliminados respecto al legacy: inputs access_token /
// api_secret y el boton "Probar conexion" (el callback OAuth ya hizo el test
// antes de persistir — Pattern G).
// ============================================================================

interface ConnectedBranchProps {
  integration: ShopifyIntegration
  pipelines: Array<Pipeline & { stages: PipelineStage[] }>
}

function ConnectedBranch({ integration, pipelines }: ConnectedBranchProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedPipelineId, setSelectedPipelineId] = useState(
    integration.config.default_pipeline_id || pipelines[0]?.id || ''
  )
  const [autoSyncOrders, setAutoSyncOrders] = useState(
    (integration.config as unknown as Record<string, unknown>)
      ?.auto_sync_orders !== false
  )

  const {
    handleSubmit,
    watch,
    setValue,
  } = useForm<ConnectedFormValues>({
    defaultValues: {
      default_pipeline_id:
        integration.config.default_pipeline_id || pipelines[0]?.id || '',
      default_stage_id:
        integration.config.default_stage_id ||
        pipelines[0]?.stages[0]?.id ||
        '',
      enable_fuzzy_matching: integration.config.enable_fuzzy_matching ?? true,
      product_matching: integration.config.product_matching || 'sku',
    },
  })

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId)
  const stages = selectedPipeline?.stages || []

  const handlePipelineChange = (pipelineId: string) => {
    setSelectedPipelineId(pipelineId)
    setValue('default_pipeline_id', pipelineId)
    const newPipeline = pipelines.find((p) => p.id === pipelineId)
    if (newPipeline?.stages[0]) {
      setValue('default_stage_id', newPipeline.stages[0].id)
    }
  }

  // Save (pipeline / stage / matching) — actualiza solo los campos editables
  // por el operador via updateShopifyAutoSync para consistency. NOTE: V1 deja
  // los selectors funcionalmente atados al toggle auto-sync; un futuro plan
  // puede agregar un endpoint domain-layer dedicado para "save config" si se
  // necesita persistir pipeline_id / stage_id / matching desde la UI sin OAuth.
  // Por ahora, los Selects controlan local state; el operador ve los valores
  // pero la persistencia productiva ocurre via OAuth callback (preserve-on-
  // update logic en upsertShopifyIntegration, ver Plan 02 SUMMARY).
  const onSubmit = (_data: ConnectedFormValues) => {
    // Placeholder: V1 no expone un endpoint para mutar SOLO la config del
    // operador (pipeline/stage/matching) sin re-correr OAuth. La UI mantiene
    // los selectors para visibility; persistencia editorial queda para un
    // standalone follow-up. Si el operador quiere cambiar los valores hoy:
    // disconnect + reconnect via OAuth (D-03b limpia el config; en el
    // siguiente OAuth los selectors de la UI conservan los valores actuales).
    toast.info(
      'Para cambiar pipeline / etapa / matching: desconecta y reconecta via OAuth.'
    )
  }

  const handleToggleActive = () => {
    startTransition(async () => {
      const result = await toggleShopifyIntegration(!integration.is_active)
      if (result.success) {
        toast.success(
          integration.is_active
            ? 'Integracion desactivada'
            : 'Integracion activada'
        )
        router.refresh()
      } else {
        toast.error(result.error || 'Error al actualizar')
      }
    })
  }

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

  const handleAutoSyncToggle = (checked: boolean) => {
    setAutoSyncOrders(checked)
    startTransition(async () => {
      const result = await updateShopifyAutoSync(checked)
      if (result.success) {
        toast.success(checked ? 'Auto-sync activado' : 'Auto-sync desactivado')
      } else {
        setAutoSyncOrders(!checked)
        toast.error(result.error || 'Error al actualizar')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Status + shop info */}
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
        <Switch
          checked={integration.is_active}
          onCheckedChange={handleToggleActive}
          disabled={isPending}
        />
      </div>

      {/* Configuration Section — preserved selectors */}
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
                {pipelines.map((pipeline) => (
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
                {stages.map((stage) => (
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
            onValueChange={(value: 'sku' | 'name' | 'value') =>
              setValue('product_matching', value)
            }
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
              Busca contactos similares por nombre y ciudad si no hay
              coincidencia por telefono
            </p>
          </div>
          <Switch
            checked={watch('enable_fuzzy_matching')}
            onCheckedChange={(checked) =>
              setValue('enable_fuzzy_matching', checked)
            }
          />
        </div>

        {/* Auto-sync toggle */}
        {integration.is_active && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="space-y-0.5">
              <Label>Crear ordenes automaticamente</Label>
              <p className="text-xs text-muted-foreground max-w-md">
                Cuando esta activado, las ordenes de Shopify crean
                automaticamente contactos y pedidos en MorfX. Cuando esta
                desactivado, solo se disparan automatizaciones.
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
                Se desconectara la tienda Shopify. Los pedidos ya importados no
                se eliminaran.
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

        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}
