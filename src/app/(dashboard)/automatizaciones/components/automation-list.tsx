'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  History,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  toggleAutomation,
  duplicateAutomation,
  deleteAutomation,
} from '@/app/actions/automations'
import { TRIGGER_CATALOG } from '@/lib/automations/constants'
import type { Automation } from '@/lib/automations/types'

// ============================================================================
// Category color mapping
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  CRM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  WhatsApp: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Tareas: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  success: { label: 'Exitosa', color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
  failed: { label: 'Fallida', color: 'text-red-600 dark:text-red-400', icon: XCircle },
  running: { label: 'Ejecutando', color: 'text-yellow-600 dark:text-yellow-400', icon: Loader2 },
  cancelled: { label: 'Cancelada', color: 'text-muted-foreground', icon: XCircle },
}

type FilterCategory = 'all' | 'CRM' | 'WhatsApp' | 'Tareas'

// ============================================================================
// Helper: get trigger info from catalog
// ============================================================================

function getTriggerInfo(triggerType: string) {
  const found = TRIGGER_CATALOG.find((t) => t.type === triggerType)
  return found ?? { label: triggerType, category: 'CRM', description: '' }
}

// ============================================================================
// Helper: relative time
// ============================================================================

function formatRelativeTime(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Hace un momento'
  if (diffMin < 60) return `Hace ${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `Hace ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `Hace ${diffDays}d`
  return date.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
}

// ============================================================================
// Component
// ============================================================================

interface AutomationListProps {
  initialAutomations: Automation[]
}

export function AutomationList({ initialAutomations }: AutomationListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('all')
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [bannerDismissed, setBannerDismissed] = useState(true) // Start hidden to avoid flash

  useEffect(() => {
    const dismissed = localStorage.getItem('morfx_builder_banner_dismissed')
    if (!dismissed) {
      setBannerDismissed(false)
    }
  }, [])

  function dismissBanner() {
    setBannerDismissed(true)
    localStorage.setItem('morfx_builder_banner_dismissed', '1')
  }

  // Filter automations
  const filtered = useMemo(() => {
    let result = initialAutomations

    // Text search
    if (search.trim()) {
      const lower = search.toLowerCase()
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(lower) ||
          (a.description && a.description.toLowerCase().includes(lower))
      )
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((a) => {
        const info = getTriggerInfo(a.trigger_type)
        return info.category === categoryFilter
      })
    }

    return result
  }, [initialAutomations, search, categoryFilter])

  // Toggle automation
  async function handleToggle(automation: Automation) {
    setTogglingIds((prev) => new Set(prev).add(automation.id))
    try {
      const result = await toggleAutomation(automation.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(
          result.data.is_enabled ? 'Automatizacion activada' : 'Automatizacion desactivada'
        )
        startTransition(() => router.refresh())
      }
    } catch {
      toast.error('Error al cambiar el estado')
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev)
        next.delete(automation.id)
        return next
      })
    }
  }

  // Duplicate automation
  async function handleDuplicate(automation: Automation) {
    try {
      const result = await duplicateAutomation(automation.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(`"${result.data.name}" creada`)
        startTransition(() => router.refresh())
      }
    } catch {
      toast.error('Error al duplicar')
    }
  }

  // Delete automation
  async function handleDelete() {
    if (!deleteTarget) return
    try {
      const result = await deleteAutomation(deleteTarget.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Automatizacion eliminada')
        startTransition(() => router.refresh())
      }
    } catch {
      toast.error('Error al eliminar')
    } finally {
      setDeleteTarget(null)
    }
  }

  // Category filter buttons
  const categories: { value: FilterCategory; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'CRM', label: 'CRM' },
    { value: 'WhatsApp', label: 'WhatsApp' },
    { value: 'Tareas', label: 'Tareas' },
  ]

  // ========================================================================
  // Empty state
  // ========================================================================

  if (initialAutomations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Zap className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Sin automatizaciones</h2>
          <p className="text-muted-foreground max-w-sm">
            Crea tu primera automatizacion para ahorrar tiempo automatizando tareas repetitivas
          </p>
        </div>
        <Button asChild>
          <Link href="/automatizaciones/nueva">
            <Plus className="h-4 w-4 mr-2" />
            Crea tu primera automatizacion
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automatizaciones</h1>
          <p className="text-muted-foreground">
            {initialAutomations.length} automatizacion{initialAutomations.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/automatizaciones/builder">
              <Sparkles className="h-4 w-4 mr-2" />
              AI Builder
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/automatizaciones/historial">
              <History className="h-4 w-4 mr-2" />
              Historial
            </Link>
          </Button>
          <Button asChild>
            <Link href="/automatizaciones/nueva">
              <Plus className="h-4 w-4 mr-2" />
              Nueva automatizacion
            </Link>
          </Button>
        </div>
      </div>

      {/* AI Builder Banner */}
      {!bannerDismissed && (
        <div className="rounded-lg border bg-muted/50 p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-violet-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Nuevo: AI Builder</p>
            <p className="text-sm text-muted-foreground">
              Describe lo que quieres automatizar en lenguaje natural y el asistente lo creara por ti.
            </p>
            <Link href="/automatizaciones/builder" className="text-sm text-primary hover:underline mt-1 inline-block">
              Probar AI Builder →
            </Link>
          </div>
          <button
            onClick={dismissBanner}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar automatizaciones..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {categories.map((cat) => (
            <Button
              key={cat.value}
              variant={categoryFilter === cat.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter(cat.value)}
            >
              {cat.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No se encontraron automatizaciones con los filtros actuales
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((automation) => {
            const trigger = getTriggerInfo(automation.trigger_type)
            const categoryColor = CATEGORY_COLORS[trigger.category] ?? CATEGORY_COLORS.CRM
            const isToggling = togglingIds.has(automation.id)

            // Enriched fields from server action
            const lastStatus = (automation as Automation & { _lastExecutionStatus?: string | null })
              ._lastExecutionStatus
            const statusInfo = lastStatus ? STATUS_CONFIG[lastStatus] : null

            return (
              <Card
                key={automation.id}
                className={!automation.is_enabled ? 'opacity-60' : undefined}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Top row: name + actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">{automation.name}</h3>
                      {automation.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {automation.description}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/automatizaciones/${automation.id}/editar`}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(automation)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(automation)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Badges: trigger category + action count */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className={categoryColor}>
                      {trigger.label}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {automation.actions.length} accion
                      {automation.actions.length !== 1 ? 'es' : ''}
                    </Badge>
                  </div>

                  {/* Last execution status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs">
                      {statusInfo ? (
                        <>
                          <statusInfo.icon
                            className={`h-3.5 w-3.5 ${statusInfo.color}`}
                          />
                          <span className={statusInfo.color}>
                            {statusInfo.label}
                          </span>
                          <span className="text-muted-foreground">
                            {formatRelativeTime(automation.updated_at)}
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">Sin ejecuciones</span>
                        </>
                      )}
                    </div>

                    {/* Toggle */}
                    <Switch
                      checked={automation.is_enabled}
                      onCheckedChange={() => handleToggle(automation)}
                      disabled={isToggling || isPending}
                      size="sm"
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar automatizacion</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro de eliminar &quot;{deleteTarget?.name}&quot;? Esta accion no se puede
              deshacer. El historial de ejecuciones tambien sera eliminado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
