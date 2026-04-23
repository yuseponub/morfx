'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PhoneInput } from '@/components/contacts/phone-input'
import { createContact, updateContactFromForm } from '@/app/actions/contacts'
import { LoaderIcon } from 'lucide-react'

const contactFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  phone: z.string().min(1, 'El telefono es requerido'),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
})

type ContactFormData = z.infer<typeof contactFormSchema>

interface ContactFormProps {
  mode: 'create' | 'edit'
  defaultValues?: ContactFormData
  contactId?: string
  /** Called after successful create/edit. For create, receives the new contact ID. */
  onSuccess?: (contactId?: string) => void
}

export function ContactForm({
  mode,
  defaultValues,
  contactId,
  onSuccess,
}: ContactFormProps) {
  const [isPending, setIsPending] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: defaultValues || {
      name: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      department: '',
    },
  })

  const handleSubmit = async (data: ContactFormData) => {
    setIsPending(true)
    setServerError(null)

    try {
      let result
      if (mode === 'edit' && contactId) {
        // For edit, still use FormData
        const formData = new FormData()
        formData.append('name', data.name)
        formData.append('phone', data.phone)
        formData.append('email', data.email || '')
        formData.append('address', data.address || '')
        formData.append('city', data.city || '')
        formData.append('department', data.department || '')
        result = await updateContactFromForm(contactId, formData)
      } else {
        // For create, use object directly
        result = await createContact({
          name: data.name,
          phone: data.phone,
          email: data.email || undefined,
          address: data.address || undefined,
          city: data.city || undefined,
          department: data.department || undefined,
        })
      }

      if ('error' in result) {
        if (result.field) {
          form.setError(result.field as keyof ContactFormData, {
            message: result.error,
          })
        } else {
          setServerError(result.error)
        }
        return
      }

      // Pass the created contact ID to the callback
      const createdId = 'data' in result ? result.data?.id : undefined
      onSuccess?.(createdId)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      {serverError && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {serverError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          {...form.register('name')}
          placeholder="Juan Perez"
          disabled={isPending}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      <PhoneInput
        value={form.watch('phone')}
        onChange={(value) => form.setValue('phone', value, { shouldValidate: true })}
        disabled={isPending}
        error={form.formState.errors.phone?.message}
      />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          {...form.register('email')}
          placeholder="juan@ejemplo.com"
          disabled={isPending}
        />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">Ciudad</Label>
          <Input
            id="city"
            {...form.register('city')}
            placeholder="Ej: Cali, Bogotá"
            disabled={isPending}
          />
          {form.formState.errors.city && (
            <p className="text-sm text-destructive">
              {form.formState.errors.city.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="department">Departamento</Label>
          <Input
            id="department"
            {...form.register('department')}
            placeholder="Ej: Valle del Cauca"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Direccion</Label>
        <Textarea
          id="address"
          {...form.register('address')}
          placeholder="Calle 123 #45-67, Barrio Centro"
          disabled={isPending}
          rows={2}
        />
        {form.formState.errors.address && (
          <p className="text-sm text-destructive">
            {form.formState.errors.address.message}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'edit' ? 'Guardar cambios' : 'Crear contacto'}
        </Button>
      </div>
    </form>
  )
}
