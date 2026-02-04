'use client'

import { ClockIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface PostponementBadgeProps {
  count: number
  className?: string
}

/**
 * Visual indicator showing how many times a task has been postponed.
 * - 0: Nothing shown
 * - 1-2: Yellow/warning indicator
 * - 3+: Red/critical indicator
 */
export function PostponementBadge({ count, className }: PostponementBadgeProps) {
  if (count === 0) return null

  const severity = count >= 3 ? 'critical' : 'warning'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "text-xs gap-1 cursor-help",
              severity === 'critical'
                ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                : "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
              className
            )}
          >
            <ClockIcon className="h-3 w-3" />
            {count}x
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Esta tarea ha sido postergada {count} {count === 1 ? 'vez' : 'veces'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
