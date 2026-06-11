// src/app/(dashboard)/whatsapp/components/mx-tag.tsx
import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// `success` is the additive 6th variant authored under `.theme-editorial-v3`
// (Plan 00) for the kanban "C" (confirmado) tag — color-mix over --semantic-success.
// `violet` + `rose` are additive (Vivificación v3 2026-06) so violet/pink tag
// colors stop folding into indigo/rubric — CSS recipe via --tc in globals.css.
type MxTagVariant = 'rubric' | 'gold' | 'indigo' | 'verdigris' | 'ink' | 'success' | 'violet' | 'rose'

interface MxTagProps extends Omit<ComponentProps<'span'>, 'children'> {
  variant: MxTagVariant
  icon?: LucideIcon
  children: ReactNode
}

/**
 * Editorial pill (UI-SPEC §7.12). Wraps the `.mx-tag` + `.mx-tag--{variant}`
 * CSS classes defined in `src/app/globals.css` under `.theme-editorial` scope.
 *
 * Outside `.theme-editorial`, the classes have no effect (Pitfall 8 — scoped
 * by selector). Renders a plain unstyled <span>.
 *
 * Use INSTEAD OF shadcn `<Badge>` (RESEARCH Primitive Map row "Badge" — bypass).
 *
 * Per RESEARCH Alternatives Considered: class-variance-authority is NOT used.
 * CVA adds runtime cost for zero benefit on static utility classes.
 */
export function MxTag({ variant, icon: Icon, children, className, ...rest }: MxTagProps) {
  return (
    <span
      data-variant={variant}
      className={cn('mx-tag', `mx-tag--${variant}`, className)}
      {...rest}
    >
      {Icon ? <Icon className="h-[10px] w-[10px]" aria-hidden /> : null}
      {children}
    </span>
  )
}
