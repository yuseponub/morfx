'use client'

import * as React from 'react'
import { FilterIcon, XIcon, SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TagBadge } from '@/components/contacts/tag-badge'
import type { Tag } from '@/lib/types/database'
import { cn } from '@/lib/utils'

interface TagFilterProps {
  tags: Tag[]
  selectedTagIds: string[]
  onSelectionChange: (tagIds: string[]) => void
  onManageTags?: () => void
}

/**
 * Tag filter component for filtering contacts by tags
 * - Horizontal list of tag badges that toggle on click
 * - Multi-select (filter by ANY of selected tags)
 * - Shows count of selected tags
 * - Clear filters button
 */
export function TagFilter({
  tags,
  selectedTagIds,
  onSelectionChange,
  onManageTags,
}: TagFilterProps) {
  // Toggle a tag in the selection
  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onSelectionChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onSelectionChange([...selectedTagIds, tagId])
    }
  }

  // Clear all selected tags
  const clearFilters = () => {
    onSelectionChange([])
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tags.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FilterIcon className="h-4 w-4" />
          <span>Filtrar por etiquetas:</span>
        </div>
      )}

      {/* Tag badges */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
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
      )}

      {/* Selected count and clear button */}
      {selectedTagIds.length > 0 && (
        <div className="flex items-center gap-2 ml-2">
          <span className="text-sm text-muted-foreground">
            {selectedTagIds.length} etiqueta{selectedTagIds.length > 1 ? 's' : ''} seleccionada
            {selectedTagIds.length > 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-3 w-3 mr-1" />
            Limpiar filtros
          </Button>
        </div>
      )}

      {/* Manage tags button */}
      {onManageTags && (
        <Button
          variant="outline"
          size="sm"
          onClick={onManageTags}
          className="h-7 px-2 ml-auto"
        >
          <SettingsIcon className="h-3.5 w-3.5 mr-1" />
          Gestionar etiquetas
        </Button>
      )}
    </div>
  )
}
