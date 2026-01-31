'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ContactForm } from '@/app/(dashboard)/crm/contactos/components/contact-form'
import { linkContactToConversation } from '@/app/actions/conversations'

interface CreateContactSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPhone?: string
  /** Conversation ID to auto-link the contact after creation */
  conversationId?: string
  onSuccess?: (contactId?: string) => void
}

/**
 * Sheet component for creating a contact directly from WhatsApp module.
 * Pre-fills the phone number from the conversation.
 */
export function CreateContactSheet({
  open,
  onOpenChange,
  defaultPhone,
  conversationId,
  onSuccess,
}: CreateContactSheetProps) {
  const handleSuccess = async (contactId?: string) => {
    // Auto-link contact to conversation if we have both IDs
    if (conversationId && contactId) {
      await linkContactToConversation(conversationId, contactId)
    }
    onOpenChange(false)
    onSuccess?.(contactId)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Crear contacto</SheetTitle>
          <SheetDescription>
            Agrega un nuevo contacto al CRM
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {/* Key forces remount when sheet opens, ensuring defaultValues are applied */}
          <ContactForm
            key={open ? `contact-form-${defaultPhone}` : 'closed'}
            mode="create"
            defaultValues={{
              name: '',
              phone: defaultPhone || '',
              email: '',
              address: '',
              city: '',
            }}
            onSuccess={handleSuccess}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
