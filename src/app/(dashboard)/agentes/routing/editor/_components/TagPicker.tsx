'use client'

// ============================================================================
// TagPicker — lista de tags del workspace (autocomplete simple).
// Plan 06 functional first: <select> con los tags existentes + opcion "input
// libre" si el editor quiere referenciar uno que no esta en la lista (en cuyo
// caso un toast/note sugiere crearlo desde el modulo de tags — Regla scope
// agent: el form NO crea tags fuera de su scope).
// ============================================================================

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  value: string
  onChange: (value: string) => void
  tags: string[]
}

export function TagPicker({ value, onChange, tags }: Props) {
  if (tags.length === 0) {
    return (
      <div className="space-y-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="tag (sin tags en el workspace todavia)"
        />
        <p className="text-xs text-muted-foreground">
          No hay tags. Crealos desde el modulo de tags y vuelve aqui.
        </p>
      </div>
    )
  }
  const isCustom = value.length > 0 && !tags.includes(value)
  return (
    <div className="space-y-1">
      <Select
        value={isCustom ? '__custom__' : value}
        onValueChange={(v) => {
          if (v === '__custom__') return // no-op; user types in the Input below
          onChange(v)
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="tag..." />
        </SelectTrigger>
        <SelectContent>
          {tags.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
          <SelectItem value="__custom__">(otro)</SelectItem>
        </SelectContent>
      </Select>
      {isCustom && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="custom tag"
        />
      )}
    </div>
  )
}
