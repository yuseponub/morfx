'use client'

// ============================================================================
// Phase 19: AI Automation Builder — Confirmation Buttons
// Crear/Guardar and Modificar buttons below the automation preview diagram.
// ============================================================================

import { Button } from '@/components/ui/button'
import { Check, Pencil } from 'lucide-react'

interface ConfirmationButtonsProps {
  onConfirm: () => void
  onModify: () => void
  isUpdate?: boolean
  disabled?: boolean
}

export function ConfirmationButtons({
  onConfirm,
  onModify,
  isUpdate = false,
  disabled = false,
}: ConfirmationButtonsProps) {
  return (
    <div className="flex items-center gap-3 border-t bg-muted/50 p-3">
      <Button
        onClick={onConfirm}
        disabled={disabled}
        size="sm"
      >
        <Check className="size-4" />
        {isUpdate ? 'Guardar cambios' : 'Crear automatizacion'}
      </Button>

      <Button
        variant="outline"
        onClick={onModify}
        size="sm"
      >
        <Pencil className="size-4" />
        Modificar
      </Button>
    </div>
  )
}
