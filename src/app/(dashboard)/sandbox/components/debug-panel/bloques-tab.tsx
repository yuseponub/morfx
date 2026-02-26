'use client'

/**
 * Bloques Tab Component
 * Debug Panel v4.0: standalone/debug-panel-v4
 *
 * Shows everything about "what gets sent and how" for the latest turn.
 *
 * 4 Sections:
 * 1. Template Selection — intent, visit type, loaded/sent/selected counts
 * 2. Block Composition — table of templates with priority + status badges
 * 3. No-Repetition — per-template L1/L2/L3 results
 * 4. Send Loop — pre-send check results per template
 *
 * NOTE: Paraphrasing section is DEFERRED (no recordParaphrasing() or engine capture yet).
 */

import { Layers, LayoutGrid, ShieldCheck, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DebugTurn, DebugTemplateSelection, DebugBlockComposition, DebugNoRepetition, DebugPreSendCheck } from '@/lib/sandbox/types'

interface BloquesTabProps {
  debugTurns: DebugTurn[]
}

// ============================================================================
// Helpers
// ============================================================================

function getPriorityColor(priority: string): string {
  switch (priority.toUpperCase()) {
    case 'CORE':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300'
    case 'COMPLEMENTARIA':
    case 'COMP':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-300'
    case 'OPCIONAL':
    case 'OPC':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400 border-gray-300'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400 border-gray-300'
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'sent':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    case 'dropped':
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400'
    default:
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400'
  }
}

function getFilterResultColor(result: 'sent' | 'filtered'): string {
  return result === 'sent'
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
}

function getCheckResultColor(result: 'ok' | 'interrupted'): string {
  return result === 'ok'
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
}

function truncateId(id: string, maxLen = 16): string {
  return id.length > maxLen ? `${id.substring(0, maxLen)}...` : id
}

function shortPriority(priority: string): string {
  switch (priority.toUpperCase()) {
    case 'COMPLEMENTARIA':
      return 'COMP'
    case 'OPCIONAL':
      return 'OPC'
    default:
      return priority.toUpperCase()
  }
}

// ============================================================================
// Section 1: Template Selection
// ============================================================================

function TemplateSelectionSection({ data }: { data: DebugTemplateSelection }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Layers className="h-3.5 w-3.5" />
        Template Selection
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Intent:</span>
          <Badge variant="outline" className="text-xs">{data.intent}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Visita:</span>
          <Badge variant="secondary" className="text-xs">{data.visitType}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Cargados:</span>
          <span className="font-medium">{data.loadedCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Ya enviados:</span>
          <span className="font-medium">{data.alreadySentCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Seleccionados:</span>
          <span className="font-medium">{data.selectedCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Repetido:</span>
          <span className={cn('font-medium', data.isRepeated ? 'text-yellow-600' : 'text-muted-foreground')}>
            {data.isRepeated ? 'Si' : 'No'}
          </span>
        </div>
      </div>

      {data.cappedByNoRep && (
        <div className="text-xs text-yellow-600 dark:text-yellow-400">
          Limitado por no-repetition (max 2 templates)
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Section 2: Block Composition
// ============================================================================

function BlockCompositionSection({ data }: { data: DebugBlockComposition }) {
  const sentCount = data.composedBlock.filter(b => b.status === 'sent').length
  const pendingCount = data.composedBlock.filter(b => b.status === 'pending').length
  const droppedCount = data.composedBlock.filter(b => b.status === 'dropped').length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <LayoutGrid className="h-3.5 w-3.5" />
        Block Composition
      </div>

      {/* Summary line */}
      <div className="text-xs text-muted-foreground">
        New: {data.newTemplates.length} + Pending: {data.pendingFromPrev.length} = Block: {data.composedBlock.length}
      </div>

      {/* Composed block table */}
      {data.composedBlock.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 text-xs">
            {/* Header */}
            <div className="px-2 py-1 bg-muted/50 font-medium text-muted-foreground">Template</div>
            <div className="px-2 py-1 bg-muted/50 font-medium text-muted-foreground text-center">Prioridad</div>
            <div className="px-2 py-1 bg-muted/50 font-medium text-muted-foreground text-center">Estado</div>

            {/* Rows */}
            {data.composedBlock.map((item, idx) => (
              <div key={idx} className="contents">
                <div className="px-2 py-1 border-t truncate font-mono text-xs" title={item.id}>
                  {item.name || truncateId(item.id)}
                </div>
                <div className="px-2 py-1 border-t flex justify-center">
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium border',
                    getPriorityColor(item.priority)
                  )}>
                    {shortPriority(item.priority)}
                  </span>
                </div>
                <div className="px-2 py-1 border-t flex justify-center">
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                    getStatusColor(item.status)
                  )}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overflow info */}
      {(data.overflow.pending > 0 || data.overflow.dropped > 0) && (
        <div className="text-xs text-muted-foreground">
          {data.overflow.pending > 0 && <span>{data.overflow.pending} pending</span>}
          {data.overflow.pending > 0 && data.overflow.dropped > 0 && <span>, </span>}
          {data.overflow.dropped > 0 && <span>{data.overflow.dropped} dropped</span>}
        </div>
      )}

      {/* Sent/pending/dropped summary badges */}
      <div className="flex gap-1.5">
        {sentCount > 0 && (
          <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20">
            {sentCount} sent
          </Badge>
        )}
        {pendingCount > 0 && (
          <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-900/20">
            {pendingCount} pending
          </Badge>
        )}
        {droppedCount > 0 && (
          <Badge variant="outline" className="text-xs bg-gray-50 dark:bg-gray-900/20">
            {droppedCount} dropped
          </Badge>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Section 3: No-Repetition Filter
// ============================================================================

function NoRepetitionSection({ data }: { data: DebugNoRepetition }) {
  if (!data.enabled) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          No-Repetition
        </div>
        <Badge variant="outline" className="text-xs text-muted-foreground">OFF</Badge>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        No-Repetition
      </div>

      {/* Per-template results table */}
      {data.perTemplate.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-1 text-xs">
            {/* Header */}
            <div className="px-2 py-1 bg-muted/50 font-medium text-muted-foreground">Template</div>
            <div className="px-2 py-1 bg-muted/50 font-medium text-muted-foreground text-center">L1</div>
            <div className="px-2 py-1 bg-muted/50 font-medium text-muted-foreground text-center">L2</div>
            <div className="px-2 py-1 bg-muted/50 font-medium text-muted-foreground text-center">L3</div>
            <div className="px-2 py-1 bg-muted/50 font-medium text-muted-foreground text-center">Result</div>

            {/* Rows */}
            {data.perTemplate.map((item, idx) => (
              <div key={idx} className="contents">
                <div className="px-2 py-1 border-t truncate font-mono text-xs" title={item.templateId}>
                  {item.templateName || truncateId(item.templateId)}
                </div>
                <div className="px-2 py-1 border-t text-center">
                  <LevelBadge value={item.level1} />
                </div>
                <div className="px-2 py-1 border-t text-center">
                  <LevelBadge value={item.level2} />
                </div>
                <div className="px-2 py-1 border-t text-center">
                  <LevelBadge value={item.level3} />
                </div>
                <div className="px-2 py-1 border-t text-center">
                  <span className={cn(
                    'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                    getFilterResultColor(item.result)
                  )}>
                    {item.result}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="text-xs text-muted-foreground">
        {data.summary.surviving} surviving, {data.summary.filtered} filtered
      </div>
    </div>
  )
}

/** Small badge for L1/L2/L3 column values */
function LevelBadge({ value }: { value: string | null }) {
  if (value === null) {
    return <span className="text-[10px] text-muted-foreground/40">-</span>
  }

  const colorMap: Record<string, string> = {
    pass: 'text-green-600 dark:text-green-400',
    filtered: 'text-red-600 dark:text-red-400',
    ENVIAR: 'text-green-600 dark:text-green-400',
    NO_ENVIAR: 'text-red-600 dark:text-red-400',
    PARCIAL: 'text-yellow-600 dark:text-yellow-400',
  }

  const shortMap: Record<string, string> = {
    pass: 'P',
    filtered: 'F',
    ENVIAR: 'E',
    NO_ENVIAR: 'N',
    PARCIAL: '~',
  }

  return (
    <span
      className={cn('text-[10px] font-semibold', colorMap[value] ?? 'text-muted-foreground')}
      title={value}
    >
      {shortMap[value] ?? value}
    </span>
  )
}

// ============================================================================
// Section 4: Send Loop
// ============================================================================

function SendLoopSection({ data }: { data: DebugPreSendCheck }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Send className="h-3.5 w-3.5" />
        Send Loop
      </div>

      {/* Per-template checks */}
      {data.perTemplate.length > 0 && (
        <div className="space-y-1">
          {data.perTemplate.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-mono w-6 text-right">#{item.index}</span>
              <span className={cn(
                'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                getCheckResultColor(item.checkResult)
              )}>
                {item.checkResult}
              </span>
              {item.newMessageFound && (
                <span className="text-yellow-600 dark:text-yellow-400 text-[10px]">
                  new msg
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="text-xs text-muted-foreground">
        Interrupted: {data.interrupted ? (
          <span className="text-red-600 dark:text-red-400 font-medium">yes</span>
        ) : (
          <span>no</span>
        )}
        {data.pendingSaved > 0 && (
          <span>, {data.pendingSaved} pending saved</span>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function BloquesTab({ debugTurns }: BloquesTabProps) {
  // Find the latest turn with block-related data
  const relevantTurns = debugTurns.filter(
    t => t.blockComposition || t.templateSelection || t.noRepetition || t.preSendCheck
  )

  if (relevantTurns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Envia un mensaje con templates para ver el sistema de bloques
      </div>
    )
  }

  // Show the latest relevant turn
  const turn = relevantTurns[relevantTurns.length - 1]

  return (
    <div className="space-y-3">
      {/* Turn header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Turno {turn.turnNumber}</span>
        {relevantTurns.length > 1 && (
          <span>{relevantTurns.length} turnos con datos</span>
        )}
      </div>

      {/* Section 1: Template Selection */}
      {turn.templateSelection ? (
        <div className="border rounded-lg p-3">
          <TemplateSelectionSection data={turn.templateSelection} />
        </div>
      ) : (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            Template Selection
          </div>
          <p className="text-xs text-muted-foreground mt-1">No template selection data</p>
        </div>
      )}

      {/* Section 2: Block Composition */}
      {turn.blockComposition ? (
        <div className="border rounded-lg p-3">
          <BlockCompositionSection data={turn.blockComposition} />
        </div>
      ) : (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <LayoutGrid className="h-3.5 w-3.5" />
            Block Composition
          </div>
          <p className="text-xs text-muted-foreground mt-1">No block composition data</p>
        </div>
      )}

      {/* Section 3: No-Repetition */}
      {turn.noRepetition ? (
        <div className="border rounded-lg p-3">
          <NoRepetitionSection data={turn.noRepetition} />
        </div>
      ) : (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            No-Repetition
          </div>
          <p className="text-xs text-muted-foreground mt-1">No no-rep data</p>
        </div>
      )}

      {/* Section 4: Send Loop */}
      {turn.preSendCheck ? (
        <div className="border rounded-lg p-3">
          <SendLoopSection data={turn.preSendCheck} />
        </div>
      ) : (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Send className="h-3.5 w-3.5" />
            Send Loop
          </div>
          <p className="text-xs text-muted-foreground mt-1">No send data</p>
        </div>
      )}
    </div>
  )
}
