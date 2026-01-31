'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createWorkspace } from '@/app/actions/workspace'

const createWorkspaceSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(50, 'El nombre es muy largo'),
  slug: z
    .string()
    .min(2, 'El slug debe tener al menos 2 caracteres')
    .max(30, 'El slug es muy largo')
    .regex(/^[a-z0-9-]+$/, 'Solo letras minusculas, numeros y guiones'),
  business_type: z.string().optional(),
})

type CreateWorkspaceFormData = z.infer<typeof createWorkspaceSchema>

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
}

export function CreateWorkspaceForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateWorkspaceFormData>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: '',
      slug: '',
      business_type: '',
    },
  })

  const watchName = watch('name')

  // Auto-generate slug from name
  useEffect(() => {
    if (watchName) {
      setValue('slug', generateSlug(watchName), { shouldValidate: true })
    }
  }, [watchName, setValue])

  async function onSubmit(data: CreateWorkspaceFormData) {
    setIsLoading(true)
    setError(null)

    const result = await createWorkspace({
      name: data.name,
      slug: data.slug,
      business_type: data.business_type || undefined,
    })

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    router.push('/crm')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre del workspace</Label>
        <Input
          id="name"
          type="text"
          placeholder="Mi empresa"
          autoComplete="organization"
          {...register('name')}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">URL del workspace</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">morfx.io/</span>
          <Input
            id="slug"
            type="text"
            placeholder="mi-empresa"
            {...register('slug')}
            aria-invalid={!!errors.slug}
            className="flex-1"
          />
        </div>
        {errors.slug && (
          <p className="text-sm text-destructive">{errors.slug.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="business_type">Tipo de negocio (opcional)</Label>
        <Input
          id="business_type"
          type="text"
          placeholder="E-commerce, Servicios, etc."
          {...register('business_type')}
        />
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creando...' : 'Crear workspace'}
      </Button>
    </form>
  )
}
