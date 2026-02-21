'use client'

/**
 * Progress Indicator
 * Phase 24: Chat de Comandos UI
 *
 * Compact live counter shown during active job execution.
 * Shows animated spinner, progress counts, and progress bar.
 */

import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

interface ProgressIndicatorProps {
  successCount: number
  errorCount: number
  totalItems: number
}

export function ProgressIndicator({
  successCount,
  errorCount,
  totalItems,
}: ProgressIndicatorProps) {
  const processed = successCount + errorCount
  const percentage = totalItems > 0 ? Math.round((processed / totalItems) * 100) : 0

  return (
    <div className="border-t px-4 py-2.5 space-y-2 bg-muted/30">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        <span className="text-sm font-medium">
          {processed}/{totalItems} procesadas
        </span>
        <Badge
          variant="outline"
          className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800 text-xs"
        >
          {successCount} ok
        </Badge>
        {errorCount > 0 && (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800 text-xs"
          >
            {errorCount} err
          </Badge>
        )}
      </div>
      <Progress value={percentage} className="h-1.5" />
    </div>
  )
}
