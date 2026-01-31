'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createPipeline, updatePipeline } from '@/app/actions/pipelines'
import { toast } from 'sonner'
import { LoaderIcon } from 'lucide-react'
import type { PipelineWithStages } from '@/lib/orders/types'

const pipelineFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100),
  description: z.string().optional().or(z.literal('')),
  is_default: z.boolean(),
})

type PipelineFormData = z.infer<typeof pipelineFormSchema>

interface PipelineFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  pipeline?: PipelineWithStages
}

export function PipelineForm({ open, onOpenChange, mode, pipeline }: PipelineFormProps) {
  const [isPending, setIsPending] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm<PipelineFormData>({
    resolver: zodResolver(pipelineFormSchema),
    defaultValues: {
      name: pipeline?.name || '',
      description: pipeline?.description || '',
      is_default: pipeline?.is_default || false,
    },
  })

  // Reset form when pipeline changes or dialog opens
  React.useEffect(() => {
    if (open) {
      form.reset({
        name: pipeline?.name || '',
        description: pipeline?.description || '',
        is_default: pipeline?.is_default || false,
      })
      setServerError(null)
    }
  }, [open, pipeline, form])

  const handleSubmit = async (data: PipelineFormData) => {
    setIsPending(true)
    setServerError(null)

    try {
      const formData = {
        name: data.name,
        description: data.description || null,
        is_default: data.is_default,
      }

      const result =
        mode === 'edit' && pipeline
          ? await updatePipeline(pipeline.id, formData)
          : await createPipeline(formData)

      if ('error' in result) {
        setServerError(result.error)
        return
      }

      toast.success(
        mode === 'edit'
          ? `Pipeline "${data.name}" actualizado`
          : `Pipeline "${data.name}" creado con etapas predeterminadas`
      )
      onOpenChange(false)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Editar pipeline' : 'Nuevo pipeline'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Modifica los datos del pipeline.'
              : 'Crea un nuevo pipeline. Se crearan las etapas predeterminadas (Nuevo, En Proceso, Ganado, Perdido).'}
          </DialogDescription>
        </DialogHeader>

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
              placeholder="Ej: Ventas, Devoluciones"
              disabled={isPending}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripcion</Label>
            <Textarea
              id="description"
              {...form.register('description')}
              placeholder="Descripcion opcional del pipeline"
              disabled={isPending}
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_default"
              checked={form.watch('is_default')}
              onCheckedChange={(checked) =>
                form.setValue('is_default', !!checked, { shouldValidate: true })
              }
              disabled={isPending || (mode === 'edit' && pipeline?.is_default)}
            />
            <Label htmlFor="is_default" className="cursor-pointer">
              Pipeline por defecto
            </Label>
          </div>
          {mode === 'edit' && pipeline?.is_default && (
            <p className="text-xs text-muted-foreground">
              No se puede quitar la marca de &quot;por defecto&quot; del pipeline predeterminado.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'edit' ? 'Guardar cambios' : 'Crear pipeline'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
