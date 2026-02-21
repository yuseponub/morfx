'use client'

/**
 * Comandos Layout Component
 * Phase 24: Chat de Comandos UI
 *
 * Client root that manages all state for the Comandos module.
 * Handles command parsing, realtime progress tracking, and job lifecycle.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Terminal } from 'lucide-react'
import { CommandPanel } from './command-panel'
import { HistoryPanel } from './history-panel'
import { useRobotJobProgress } from '@/hooks/use-robot-job-progress'
import {
  executeSubirOrdenesCoord,
  getJobStatus,
  getCommandHistory,
  getJobItemsForHistory,
} from '@/app/actions/comandos'
import type { RobotJob } from '@/lib/domain/robot-jobs'

// Dynamic import for split panel (Allotment has no SSR support)
const ComandosSplitPanel = dynamic(
  () => import('./comandos-split-panel').then(mod => mod.ComandosSplitPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    ),
  }
)

// ============================================================================
// Types
// ============================================================================

export type CommandMessage =
  | { type: 'command'; text: string; timestamp: string }
  | { type: 'system'; text: string; timestamp: string }
  | { type: 'progress'; current: number; total: number; timestamp: string }
  | {
      type: 'result'
      success: number
      error: number
      details: Array<{
        orderId: string
        orderName: string | null
        status: 'success' | 'error'
        trackingNumber?: string
        errorMessage?: string
      }>
      timestamp: string
    }
  | { type: 'error'; text: string; timestamp: string }
  | { type: 'help'; timestamp: string }

// ============================================================================
// Helper
// ============================================================================

function now(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' })
}

// ============================================================================
// Component
// ============================================================================

export function ComandosLayout() {
  // Command output messages
  const [messages, setMessages] = useState<CommandMessage[]>([])
  // Active job tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  // Job history
  const [history, setHistory] = useState<RobotJob[]>([])
  // Input disabled flag
  const [isExecuting, setIsExecuting] = useState(false)
  // Track previous processed count to detect changes
  const prevProcessedRef = useRef(0)
  // Track previous isComplete to detect transition
  const prevIsCompleteRef = useRef(false)

  // Realtime hook
  const { job, items, successCount, errorCount, totalItems, isComplete } =
    useRobotJobProgress(activeJobId)

  // ---- Helper: add message ----
  const addMessage = useCallback((msg: CommandMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  // ---- Helper: load history ----
  const loadHistory = useCallback(async () => {
    const result = await getCommandHistory()
    if (result.success && result.data) {
      setHistory(result.data)
    }
  }, [])

  // ---- Progress message injection ----
  // When successCount + errorCount changes and job is active,
  // update the LAST progress message (or add one if not present).
  useEffect(() => {
    if (!activeJobId) return

    const processed = successCount + errorCount
    if (processed === prevProcessedRef.current) return
    prevProcessedRef.current = processed

    setMessages(prev => {
      // Find the last progress message index
      const lastProgressIdx = prev.findLastIndex(m => m.type === 'progress')
      const progressMsg: CommandMessage = {
        type: 'progress',
        current: processed,
        total: totalItems,
        timestamp: now(),
      }

      if (lastProgressIdx !== -1) {
        // Replace existing progress message
        const updated = [...prev]
        updated[lastProgressIdx] = progressMsg
        return updated
      }
      // Add new progress message
      return [...prev, progressMsg]
    })
  }, [activeJobId, successCount, errorCount, totalItems])

  // ---- Completion detection ----
  useEffect(() => {
    if (isComplete && !prevIsCompleteRef.current && activeJobId) {
      // Build result details from items
      const details = items.map(item => ({
        orderId: item.order_id,
        orderName: null as string | null,
        status: item.status === 'success' ? ('success' as const) : ('error' as const),
        trackingNumber: item.tracking_number ?? undefined,
        errorMessage: item.error_message ?? undefined,
      }))

      addMessage({
        type: 'result',
        success: successCount,
        error: errorCount,
        details,
        timestamp: now(),
      })

      setActiveJobId(null)
      setIsExecuting(false)
      prevProcessedRef.current = 0
      loadHistory()
    }
    prevIsCompleteRef.current = isComplete
  }, [isComplete, activeJobId, items, successCount, errorCount, addMessage, loadHistory])

  // ---- Initial load ----
  useEffect(() => {
    // Load history
    loadHistory()

    // Detect active job (reconnect scenario)
    async function detectActiveJob() {
      const result = await getJobStatus()
      if (result.success && result.data) {
        const activeJob = result.data
        if (
          activeJob.job.status === 'pending' ||
          activeJob.job.status === 'processing'
        ) {
          setActiveJobId(activeJob.job.id)
          addMessage({
            type: 'system',
            text: 'Reconectando a job activo...',
            timestamp: now(),
          })
          setIsExecuting(true)
          prevProcessedRef.current =
            activeJob.items.filter(
              i => i.status === 'success' || i.status === 'error'
            ).length
        }
      }
    }
    detectActiveJob()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Command handler ----
  const handleCommand = useCallback(
    async (input: string) => {
      const normalized = input.trim().toLowerCase()

      // Echo the command
      addMessage({ type: 'command', text: input, timestamp: now() })

      if (normalized === 'ayuda') {
        addMessage({ type: 'help', timestamp: now() })
        return
      }

      if (normalized === 'estado') {
        if (activeJobId && job) {
          addMessage({
            type: 'system',
            text: `Job activo: ${successCount + errorCount}/${totalItems} procesadas (${successCount} exitos, ${errorCount} errores)`,
            timestamp: now(),
          })
        } else {
          addMessage({
            type: 'system',
            text: 'No hay job activo.',
            timestamp: now(),
          })
        }
        return
      }

      if (normalized === 'subir ordenes coord') {
        setIsExecuting(true)
        addMessage({
          type: 'system',
          text: 'Preparando ordenes...',
          timestamp: now(),
        })

        const result = await executeSubirOrdenesCoord()
        if (!result.success) {
          addMessage({
            type: 'error',
            text: result.error!,
            timestamp: now(),
          })
          setIsExecuting(false)
          return
        }

        const data = result.data!
        addMessage({
          type: 'system',
          text: `Job creado: ${data.validCount} ordenes validas de ${data.totalOrders} total.${data.invalidCount > 0 ? ` ${data.invalidCount} invalidas.` : ''}`,
          timestamp: now(),
        })

        if (data.invalidOrders.length > 0) {
          const invalidText = data.invalidOrders
            .map(o => `  - ${o.orderName || o.orderId}: ${o.reason}`)
            .join('\n')
          addMessage({
            type: 'system',
            text: `Ordenes invalidas:\n${invalidText}`,
            timestamp: now(),
          })
        }

        setActiveJobId(data.jobId)
        return
      }

      // Unknown command
      addMessage({
        type: 'system',
        text: `Comando no reconocido: "${input}". Escribe "ayuda" para ver los comandos disponibles.`,
        timestamp: now(),
      })
    },
    [activeJobId, job, successCount, errorCount, totalItems, addMessage]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center px-6 border-b bg-card">
        <Terminal className="h-5 w-5 mr-2 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Comandos</h1>
      </div>
      <div className="flex-1 min-h-0">
        <ComandosSplitPanel
          leftPanel={
            <CommandPanel
              messages={messages}
              onCommand={handleCommand}
              isExecuting={isExecuting}
              activeJobId={activeJobId}
              successCount={successCount}
              errorCount={errorCount}
              totalItems={totalItems}
            />
          }
          rightPanel={
            <HistoryPanel history={history} onRefresh={loadHistory} />
          }
        />
      </div>
    </div>
  )
}
