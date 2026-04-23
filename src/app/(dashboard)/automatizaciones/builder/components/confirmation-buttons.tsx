'use client'

// ============================================================================
// Phase 19: AI Automation Builder — Confirmation Buttons
// Crear/Guardar and Modificar buttons below the automation preview diagram.
// ============================================================================

import { Button } from '@/components/ui/button'
import { Check, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

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
  const v2 = useDashboardV2()
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3',
        v2
          ? 'border-t border-[var(--ink-1)] bg-[var(--paper-2)]'
          : 'border-t bg-muted/50'
      )}
    >
      <Button
        onClick={onConfirm}
        disabled={disabled}
        size="sm"
        className={cn(
          v2 &&
            'bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] text-[11px] font-semibold uppercase tracking-[0.08em]'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        <Check className="size-4" />
        {v2
          ? (isUpdate ? 'Guardar cambios' : 'Crear automatización')
          : (isUpdate ? 'Guardar cambios' : 'Crear automatizacion')}
      </Button>

      <Button
        variant="outline"
        onClick={onModify}
        size="sm"
        className={cn(
          v2 &&
            'bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        <Pencil className="size-4" />
        Modificar
      </Button>
    </div>
  )
}
