'use client'

import * as React from 'react'
import { SearchIcon, XIcon, FilterIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { PipelineStage } from '@/lib/orders/types'
import type { Tag } from '@/lib/types/database'

interface OrderFiltersProps {
  /** Search query value */
  searchQuery: string
  /** Update search query */
  onSearchChange: (query: string) => void
  /** Available stages from active pipeline */
  stages: PipelineStage[]
  /** Selected stage ID filter */
  selectedStageId: string | null
  /** Update stage filter */
  onStageChange: (stageId: string | null) => void
  /** Available tags */
  tags: Tag[]
  /** Selected tag IDs filter */
  selectedTagIds: string[]
  /** Update tag filter */
  onTagsChange: (tagIds: string[]) => void
  /** Whether any filters are active */
  hasActiveFilters: boolean
  /** Clear all filters */
  onClearFilters: () => void
  /** Total count for display */
  totalCount: number
  /** Filtered count for display */
  filteredCount: number
  className?: string
}

/**
 * Filter bar for orders with search, stage filter, and tag filter.
 * Works with both Kanban and List views.
 */
export function OrderFilters({
  searchQuery,
  onSearchChange,
  stages,
  selectedStageId,
  onStageChange,
  tags,
  selectedTagIds,
  onTagsChange,
  hasActiveFilters,
  onClearFilters,
  totalCount,
  filteredCount,
  className,
}: OrderFiltersProps) {
  // Toggle a tag in the selection
  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onTagsChange([...selectedTagIds, tagId])
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Primary filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por contacto, producto, guia..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
            >
              <XIcon className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Stage filter */}
        <Select
          value={selectedStageId || 'all'}
          onValueChange={(value) => onStageChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las etapas</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-muted-foreground"
          >
            <XIcon className="h-4 w-4 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Tag filters row */}
      {tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FilterIcon className="h-4 w-4" />
            <span>Etiquetas:</span>
          </div>
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
          {selectedTagIds.length > 0 && (
            <span className="text-sm text-muted-foreground ml-2">
              {selectedTagIds.length} seleccionada{selectedTagIds.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Results count */}
      {hasActiveFilters && (
        <div className="text-sm text-muted-foreground">
          Mostrando {filteredCount} de {totalCount} pedidos
        </div>
      )}
    </div>
  )
}
