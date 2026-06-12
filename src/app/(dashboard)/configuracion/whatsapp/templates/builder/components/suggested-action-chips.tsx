'use client'

// ============================================================================
// Standalone: template-builder-suggested-actions — Plan 02
// Chips de acción sugerida, puro render (sin state). Portable: no importa
// nada template-specific — recibe chips + onChipClick por props.
// D-02: el caller garantiza máx 4 chips. D-06: el caller controla disabled.
// XSS (T-TBC-05): labels renderizados como texto plano — React escapa por defecto,
// nunca se inyecta HTML crudo en el DOM.
// ============================================================================

export interface SuggestedChip {
  label: string
  message: string
  action?: string
  variant?: 'default' | 'confirm'
}

interface SuggestedActionChipsProps {
  chips: SuggestedChip[]
  disabled?: boolean
  onChipClick: (chip: SuggestedChip) => void
}

export function SuggestedActionChips({ chips, disabled, onChipClick }: SuggestedActionChipsProps) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          disabled={disabled}
          onClick={() => onChipClick(chip)}
          className={
            chip.variant === 'confirm'
              ? 'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950'
              : 'rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed'
          }
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
