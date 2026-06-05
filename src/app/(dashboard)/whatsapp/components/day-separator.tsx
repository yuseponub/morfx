// src/app/(dashboard)/whatsapp/components/day-separator.tsx
'use client'

import { format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import { useInboxV3 } from './inbox-v3-context'

/**
 * Day separator.
 *
 * - Editorial v3 (`ui_kits/conversaciones/index.html`): the `.daysep` pill
 *   (uppercase smallcaps over paper-2 + border, via the `.daysep` CSS rule).
 *   Labels: "Hoy" / "Ayer" / "Martes 21 de abril".
 * - Otherwise (legacy v2 path): `— Martes 21 de abril —` (smallcaps ink-3).
 *
 * Timezone: America/Bogota is the app default (CLAUDE.md Regla 2);
 * `new Date(timestamp)` inherits the CO locale and needs no
 * date-fns-tz wrapper. The date-grouping logic in chat-view is unchanged.
 */
export function DaySeparator({ date }: { date: Date }) {
  const v3 = useInboxV3()

  if (v3) {
    const dayLabel = isToday(date)
      ? 'Hoy'
      : isYesterday(date)
        ? 'Ayer'
        : (() => {
            const l = format(date, "EEEE d 'de' MMMM", { locale: es })
            return l.charAt(0).toUpperCase() + l.slice(1)
          })()
    return (
      <div className="flex justify-center">
        <span className="daysep">{dayLabel}</span>
      </div>
    )
  }

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
