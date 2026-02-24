'use client'

/**
 * Comandos Layout Component
 * Phase 24 + Phase 27 + Phase 28: Chat de Comandos UI
 *
 * Client root that manages all state for the Comandos module.
 * Handles command parsing, realtime progress tracking, job lifecycle,
 * file upload staging, OCR result rendering, and PDF/Excel guide generation.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Terminal } from 'lucide-react'
import { CommandPanel } from './command-panel'
import { HistoryPanel } from './history-panel'
import { useRobotJobProgress } from '@/hooks/use-robot-job-progress'
import {
  executeSubirOrdenesCoord,
  executeBuscarGuiasCoord,
  executeLeerGuias,
  executeGenerarGuiasInter,
  executeGenerarGuiasBogota,
  executeGenerarExcelEnvia,
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
  | {
      type: 'ocr_result'
      autoAssigned: Array<{
        guideNumber: string
        orderName: string | null
        carrier: string
        confidence: number
        matchedBy: string
      }>
      pendingConfirmation: Array<{
        guideNumber: string | null
        suggestedOrderName: string | null
        carrier: string
        confidence: number
        matchedBy: string
      }>
      noMatch: Array<{
        guideNumber: string | null
        carrier: string
      }>
      ocrFailed: Array<{
        fileName: string
      }>
      timestamp: string
    }
  | {
      type: 'document_result'
      documentUrl: string
      documentType: 'pdf' | 'excel'
      totalOrders: number
      carrierName: string
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
  // Active job type (for OCR vs shipment result rendering)
  const [activeJobType, setActiveJobType] = useState<string | null>(null)
  // Job history
  const [history, setHistory] = useState<RobotJob[]>([])
  // Input disabled flag
  const [isExecuting, setIsExecuting] = useState(false)
  // Staged files for OCR upload
  const [stagedFiles, setStagedFiles] = useState<Array<{ fileName: string; mimeType: string; base64Data: string }>>([])
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

  // ---- File staging handler ----
  const handleFilesSelected = useCallback(
    (files: Array<{ fileName: string; mimeType: string; base64Data: string }>) => {
      setStagedFiles(prev => [...prev, ...files])
    },
    []
  )

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
      // FIRST: PDF/Excel guide completion -> document_result message
      // Uses async fetch to avoid Realtime race condition (job status event
      // may arrive before item updates, causing 0 orders / empty URL)
      if (['pdf_guide_inter', 'pdf_guide_bogota', 'excel_guide_envia'].includes(activeJobType ?? '')) {
        const jobType = activeJobType!
        const jobIdCopy = activeJobId

        // Reset state immediately (don't wait for async)
        setActiveJobId(null)
        setActiveJobType(null)
        setIsExecuting(false)
        prevProcessedRef.current = 0

        getJobItemsForHistory(jobIdCopy).then((finalResult) => {
          const finalItems = finalResult.success && finalResult.data ? finalResult.data : items
          const finalSuccessCount = finalItems.filter(i => i.status === 'success').length

          const successItem = finalItems.find(i => i.status === 'success' && i.value_sent)
          const documentUrl = (successItem?.value_sent as any)?.documentUrl
          const isExcel = jobType === 'excel_guide_envia'
          const carrierNames: Record<string, string> = {
            'pdf_guide_inter': 'Inter Rapidisimo',
            'pdf_guide_bogota': 'Bogota',
            'excel_guide_envia': 'Envia',
          }
          addMessage({
            type: 'document_result',
            documentUrl: documentUrl || '',
            documentType: isExcel ? 'excel' : 'pdf',
            totalOrders: finalSuccessCount,
            carrierName: carrierNames[jobType] || jobType,
            timestamp: now(),
          })
          loadHistory()
        })

        prevIsCompleteRef.current = isComplete
        return
      // SECOND: OCR completion -> ocr_result message
      } else if (activeJobType === 'ocr_guide_read') {
        // Parse structured OCR metadata from value_sent JSONB (set by orchestrator)
        type OcrMeta = Record<string, unknown>

        const autoAssigned: Array<{ guideNumber: string; orderName: string | null; carrier: string; confidence: number; matchedBy: string }> = []
        const lowConfidence: Array<{ guideNumber: string | null; suggestedOrderName: string | null; carrier: string; confidence: number; matchedBy: string }> = []
        const noMatch: Array<{ guideNumber: string | null; carrier: string }> = []
        const ocrFailed: Array<{ fileName: string }> = []

        for (const item of items) {
          const meta = (item.value_sent ?? {}) as OcrMeta
          const category = meta.ocrCategory as string | undefined

          switch (category) {
            case 'auto_assigned':
              autoAssigned.push({
                guideNumber: (meta.guideNumber as string) || 'N/A',
                orderName: (meta.orderName as string | null) ?? null,
                carrier: (meta.carrier as string) || 'DESCONOCIDA',
                confidence: (meta.confidence as number) || 0,
                matchedBy: (meta.matchedBy as string) || '',
              })
              break
            case 'low_confidence':
              lowConfidence.push({
                guideNumber: (meta.guideNumber as string | null) ?? null,
                suggestedOrderName: (meta.suggestedOrderName as string | null) ?? null,
                carrier: (meta.carrier as string) || 'DESCONOCIDA',
                confidence: (meta.confidence as number) || 0,
                matchedBy: (meta.matchedBy as string) || '',
              })
              break
            case 'no_match':
              noMatch.push({
                guideNumber: (meta.guideNumber as string | null) ?? null,
                carrier: (meta.carrier as string) || 'DESCONOCIDA',
              })
              break
            case 'ocr_failed':
              ocrFailed.push({
                fileName: (meta.fileName as string) || 'desconocido',
              })
              break
            default:
              // Fallback for items without value_sent
              ocrFailed.push({ fileName: 'desconocido' })
          }
        }

        addMessage({
          type: 'ocr_result',
          autoAssigned,
          pendingConfirmation: lowConfidence,
          noMatch,
          ocrFailed,
          timestamp: now(),
        })
      // THIRD: Default -> shipment/guide result
      } else {
        // Existing result message for shipment/guide jobs
        const details = items
          .filter(item => item.order_id != null)
          .map(item => ({
            orderId: item.order_id!,
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
      }

      setActiveJobId(null)
      setActiveJobType(null)
      setIsExecuting(false)
      prevProcessedRef.current = 0
      loadHistory()
    }
    prevIsCompleteRef.current = isComplete
  }, [isComplete, activeJobId, activeJobType, items, successCount, errorCount, addMessage, loadHistory])

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
          setActiveJobType(activeJob.job.job_type ?? null)
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
        setActiveJobType('create_shipment')
        return
      }

      if (normalized === 'buscar guias coord') {
        setIsExecuting(true)
        addMessage({
          type: 'system',
          text: 'Buscando ordenes pendientes de guia...',
          timestamp: now(),
        })

        const result = await executeBuscarGuiasCoord()
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
          text: `Job creado: buscando guias para ${data.totalOrders} ordenes.`,
          timestamp: now(),
        })

        setActiveJobId(data.jobId)
        setActiveJobType('guide_lookup')
        return
      }

      if (normalized === 'leer guias') {
        if (stagedFiles.length === 0) {
          addMessage({
            type: 'error',
            text: 'Adjunta fotos de guias primero (arrastra o usa el boton "Leer guias").',
            timestamp: now(),
          })
          return
        }

        setIsExecuting(true)
        addMessage({
          type: 'system',
          text: `Leyendo ${stagedFiles.length} guia${stagedFiles.length > 1 ? 's' : ''}...`,
          timestamp: now(),
        })

        const result = await executeLeerGuias({ files: stagedFiles })
        // Clear staged files after submission
        setStagedFiles([])

        if (!result.success) {
          addMessage({ type: 'error', text: result.error!, timestamp: now() })
          setIsExecuting(false)
          return
        }

        const data = result.data!
        addMessage({
          type: 'system',
          text: `Job OCR creado: procesando ${data.totalFiles} archivo${data.totalFiles > 1 ? 's' : ''}.`,
          timestamp: now(),
        })

        setActiveJobId(data.jobId)
        setActiveJobType('ocr_guide_read')
        return
      }

      if (normalized === 'generar guias inter') {
        setIsExecuting(true)
        addMessage({ type: 'system', text: 'Preparando guias Interrapidisimo...', timestamp: now() })
        const result = await executeGenerarGuiasInter()
        if (!result.success) {
          addMessage({ type: 'error', text: result.error!, timestamp: now() })
          setIsExecuting(false)
          return
        }
        addMessage({
          type: 'system',
          text: `Job creado: generando guias para ${result.data!.totalOrders} ordenes.`,
          timestamp: now(),
        })
        setActiveJobId(result.data!.jobId)
        setActiveJobType('pdf_guide_inter')
        return
      }

      if (normalized === 'generar guias bogota') {
        setIsExecuting(true)
        addMessage({ type: 'system', text: 'Preparando guias Bogota...', timestamp: now() })
        const result = await executeGenerarGuiasBogota()
        if (!result.success) {
          addMessage({ type: 'error', text: result.error!, timestamp: now() })
          setIsExecuting(false)
          return
        }
        addMessage({
          type: 'system',
          text: `Job creado: generando guias para ${result.data!.totalOrders} ordenes.`,
          timestamp: now(),
        })
        setActiveJobId(result.data!.jobId)
        setActiveJobType('pdf_guide_bogota')
        return
      }

      if (normalized === 'generar excel envia') {
        setIsExecuting(true)
        addMessage({ type: 'system', text: 'Preparando Excel Envia...', timestamp: now() })
        const result = await executeGenerarExcelEnvia()
        if (!result.success) {
          addMessage({ type: 'error', text: result.error!, timestamp: now() })
          setIsExecuting(false)
          return
        }
        addMessage({
          type: 'system',
          text: `Job creado: generando Excel para ${result.data!.totalOrders} ordenes.`,
          timestamp: now(),
        })
        setActiveJobId(result.data!.jobId)
        setActiveJobType('excel_guide_envia')
        return
      }

      // Unknown command
      addMessage({
        type: 'system',
        text: `Comando no reconocido: "${input}". Escribe "ayuda" para ver los comandos disponibles.`,
        timestamp: now(),
      })
    },
    [activeJobId, job, successCount, errorCount, totalItems, addMessage, stagedFiles]
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
              onFilesSelected={handleFilesSelected}
              stagedFileCount={stagedFiles.length}
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
