'use client'

// ============================================================================
// useRobotJobProgress Hook
// Real-time job progress subscription via Supabase postgres_changes.
//
// Subscribes to:
//   - robot_job_items (INSERT/UPDATE) for per-order progress
//   - robot_jobs (UPDATE) for job status changes (processing -> completed)
//
// Pattern:
//   1. Initial fetch via getJobStatus() server action (reconnect scenario)
//   2. Realtime subscription overlays live updates
//   3. Functional state updaters prevent stale closures
//   4. Cleanup removes channel on unmount / jobId change
// ============================================================================

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getJobStatus } from '@/app/actions/comandos'
import type { RobotJob, RobotJobItem } from '@/lib/domain/robot-jobs'

// ============================================================================
// Hook
// ============================================================================

export function useRobotJobProgress(jobId: string | null): {
  job: RobotJob | null
  items: RobotJobItem[]
  successCount: number
  errorCount: number
  totalItems: number
  isComplete: boolean
  isLoading: boolean
  isDisconnected: boolean
} {
  const [job, setJob] = useState<RobotJob | null>(null)
  const [items, setItems] = useState<RobotJobItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(!!jobId)
  const [isDisconnected, setIsDisconnected] = useState(false)

  // ---- Initial data fetch (handles reconnect scenario) ----
  useEffect(() => {
    if (!jobId) {
      setJob(null)
      setItems([])
      setIsLoading(false)
      setIsDisconnected(false)
      return
    }

    setIsLoading(true)

    async function fetchInitialData() {
      try {
        const result = await getJobStatus()
        if (result.success && result.data) {
          setJob(result.data.job ?? null)
          setItems(result.data.items ?? [])
        } else {
          setJob(null)
          setItems([])
        }
      } catch (err) {
        console.error('[useRobotJobProgress] Error fetching initial data:', err)
        setJob(null)
        setItems([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchInitialData()
  }, [jobId])

  // ---- Realtime subscription ----
  useEffect(() => {
    if (!jobId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`robot-job:${jobId}`)
      // Listener A: robot_job_items changes (INSERT + UPDATE)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'robot_job_items',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          const newItem = payload.new as RobotJobItem
          if (!newItem || !newItem.id) return

          // Surgical update: replace if exists, append if new
          setItems((prev) => {
            const idx = prev.findIndex((item) => item.id === newItem.id)
            if (idx !== -1) {
              // Replace existing item
              const updated = [...prev]
              updated[idx] = newItem
              return updated
            }
            // Append new item
            return [...prev, newItem]
          })
        }
      )
      // Listener B: robot_jobs status changes (UPDATE only)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'robot_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const updatedJob = payload.new as RobotJob
          if (!updatedJob || !updatedJob.id) return
          setJob(updatedJob)
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setIsDisconnected(false)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setIsDisconnected(true)
          console.error(`[useRobotJobProgress] Realtime ${status}:`, err)
        }
      })

    // Cleanup on unmount or jobId change
    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId])

  // ---- Polling fallback (covers Realtime missed events) ----
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const jobStatusRef = useRef<string | null>(null)

  // Keep ref in sync with job state (avoids stale closure in setInterval)
  useEffect(() => {
    jobStatusRef.current = job?.status ?? null
  }, [job?.status])

  useEffect(() => {
    // Clear any previous interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    if (!jobId) return

    pollingRef.current = setInterval(async () => {
      // Stop polling if job already complete
      if (jobStatusRef.current === 'completed' || jobStatusRef.current === 'failed') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        return
      }

      try {
        const result = await getJobStatus()
        if (result.success && result.data) {
          setJob(result.data.job ?? null)
          setItems(result.data.items ?? [])
        }
      } catch (err) {
        // Silently ignore — next interval will retry
        console.warn('[useRobotJobProgress] Polling error:', err)
      }
    }, 5000)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Computed values ----
  const successCount = useMemo(
    () => items.filter((i) => i.status === 'success').length,
    [items]
  )

  const errorCount = useMemo(
    () => items.filter((i) => i.status === 'error').length,
    [items]
  )

  const totalItems = useMemo(
    () => job?.total_items ?? 0,
    [job]
  )

  const isComplete = useMemo(
    () => job?.status === 'completed' || job?.status === 'failed',
    [job]
  )

  return {
    job,
    items,
    successCount,
    errorCount,
    totalItems,
    isComplete,
    isLoading,
    isDisconnected,
  }
}
