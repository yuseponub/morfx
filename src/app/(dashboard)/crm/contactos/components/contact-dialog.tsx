'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'
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
  const v2 = useDashboardV2()
  const isEditing = !!contact

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'sm:max-w-[500px]',
          v2 && 'theme-editorial bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]'
        )}
      >
        <DialogHeader>
          <DialogTitle
            className={v2 ? 'text-[20px] font-bold tracking-[-0.01em] text-[var(--ink-1)]' : ''}
            style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
          >
            {isEditing ? 'Editar contacto' : 'Nuevo contacto'}
          </DialogTitle>
          <DialogDescription className={v2 ? 'mx-smallcaps text-[var(--ink-3)] mt-1' : undefined}>
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
