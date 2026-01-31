'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText } from 'lucide-react'
import { TemplateSendModal } from './template-send-modal'

interface Contact {
  id: string
  name: string
  phone: string
  email?: string | null
  city?: string | null
}

interface Order {
  id: string
  total: number
  tracking_number?: string | null
  carrier?: string | null
}

interface TemplateButtonProps {
  conversationId: string
  contact: Contact | null
  recentOrder?: Order | null
  disabled?: boolean
}

/**
 * Button that opens the template send modal.
 * Used when the 24h window is closed.
 */
export function TemplateButton({
  conversationId,
  contact,
  recentOrder,
  disabled
}: TemplateButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-2"
      >
        <FileText className="h-4 w-4" />
        Enviar Template
      </Button>

      <TemplateSendModal
        open={open}
        onOpenChange={setOpen}
        conversationId={conversationId}
        contact={contact}
        recentOrder={recentOrder}
      />
    </>
  )
}
