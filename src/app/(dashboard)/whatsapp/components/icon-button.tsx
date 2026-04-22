// src/app/(dashboard)/whatsapp/components/icon-button.tsx
import { forwardRef, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** REQUIRED — Spanish aria-label per D-24. */
  'aria-label': string
  children: ReactNode
  /** Optional pressed state (e.g. toggle buttons). */
  pressed?: boolean
}

/**
 * Editorial 32x32 icon button (UI-SPEC §7.7). Mandatory `aria-label` (D-24).
 * Used in chat-header actions, conversation-list filters, etc.
 *
 * Outside `.theme-editorial`, the `var(--*)` references resolve to the
 * shadcn-slate tokens (which is fine for SSR safety — but this component
 * is intended to be used INSIDE the scope only).
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, pressed, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        data-pressed={pressed || undefined}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center',
          'rounded-[4px] border border-[var(--border)]',
          'bg-[var(--paper-0)] text-[var(--ink-2)]',
          'transition-colors',
          'hover:bg-[var(--paper-3)] hover:text-[var(--ink-1)]',
          'active:translate-y-px',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          pressed && 'bg-[var(--paper-3)] text-[var(--ink-1)]',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    )
  },
)
