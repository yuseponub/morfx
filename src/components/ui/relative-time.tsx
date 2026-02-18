'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface RelativeTimeProps {
  date: string | null
  className?: string
  /** Refresh interval in ms (default: 60000 = 1 min) */
  refreshInterval?: number
}

/**
 * Displays a relative time string (e.g., "hace 5 min") that auto-refreshes.
 * Uses suppressHydrationWarning to handle SSR/client time mismatch without error.
 */
export function RelativeTime({ date, className, refreshInterval = 60_000 }: RelativeTimeProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!date) return
    const timer = setInterval(() => setTick(t => t + 1), refreshInterval)
    return () => clearInterval(timer)
  }, [date, refreshInterval])

  if (!date) return null

  const text = formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })

  return <span className={className} suppressHydrationWarning>{text}</span>
}
