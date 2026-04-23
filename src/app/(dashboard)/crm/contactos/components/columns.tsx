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
import { cn } from '@/lib/utils'

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
  v2?: boolean
}

export function createColumns({
  onEdit,
  onDelete,
  onViewDetail,
  v2 = false,
}: ColumnsProps): ColumnDef<ContactWithTags>[] {
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
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className={cn('-ml-4', sortHeaderCn)}
          style={sortHeaderStyle}
        >
          Nombre
          <ArrowUpDownIcon className={arrowCn} />
        </Button>
      ),
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onViewDetail(row.original)}
          className={cn(
            'text-left cursor-pointer',
            v2
              ? 'font-semibold text-[13px] text-[var(--ink-1)] hover:text-[var(--rubric-2)] transition-colors'
              : 'font-medium hover:underline hover:text-primary'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          {row.getValue('name')}
        </button>
      ),
    },
    {
      accessorKey: 'phone',
      header: () =>
        v2 ? (
          <span
            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Teléfono
          </span>
        ) : (
          'Telefono'
        ),
      cell: ({ row }) => {
        const phone = row.getValue('phone') as string
        return (
          <div
            className={v2 ? 'text-[12px] text-[var(--ink-2)] font-medium' : 'text-muted-foreground'}
            style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
          >
            {formatPhoneDisplay(phone)}
          </div>
        )
      },
    },
    {
      accessorKey: 'address',
      header: () =>
        v2 ? (
          <span
            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Dirección
          </span>
        ) : (
          'Direccion'
        ),
      cell: ({ row }) => {
        const address = row.getValue('address') as string | null
        if (!address) {
          return (
            <span className={v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'}>-</span>
          )
        }
        return (
          <div
            className={cn('max-w-[200px] truncate', v2 ? 'text-[13px] text-[var(--ink-2)]' : 'text-sm')}
            title={address}
          >
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
          className={cn('-ml-4', sortHeaderCn)}
          style={sortHeaderStyle}
        >
          Ciudad
          <ArrowUpDownIcon className={arrowCn} />
        </Button>
      ),
      cell: ({ row }) => {
        const cityValue = row.getValue('city') as string | null
        if (!cityValue) {
          return (
            <span className={v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'}>-</span>
          )
        }

        const city = getCityByValue(cityValue)
        return city ? (
          <div className={v2 ? 'text-[13px] text-[var(--ink-3)]' : 'text-sm'}>{city.label}</div>
        ) : (
          <div className={v2 ? 'text-[13px] text-[var(--ink-3)]' : 'text-sm'}>{cityValue}</div>
        )
      },
    },
    {
      accessorKey: 'department',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className={cn('-ml-4', sortHeaderCn)}
          style={sortHeaderStyle}
        >
          Departamento
          <ArrowUpDownIcon className={arrowCn} />
        </Button>
      ),
      cell: ({ row }) => {
        const department = row.original.department
        if (!department) {
          return (
            <span className={v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'}>-</span>
          )
        }
        return (
          <span className={v2 ? 'text-[13px] text-[var(--ink-3)]' : 'text-sm'}>{department}</span>
        )
      },
    },
    {
      accessorKey: 'tags',
      header: () =>
        v2 ? (
          <span
            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Etiquetas
          </span>
        ) : (
          'Etiquetas'
        ),
      cell: ({ row }) => {
        const tags = row.original.tags
        if (!tags || tags.length === 0) {
          return (
            <span className={cn('text-sm', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}>-</span>
          )
        }

        return (
          <div className="flex gap-1 flex-wrap max-w-[200px]">
            {tags.slice(0, 3).map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
            {tags.length > 3 &&
              (v2 ? (
                <span className="mx-tag mx-tag--ink">+{tags.length - 3}</span>
              ) : (
                <span className="text-muted-foreground text-xs">
                  +{tags.length - 3}
                </span>
              ))}
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
          className={cn('-ml-4', sortHeaderCn)}
          style={sortHeaderStyle}
        >
          Actualizado
          <ArrowUpDownIcon className={arrowCn} />
        </Button>
      ),
      cell: ({ row }) => {
        const date = row.getValue('updated_at') as string
        return (
          <div
            className={cn(v2 ? 'text-[12px] text-[var(--ink-3)]' : 'text-muted-foreground text-sm')}
            style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
          >
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
