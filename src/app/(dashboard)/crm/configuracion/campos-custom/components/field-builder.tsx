'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createCustomField, updateCustomField } from '@/app/actions/custom-fields'
import { FIELD_TYPE_LABELS, generateFieldKey } from '@/lib/custom-fields/validator'
import type { CustomFieldDefinition, FieldType } from '@/lib/types/database'

// ============================================================================
// Types
// ============================================================================

interface FieldBuilderProps {
  /** Field to edit (null for create mode) */
  field?: CustomFieldDefinition
  /** Dialog trigger button (uses default if not provided) */
  trigger?: React.ReactNode
  /** Called after successful save */
  onSuccess?: () => void
}

// All available field types
const FIELD_TYPES: FieldType[] = [
  'text',
  'number',
  'date',
  'select',
  'checkbox',
  'url',
  'email',
  'phone',
  'currency',
  'percentage',
  'file',
  'contact_relation',
]

// ============================================================================
// FieldBuilder Component
// ============================================================================

export function FieldBuilder({ field, trigger, onSuccess }: FieldBuilderProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  // Form state
  const [name, setName] = React.useState(field?.name || '')
  const [fieldType, setFieldType] = React.useState<FieldType>(field?.field_type || 'text')
  const [options, setOptions] = React.useState<string[]>(field?.options || [])
  const [isRequired, setIsRequired] = React.useState(field?.is_required || false)
  const [newOption, setNewOption] = React.useState('')

  // Reset form when dialog opens/closes or field changes
  React.useEffect(() => {
    if (open) {
      setName(field?.name || '')
      setFieldType(field?.field_type || 'text')
      setOptions(field?.options || [])
      setIsRequired(field?.is_required || false)
      setNewOption('')
    }
  }, [open, field])

  // Show options only for select type
  const showOptions = fieldType === 'select'

  // Add option to list
  const handleAddOption = () => {
    const trimmed = newOption.trim()
    if (trimmed && !options.includes(trimmed)) {
      setOptions([...options, trimmed])
      setNewOption('')
    }
  }

  // Remove option from list
  const handleRemoveOption = (optionToRemove: string) => {
    setOptions(options.filter((o) => o !== optionToRemove))
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('El nombre es requerido')
      return
    }

    if (fieldType === 'select' && options.length === 0) {
      toast.error('Agrega al menos una opcion para el campo de seleccion')
      return
    }

    setPending(true)

    try {
      if (field) {
        // Update existing field
        const result = await updateCustomField(field.id, {
          name: name.trim(),
          options: fieldType === 'select' ? options : undefined,
          is_required: isRequired,
        })

        if ('error' in result) {
          toast.error(result.error)
          return
        }

        toast.success('Campo actualizado')
      } else {
        // Create new field
        const result = await createCustomField({
          name: name.trim(),
          field_type: fieldType,
          options: fieldType === 'select' ? options : undefined,
          is_required: isRequired,
        })

        if ('error' in result) {
          toast.error(result.error)
          return
        }

        toast.success('Campo creado')
      }

      setOpen(false)
      router.refresh()
      onSuccess?.()
    } catch {
      toast.error('Error al guardar el campo')
    } finally {
      setPending(false)
    }
  }

  // Preview the generated key
  const previewKey = name ? generateFieldKey(name) : ''

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <PlusIcon className="mr-2 h-4 w-4" />
            Nuevo campo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {field ? 'Editar campo' : 'Nuevo campo personalizado'}
            </DialogTitle>
            <DialogDescription>
              {field
                ? 'Modifica las propiedades del campo. No puedes cambiar el tipo.'
                : 'Define un nuevo campo para tus contactos.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name field */}
            <div className="space-y-2">
              <Label htmlFor="field-name">Nombre del campo</Label>
              <Input
                id="field-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Fecha de cumpleanos"
                disabled={pending}
              />
              {!field && previewKey && (
                <p className="text-xs text-muted-foreground">
                  Clave: <code className="bg-muted px-1 rounded">{previewKey}</code>
                </p>
              )}
            </div>

            {/* Field type (only for new fields) */}
            {!field && (
              <div className="space-y-2">
                <Label htmlFor="field-type">Tipo de campo</Label>
                <Select
                  value={fieldType}
                  onValueChange={(val) => setFieldType(val as FieldType)}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {FIELD_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Show current type for editing */}
            {field && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Tipo de campo</Label>
                <p className="text-sm">{FIELD_TYPE_LABELS[field.field_type]}</p>
              </div>
            )}

            {/* Options for select type */}
            {showOptions && (
              <div className="space-y-2">
                <Label>Opciones</Label>
                <div className="flex gap-2">
                  <Input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Nueva opcion"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddOption()
                      }
                    }}
                    disabled={pending}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddOption}
                    disabled={pending || !newOption.trim()}
                  >
                    Agregar
                  </Button>
                </div>
                {options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {options.map((option) => (
                      <span
                        key={option}
                        className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-muted rounded-md"
                      >
                        {option}
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(option)}
                          className="hover:text-destructive"
                          disabled={pending}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Required checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is-required"
                checked={isRequired}
                onCheckedChange={(checked) => setIsRequired(Boolean(checked))}
                disabled={pending}
              />
              <Label htmlFor="is-required" className="font-normal cursor-pointer">
                Campo obligatorio
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando...' : field ? 'Guardar' : 'Crear campo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
