'use client'

import { useState, useEffect, useTransition } from 'react'
import { Plus, X, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { TagBadge } from '@/components/contacts/tag-badge'
import { getTagsForScope } from '@/app/actions/tags'
import { addOrderTag, removeOrderTag } from '@/app/actions/orders'
import { toast } from 'sonner'

interface OrderTagInputProps {
  /** Order ID to manage tags for */
  orderId: string
  /** Currently applied tags */
  currentTags: Array<{ id: string; name: string; color: string }>
  /** Callback when tags change */
  onTagsChange?: () => void
  /** Whether the input is disabled */
  disabled?: boolean
}

/**
 * Tag input for managing order tags.
 * Shows only tags with applies_to = 'orders' or 'both'.
 */
export function OrderTagInput({
  orderId,
  currentTags,
  onTagsChange,
  disabled = false,
}: OrderTagInputProps) {
  const [open, setOpen] = useState(false)
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Load available tags (filtered by scope)
  useEffect(() => {
    async function loadTags() {
      setIsLoading(true)
      try {
        const tags = await getTagsForScope('orders')
        setAvailableTags(tags)
      } catch (error) {
        console.error('Error loading tags:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadTags()
  }, [])

  // Filter out already applied tags
  const unassignedTags = availableTags.filter(
    tag => !currentTags.some(ct => ct.id === tag.id)
  )

  const handleAddTag = (tagId: string) => {
    startTransition(async () => {
      const result = await addOrderTag(orderId, tagId)

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Etiqueta agregada')
      onTagsChange?.()
      setOpen(false)
    })
  }

  const handleRemoveTag = (tagId: string) => {
    startTransition(async () => {
      const result = await removeOrderTag(orderId, tagId)

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Etiqueta eliminada')
      onTagsChange?.()
    })
  }

  return (
    <div className="space-y-2">
      {/* Current tags */}
      {currentTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {currentTags.map((tag) => (
            <div key={tag.id} className="group relative inline-flex">
              <TagBadge tag={tag} size="sm" />
              {!disabled && (
                <button
                  onClick={() => handleRemoveTag(tag.id)}
                  className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                  disabled={isPending}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add tag popover */}
      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start"
              disabled={isPending}
            >
              <Tag className="mr-2 h-4 w-4" />
              Agregar etiqueta
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar etiqueta..." />
              <CommandList>
                <CommandEmpty>
                  {isLoading ? 'Cargando...' : 'Sin etiquetas disponibles'}
                </CommandEmpty>
                <CommandGroup>
                  {unassignedTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      onSelect={() => handleAddTag(tag.id)}
                      className="flex items-center gap-2"
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
