'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PencilIcon, TrashIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContactDialog } from '../components/contact-dialog'
import { deleteContact } from '@/app/actions/contacts'
import { toast } from 'sonner'
import type { ContactWithTags } from '@/lib/types/database'

interface ContactDetailActionsProps {
  contact: ContactWithTags
  v2?: boolean
}

export function ContactDetailActions({ contact, v2 = false }: ContactDetailActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const handleDelete = async () => {
    if (!confirm(`Eliminar contacto "${contact.name}"? Esta accion no se puede deshacer.`)) {
      return
    }

    setIsDeleting(true)
    try {
      const result = await deleteContact(contact.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Contacto eliminado')
        router.push('/crm/contactos')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
          className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
        >
          <PencilIcon className="mr-2 h-4 w-4" />
          Editar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          className={v2 ? 'border-[var(--rubric-2)] text-[var(--rubric-2)] bg-[var(--paper-0)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--rubric-2)]' : 'text-destructive hover:text-destructive'}
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          {isDeleting ? 'Eliminando...' : 'Eliminar'}
        </Button>
      </div>

      <ContactDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        contact={contact}
        onSuccess={() => {
          setEditOpen(false)
          toast.success('Contacto actualizado')
          router.refresh()
        }}
      />
    </>
  )
}
