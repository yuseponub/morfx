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
import { addTagToConversation, removeTagFromConversation } from '@/app/actions/conversations'
import { toast } from 'sonner'

interface ConversationTagInputProps {
  /** Conversation ID to manage tags for */
  conversationId: string
  /** Currently applied tags */
  currentTags: Array<{ id: string; name: string; color: string }>
  /** Callback when tags change */
  onTagsChange?: () => void
  /** Whether the input is disabled */
  disabled?: boolean
  /** Compact mode for header display */
  compact?: boolean
}

/**
 * Tag input for managing conversation-specific tags.
 * Shows only tags with applies_to = 'whatsapp' or 'both'.
 */
export function ConversationTagInput({
  conversationId,
  currentTags,
  onTagsChange,
  disabled = false,
  compact = false,
}: ConversationTagInputProps) {
  const [open, setOpen] = useState(false)
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Load available tags (filtered by scope)
  useEffect(() => {
    async function loadTags() {
      setIsLoading(true)
      try {
        const tags = await getTagsForScope('whatsapp')
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
      const result = await addTagToConversation(conversationId, tagId)

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
      const result = await removeTagFromConversation(conversationId, tagId)

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Etiqueta eliminada')
      onTagsChange?.()
    })
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {/* Current tags as small badges */}
        {currentTags.slice(0, 3).map((tag) => (
          <div key={tag.id} className="group relative">
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
        {currentTags.length > 3 && (
          <span className="text-xs text-muted-foreground">+{currentTags.length - 3}</span>
        )}

        {/* Add tag button */}
        {!disabled && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={isPending}
              >
                <Plus className="h-3 w-3" />
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

  // Full mode (for larger displays)
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
