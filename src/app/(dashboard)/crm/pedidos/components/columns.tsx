'use client'

import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDownIcon, MoreHorizontalIcon, PackageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TagBadge } from '@/components/contacts/tag-badge'
import type { OrderWithDetails } from '@/lib/orders/types'

// Format currency in COP
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)
}

// Format relative time
function formatRelativeTime(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Ahora'
  if (diffMins < 60) return `Hace ${diffMins} min`
  if (diffHours < 24) return `Hace ${diffHours}h`
  if (diffDays < 7) return `Hace ${diffDays}d`

  return then.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  })
}

interface ColumnsProps {
  onEdit: (order: OrderWithDetails) => void
  onDelete: (order: OrderWithDetails) => void
}

export function createColumns({
  onEdit,
  onDelete,
}: ColumnsProps): ColumnDef<OrderWithDetails>[] {
  return [
    {
      accessorKey: 'contact',
      header: 'Contacto',
      cell: ({ row }) => {
        const contact = row.original.contact
        if (!contact) {
          return <span className="text-muted-foreground">Sin contacto</span>
        }
        return (
          <div>
            <div className="font-medium">{contact.name}</div>
            <div className="text-sm text-muted-foreground">{contact.phone}</div>
          </div>
        )
      },
      filterFn: (row, _columnId, filterValue: string) => {
        const contact = row.original.contact
        if (!contact) return false
        const searchValue = filterValue.toLowerCase()
        return (
          contact.name.toLowerCase().includes(searchValue) ||
          contact.phone.toLowerCase().includes(searchValue) ||
          (row.original.tracking_number?.toLowerCase().includes(searchValue) ?? false)
        )
      },
    },
    {
      accessorKey: 'total_value',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Valor
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue('total_value') as number
        return <div className="font-medium">{formatCurrency(value)}</div>
      },
    },
    {
      accessorKey: 'stage',
      header: 'Etapa',
      cell: ({ row }) => {
        const stage = row.original.stage
        return (
          <div
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${stage.color}20`,
              color: stage.color,
            }}
          >
            {stage.name}
          </div>
        )
      },
      filterFn: (row, _columnId, filterValue: string) => {
        return row.original.stage_id === filterValue
      },
    },
    {
      accessorKey: 'pipeline',
      header: 'Pipeline',
      cell: ({ row }) => {
        const pipeline = row.original.pipeline
        return <div className="text-sm">{pipeline.name}</div>
      },
      filterFn: (row, _columnId, filterValue: string) => {
        return row.original.pipeline_id === filterValue
      },
    },
    {
      accessorKey: 'products',
      header: 'Productos',
      cell: ({ row }) => {
        const products = row.original.products
        if (!products || products.length === 0) {
          return <span className="text-muted-foreground">-</span>
        }
        return (
          <div className="flex items-center gap-2">
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="font-medium">{products.length}</span>
              <span className="text-muted-foreground text-sm ml-1">
                {products.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'tracking_number',
      header: 'Guia',
      cell: ({ row }) => {
        const tracking = row.original.tracking_number
        const carrier = row.original.carrier
        if (!tracking) {
          return <span className="text-muted-foreground">-</span>
        }
        return (
          <div>
            <div className="font-mono text-sm">{tracking}</div>
            {carrier && (
              <div className="text-xs text-muted-foreground">{carrier}</div>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'tags',
      header: 'Etiquetas',
      cell: ({ row }) => {
        const tags = row.original.tags
        if (!tags || tags.length === 0) {
          return <span className="text-muted-foreground text-sm">-</span>
        }
        return (
          <div className="flex gap-1 flex-wrap max-w-[150px]">
            {tags.slice(0, 2).map((tag) => (
              <TagBadge key={tag.id} tag={tag} size="sm" />
            ))}
            {tags.length > 2 && (
              <span className="text-muted-foreground text-xs">
                +{tags.length - 2}
              </span>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Fecha
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = row.getValue('created_at') as string
        return (
          <div className="text-muted-foreground text-sm">
            {formatRelativeTime(date)}
          </div>
        )
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const order = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <span className="sr-only">Abrir menu</span>
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onEdit(order)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(order)}
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
