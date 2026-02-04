'use client'

import { useEffect, useState, useCallback } from 'react'
import { getTaskSummary } from '@/app/actions/tasks'
import type { TaskSummary } from '@/lib/tasks/types'

/**
 * Hook to fetch and manage task summary for badge display.
 * Automatically refreshes every 5 minutes.
 * Badge count = overdue + dueSoon tasks.
 */
export function useTaskBadge() {
  const [summary, setSummary] = useState<TaskSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await getTaskSummary()
      setSummary(result)
    } catch (error) {
      console.error('Error fetching task summary:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Refresh every 5 minutes
    const interval = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [refresh])

  // Badge count = overdue + dueSoon
  const badgeCount = summary ? summary.overdue + summary.dueSoon : 0

  return {
    summary,
    badgeCount,
    loading,
    refresh,
  }
}
