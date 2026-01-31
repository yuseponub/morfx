import * as React from 'react'
import { cn } from '@/lib/utils'

// ============================================================================
// Timeline Container
// ============================================================================

interface TimelineProps {
  children: React.ReactNode
  className?: string
}

/**
 * Timeline container component.
 * Renders a vertical timeline with connecting line.
 */
export function Timeline({ children, className }: TimelineProps) {
  return (
    <div className={cn('relative space-y-0', className)}>
      {children}
    </div>
  )
}

// ============================================================================
// Timeline Item
// ============================================================================

interface TimelineItemProps {
  /** Icon to display at the timeline marker */
  icon?: React.ReactNode
  /** Title text or element (displayed in semi-bold) */
  title: React.ReactNode
  /** Description text (displayed in muted color) */
  description?: React.ReactNode
  /** Date/time to display */
  date: string
  /** Expandable content (shown below the item) */
  children?: React.ReactNode
  className?: string
  /** Whether this is the last item (hides the connecting line) */
  isLast?: boolean
}

/**
 * Timeline item component.
 * Displays a single event in the timeline with marker, title, description, and date.
 */
export function TimelineItem({
  icon,
  title,
  description,
  date,
  children,
  className,
  isLast = false,
}: TimelineItemProps) {
  return (
    <div className={cn('relative flex gap-4 pb-6', className)}>
      {/* Connecting line */}
      {!isLast && (
        <div className="absolute left-[15px] top-8 h-[calc(100%-16px)] w-[2px] bg-border" />
      )}

      {/* Icon/marker */}
      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon || (
          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-1 pt-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-none">{title}</p>
          <time className="text-xs text-muted-foreground whitespace-nowrap">{date}</time>
        </div>
        {description && (
          <div className="text-sm text-muted-foreground">{description}</div>
        )}
        {children && (
          <div className="mt-2">{children}</div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Helper: Format relative date
// ============================================================================

/**
 * Format a date as relative time (e.g., "hace 2 horas") or absolute date
 * for older dates.
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  // Less than a minute
  if (diffSec < 60) {
    return 'hace un momento'
  }

  // Less than an hour
  if (diffMin < 60) {
    return diffMin === 1 ? 'hace 1 minuto' : `hace ${diffMin} minutos`
  }

  // Less than 24 hours
  if (diffHours < 24) {
    return diffHours === 1 ? 'hace 1 hora' : `hace ${diffHours} horas`
  }

  // Less than 7 days
  if (diffDays < 7) {
    return diffDays === 1 ? 'hace 1 dia' : `hace ${diffDays} dias`
  }

  // More than 7 days - show absolute date
  return date.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    timeZone: 'America/Bogota',
  })
}
