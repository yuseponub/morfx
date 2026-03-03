'use client'

import { useState, useEffect } from 'react'
import { differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns'

interface RelativeTimeProps {
  date: string | null
  className?: string
  /** Refresh interval in ms (default: 60000 = 1 min) */
  refreshInterval?: number
}

/** Short relative time: "hace 3 min", "hace 1h", "hace 2h", "hace 5 días" */
function shortTimeAgo(date: Date): string {
  const now = new Date()
  const mins = differenceInMinutes(now, date)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = differenceInHours(now, date)
  if (hours === 1) return 'hace 1 hora'
  if (hours < 24) return `hace ${hours}h`
  const days = differenceInDays(now, date)
  if (days === 1) return 'hace 1 día'
  return `hace ${days} días`
}

/**
 * Displays a short relative time string (e.g., "hace 5 min") that auto-refreshes.
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

  const text = mounted ? shortTimeAgo(new Date(date)) : ''

  return <span className={className} suppressHydrationWarning>{text}</span>
}
