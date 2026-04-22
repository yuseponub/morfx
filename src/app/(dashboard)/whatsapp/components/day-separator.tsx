// src/app/(dashboard)/whatsapp/components/day-separator.tsx
'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * Editorial day separator (UI-SPEC §7.5):
 *   `— Martes 21 de abril —` (smallcaps ink-3)
 *
 * Timezone: America/Bogota is the app default (CLAUDE.md Regla 2);
 * `new Date(timestamp)` inherits the CO locale and needs no
 * date-fns-tz wrapper.
 *
 * Em-dashes (U+2014) wrap the label; weekday name capitalized
 * (date-fns es locale lowercases it by default).
 */
export function DaySeparator({ date }: { date: Date }) {
  const label = format(date, "EEEE d 'de' MMMM", { locale: es })
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1)
  return (
    <div className="flex justify-center py-3">
      <span className="mx-smallcaps text-[var(--ink-3)] text-[11px] tracking-[0.06em]">
        — {capitalized} —
      </span>
    </div>
  )
}
