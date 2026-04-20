'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { Plus, X, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TagBadge } from '@/components/contacts/tag-badge'
import { createTag, getTagsForScope } from '@/app/actions/tags'
import { addTagToConversation, removeTagFromConversation } from '@/app/actions/conversations'
import { TAG_COLORS, DEFAULT_TAG_COLOR, getContrastColor } from '@/lib/data/tag-colors'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ConversationTagInputProps {
  /** Conversation ID to manage tags for */
  conversationId: string
  /** Contact ID linked to this conversation (null = no contact linked) */
  contactId: string | null
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
 * Tag input for managing contact tags via conversation.
 * Shows only tags with applies_to = 'whatsapp' or 'both'.
 * When no contact is linked (contactId=null), shows disabled state.
 * Allows inline tag creation (applies_to='whatsapp') via a quick dialog.
 */
export function ConversationTagInput({
  conversationId,
  contactId,
  currentTags,
  onTagsChange,
  disabled = false,
  compact = false,
}: ConversationTagInputProps) {
  const isDisabled = disabled || !contactId
  const [open, setOpen] = useState(false)
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [commandQuery, setCommandQuery] = useState('')

  // Inline tag creation state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLOR)
  const [isCreatingTag, setIsCreatingTag] = useState(false)

  // Load available tags (filtered by scope)
  const refreshTags = useCallback(async () => {
    setIsLoading(true)
    try {
      const tags = await getTagsForScope('whatsapp')
      setAvailableTags(tags)
    } catch (error) {
      console.error('Error loading tags:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshTags()
  }, [refreshTags])

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

  // Open create dialog — prefill name with whatever user typed in the command input
  const openCreateDialog = () => {
    setNewTagName(commandQuery.trim())
    setNewTagColor(DEFAULT_TAG_COLOR)
    setOpen(false)
    setCreateDialogOpen(true)
  }

  const resetCreateState = () => {
    setNewTagName('')
    setNewTagColor(DEFAULT_TAG_COLOR)
    setCommandQuery('')
  }

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newTagName.trim()
    if (!name || isCreatingTag) return

    setIsCreatingTag(true)
    const formData = new FormData()
    formData.set('name', name)
    formData.set('color', newTagColor)
    formData.set('applies_to', 'whatsapp')

    const result = await createTag(formData)

    if ('error' in result) {
      setIsCreatingTag(false)
      toast.error(result.error)
      return
    }

    // Tag created — auto-apply to this conversation
    const applyResult = await addTagToConversation(conversationId, result.data.id)
    setIsCreatingTag(false)

    if ('error' in applyResult) {
      toast.error(`Etiqueta creada pero no se pudo aplicar: ${applyResult.error}`)
    } else {
      toast.success(`Etiqueta "${name}" creada y aplicada`)
    }

    await refreshTags()
    onTagsChange?.()
    setCreateDialogOpen(false)
    resetCreateState()
  }

  // Shared "+ Crear nueva etiqueta" item for both modes
  const createItemLabel = commandQuery.trim()
    ? `+ Crear "${commandQuery.trim()}"`
    : '+ Crear nueva etiqueta'

  const renderCreateItem = () => (
    <>
      <CommandSeparator />
      <CommandGroup>
        <CommandItem
          onSelect={openCreateDialog}
          className="flex items-center gap-2 text-primary"
          value={`__create__${commandQuery}`}
        >
          <Plus className="h-3 w-3" />
          {createItemLabel}
        </CommandItem>
      </CommandGroup>
    </>
  )

  // Shared create-tag dialog
  const createDialog = (
    <Dialog
      open={createDialogOpen}
      onOpenChange={(next) => {
        setCreateDialogOpen(next)
        if (!next) resetCreateState()
      }}
    >
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Crear nueva etiqueta</DialogTitle>
          <DialogDescription>
            Se aplicara automaticamente a esta conversacion.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreateTag} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-tag-name">Nombre</Label>
            <Input
              id="quick-tag-name"
              placeholder="Ej: Interesado, VIP, Reclamo"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              autoFocus
              disabled={isCreatingTag}
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setNewTagColor(color.value)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-all',
                    newTagColor === color.value
                      ? 'border-foreground ring-2 ring-offset-2 ring-foreground/30'
                      : 'border-transparent hover:scale-110'
                  )}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                  aria-label={color.name}
                  disabled={isCreatingTag}
                />
              ))}
            </div>
          </div>

          {newTagName.trim() && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Vista previa:</span>
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: newTagColor,
                  color: getContrastColor(newTagColor),
                }}
              >
                {newTagName.trim()}
              </span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreateDialogOpen(false)
                resetCreateState()
              }}
              disabled={isCreatingTag}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!newTagName.trim() || isCreatingTag}>
              {isCreatingTag ? 'Creando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-1">
          {/* No contact linked message */}
          {!contactId && currentTags.length === 0 && (
            <span className="text-xs text-muted-foreground">Vincular contacto primero</span>
          )}
          {/* Current tags as small badges */}
          {currentTags.slice(0, 3).map((tag) => (
            <div key={tag.id} className="group relative">
              <TagBadge tag={tag} size="sm" />
              {!isDisabled && (
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
          {!isDisabled && (
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
              <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar etiqueta..."
                    value={commandQuery}
                    onValueChange={setCommandQuery}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {isLoading ? 'Cargando...' : 'Sin etiquetas disponibles'}
                    </CommandEmpty>
                    {unassignedTags.length > 0 && (
                      <CommandGroup>
                        {unassignedTags.map((tag) => (
                          <CommandItem
                            key={tag.id}
                            onSelect={() => handleAddTag(tag.id)}
                            className="flex items-center gap-2"
                            value={tag.name}
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
                    {renderCreateItem()}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {createDialog}
      </>
    )
  }

  // Full mode (for larger displays)
  return (
    <>
      <div className="space-y-2">
        {/* Current tags */}
        {currentTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {currentTags.map((tag) => (
              <div key={tag.id} className="group relative inline-flex">
                <TagBadge tag={tag} size="sm" />
                {!isDisabled && (
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
        {!isDisabled && (
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
            <PopoverContent className="w-[220px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Buscar etiqueta..."
                  value={commandQuery}
                  onValueChange={setCommandQuery}
                />
                <CommandList>
                  <CommandEmpty>
                    {isLoading ? 'Cargando...' : 'Sin etiquetas disponibles'}
                  </CommandEmpty>
                  {unassignedTags.length > 0 && (
                    <CommandGroup>
                      {unassignedTags.map((tag) => (
                        <CommandItem
                          key={tag.id}
                          onSelect={() => handleAddTag(tag.id)}
                          className="flex items-center gap-2"
                          value={tag.name}
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
                  {renderCreateItem()}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {createDialog}
    </>
  )
}
