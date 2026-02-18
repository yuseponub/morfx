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
  const [mounted, setMounted] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!date || !mounted) return
    const timer = setInterval(() => setTick(t => t + 1), refreshInterval)
    return () => clearInterval(timer)
  }, [date, mounted, refreshInterval])

  if (!date) return null

  // Render empty text on server/before mount, fill after mount
  // This keeps DOM structure identical (span always exists) preventing hydration mismatch
  const text = mounted
    ? formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
    : ''

  return <span className={className} suppressHydrationWarning>{text}</span>
}
