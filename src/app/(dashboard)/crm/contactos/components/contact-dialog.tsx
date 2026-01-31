'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ContactForm } from './contact-form'
import type { ContactWithTags } from '@/lib/types/database'

interface ContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact?: ContactWithTags | null
  onSuccess?: () => void
}

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  onSuccess,
}: ContactDialogProps) {
  const isEditing = !!contact

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar contacto' : 'Nuevo contacto'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Actualiza la informacion del contacto'
              : 'Ingresa los datos del nuevo contacto'}
          </DialogDescription>
        </DialogHeader>
        <ContactForm
          mode={isEditing ? 'edit' : 'create'}
          defaultValues={
            contact
              ? {
                  name: contact.name,
                  phone: contact.phone,
                  email: contact.email || '',
                  address: contact.address || '',
                  city: contact.city || '',
                }
              : undefined
          }
          contactId={contact?.id}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  )
}
