'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PencilIcon, SettingsIcon, XIcon, SaveIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { FieldInput } from '@/components/custom-fields/field-input'
import { FieldValue } from '@/components/custom-fields/field-display'
import { updateContactCustomFields } from '@/app/actions/custom-fields'
import { validateCustomFields } from '@/lib/custom-fields/validator'
import type { CustomFieldDefinition, ContactWithTags } from '@/lib/types/database'

// ============================================================================
// CustomFieldsSection Component
// ============================================================================

interface CustomFieldsSectionProps {
  contact: ContactWithTags
  fieldDefinitions: CustomFieldDefinition[]
  isAdminOrOwner?: boolean
}

/**
 * Section on contact detail page showing custom fields.
 * Supports view and edit modes.
 */
export function CustomFieldsSection({
  contact,
  fieldDefinitions,
  isAdminOrOwner = false,
}: CustomFieldsSectionProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [values, setValues] = React.useState<Record<string, unknown>>({})
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  // Initialize values from contact when entering edit mode
  React.useEffect(() => {
    if (isEditing) {
      setValues(contact.custom_fields || {})
      setErrors({})
    }
  }, [isEditing, contact.custom_fields])

  // Handle field value change
  const handleValueChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    // Clear error for this field
    if (errors[key]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[key]
        return newErrors
      })
    }
  }

  // Handle save
  const handleSave = async () => {
    // Validate values
    const validationResult = validateCustomFields(fieldDefinitions, values)

    if (!validationResult.success) {
      setErrors(validationResult.errors)
      toast.error('Corrige los errores antes de guardar')
      return
    }

    setPending(true)

    try {
      const result = await updateContactCustomFields(contact.id, validationResult.data)

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Campos actualizados')
      setIsEditing(false)
      router.refresh()
    } catch {
      toast.error('Error al guardar los campos')
    } finally {
      setPending(false)
    }
  }

  // Handle cancel
  const handleCancel = () => {
    setIsEditing(false)
    setValues({})
    setErrors({})
  }

  // No fields defined
  if (fieldDefinitions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center justify-between">
            <span>Campos personalizados</span>
            {isAdminOrOwner && (
              <Link
                href="/crm/configuracion/campos-custom"
                className="text-primary hover:underline text-xs inline-flex items-center gap-1"
              >
                <SettingsIcon className="h-3 w-3" />
                Configurar
              </Link>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No hay campos personalizados definidos.
            {isAdminOrOwner && (
              <>
                {' '}
                <Link
                  href="/crm/configuracion/campos-custom"
                  className="text-primary hover:underline"
                >
                  Crear campos
                </Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    )
  }

  const customFieldValues = contact.custom_fields || {}

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center justify-between">
          <span>Campos personalizados</span>
          <div className="flex items-center gap-2">
            {isAdminOrOwner && (
              <Link
                href="/crm/configuracion/campos-custom"
                className="text-primary hover:underline text-xs inline-flex items-center gap-1"
              >
                <SettingsIcon className="h-3 w-3" />
                Configurar
              </Link>
            )}
            {!isEditing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-6 px-2"
              >
                <PencilIcon className="h-3 w-3 mr-1" />
                Editar
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={pending}
                  className="h-6 px-2"
                >
                  <XIcon className="h-3 w-3 mr-1" />
                  Cancelar
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={pending}
                  className="h-6 px-2"
                >
                  <SaveIcon className="h-3 w-3 mr-1" />
                  {pending ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            )}
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          // Edit mode
          <div className="grid gap-4 sm:grid-cols-2">
            {fieldDefinitions.map((def) => (
              <FieldInput
                key={def.id}
                definition={def}
                value={values[def.key]}
                onChange={(val) => handleValueChange(def.key, val)}
                error={errors[def.key]}
                disabled={pending}
              />
            ))}
          </div>
        ) : (
          // View mode
          <div className="grid gap-4 sm:grid-cols-2">
            {fieldDefinitions.map((def) => (
              <FieldValue
                key={def.id}
                definition={def}
                value={customFieldValues[def.key]}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
