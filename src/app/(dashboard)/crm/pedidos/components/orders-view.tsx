'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PlusIcon, ShoppingCartIcon, SearchIcon, XIcon, SlidersHorizontalIcon, Trash2Icon, DownloadIcon } from 'lucide-react'
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
import { OrderForm } from './order-form'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { deleteOrder, deleteOrders, exportOrdersToCSV } from '@/app/actions/orders'
import { useOrderSearch } from '@/lib/search/fuse-config'
import type { User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type {
  OrderWithDetails,
  PipelineWithStages,
  Product,
  OrdersByStage,
} from '@/lib/orders/types'
import type { ContactWithTags, Tag } from '@/lib/types/database'

const VIEW_MODE_STORAGE_KEY = 'morfx_orders_view_mode'

interface OrdersViewProps {
  orders: OrderWithDetails[]
  pipelines: PipelineWithStages[]
  products: Product[]
  contacts: ContactWithTags[]
  tags: Tag[]
  defaultPipelineId?: string
  defaultStageId?: string
  user: User | null
}

/**
 * Main orders view component with Kanban/List toggle, filters, and pipeline tabs.
 */
export function OrdersView({
  orders,
  pipelines,
  products,
  contacts,
  tags,
  defaultPipelineId,
  defaultStageId,
  user,
}: OrdersViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // View mode (kanban default per CONTEXT.md)
  const [viewMode, setViewMode] = React.useState<OrderViewMode>('kanban')

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

  // Fuzzy search
  const { query: searchQuery, setQuery: setSearchQuery, results: searchResults } = useOrderSearch(orders)

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

  // Auto-open order detail if ?order=<id> in URL (for WhatsApp integration)
  React.useEffect(() => {
    const orderId = searchParams.get('order')
    if (orderId) {
      const order = orders.find(o => o.id === orderId)
      if (order) {
        setViewingOrder(order)
        // Clear the URL param after opening
        router.replace('/crm/pedidos', { scroll: false })
      }
    }
  }, [searchParams, router, orders])

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [orderToDelete, setOrderToDelete] = React.useState<OrderWithDetails | null>(null)

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
      }
    } finally {
      setIsBulkDeleting(false)
      setBulkDeleteDialogOpen(false)
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

  // Load saved view mode from localStorage
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
      if (saved === 'kanban' || saved === 'list') {
        setViewMode(saved)
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
    const grouped: OrdersByStage = {}
    for (const stage of stages) {
      grouped[stage.id] = filteredOrders.filter((o) => o.stage_id === stage.id)
    }
    return grouped
  }, [filteredOrders, stages])

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
      }),
    []
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
    }
    setDeleteDialogOpen(false)
    setOrderToDelete(null)
  }

  // Handle form success
  const handleFormSuccess = () => {
    setFormSheetOpen(false)
    setEditingOrder(null)
    toast.success(editingOrder ? 'Pedido actualizado' : 'Pedido creado')
    router.refresh()
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
      ) : (
    <div className="relative flex flex-col h-full p-4">
      {/* Unified Top Bar */}
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

      {/* Selection bar */}
      {selectedOrderIds.size > 0 && (
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
      )}

      {/* Results count when filtering */}
      {hasActiveFilters && selectedOrderIds.size === 0 && (
        <div className="text-sm text-muted-foreground mb-2">
          Mostrando {filteredOrders.length} de {orders.filter((o) => o.pipeline_id === activePipelineId).length} pedidos
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
            contacts={contacts}
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
