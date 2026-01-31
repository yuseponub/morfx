'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon, PlusIcon, ShoppingCartIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
} from '@/components/ui/alert-dialog'
import { createColumns } from './columns'
import { OrderForm } from './order-form'
import { deleteOrder } from '@/app/actions/orders'
import { toast } from 'sonner'
import { RowSelectionState } from '@tanstack/react-table'
import type { OrderWithDetails, PipelineWithStages, Product } from '@/lib/orders/types'
import type { ContactWithTags, Tag } from '@/lib/types/database'

interface OrdersTableProps {
  orders: OrderWithDetails[]
  pipelines: PipelineWithStages[]
  products: Product[]
  contacts: ContactWithTags[]
  tags: Tag[]
  defaultPipelineId?: string
  defaultStageId?: string
}

export function OrdersTable({
  orders,
  pipelines,
  products,
  contacts,
  tags,
  defaultPipelineId,
  defaultStageId,
}: OrdersTableProps) {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editingOrder, setEditingOrder] = React.useState<OrderWithDetails | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [orderToDelete, setOrderToDelete] = React.useState<OrderWithDetails | null>(null)

  // Filters
  const [pipelineFilter, setPipelineFilter] = React.useState<string>('all')
  const [stageFilter, setStageFilter] = React.useState<string>('all')

  // Get stages for selected pipeline filter
  const filteredPipelineStages = React.useMemo(() => {
    if (pipelineFilter === 'all') {
      return pipelines.flatMap((p) => p.stages)
    }
    const pipeline = pipelines.find((p) => p.id === pipelineFilter)
    return pipeline?.stages || []
  }, [pipelines, pipelineFilter])

  // Filter orders by pipeline, stage, and search
  const filteredOrders = React.useMemo(() => {
    return orders.filter((order) => {
      // Pipeline filter
      if (pipelineFilter !== 'all' && order.pipeline_id !== pipelineFilter) {
        return false
      }
      // Stage filter
      if (stageFilter !== 'all' && order.stage_id !== stageFilter) {
        return false
      }
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const contactMatch = order.contact?.name.toLowerCase().includes(searchLower) ||
          order.contact?.phone.includes(search)
        const trackingMatch = order.tracking_number?.toLowerCase().includes(searchLower)
        return contactMatch || trackingMatch
      }
      return true
    })
  }, [orders, pipelineFilter, stageFilter, search])

  // Memoize columns to prevent infinite re-renders
  const columns = React.useMemo(
    () =>
      createColumns({
        onEdit: (order) => {
          setEditingOrder(order)
          setSheetOpen(true)
        },
        onDelete: (order) => {
          setOrderToDelete(order)
          setDeleteDialogOpen(true)
        },
      }),
    []
  )

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

  // Handle sheet close and success
  const handleSheetClose = () => {
    setSheetOpen(false)
    setEditingOrder(null)
  }

  const handleFormSuccess = () => {
    handleSheetClose()
    toast.success(editingOrder ? 'Pedido actualizado' : 'Pedido creado')
    router.refresh()
  }

  // Reset stage filter when pipeline changes
  React.useEffect(() => {
    setStageFilter('all')
  }, [pipelineFilter])

  // Empty state
  if (orders.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ShoppingCartIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Sin pedidos</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Crea tu primer pedido para comenzar a gestionar tus ventas.
          </p>
          <Button onClick={() => setSheetOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Nuevo Pedido
          </Button>
        </div>

        <Sheet open={sheetOpen} onOpenChange={handleSheetClose}>
          <SheetContent className="sm:max-w-[600px] p-0 flex flex-col">
            <SheetHeader className="px-6 pt-6 pb-4 border-b">
              <SheetTitle>Nuevo pedido</SheetTitle>
              <SheetDescription>
                Crea un nuevo pedido con contacto y productos
              </SheetDescription>
            </SheetHeader>
            <OrderForm
              mode="create"
              pipelines={pipelines}
              products={products}
              contacts={contacts}
              defaultPipelineId={defaultPipelineId}
              defaultStageId={defaultStageId}
              onSuccess={handleFormSuccess}
              onCancel={handleSheetClose}
            />
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por contacto o guia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pipelines</SelectItem>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las etapas</SelectItem>
              {filteredPipelineStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    {stage.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => setSheetOpen(true)} className="ml-auto">
          <PlusIcon className="h-4 w-4 mr-2" />
          Nuevo Pedido
        </Button>
      </div>

      {/* Results count */}
      {(pipelineFilter !== 'all' || stageFilter !== 'all' || search) && (
        <div className="text-sm text-muted-foreground">
          Mostrando {filteredOrders.length} de {orders.length} pedidos
        </div>
      )}

      {/* Data table */}
      <DataTable
        columns={columns}
        data={filteredOrders}
        onRowSelectionChange={setRowSelection}
        searchColumn="contact"
        searchValue={search}
      />

      {/* Create/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={handleSheetClose}>
        <SheetContent className="sm:max-w-[600px] p-0 flex flex-col">
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
            onSuccess={handleFormSuccess}
            onCancel={handleSheetClose}
          />
        </SheetContent>
      </Sheet>

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
    </div>
  )
}
