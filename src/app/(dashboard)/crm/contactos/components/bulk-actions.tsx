'use client'

import { TagIcon, TrashIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  if (selectedCount === 0) return null

  return (
    <div className="flex items-center gap-2 bg-muted/50 border rounded-lg px-4 py-2">
      <span className="text-sm font-medium">
        {selectedCount} seleccionado{selectedCount > 1 ? 's' : ''}
      </span>

      <div className="h-4 w-px bg-border mx-2" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <TagIcon className="mr-2 h-4 w-4" />
            Agregar tag
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
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
          <Button variant="outline" size="sm">
            <XIcon className="mr-2 h-4 w-4" />
            Quitar tag
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
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
        className="text-destructive hover:text-destructive"
      >
        <TrashIcon className="mr-2 h-4 w-4" />
        Eliminar
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="ml-auto"
      >
        Limpiar seleccion
      </Button>
    </div>
  )
}
