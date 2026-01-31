'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { deleteCustomField } from '@/app/actions/custom-fields'

interface DeleteFieldButtonProps {
  fieldId: string
  fieldName: string
}

export function DeleteFieldButton({ fieldId, fieldName }: DeleteFieldButtonProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const handleDelete = async () => {
    setPending(true)

    try {
      const result = await deleteCustomField(fieldId)

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('Campo eliminado')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Error al eliminar el campo')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar campo</DialogTitle>
          <DialogDescription>
            Estas seguro de eliminar el campo <strong>{fieldName}</strong>?
            <br />
            <br />
            Los valores guardados en los contactos no se eliminaran, pero el campo
            ya no aparecera en el formulario.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
