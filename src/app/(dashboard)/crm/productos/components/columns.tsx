'use client'

import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDownIcon, MoreHorizontalIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Product } from '@/lib/orders/types'
import { cn } from '@/lib/utils'

// Format price as Colombian Pesos
function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

interface ColumnsProps {
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onToggleActive: (product: Product) => void
  v2?: boolean
}

export function createColumns({
  onEdit,
  onDelete,
  onToggleActive,
  v2 = false,
}: ColumnsProps): ColumnDef<Product>[] {
  const sortHeaderCn = v2
    ? 'text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-transparent'
    : ''
  const sortHeaderStyle = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const arrowCn = v2 ? 'ml-2 h-3 w-3' : 'ml-2 h-4 w-4'

  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todos"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar fila"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'sku',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className={cn('-ml-4', sortHeaderCn)}
          style={sortHeaderStyle}
        >
          SKU
          <ArrowUpDownIcon className={arrowCn} />
        </Button>
      ),
      cell: ({ row }) => (
        <span
          className={cn('font-mono', v2 ? 'text-[12px] text-[var(--ink-2)] font-medium' : 'text-sm')}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          {row.getValue('sku')}
        </span>
      ),
    },
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className={cn('-ml-4', sortHeaderCn)}
          style={sortHeaderStyle}
        >
          Titulo
          <ArrowUpDownIcon className={arrowCn} />
        </Button>
      ),
      cell: ({ row }) => (
        <span
          className={cn(v2 ? 'font-semibold text-[13px] text-[var(--ink-1)]' : 'font-medium')}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          {row.getValue('title')}
        </span>
      ),
    },
    {
      accessorKey: 'price',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className={cn('-ml-4', sortHeaderCn)}
          style={sortHeaderStyle}
        >
          Precio
          <ArrowUpDownIcon className={arrowCn} />
        </Button>
      ),
      cell: ({ row }) => {
        const price = row.getValue('price') as number
        return (
          <span
            className={cn('text-right', v2 && 'text-[13px] text-[var(--ink-1)]')}
            style={v2 ? { fontFamily: 'var(--font-mono)', fontWeight: 500 } : undefined}
          >
            {formatPrice(price)}
          </span>
        )
      },
    },
    {
      accessorKey: 'is_active',
      header: () =>
        v2 ? (
          <span
            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Estado
          </span>
        ) : (
          'Estado'
        ),
      cell: ({ row }) => {
        const isActive = row.getValue('is_active') as boolean
        if (v2) {
          return (
            <span className={isActive ? 'mx-tag mx-tag--verdigris' : 'mx-tag mx-tag--ink'}>
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
          )
        }
        return (
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        )
      },
      enableSorting: false,
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const product = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-8 w-8', v2 && 'hover:bg-[var(--paper-3)] text-[var(--ink-2)] hover:text-[var(--ink-1)]')}
              >
                <span className="sr-only">Abrir menu</span>
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className={v2 ? 'mx-smallcaps text-[var(--ink-3)]' : ''}>
                Acciones
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onEdit(product)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActive(product)}>
                {product.is_active ? 'Desactivar' : 'Activar'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(product)}
                className="text-destructive"
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}
