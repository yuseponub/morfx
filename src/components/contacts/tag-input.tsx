'use client'

import * as React from 'react'
import { PlusIcon, CheckIcon } from 'lucide-react'
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
  CommandSeparator,
} from '@/components/ui/command'
import { TagBadge } from './tag-badge'
import { addTagToContact, removeTagFromContact } from '@/app/actions/contacts'
import { createTag } from '@/app/actions/tags'
import { toast } from 'sonner'
import { DEFAULT_TAG_COLOR } from '@/lib/data/tag-colors'
import type { Tag } from '@/lib/types/database'

interface TagInputProps {
  contactId: string
  currentTags: Tag[]
  availableTags: Tag[]
}

/**
 * Tag input component for managing contact tags
 * - Autocomplete from availableTags
 * - Create new tag inline (type name + Enter)
 * - Remove tag by clicking X
 * - Optimistic updates with revert on error
 */
export function TagInput({ contactId, currentTags, availableTags }: TagInputProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [optimisticTags, setOptimisticTags] = React.useState<Tag[]>(currentTags)
  const [isCreating, setIsCreating] = React.useState(false)

  // Sync optimistic tags with actual tags when they change
  React.useEffect(() => {
    setOptimisticTags(currentTags)
  }, [currentTags])

  // Get tags that are not currently assigned to this contact
  const unassignedTags = availableTags.filter(
    (tag) => !optimisticTags.some((t) => t.id === tag.id)
  )

  // Filter by search term
  const filteredTags = unassignedTags.filter((tag) =>
    tag.name.toLowerCase().includes(search.toLowerCase())
  )

  // Check if the search term matches an existing tag name exactly
  const exactMatch = availableTags.some(
    (tag) => tag.name.toLowerCase() === search.toLowerCase()
  )

  // Handle adding a tag
  const handleAddTag = async (tag: Tag) => {
    // Optimistic update
    setOptimisticTags((prev) => [...prev, tag])
    setOpen(false)
    setSearch('')

    const result = await addTagToContact(contactId, tag.id)
    if ('error' in result) {
      // Revert on error
      setOptimisticTags((prev) => prev.filter((t) => t.id !== tag.id))
      toast.error(result.error)
    } else {
      toast.success(`Etiqueta "${tag.name}" agregada`)
    }
  }

  // Handle removing a tag
  const handleRemoveTag = async (tag: Tag) => {
    // Optimistic update
    setOptimisticTags((prev) => prev.filter((t) => t.id !== tag.id))

    const result = await removeTagFromContact(contactId, tag.id)
    if ('error' in result) {
      // Revert on error
      setOptimisticTags((prev) => [...prev, tag])
      toast.error(result.error)
    } else {
      toast.success(`Etiqueta "${tag.name}" removida`)
    }
  }

  // Handle creating a new tag
  const handleCreateTag = async () => {
    if (!search.trim() || exactMatch) return

    setIsCreating(true)
    const formData = new FormData()
    formData.set('name', search.trim())
    formData.set('color', DEFAULT_TAG_COLOR)

    const result = await createTag(formData)
    setIsCreating(false)

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    // Tag created, now add it to the contact
    const newTag = result.data
    setOptimisticTags((prev) => [...prev, newTag])
    setOpen(false)
    setSearch('')

    const addResult = await addTagToContact(contactId, newTag.id)
    if ('error' in addResult) {
      setOptimisticTags((prev) => prev.filter((t) => t.id !== newTag.id))
      toast.error(addResult.error)
    } else {
      toast.success(`Etiqueta "${newTag.name}" creada y agregada`)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Current tags */}
      {optimisticTags.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag}
          onRemove={() => handleRemoveTag(tag)}
          size="md"
        />
      ))}

      {/* Add tag popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 border-dashed"
          >
            <PlusIcon className="mr-1 h-3 w-3" />
            Agregar
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar o crear etiqueta..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {search.trim() && !exactMatch ? (
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    disabled={isCreating}
                    className="flex w-full items-center justify-center gap-2 px-4 py-3 text-sm hover:bg-accent"
                  >
                    <PlusIcon className="h-4 w-4" />
                    {isCreating ? 'Creando...' : `Crear "${search.trim()}"`}
                  </button>
                ) : (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    Escribe para crear una etiqueta
                  </p>
                )}
              </CommandEmpty>
              {filteredTags.length > 0 && (
                <CommandGroup heading="Etiquetas">
                  {filteredTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.id}
                      onSelect={() => handleAddTag(tag)}
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
              )}
              {search.trim() && !exactMatch && filteredTags.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={handleCreateTag}
                      disabled={isCreating}
                      className="flex items-center gap-2"
                    >
                      <PlusIcon className="h-4 w-4" />
                      {isCreating ? 'Creando...' : `Crear "${search.trim()}"`}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
