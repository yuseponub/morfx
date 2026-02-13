'use client'

import { useEffect, useState, useCallback } from 'react'
import { getRecentFailures } from '@/app/actions/automations'

/**
 * Hook to fetch recent automation failure count for badge display.
 * Automatically refreshes every 5 minutes.
 * Shows red badge when failures > 0 in last 24h.
 */
export function useAutomationBadge() {
  const [failureCount, setFailureCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const count = await getRecentFailures()
      setFailureCount(count)
    } catch (error) {
      console.error('Error fetching automation failures:', error)
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

  return {
    failureCount,
    loading,
    refresh,
  }
}
