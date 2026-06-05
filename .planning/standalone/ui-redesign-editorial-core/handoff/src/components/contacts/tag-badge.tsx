'use client'

import { XIcon } from 'lucide-react'
import { getContrastColor } from '@/lib/data/tag-colors'
import { cn } from '@/lib/utils'

interface TagBadgeProps {
  tag: {
    id?: string
    name: string
    color: string
  }
  onRemove?: () => void
  className?: string
  size?: 'sm' | 'md'
}

/**
 * Tag badge component with colored background and optional remove button
 * Uses getContrastColor() for accessible text color
 */
export function TagBadge({ tag, onRemove, className, size = 'sm' }: TagBadgeProps) {
  const textColor = getContrastColor(tag.color)

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium transition-colors',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        onRemove && 'pr-1',
        className
      )}
      style={{
        backgroundColor: tag.color,
        color: textColor,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className={cn(
            'ml-1 rounded-full hover:bg-black/20 focus:outline-none focus:ring-2 focus:ring-white/50',
            size === 'sm' ? 'p-0.5' : 'p-1'
          )}
          aria-label={`Quitar ${tag.name}`}
        >
          <XIcon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </button>
      )}
    </span>
  )
}
