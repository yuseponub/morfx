'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PlusIcon, ShoppingCartIcon, SearchIcon, XIcon, SlidersHorizontalIcon, Trash2Icon, DownloadIcon, ArrowUpIcon, ArrowDownIcon, ArrowRightIcon, PencilIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { DataTable } from '@/components/ui/data-table'
import { createColumns } from './columns'
import { ViewToggle, type OrderViewMode } from './view-toggle'
import { KanbanBoard } from './kanban-board'
import { OrderSheet } from './order-sheet'
import { PipelineTabs } from './pipeline-tabs'
import { StageEditDialog } from './stage-edit-dialog'
import { BulkMoveDialog } from './bulk-move-dialog'
import { BulkEditDialog } from './bulk-edit-dialog'
import { OrderForm } from './order-form'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { deleteOrder, deleteOrders, exportOrdersToCSV, getOrdersForStage, getStageOrderCounts, bulkMoveOrdersToStage, bulkUpdateOrderField, recompraOrder } from '@/app/actions/orders'
import { RECOMPRA_PIPELINE_NAME } from '@/lib/orders/constants'
import { ProductPicker } from './product-picker'
import { useOrderSearch } from '@/lib/search/fuse-config'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import type { User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type {
  OrderWithDetails,
  PipelineWithStages,
  Product,
  OrdersByStage,
  OrderProductFormData,
} from '@/lib/orders/types'
import type { Tag } from '@/lib/types/database'

const VIEW_MODE_STORAGE_KEY = 'morfx_orders_view_mode'
const SORT_FIELD_STORAGE_KEY = 'morfx_kanban_sort_field'
const SORT_DIR_STORAGE_KEY = 'morfx_kanban_sort_dir'

type KanbanSortField = 'created_at' | 'updated_at' | 'total_value' | 'name' | 'closing_date'
type KanbanSortDirection = 'asc' | 'desc'

const SORT_OPTIONS: { value: KanbanSortField; label: string }[] = [
  { value: 'created_at', label: 'Fecha de creacion' },
  { value: 'updated_at', label: 'Ultima modificacion' },
  { value: 'total_value', label: 'Valor' },
  { value: 'name', label: 'Nombre' },
  { value: 'closing_date', label: 'Fecha de cierre' },
]

function compareOrders(a: OrderWithDetails, b: OrderWithDetails, field: KanbanSortField, dir: KanbanSortDirection): number {
  let cmp = 0
  switch (field) {
    case 'created_at':
    case 'updated_at': {
      const aVal = a[field] || ''
      const bVal = b[field] || ''
      cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      break
    }
    case 'closing_date': {
      const aVal = a.closing_date
      const bVal = b.closing_date
      if (!aVal && !bVal) cmp = 0
      else if (!aVal) cmp = 1 // nulls last
      else if (!bVal) cmp = -1
      else cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      break
    }
    case 'total_value':
      cmp = (a.total_value || 0) - (b.total_value || 0)
      break
    case 'name': {
      const aName = a.name || ''
      const bName = b.name || ''
      if (!aName && !bName) cmp = 0
      else if (!aName) cmp = 1
      else if (!bName) cmp = -1
      else cmp = aName.localeCompare(bName, 'es')
      break
    }
  }
  return dir === 'asc' ? cmp : -cmp
}

interface OrdersViewProps {
  orders: OrderWithDetails[]
  pipelines: PipelineWithStages[]
  products: Product[]
  tags: Tag[]
  defaultPipelineId?: string
  defaultStageId?: string
  user: User | null
  currentUserId?: string
  isAdminOrOwner?: boolean
}

/**
 * Main orders view component with Kanban/List toggle, filters, and pipeline tabs.
 */
export function OrdersView({
  orders,
  pipelines,
  products,
  tags,
  defaultPipelineId,
  defaultStageId,
  user,
  currentUserId,
  isAdminOrOwner,
}: OrdersViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const v2 = useDashboardV2()

  // View mode (kanban default per CONTEXT.md)
  const [viewMode, setViewMode] = React.useState<OrderViewMode>('kanban')

  // Kanban sort
  const [sortField, setSortField] = React.useState<KanbanSortField>('created_at')
  const [sortDirection, setSortDirection] = React.useState<KanbanSortDirection>('desc')

  // Default contact from URL params (for WhatsApp integration)
  const defaultContactId = searchParams.get('contact_id')

  // Active pipeline
  const [activePipelineId, setActivePipelineId] = React.useState<string | null>(
    defaultPipelineId || pipelines[0]?.id || null
  )

  // Open pipelines for tabs
  const [openPipelineIds, setOpenPipelineIds] = React.useState<string[]>([])

  // Filters
  const [selectedStageId, setSelectedStageId] = React.useState<string | null>(null)
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([])

  // Per-stage paginated orders for Kanban
  const [kanbanOrders, setKanbanOrders] = React.useState<Record<string, OrderWithDetails[]>>({})
  const [kanbanHasMore, setKanbanHasMore] = React.useState<Record<string, boolean>>({})
  const [kanbanCounts, setKanbanCounts] = React.useState<Record<string, number>>({})
  const [kanbanLoading, setKanbanLoading] = React.useState<Record<string, boolean>>({})
  const [kanbanInitialized, setKanbanInitialized] = React.useState(false)

  // Fuzzy search
  const { query: searchQuery, setQuery: setSearchQuery, results: searchResults } = useOrderSearch(orders)

  // Load initial orders per stage when pipeline changes (Kanban mode)
  React.useEffect(() => {
    if (!activePipelineId || viewMode !== 'kanban') return

    const activePipeline = pipelines.find(p => p.id === activePipelineId)
    if (!activePipeline) return

    let cancelled = false

    const loadInitial = async () => {
      const stageIds = activePipeline.stages.map(s => s.id)

      const [counts, ...stageResults] = await Promise.all([
        getStageOrderCounts(activePipelineId),
        ...stageIds.map(stageId => getOrdersForStage(stageId, 20, 0))
      ])

      if (cancelled) return

      const newOrders: Record<string, OrderWithDetails[]> = {}
      const newHasMore: Record<string, boolean> = {}

      stageIds.forEach((stageId, i) => {
        newOrders[stageId] = stageResults[i].orders
        newHasMore[stageId] = stageResults[i].hasMore
      })

      setKanbanOrders(newOrders)
      setKanbanHasMore(newHasMore)
      setKanbanCounts(counts)
      setKanbanInitialized(true)
    }

    setKanbanInitialized(false)
    loadInitial()

    return () => { cancelled = true }
  }, [activePipelineId, viewMode, pipelines])

  // Load more orders for a specific stage (infinite scroll)
  const handleLoadMore = React.useCallback(async (stageId: string) => {
    if (kanbanLoading[stageId] || !kanbanHasMore[stageId]) return

    setKanbanLoading(prev => ({ ...prev, [stageId]: true }))

    const currentCount = kanbanOrders[stageId]?.length || 0
    const result = await getOrdersForStage(stageId, 20, currentCount)

    setKanbanOrders(prev => ({
      ...prev,
      [stageId]: [...(prev[stageId] || []), ...result.orders]
    }))
    setKanbanHasMore(prev => ({ ...prev, [stageId]: result.hasMore }))
    setKanbanLoading(prev => ({ ...prev, [stageId]: false }))
  }, [kanbanOrders, kanbanHasMore, kanbanLoading])

  // Handle order moved in Kanban — update kanbanOrders so revalidatePath won't bounce back
  const handleOrderMoved = React.useCallback((orderId: string, fromStageId: string, toStageId: string) => {
    setKanbanOrders(prev => {
      const fromOrders = prev[fromStageId] || []
      const movedOrder = fromOrders.find(o => o.id === orderId)
      if (!movedOrder) return prev

      return {
        ...prev,
        [fromStageId]: fromOrders.filter(o => o.id !== orderId),
        [toStageId]: [...(prev[toStageId] || []), { ...movedOrder, stage_id: toStageId }],
      }
    })
    setKanbanCounts(prev => ({
      ...prev,
      [fromStageId]: Math.max(0, (prev[fromStageId] || 0) - 1),
      [toStageId]: (prev[toStageId] || 0) + 1,
    }))
  }, [])

  // Sheet states
  const [formSheetOpen, setFormSheetOpen] = React.useState(false)
  const [editingOrder, setEditingOrder] = React.useState<OrderWithDetails | null>(null)
  const [viewingOrder, setViewingOrder] = React.useState<OrderWithDetails | null>(null)

  // Auto-open form sheet if ?new=true in URL (for WhatsApp integration)
  React.useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setFormSheetOpen(true)
      // Clear the URL param after opening
      router.replace('/crm/pedidos', { scroll: false })
    }
  }, [searchParams, router])

  // Auto-open order detail if ?order=<id> in URL (for WhatsApp integration & related orders)
  React.useEffect(() => {
    const orderId = searchParams.get('order')
    if (orderId) {
      const order = orders.find(o => o.id === orderId)
      if (order) {
        // Switch to the order's pipeline if different
        if (order.pipeline_id !== activePipelineId) {
          setActivePipelineId(order.pipeline_id)
        }
        setViewingOrder(order)
        // Clear the URL param after opening
        router.replace('/crm/pedidos', { scroll: false })
      }
    }
  }, [searchParams, router, orders, activePipelineId])

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [orderToDelete, setOrderToDelete] = React.useState<OrderWithDetails | null>(null)

  // Recompra dialog
  const [recompraDialogOpen, setRecompraDialogOpen] = React.useState(false)
  const [orderToRecompra, setOrderToRecompra] = React.useState<OrderWithDetails | null>(null)
  const [recompraStageId, setRecompraStageId] = React.useState<string>('')
  const [recompraProducts, setRecompraProducts] = React.useState<OrderProductFormData[]>([])

  // Pipeline destino para recompras (quick task 043)
  const recompraPipeline = React.useMemo(
    () => pipelines.find((p) => p.name === RECOMPRA_PIPELINE_NAME),
    [pipelines]
  )
  const recompraDisabled = !recompraPipeline

  // Order selection
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<Set<string>>(new Set())

  // Handle order selection change
  const handleOrderSelectChange = (orderId: string, selected: boolean) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(orderId)
      } else {
        next.delete(orderId)
      }
      return next
    })
  }

  // Clear selection
  const clearSelection = () => setSelectedOrderIds(new Set())

  // Stage dialog state
  const [stageDialogOpen, setStageDialogOpen] = React.useState(false)
  const [stageDialogMode, setStageDialogMode] = React.useState<'create' | 'edit' | 'delete'>('create')
  const [editingStage, setEditingStage] = React.useState<typeof stages[0] | null>(null)

  // Bulk delete dialog
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = React.useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false)

  // Bulk move and edit dialogs
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = React.useState(false)
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = React.useState(false)

  // Handle stage edit
  const handleEditStage = (stage: typeof stages[0]) => {
    setEditingStage(stage)
    setStageDialogMode('edit')
    setStageDialogOpen(true)
  }

  // Handle stage delete
  const handleDeleteStage = (stage: typeof stages[0]) => {
    setEditingStage(stage)
    setStageDialogMode('delete')
    setStageDialogOpen(true)
  }

  // Handle add stage
  const handleAddStage = () => {
    setEditingStage(null)
    setStageDialogMode('create')
    setStageDialogOpen(true)
  }

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedOrderIds.size === 0) return

    setIsBulkDeleting(true)
    try {
      const result = await deleteOrders(Array.from(selectedOrderIds))
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(`${result.data?.deleted} pedido(s) eliminado(s)`)
        clearSelection()
        router.refresh()
        if (viewMode === 'kanban' && activePipelineId) {
          setKanbanInitialized(false)
        }
      }
    } finally {
      setIsBulkDeleting(false)
      setBulkDeleteDialogOpen(false)
    }
  }

  // Handle bulk move to stage
  const handleBulkMove = async (stageId: string) => {
    if (selectedOrderIds.size === 0) return
    const result = await bulkMoveOrdersToStage(Array.from(selectedOrderIds), stageId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`${result.data?.moved} pedido(s) movido(s)`)
      clearSelection()
      router.refresh()
      if (viewMode === 'kanban' && activePipelineId) {
        setKanbanInitialized(false)
      }
    }
  }

  // Handle bulk field edit
  const handleBulkEdit = async (field: string, value: string) => {
    if (selectedOrderIds.size === 0) return
    const result = await bulkUpdateOrderField(Array.from(selectedOrderIds), field, value)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`${result.data?.updated} pedido(s) actualizado(s)`)
      clearSelection()
      router.refresh()
      if (viewMode === 'kanban' && activePipelineId) {
        setKanbanInitialized(false)
      }
    }
  }

  // Handle export
  const handleExport = async () => {
    const orderIds = selectedOrderIds.size > 0 ? Array.from(selectedOrderIds) : undefined
    const result = await exportOrdersToCSV(orderIds)

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    // Download CSV
    const blob = new Blob([result.data!], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pedidos-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(selectedOrderIds.size > 0
      ? `${selectedOrderIds.size} pedido(s) exportado(s)`
      : 'Todos los pedidos exportados'
    )
  }

  // Load saved view mode and sort from localStorage
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
      if (saved === 'kanban' || saved === 'list') {
        setViewMode(saved)
      }
      const savedField = localStorage.getItem(SORT_FIELD_STORAGE_KEY)
      if (savedField && SORT_OPTIONS.some(o => o.value === savedField)) {
        setSortField(savedField as KanbanSortField)
      }
      const savedDir = localStorage.getItem(SORT_DIR_STORAGE_KEY)
      if (savedDir === 'asc' || savedDir === 'desc') {
        setSortDirection(savedDir)
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  // Save view mode to localStorage
  const handleViewModeChange = (mode: OrderViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
    } catch {
      // Ignore localStorage errors
    }
  }

  // Sort field change
  const handleSortFieldChange = (value: string) => {
    const field = value as KanbanSortField
    setSortField(field)
    try { localStorage.setItem(SORT_FIELD_STORAGE_KEY, field) } catch {}
  }

  // Sort direction toggle
  const toggleSortDirection = () => {
    const next = sortDirection === 'asc' ? 'desc' : 'asc'
    setSortDirection(next)
    try { localStorage.setItem(SORT_DIR_STORAGE_KEY, next) } catch {}
  }

  // Get active pipeline
  const activePipeline = pipelines.find((p) => p.id === activePipelineId)
  const stages = activePipeline?.stages || []

  // Filter orders by active pipeline, stage, and tags
  const filteredOrders = React.useMemo(() => {
    return searchResults.filter((order) => {
      // Pipeline filter
      if (activePipelineId && order.pipeline_id !== activePipelineId) {
        return false
      }
      // Stage filter
      if (selectedStageId && order.stage_id !== selectedStageId) {
        return false
      }
      // Tag filter (any of selected tags)
      if (selectedTagIds.length > 0) {
        const orderTagIds = order.tags.map((t) => t.id)
        const hasAnyTag = selectedTagIds.some((tagId) => orderTagIds.includes(tagId))
        if (!hasAnyTag) return false
      }
      return true
    })
  }, [searchResults, activePipelineId, selectedStageId, selectedTagIds])

  // Group orders by stage for Kanban
  const ordersByStage: OrdersByStage = React.useMemo(() => {
    if (viewMode === 'kanban' && kanbanInitialized) {
      // When searching, use filteredOrders (Fuse.js on ALL orders) to search across all
      // pedidos, not just the ~20 loaded per stage in kanban pagination
      if (searchQuery.trim()) {
        const grouped: OrdersByStage = {}
        for (const stage of stages) {
          grouped[stage.id] = filteredOrders
            .filter((o) => o.stage_id === stage.id)
            .sort((a, b) => compareOrders(a, b, sortField, sortDirection))
        }
        return grouped
      }

      // No search — use paginated per-stage data
      const grouped: OrdersByStage = {}
      for (const stage of stages) {
        let stageOrders = kanbanOrders[stage.id] || []

        if (selectedTagIds.length > 0) {
          stageOrders = stageOrders.filter(o => {
            const orderTagIds = o.tags.map(t => t.id)
            return selectedTagIds.some(tagId => orderTagIds.includes(tagId))
          })
        }

        // Sort
        grouped[stage.id] = [...stageOrders].sort((a, b) => compareOrders(a, b, sortField, sortDirection))
      }
      return grouped
    }

    // Fallback: use full orders (list view or before kanban initialized)
    const grouped: OrdersByStage = {}
    for (const stage of stages) {
      grouped[stage.id] = filteredOrders
        .filter((o) => o.stage_id === stage.id)
        .sort((a, b) => compareOrders(a, b, sortField, sortDirection))
    }
    return grouped
  }, [viewMode, kanbanInitialized, kanbanOrders, stages, searchQuery, selectedTagIds, filteredOrders, sortField, sortDirection])

  // Check if any filters are active
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedStageId !== null ||
    selectedTagIds.length > 0

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('')
    setSelectedStageId(null)
    setSelectedTagIds([])
  }

  // Reset stage filter when pipeline changes
  React.useEffect(() => {
    setSelectedStageId(null)
  }, [activePipelineId])

  // Table columns with callbacks
  const columns = React.useMemo(
    () =>
      createColumns({
        onEdit: (order) => {
          setEditingOrder(order)
          setFormSheetOpen(true)
        },
        onDelete: (order) => {
          setOrderToDelete(order)
          setDeleteDialogOpen(true)
        },
        onRecompra: (order) => {
          if (recompraDisabled) {
            toast.error(`No existe el pipeline '${RECOMPRA_PIPELINE_NAME}' en este workspace`)
            return
          }
          setOrderToRecompra(order)
          setRecompraStageId(recompraPipeline?.stages[0]?.id || '')
          setRecompraProducts([])
          setRecompraDialogOpen(true)
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recompraDisabled, recompraPipeline]
  )

  // Handle card click in Kanban
  const handleOrderClick = (order: OrderWithDetails) => {
    setViewingOrder(order)
  }

  // Handle edit from order sheet
  const handleEditFromSheet = (order: OrderWithDetails) => {
    setViewingOrder(null)
    setEditingOrder(order)
    setFormSheetOpen(true)
  }

  // Handle delete from order sheet
  const handleDeleteFromSheet = (order: OrderWithDetails) => {
    setViewingOrder(null)
    setOrderToDelete(order)
    setDeleteDialogOpen(true)
  }

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!orderToDelete) return

    const result = await deleteOrder(orderToDelete.id)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Pedido eliminado')
      router.refresh()
      if (viewMode === 'kanban' && activePipelineId) {
        setKanbanInitialized(false)
      }
    }
    setDeleteDialogOpen(false)
    setOrderToDelete(null)
  }

  // Handle recompra confirmation
  const handleRecompraConfirm = async () => {
    if (!orderToRecompra || !recompraStageId || recompraProducts.length === 0) return
    const result = await recompraOrder(
      orderToRecompra.id,
      recompraStageId,
      recompraProducts.map((p) => ({
        product_id: p.product_id,
        sku: p.sku,
        title: p.title,
        unit_price: p.unit_price,
        quantity: p.quantity,
      }))
    )
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Recompra creada exitosamente')
      router.refresh()
      if (viewMode === 'kanban' && activePipelineId) {
        setKanbanInitialized(false)
      }
    }
    setRecompraDialogOpen(false)
    setOrderToRecompra(null)
    setRecompraProducts([])
  }

  // Handle form success
  const handleFormSuccess = () => {
    setFormSheetOpen(false)
    setEditingOrder(null)
    toast.success(editingOrder ? 'Pedido actualizado' : 'Pedido creado')
    router.refresh()
    // Reload kanban data for affected pipeline
    if (viewMode === 'kanban' && activePipelineId) {
      setKanbanInitialized(false)
    }
  }

  // Handle form close
  const handleFormClose = () => {
    setFormSheetOpen(false)
    setEditingOrder(null)
  }

  // Empty state flag
  const isEmpty = orders.length === 0

  return (
    <>
      {isEmpty ? (
        v2 ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-center"
            data-theme-scope="dashboard-editorial"
          >
            <p className="mx-h3">Sin pedidos todavía.</p>
            <p className="mx-caption mt-2">Crea tu primer pedido para comenzar a gestionar tus ventas.</p>
            <p className="mx-rule-ornament my-4">· · ·</p>
            <button
              type="button"
              onClick={() => setFormSheetOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[3px] bg-[var(--ink-1)] text-[var(--paper-0)] text-[13px] font-semibold hover:bg-[var(--ink-2)] transition-colors"
              style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
            >
              <PlusIcon className="h-4 w-4" />
              Nuevo pedido
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <ShoppingCartIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Sin pedidos</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Crea tu primer pedido para comenzar a gestionar tus ventas.
            </p>
            <Button onClick={() => setFormSheetOpen(true)}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Nuevo Pedido
            </Button>
          </div>
        )
      ) : (
    <div
      className="relative flex flex-col h-full p-4"
      data-theme-scope="dashboard-editorial"
    >
      {/* Editorial topbar — flag ON only (mock pedidos.html lines 199-247) */}
      {v2 && (
        <>
          {/* Row 1 — eyebrow + h1 + actions */}
          <div className="flex items-end justify-between mb-4 pb-4 border-b border-[var(--ink-1)]">
            <div>
              <span
                className="block text-[11px] uppercase tracking-[0.14em] font-semibold text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Módulo · pedidos
              </span>
              <h1
                className="mt-1 text-[30px] leading-[1.1] font-semibold tracking-[-0.015em] text-[var(--ink-1)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Tablero de pedidos
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[13px] font-semibold hover:bg-[var(--paper-3)] transition-colors"
                style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                Exportar
              </button>
              <button
                type="button"
                onClick={() => setFormSheetOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] bg-[var(--ink-1)] text-[var(--paper-0)] text-[13px] font-semibold hover:bg-[var(--ink-2)] transition-colors"
                style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Nuevo pedido
              </button>
            </div>
          </div>

          {/* Row 2 — toolbar editorial: search + chips + view-toggle */}
          <div className="flex items-center gap-2.5 mb-4">
            {/* Search */}
            <div className="relative flex-1 max-w-[340px]">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ink-3)] pointer-events-none" aria-hidden />
              <input
                type="text"
                placeholder="Buscar por cliente, id de pedido o producto…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--paper-0)] border border-[var(--border)] rounded-[3px] py-2 pr-3 pl-8 text-[13px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]"
                style={{ fontFamily: 'var(--font-sans)' }}
                aria-label="Buscar pedidos"
              />
            </div>

            {/* Stage filter */}
            <Select
              value={selectedStageId || 'all'}
              onValueChange={(value) => setSelectedStageId(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-[160px] bg-[var(--paper-0)] border-[var(--border)] text-[13px] rounded-[3px]" style={{ fontFamily: 'var(--font-sans)' }}>
                <SelectValue placeholder="Etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las etapas</SelectItem>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      {stage.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tags filter popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center justify-center h-9 w-9 rounded-[3px] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-3)] transition-colors',
                    selectedTagIds.length > 0 && 'border-[var(--rubric-2)] text-[var(--rubric-2)]'
                  )}
                  aria-label="Filtrar por etiquetas"
                >
                  <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64"
                align="end"
                portalContainer={typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]') : undefined}
              >
                <div className="space-y-3">
                  <div className="font-medium text-sm">Filtrar por etiquetas</div>
                  {tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => {
                        const isSelected = selectedTagIds.includes(tag.id)
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id))
                              } else {
                                setSelectedTagIds([...selectedTagIds, tag.id])
                              }
                            }}
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                              'border-2 cursor-pointer',
                              isSelected
                                ? 'border-foreground shadow-sm'
                                : 'border-transparent opacity-70 hover:opacity-100'
                            )}
                            style={{
                              backgroundColor: tag.color,
                              color: tag.color === '#eab308' || tag.color === '#06b6d4' ? '#1f2937' : '#ffffff',
                            }}
                          >
                            {tag.name}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin etiquetas disponibles</p>
                  )}
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full text-muted-foreground">
                      <XIcon className="h-4 w-4 mr-1" />
                      Limpiar filtros
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Sort (kanban only) */}
            {viewMode === 'kanban' && (
              <div className="flex items-center gap-1">
                <Select value={sortField} onValueChange={handleSortFieldChange}>
                  <SelectTrigger className="w-[170px] h-9 text-xs bg-[var(--paper-0)] border-[var(--border)] rounded-[3px]" style={{ fontFamily: 'var(--font-sans)' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={toggleSortDirection}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-[3px] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-3)] transition-colors"
                  title={sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}
                  aria-label={sortDirection === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
                >
                  {sortDirection === 'asc' ? (
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}

            <div className="flex-1" />

            {/* View toggle */}
            <ViewToggle value={viewMode} onChange={handleViewModeChange} />

            {/* Theme toggle — CSS-cascades via .theme-editorial */}
            <ThemeToggle />
          </div>
        </>
      )}

      {/* Unified Top Bar — current (flag OFF) */}
      {!v2 && (
      <div className="flex items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por contacto, producto, guia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
            >
              <XIcon className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Stage filter */}
        <Select
          value={selectedStageId || 'all'}
          onValueChange={(value) => setSelectedStageId(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las etapas</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filter button (tags popover) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'shrink-0',
                selectedTagIds.length > 0 && 'border-primary text-primary'
              )}
            >
              <SlidersHorizontalIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-3">
              <div className="font-medium text-sm">Filtrar por etiquetas</div>
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id))
                          } else {
                            setSelectedTagIds([...selectedTagIds, tag.id])
                          }
                        }}
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                          'border-2 cursor-pointer',
                          isSelected
                            ? 'border-foreground shadow-sm'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        )}
                        style={{
                          backgroundColor: tag.color,
                          color: tag.color === '#eab308' || tag.color === '#06b6d4' ? '#1f2937' : '#ffffff',
                        }}
                      >
                        {tag.name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin etiquetas disponibles</p>
              )}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="w-full text-muted-foreground"
                >
                  <XIcon className="h-4 w-4 mr-1" />
                  Limpiar filtros
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort (kanban only) */}
        {viewMode === 'kanban' && (
          <div className="flex items-center gap-1">
            <Select value={sortField} onValueChange={handleSortFieldChange}>
              <SelectTrigger className="w-[170px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={toggleSortDirection}
              title={sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}
            >
              {sortDirection === 'asc' ? (
                <ArrowUpIcon className="h-4 w-4" />
              ) : (
                <ArrowDownIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* New order button */}
        <Button onClick={() => setFormSheetOpen(true)}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Nuevo Pedido
        </Button>

        {/* View toggle */}
        <ViewToggle value={viewMode} onChange={handleViewModeChange} />

        {/* Theme toggle */}
        <ThemeToggle />
      </div>
      )}

      {/* Selection bar */}
      {selectedOrderIds.size > 0 && (
        v2 ? (
          <div
            className="flex items-center gap-3 mb-3 p-3 bg-[var(--paper-2)] border border-[var(--ink-1)] rounded-[3px]"
            style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
          >
            <span
              className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Selección
            </span>
            <span className="text-[13px] font-medium text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>
              {selectedOrderIds.size} pedido{selectedOrderIds.size > 1 ? 's' : ''}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[12px] font-medium hover:bg-[var(--paper-3)] transition-colors"
              style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Exportar
            </button>
            <button
              type="button"
              onClick={() => setBulkMoveDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[12px] font-medium hover:bg-[var(--paper-3)] transition-colors"
              style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
            >
              <ArrowRightIcon className="h-3.5 w-3.5" />
              Mover de etapa
            </button>
            <button
              type="button"
              onClick={() => setBulkEditDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[12px] font-medium hover:bg-[var(--paper-3)] transition-colors"
              style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Editar campo
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--rubric-2)] bg-[var(--paper-0)] text-[var(--rubric-2)] text-[12px] font-medium hover:bg-[var(--rubric-2)]/10 transition-colors"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <Trash2Icon className="h-3.5 w-3.5" />
              Eliminar
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center justify-center h-7 w-7 rounded-[3px] hover:bg-[var(--paper-3)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
              aria-label="Limpiar selección"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-3 p-2 bg-primary/10 border border-primary/20 rounded-lg">
            <span className="text-sm font-medium">
              {selectedOrderIds.size} pedido{selectedOrderIds.size > 1 ? 's' : ''} seleccionado{selectedOrderIds.size > 1 ? 's' : ''}
            </span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              <DownloadIcon className="h-4 w-4 mr-1" />
              Exportar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkMoveDialogOpen(true)}
            >
              <ArrowRightIcon className="h-4 w-4 mr-1" />
              Mover de etapa
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkEditDialogOpen(true)}
            >
              <PencilIcon className="h-4 w-4 mr-1" />
              Editar campo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkDeleteDialogOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2Icon className="h-4 w-4 mr-1" />
              Eliminar
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        )
      )}

      {/* Results count when filtering */}
      {hasActiveFilters && selectedOrderIds.size === 0 && (
        <div
          className={cn(
            'mb-2',
            v2
              ? 'text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]'
              : 'text-sm text-muted-foreground'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          {v2
            ? `Mostrando ${filteredOrders.length} de ${orders.filter((o) => o.pipeline_id === activePipelineId).length}`
            : `Mostrando ${filteredOrders.length} de ${orders.filter((o) => o.pipeline_id === activePipelineId).length} pedidos`}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'kanban' ? (
          <KanbanBoard
            stages={stages}
            ordersByStage={ordersByStage}
            pipelineId={activePipelineId || ''}
            onOrderClick={handleOrderClick}
            onEditStage={handleEditStage}
            onDeleteStage={handleDeleteStage}
            onAddStage={handleAddStage}
            selectedOrderIds={selectedOrderIds}
            onOrderSelectChange={handleOrderSelectChange}
            onRecompra={(order) => {
              if (recompraDisabled) {
                toast.error(`No existe el pipeline '${RECOMPRA_PIPELINE_NAME}' en este workspace`)
                return
              }
              setOrderToRecompra(order)
              setRecompraStageId(recompraPipeline?.stages[0]?.id || '')
              setRecompraProducts([])
              setRecompraDialogOpen(true)
            }}
            stageCounts={kanbanCounts}
            stageHasMore={kanbanHasMore}
            stageLoading={kanbanLoading}
            onLoadMore={handleLoadMore}
            onOrderMoved={handleOrderMoved}
          />
        ) : (
          <DataTable
            columns={columns}
            data={filteredOrders}
            searchColumn="contact"
            searchValue={searchQuery}
          />
        )}
      </div>

      {/* Pipeline tabs */}
      <PipelineTabs
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        onPipelineChange={setActivePipelineId}
        onOpenPipelines={setOpenPipelineIds}
      />

      {/* Order detail sheet */}
      <OrderSheet
        order={viewingOrder}
        open={!!viewingOrder}
        stages={stages}
        allOrders={orders}
        onClose={() => setViewingOrder(null)}
        onEdit={handleEditFromSheet}
        onDelete={handleDeleteFromSheet}
        onViewOrder={setViewingOrder}
        currentUserId={currentUserId}
        isAdminOrOwner={isAdminOrOwner}
        availableTags={tags}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar pedido</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro que deseas eliminar este pedido
              {orderToDelete?.contact && (
                <> de <strong>{orderToDelete.contact.name}</strong></>
              )}
              ? Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recompra confirmation dialog */}
      <AlertDialog
        open={recompraDialogOpen}
        onOpenChange={(open) => {
          setRecompraDialogOpen(open)
          if (!open) setRecompraProducts([])
        }}
      >
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Crear recompra</AlertDialogTitle>
            <AlertDialogDescription>
              Se creara un nuevo pedido en el pipeline &apos;{RECOMPRA_PIPELINE_NAME}&apos; con el contacto del pedido origen.
              Selecciona los productos manualmente (no se copian del pedido original).
            </AlertDialogDescription>
          </AlertDialogHeader>
          {recompraPipeline ? (
            <div className="py-2 space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Etapa del nuevo pedido</label>
                <Select value={recompraStageId} onValueChange={setRecompraStageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {recompraPipeline.stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                          {stage.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Productos de la recompra</label>
                <ProductPicker
                  products={products}
                  value={recompraProducts}
                  onChange={setRecompraProducts}
                />
              </div>
            </div>
          ) : (
            <div className="py-4 text-sm text-destructive">
              No existe el pipeline &apos;{RECOMPRA_PIPELINE_NAME}&apos; en este workspace.
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRecompraConfirm}
              disabled={!recompraStageId || recompraProducts.length === 0 || !recompraPipeline}
            >
              Crear recompra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {selectedOrderIds.size} pedido{selectedOrderIds.size > 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro que deseas eliminar {selectedOrderIds.size} pedido{selectedOrderIds.size > 1 ? 's' : ''} seleccionado{selectedOrderIds.size > 1 ? 's' : ''}? Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk move dialog */}
      <BulkMoveDialog
        open={bulkMoveDialogOpen}
        onOpenChange={setBulkMoveDialogOpen}
        stages={stages}
        selectedCount={selectedOrderIds.size}
        onConfirm={handleBulkMove}
      />

      {/* Bulk edit dialog */}
      <BulkEditDialog
        open={bulkEditDialogOpen}
        onOpenChange={setBulkEditDialogOpen}
        selectedCount={selectedOrderIds.size}
        onConfirm={handleBulkEdit}
      />

      {/* Stage edit dialog */}
      {activePipelineId && (
        <StageEditDialog
          open={stageDialogOpen}
          onClose={() => {
            setStageDialogOpen(false)
            setEditingStage(null)
          }}
          pipelineId={activePipelineId}
          stage={editingStage}
          mode={stageDialogMode}
        />
      )}
    </div>
      )}

      {/* Create/Edit Sheet - always rendered for both empty and non-empty states */}
      <Sheet open={formSheetOpen} onOpenChange={handleFormClose}>
        <SheetContent className="sm:max-w-[600px] p-0 flex flex-col h-full max-h-screen overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>
              {editingOrder ? 'Editar pedido' : 'Nuevo pedido'}
            </SheetTitle>
            <SheetDescription>
              {editingOrder
                ? 'Actualiza la informacion del pedido'
                : 'Crea un nuevo pedido con contacto y productos'}
            </SheetDescription>
          </SheetHeader>
          <OrderForm
            mode={editingOrder ? 'edit' : 'create'}
            order={editingOrder || undefined}
            pipelines={pipelines}
            products={products}
            defaultPipelineId={defaultPipelineId}
            defaultStageId={defaultStageId}
            defaultContactId={defaultContactId || undefined}
            onSuccess={handleFormSuccess}
            onCancel={handleFormClose}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
