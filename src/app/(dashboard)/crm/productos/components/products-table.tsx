'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon, PlusIcon, PackageIcon, Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { ProductForm, productToFormData } from './product-form'
import { deleteProduct, toggleProductActive } from '@/app/actions/products'
import { toast } from 'sonner'
import { RowSelectionState } from '@tanstack/react-table'
import type { Product } from '@/lib/orders/types'

interface ProductsTableProps {
  products: Product[]
}

export function ProductsTable({ products }: ProductsTableProps) {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null)
  const [showInactive, setShowInactive] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [productToDelete, setProductToDelete] = React.useState<Product | null>(null)

  // Filter products by active status
  const filteredProducts = React.useMemo(() => {
    if (showInactive) {
      return products
    }
    return products.filter((product) => product.is_active)
  }, [products, showInactive])

  // Memoize columns to prevent infinite re-renders
  const columns = React.useMemo(
    () =>
      createColumns({
        onEdit: (product) => {
          setEditingProduct(product)
          setDialogOpen(true)
        },
        onDelete: (product) => {
          setProductToDelete(product)
          setDeleteDialogOpen(true)
        },
        onToggleActive: async (product) => {
          const result = await toggleProductActive(product.id, !product.is_active)
          if ('error' in result) {
            toast.error(result.error)
          } else {
            toast.success(
              product.is_active ? 'Producto desactivado' : 'Producto activado'
            )
            router.refresh()
          }
        },
      }),
    [router]
  )

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!productToDelete) return

    const result = await deleteProduct(productToDelete.id)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Producto eliminado')
      router.refresh()
    }
    setDeleteDialogOpen(false)
    setProductToDelete(null)
  }

  // Handle dialog close and success
  const handleDialogClose = () => {
    setDialogOpen(false)
    setEditingProduct(null)
  }

  const handleCreateSuccess = () => {
    handleDialogClose()
    toast.success(editingProduct ? 'Producto actualizado' : 'Producto creado')
    router.refresh()
  }

  // Count inactive products
  const inactiveCount = products.filter((p) => !p.is_active).length

  // Empty state
  if (products.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <PackageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Sin productos</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Agrega tu primer producto para poder incluirlo en tus pedidos.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Nuevo Producto
          </Button>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Nuevo producto</DialogTitle>
              <DialogDescription>
                Ingresa los datos del nuevo producto
              </DialogDescription>
            </DialogHeader>
            <ProductForm mode="create" onSuccess={handleCreateSuccess} />
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por titulo o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="gap-2"
          >
            {showInactive ? (
              <>
                <EyeOff className="h-4 w-4" />
                Ocultar inactivos
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Mostrar inactivos ({inactiveCount})
              </>
            )}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={filteredProducts}
        onRowSelectionChange={setRowSelection}
        searchColumn="title"
        searchValue={search}
      />

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Editar producto' : 'Nuevo producto'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? 'Actualiza la informacion del producto'
                : 'Ingresa los datos del nuevo producto'}
            </DialogDescription>
          </DialogHeader>
          <ProductForm
            mode={editingProduct ? 'edit' : 'create'}
            defaultValues={editingProduct ? productToFormData(editingProduct) : undefined}
            productId={editingProduct?.id}
            onSuccess={handleCreateSuccess}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro que deseas eliminar el producto &quot;{productToDelete?.title}&quot;?
              Esta accion no se puede deshacer.
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
