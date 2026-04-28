'use client'

/**
 * HypothesisInput — sub-componente para AuditorTab v2 (Plan 05, D-16).
 *
 * Textarea opcional (max 2000 chars — RESEARCH Open Item §3) con char counter.
 * El auditor investigara la hipotesis ESPECIFICAMENTE en first-round.
 */

import { Textarea } from '@/components/ui/textarea'

interface HypothesisInputProps {
  value: string
  onChange: (val: string) => void
  disabled: boolean
}

const MAX_CHARS = 2000

export function HypothesisInput({
  value,
  onChange,
  disabled,
}: HypothesisInputProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">
        Hipótesis (opcional) — el auditor la investigará específicamente
      </label>
      <Textarea
        value={value}
        onChange={(e) => {
          if (e.target.value.length <= MAX_CHARS) onChange(e.target.value)
        }}
        placeholder='Ej: "el bot mandó promo cuando el cliente solo saludó, sin preguntar dirección"'
        disabled={disabled}
        className="min-h-12 text-sm"
      />
      <div className="flex justify-end text-[10px] text-muted-foreground font-mono">
        {value.length} / {MAX_CHARS}
      </div>
    </div>
  )
}
