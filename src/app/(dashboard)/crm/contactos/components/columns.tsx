'use client'

import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDownIcon, MoreHorizontalIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ContactWithTags } from '@/lib/types/database'
import { formatPhoneDisplay } from '@/lib/utils/phone'
import { getCityByValue } from '@/lib/data/colombia-cities'
import { TagBadge } from '@/components/contacts/tag-badge'

// Format relative time (e.g., "hace 2 horas")
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
  onEdit: (contact: ContactWithTags) => void
  onDelete: (contact: ContactWithTags) => void
  onViewDetail: (contact: ContactWithTags) => void
}

export function createColumns({
  onEdit,
  onDelete,
  onViewDetail,
}: ColumnsProps): ColumnDef<ContactWithTags>[] {
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
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Nombre
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onViewDetail(row.original)}
          className="font-medium text-left hover:underline hover:text-primary cursor-pointer"
        >
          {row.getValue('name')}
        </button>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Telefono',
      cell: ({ row }) => {
        const phone = row.getValue('phone') as string
        return (
          <div className="text-muted-foreground">
            {formatPhoneDisplay(phone)}
          </div>
        )
      },
    },
    {
      accessorKey: 'address',
      header: 'Direccion',
      cell: ({ row }) => {
        const address = row.getValue('address') as string | null
        if (!address) return <span className="text-muted-foreground">-</span>
        return (
          <div className="text-sm max-w-[200px] truncate" title={address}>
            {address}
          </div>
        )
      },
    },
    {
      accessorKey: 'city',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Ciudad
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const cityValue = row.getValue('city') as string | null
        if (!cityValue) return <span className="text-muted-foreground">-</span>

        const city = getCityByValue(cityValue)
        return city ? (
          <div className="text-sm">{city.label}</div>
        ) : (
          <div className="text-sm">{cityValue}</div>
        )
      },
    },
    {
      accessorKey: 'department',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Departamento
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const department = row.original.department
        if (!department) return <span className="text-muted-foreground">-</span>
        return <span className="text-sm">{department}</span>
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
          <div className="flex gap-1 flex-wrap max-w-[200px]">
            {tags.slice(0, 3).map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
            {tags.length > 3 && (
              <span className="text-muted-foreground text-xs">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'updated_at',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Actualizado
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = row.getValue('updated_at') as string
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
        const contact = row.original

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
              <DropdownMenuItem onClick={() => onViewDetail(contact)}>
                Ver detalles
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(contact)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(contact)}
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
