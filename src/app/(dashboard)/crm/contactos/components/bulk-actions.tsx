'use client'

import { TagIcon, TrashIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'
import type { Tag } from '@/lib/types/database'
import { getContrastColor } from '@/lib/data/tag-colors'

interface BulkActionsProps {
  selectedCount: number
  tags: Tag[]
  onAddTag: (tagId: string) => void
  onRemoveTag: (tagId: string) => void
  onDelete: () => void
  onClearSelection: () => void
}

export function BulkActions({
  selectedCount,
  tags,
  onAddTag,
  onRemoveTag,
  onDelete,
  onClearSelection,
}: BulkActionsProps) {
  const v2 = useDashboardV2()
  if (selectedCount === 0) return null

  // Preserve getContrastColor import for potential future usage (Regla 6 / D-DASH-07)
  void getContrastColor

  const portalContainer =
    v2 && typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]')
      : undefined

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2',
        v2
          ? 'bg-[var(--paper-2)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]'
          : 'bg-muted/50 border rounded-lg'
      )}
    >
      <span
        className={cn(
          'text-sm font-medium',
          v2 && 'text-[var(--ink-1)] uppercase tracking-[0.08em] text-[11px] font-semibold'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        {selectedCount} seleccionado{selectedCount > 1 ? 's' : ''}
      </span>

      <div className={cn('h-4 w-px mx-2', v2 ? 'bg-[var(--ink-1)]' : 'bg-border')} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
          >
            <TagIcon className="mr-2 h-4 w-4" />
            Agregar tag
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" portalContainer={portalContainer}>
          {tags.length === 0 ? (
            <DropdownMenuItem disabled>No hay tags disponibles</DropdownMenuItem>
          ) : (
            tags.map((tag) => (
              <DropdownMenuItem
                key={tag.id}
                onClick={() => onAddTag(tag.id)}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
          >
            <XIcon className="mr-2 h-4 w-4" />
            Quitar tag
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" portalContainer={portalContainer}>
          {tags.length === 0 ? (
            <DropdownMenuItem disabled>No hay tags disponibles</DropdownMenuItem>
          ) : (
            tags.map((tag) => (
              <DropdownMenuItem
                key={tag.id}
                onClick={() => onRemoveTag(tag.id)}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        onClick={onDelete}
        className={v2 ? 'border-[var(--rubric-2)] text-[var(--rubric-2)] bg-[var(--paper-0)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--rubric-2)]' : 'text-destructive hover:text-destructive'}
      >
        <TrashIcon className="mr-2 h-4 w-4" />
        Eliminar
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className={cn('ml-auto', v2 && 'text-[var(--ink-2)] hover:text-[var(--ink-1)]')}
      >
        Limpiar seleccion
      </Button>
    </div>
  )
}
