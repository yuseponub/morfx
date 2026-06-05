'use client'

import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDownIcon, MoreHorizontalIcon, PackageIcon, RefreshCwIcon } from 'lucide-react'
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
import { MxTag } from '@/app/(dashboard)/whatsapp/components/mx-tag'
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
import type { OrderWithDetails } from '@/lib/orders/types'

// ============================================================================
// Editorial v3 helpers (standalone ui-redesign-editorial-core, Plan 03).
// Additive — the legacy shadcn `createColumns` below is byte-untouched.
// Tags + status use the official MxTag / mx-tag--* system, NEVER legacy
// `.tg.*` nor shadcn <Badge> (D-09).
// ============================================================================

type MxTagVariant = 'rubric' | 'gold' | 'indigo' | 'verdigris' | 'ink' | 'success'

/**
 * Map a real order Tag (name + color, no editorial category) to an editorial
 * `mx-tag--*` variant (UI-SPEC §7). Matches by normalized lowercase name; the
 * kanban-specific tokens map P/W → indigo, RECO → indigo, C/confirmado →
 * success (UI-SPEC §6.3 / §7). Falls back to `ink` (neutral) so every tag still
 * renders as a token-built pill.
 */
export function mapOrderTagVariant(tag: { name: string }): MxTagVariant {
  const name = (tag.name || '').toLowerCase().trim()
  if (name === 'p/w' || name === 'pw') return 'indigo'
  if (name === 'reco' || name === 'recompra') return 'indigo'
  if (name === 'c' || name === 'confirmado' || name === 'confirmada') return 'success'
  if (name === 'cliente' || name === 'clientes' || name === 'vip' || name === 'pagado')
    return 'gold'
  if (name === 'prospecto' || name === 'prospectos' || name === 'lead' || name === 'leads' || name === 'entregado')
    return 'indigo'
  if (name === 'mayorista' || name === 'mayoristas' || name === 'distribuidor' || name === 'wpp' || name === 'despachado')
    return 'verdigris'
  if (name === 'pendiente' || name === 'por pagar' || name === 'sin pagar' || name === 'cancelado')
    return name === 'cancelado' ? 'ink' : 'rubric'
  return 'ink'
}

/**
 * Map a pipeline stage NAME to an editorial status `mx-tag--*` variant for the
 * Estado cell of the table.dict view (UI-SPEC §6.3 / §7):
 * Pendiente/Por pagar → rubric, Confirmado → gold, Despachado → verdigris,
 * Entregado → indigo, Cancelado → ink. Falls back to `ink`.
 */
export function mapStatusVariant(stageName: string | null | undefined): MxTagVariant {
  const name = (stageName || '').toLowerCase().trim()
  if (name.includes('cancel')) return 'ink'
  if (name.includes('entreg')) return 'indigo'
  if (name.includes('despach') || name.includes('reparto') || name.includes('envi')) return 'verdigris'
  if (name.includes('confirm')) return 'gold'
  if (name.includes('pend') || name.includes('pagar') || name.includes('falta')) return 'rubric'
  return 'ink'
}

/**
 * Editorial date formatter for the `.date` cell (mono ink-3, UI-SPEC §6.3).
 * es-CO `yyyy-mm-dd`, America/Bogota (Regla 2). Mirrors the table mock.
 */
export function formatEditorialOrderDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Bogota',
  })
}

/** Render an order's tags as MxTag pills for the editorial kanban card / table. */
export function renderEditorialOrderTags(tags: Array<{ id: string; name: string }> | undefined) {
  if (!tags || tags.length === 0) return null
  return (
    <>
      {tags.slice(0, 3).map((tag) => (
        <MxTag key={tag.id} variant={mapOrderTagVariant(tag)}>
          {tag.name}
        </MxTag>
      ))}
    </>
  )
}

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
  onRecompra: (order: OrderWithDetails) => void
}

export function createColumns({
  onEdit,
  onDelete,
  onRecompra,
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
        const productTypes = detectOrderProductTypes(products)
        return (
          <div className="flex items-center gap-2">
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <span className="font-medium">{products.length}</span>
              <span className="text-muted-foreground text-sm">
                {products.length === 1 ? 'producto' : 'productos'}
              </span>
              {productTypes.length > 0 && (
                <div className="flex items-center gap-1 ml-1">
                  {productTypes.map((type) => {
                    const { label, dotColor } = PRODUCT_TYPE_COLORS[type]
                    return (
                      <span
                        key={type}
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: dotColor }}
                        title={label}
                        aria-label={`Tipo de producto: ${label}`}
                        role="img"
                      />
                    )
                  })}
                </div>
              )}
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
              <DropdownMenuItem onClick={() => onRecompra(order)}>
                <RefreshCwIcon className="mr-2 h-4 w-4" />
                Recompra
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
