'use client'

// ============================================================================
// Phase 999.1 — Plan 04 Task 2
// Trigger del composer de mensaje interactivo (mirror template-button.tsx con la
// forma de icono ghost de los botones adjuntar/emoji de message-input.tsx:428-437).
// Vive SOLO en la rama de ventana abierta del toolbar (D-02 — la ubicacion ES el gate).
// ============================================================================

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { List } from 'lucide-react'
import { InteractiveComposerModal } from './interactive-composer-modal'

interface InteractiveComposerButtonProps {
  conversationId: string
  contactPhone: string
  onSend?: () => void
  disabled?: boolean
}

export function InteractiveComposerButton({
  conversationId,
  contactPhone,
  onSend,
  disabled,
}: InteractiveComposerButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 flex-shrink-0"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="Mensaje interactivo"
        aria-label="Abrir compositor de mensaje interactivo"
      >
        <List className="h-5 w-5" />
      </Button>

      <InteractiveComposerModal
        open={open}
        onOpenChange={setOpen}
        conversationId={conversationId}
        contactPhone={contactPhone}
        onSend={onSend}
      />
    </>
  )
}
