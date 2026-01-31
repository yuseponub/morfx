'use client'

import * as React from 'react'
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TAG_COLORS, DEFAULT_TAG_COLOR, getContrastColor } from '@/lib/data/tag-colors'
import { createTag, updateTag, deleteTag } from '@/app/actions/tags'
import { toast } from 'sonner'
import type { Tag } from '@/lib/types/database'
import { cn } from '@/lib/utils'

interface TagManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tags: Tag[]
}

/**
 * Tag manager component for workspace tag CRUD operations
 * - List all tags with color preview
 * - Create new tag with name + color picker
 * - Edit tag inline: click to edit name/color
 * - Delete with confirmation
 */
export function TagManager({ open, onOpenChange, tags }: TagManagerProps) {
  const [newTagName, setNewTagName] = React.useState('')
  const [newTagColor, setNewTagColor] = React.useState(DEFAULT_TAG_COLOR)
  const [isCreating, setIsCreating] = React.useState(false)
  const [editingTagId, setEditingTagId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editColor, setEditColor] = React.useState('')

  // Handle create tag
  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTagName.trim()) return

    setIsCreating(true)
    const formData = new FormData()
    formData.set('name', newTagName.trim())
    formData.set('color', newTagColor)

    const result = await createTag(formData)
    setIsCreating(false)

    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`Etiqueta "${newTagName}" creada`)
      setNewTagName('')
      setNewTagColor(DEFAULT_TAG_COLOR)
    }
  }

  // Start editing a tag
  const startEditing = (tag: Tag) => {
    setEditingTagId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  // Cancel editing
  const cancelEditing = () => {
    setEditingTagId(null)
    setEditName('')
    setEditColor('')
  }

  // Save edited tag
  const saveEdit = async (tagId: string) => {
    if (!editName.trim()) {
      toast.error('El nombre es requerido')
      return
    }

    const formData = new FormData()
    formData.set('name', editName.trim())
    formData.set('color', editColor)

    const result = await updateTag(tagId, formData)

    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Etiqueta actualizada')
      cancelEditing()
    }
  }

  // Delete tag with confirmation
  const handleDeleteTag = async (tag: Tag) => {
    if (!confirm(`Eliminar etiqueta "${tag.name}"? Esta accion no se puede deshacer.`)) {
      return
    }

    const result = await deleteTag(tag.id)

    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`Etiqueta "${tag.name}" eliminada`)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Gestionar etiquetas</SheetTitle>
          <SheetDescription>
            Crea, edita y elimina etiquetas para organizar tus contactos.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-8 space-y-8">
          {/* Create new tag form */}
          <form onSubmit={handleCreateTag} className="space-y-5 p-4 border rounded-lg bg-muted/30">
            <div className="space-y-3">
              <Label htmlFor="new-tag-name" className="text-base font-medium">Nueva etiqueta</Label>
              <div className="flex gap-3">
                <Input
                  id="new-tag-name"
                  placeholder="Nombre de la etiqueta"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={isCreating || !newTagName.trim()}>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  {isCreating ? 'Creando...' : 'Crear'}
                </Button>
              </div>
            </div>

            {/* Color picker for new tag */}
            <div className="space-y-3">
              <Label>Color</Label>
              <ColorPicker
                value={newTagColor}
                onChange={setNewTagColor}
              />
            </div>

            {/* Preview */}
            {newTagName.trim() && (
              <div className="flex items-center gap-3 pt-2">
                <Label className="text-muted-foreground">Vista previa:</Label>
                <span
                  className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium"
                  style={{
                    backgroundColor: newTagColor,
                    color: getContrastColor(newTagColor),
                  }}
                >
                  {newTagName.trim()}
                </span>
              </div>
            )}
          </form>

          {/* Existing tags list */}
          <div className="space-y-2">
            <Label>Etiquetas existentes ({tags.length})</Label>
            <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
              {tags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay etiquetas creadas
                </p>
              ) : (
                tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50"
                  >
                    {editingTagId === tag.id ? (
                      // Edit mode
                      <>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 h-8"
                          autoFocus
                        />
                        <ColorPicker
                          value={editColor}
                          onChange={setEditColor}
                          compact
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => saveEdit(tag.id)}
                          className="h-8 w-8 p-0"
                        >
                          <CheckIcon className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEditing}
                          className="h-8 w-8 p-0"
                        >
                          <XIcon className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      // View mode
                      <>
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                          style={{
                            backgroundColor: tag.color,
                            color: getContrastColor(tag.color),
                          }}
                        >
                          {tag.name}
                        </span>
                        <div className="flex-1" />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditing(tag)}
                          className="h-8 w-8 p-0"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteTag(tag)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Color picker component
interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  compact?: boolean
}

function ColorPicker({ value, onChange, compact }: ColorPickerProps) {
  const [customColor, setCustomColor] = React.useState('')

  // Check if current value is a custom color (not in palette)
  const isCustom = !TAG_COLORS.some((c) => c.value === value)

  return (
    <div className="space-y-3">
      <div className={cn('flex flex-wrap gap-3', compact && 'flex-nowrap gap-2')}>
        {TAG_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => onChange(color.value)}
            className={cn(
              'w-8 h-8 rounded-full border-2 transition-all',
              compact && 'w-6 h-6',
              value === color.value
                ? 'border-foreground ring-2 ring-offset-2 ring-foreground/30'
                : 'border-transparent hover:scale-110'
            )}
            style={{ backgroundColor: color.value }}
            title={color.name}
          />
        ))}
      </div>
      {!compact && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Personalizado:</Label>
          <Input
            type="text"
            placeholder="#hex"
            value={isCustom ? value : customColor}
            onChange={(e) => {
              const hex = e.target.value
              setCustomColor(hex)
              if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                onChange(hex)
              }
            }}
            className="w-24 h-8 text-sm"
          />
        </div>
      )}
    </div>
  )
}
