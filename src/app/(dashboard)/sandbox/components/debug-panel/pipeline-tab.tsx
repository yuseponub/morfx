'use client'

/**
 * Pipeline Tab Component
 * Debug Panel v4.0: standalone/debug-panel-v4
 *
 * The primary debug tab. Shows a full overview of every turn's processing
 * pipeline with turn-chip navigation and 11 expandable steps.
 *
 * Structure:
 * - Top: horizontal turn chips (color-coded by category, with flags)
 * - Middle: 11 pipeline steps (expandable, skipped steps dimmed)
 * - Footer: Claude calls + tokens for selected turn
 */

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { DebugTurn } from '@/lib/sandbox/types'

interface PipelineTabProps {
  debugTurns: DebugTurn[]
}

// ============================================================================
// Turn Chip Navigation
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  'RESPONDIBLE': 'border-green-500 bg-green-50 dark:bg-green-950/30',
  'SILENCIOSO': 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30',
  'HANDOFF': 'border-red-500 bg-red-50 dark:bg-red-950/30',
}

function TurnChip({ turn, selected, onClick }: {
  turn: DebugTurn; selected: boolean; onClick: () => void
}) {
  const category = turn.classification?.category ?? 'RESPONDIBLE'
  const colorClass = CATEGORY_COLORS[category] ?? 'border-gray-300 bg-gray-50 dark:bg-gray-900/30'

  // Flags
  const flags: string[] = []
  if (turn.preSendCheck?.interrupted) flags.push('\u26A1')
  if (turn.templateSelection?.isRepeated) flags.push('\uD83D\uDD04')
  if (turn.ofiInter?.route1?.detected || turn.ofiInter?.route3?.detected) flags.push('\uD83C\uDFE2')
  if (turn.orchestration?.shouldCreateOrder) flags.push('\uD83D\uDCB3')

  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 px-2 py-1 text-xs rounded-full border-2 whitespace-nowrap transition-all',
        colorClass,
        selected && 'ring-2 ring-primary ring-offset-1'
      )}
    >
      T{turn.turnNumber}
      {turn.intent && <span className="mx-0.5">&middot;</span>}
      {turn.intent && <span>{turn.intent.intent}</span>}
      {turn.intent && <span className="ml-0.5 opacity-70">{turn.intent.confidence}%</span>}
      {flags.length > 0 && <span className="ml-1">{flags.join('')}</span>}
    </button>
  )
}

// ============================================================================
// Pipeline Step
// ============================================================================

function PipelineStep({ stepNumber, name, active, summary, children }: {
  stepNumber: number; name: string; active: boolean; summary: string; children?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('border rounded-lg overflow-hidden', !active && 'opacity-40')}>
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => active && children && setExpanded(!expanded)}
        disabled={!active || !children}
      >
        <span className="text-xs text-muted-foreground w-5">{stepNumber}.</span>
        {active ? (
          <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
        ) : (
          <span className="text-xs text-muted-foreground shrink-0 font-mono">--</span>
        )}
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground truncate flex-1 text-right">{summary}</span>
        {active && children && (
          expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
        )}
      </button>
      {expanded && children && (
        <div className="px-3 pb-3 pt-2 border-t bg-muted/20 text-xs space-y-1">
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Step Detail Renderers
// ============================================================================

function IngestDetail({ turn }: { turn: DebugTurn }) {
  const d = turn.ingestDetails
  if (!d) return null
  return (
    <>
      {d.classification && (
        <div>Clasificacion: <span className="font-medium">{d.classification}</span>
          {d.classificationConfidence != null && <span className="ml-1 opacity-70">({d.classificationConfidence}%)</span>}
        </div>
      )}
      {d.extractedFields && d.extractedFields.length > 0 && (
        <div>
          Campos extraidos:
          {d.extractedFields.map((f, i) => (
            <span key={i} className="ml-1 inline-flex items-center gap-0.5">
              <span className="font-medium">{f.field}</span>=<span className="text-muted-foreground">{f.value}</span>
              {i < d.extractedFields!.length - 1 && ','}
            </span>
          ))}
        </div>
      )}
      {d.action && <div>Accion: <span className="font-medium">{d.action}</span></div>}
    </>
  )
}

function ImplicitYesDetail({ turn }: { turn: DebugTurn }) {
  const iy = turn.ingestDetails?.implicitYes
  if (!iy) return null
  return (
    <>
      <div>Triggered: <span className="font-medium">{iy.triggered ? 'si' : 'no'}</span></div>
      <div>Datos encontrados: <span className="font-medium">{iy.dataFound ? 'si' : 'no'}</span></div>
      {iy.modeTransition && <div>Transicion: <span className="font-medium">{iy.modeTransition}</span></div>}
    </>
  )
}

function OfiInterDetail({ turn }: { turn: DebugTurn }) {
  const oi = turn.ofiInter
  if (!oi) return null
  return (
    <>
      {oi.route1.detected && (
        <div>Ruta 1 (mencion directa): <span className="font-medium">{oi.route1.pattern ?? 'detectada'}</span></div>
      )}
      {oi.route3.detected && (
        <div>Ruta 3 (municipio remoto): <span className="font-medium">{oi.route3.city ?? 'detectada'}</span>
          {oi.route3.isRemote != null && <span className="ml-1">({oi.route3.isRemote ? 'remoto' : 'local'})</span>}
        </div>
      )}
    </>
  )
}

function IntentDetail({ turn }: { turn: DebugTurn }) {
  const intent = turn.intent
  if (!intent) return null
  return (
    <>
      {intent.alternatives && intent.alternatives.length > 0 && (
        <div>
          Alternativas:{' '}
          {intent.alternatives.map((a, i) => (
            <span key={i} className="ml-1">{a.intent} ({a.confidence}%){i < intent.alternatives!.length - 1 ? ',' : ''}</span>
          ))}
        </div>
      )}
      {intent.reasoning && <div className="text-muted-foreground">{intent.reasoning}</div>}
    </>
  )
}

function CategoryDetail({ turn }: { turn: DebugTurn }) {
  const c = turn.classification
  if (!c) return null
  return (
    <>
      <div>Razon: <span className="font-medium">{c.reason}</span></div>
      <div className="flex gap-2 flex-wrap">
        {Object.entries(c.rulesChecked).map(([key, val]) => (
          <span key={key} className={cn('px-1.5 py-0.5 rounded', val ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-muted text-muted-foreground')}>
            {key}: {val ? 'triggered' : 'pass'}
          </span>
        ))}
      </div>
    </>
  )
}

function OrchestrateDetail({ turn }: { turn: DebugTurn }) {
  const o = turn.orchestration
  if (!o) return null
  return (
    <>
      <div>Modo: <span className="font-medium">{o.previousMode}</span> {o.modeChanged ? <span>-&gt; <span className="font-medium">{o.nextMode}</span></span> : '(sin cambio)'}</div>
      <div>Templates: <span className="font-medium">{o.templatesCount}</span></div>
      {o.shouldCreateOrder && <div className="text-green-600 dark:text-green-400 font-medium">Crear orden</div>}
    </>
  )
}

function BlockCompositionDetail({ turn }: { turn: DebugTurn }) {
  const b = turn.blockComposition
  if (!b) return null
  return (
    <>
      {b.composedBlock.length > 0 && (
        <div className="space-y-0.5">
          {b.composedBlock.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={cn(
                'px-1 py-0.5 rounded text-[10px] font-medium',
                t.priority === 'CORE' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                t.priority === 'COMPLEMENTARIA' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              )}>
                {t.priority}
              </span>
              <span>{t.name}</span>
              <span className={cn(
                'text-[10px]',
                t.status === 'sent' ? 'text-green-600 dark:text-green-400' :
                t.status === 'pending' ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              )}>
                {t.status}
              </span>
            </div>
          ))}
        </div>
      )}
      {(b.overflow.pending > 0 || b.overflow.dropped > 0) && (
        <div className="text-muted-foreground">
          Overflow: {b.overflow.pending} pending, {b.overflow.dropped} dropped
        </div>
      )}
    </>
  )
}

function NoRepDetail({ turn }: { turn: DebugTurn }) {
  const nr = turn.noRepetition
  if (!nr) return null
  return (
    <>
      {nr.perTemplate.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="font-medium">{t.templateName}</span>
          <span className={cn('text-[10px] px-1 rounded', t.result === 'sent' ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-red-100 dark:bg-red-900/30 text-red-700')}>
            {t.result}
          </span>
          {t.filteredAtLevel && <span className="text-muted-foreground">L{t.filteredAtLevel}</span>}
        </div>
      ))}
    </>
  )
}

function SendLoopDetail({ turn }: { turn: DebugTurn }) {
  const ps = turn.preSendCheck
  if (!ps) return null
  return (
    <>
      {ps.perTemplate.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <span>Template #{t.index + 1}:</span>
          <span className={cn('font-medium', t.checkResult === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
            {t.checkResult}
          </span>
          {t.newMessageFound && <span className="text-yellow-600 dark:text-yellow-400">(nuevo mensaje)</span>}
        </div>
      ))}
      {ps.pendingSaved > 0 && <div>Guardados como pending: <span className="font-medium">{ps.pendingSaved}</span></div>}
    </>
  )
}

function TimerSignalsDetail({ turn }: { turn: DebugTurn }) {
  const signals = turn.timerSignals
  if (!signals || signals.length === 0) return null
  return (
    <>
      {signals.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={cn(
            'font-medium',
            s.type === 'start' ? 'text-green-600 dark:text-green-400' :
            s.type === 'cancel' ? 'text-red-600 dark:text-red-400' :
            'text-yellow-600 dark:text-yellow-400'
          )}>
            {s.type}
          </span>
          {s.reason && <span className="text-muted-foreground">{s.reason}</span>}
        </div>
      ))}
    </>
  )
}

// ============================================================================
// Claude Call Estimator
// ============================================================================

function estimateClaudeCalls(turn: DebugTurn): number {
  let calls = 0
  // Intent detection always runs (1 call)
  if (turn.intent) calls++
  // Ingest: message classifier
  if (turn.ingestDetails?.classification) calls++
  // Ingest: data extractor
  if (turn.ingestDetails?.extractedFields && turn.ingestDetails.extractedFields.length > 0) calls++
  // No-repetition filter may use multiple calls
  if (turn.noRepetition?.enabled && turn.noRepetition.perTemplate.length > 0) {
    // L2 and L3 are separate Claude calls per template
    for (const t of turn.noRepetition.perTemplate) {
      if (t.level2 != null) calls++
      if (t.level3 != null) calls++
    }
  }
  return calls
}

// ============================================================================
// Pipeline Steps Builder
// ============================================================================

function PipelineSteps({ turn }: { turn: DebugTurn }) {
  // 1. Ingest
  const ingestActive = turn.ingestDetails != null && turn.ingestDetails.action != null
  const ingestSummary = ingestActive ? (turn.ingestDetails!.action ?? 'skipped') : 'skipped'

  // 2. Implicit Yes
  const implicitYesActive = turn.ingestDetails?.implicitYes != null
  const implicitYesSummary = implicitYesActive
    ? (turn.ingestDetails!.implicitYes!.triggered ? 'triggered' : 'not triggered')
    : 'skipped'

  // 3. Ofi Inter
  const ofiActive = turn.ofiInter != null && (turn.ofiInter.route1.detected || turn.ofiInter.route3.detected)
  const ofiSummary = ofiActive
    ? (turn.ofiInter!.route1.detected ? 'ruta 1' : '') + (turn.ofiInter!.route1.detected && turn.ofiInter!.route3.detected ? ' + ' : '') + (turn.ofiInter!.route3.detected ? 'ruta 3' : '')
    : 'skipped'

  // 4. Intent Detection
  const intentActive = turn.intent != null
  const intentSummary = intentActive
    ? `${turn.intent!.intent} ${turn.intent!.confidence}%`
    : 'skipped'

  // 5. Message Category
  const categoryActive = turn.classification != null
  const categorySummary = categoryActive ? turn.classification!.category : 'skipped'

  // 6. Orchestrate
  const orchActive = turn.orchestration != null
  const orchSummary = orchActive
    ? (turn.orchestration!.modeChanged
        ? `${turn.orchestration!.previousMode} -> ${turn.orchestration!.nextMode}`
        : 'sin cambio')
    : 'skipped'

  // 7. Block Composition
  const blockActive = turn.blockComposition != null
  const blockSummary = blockActive
    ? `${turn.blockComposition!.composedBlock.length} templates`
    : 'skipped'

  // 8. No-Repetition
  const noRepActive = turn.noRepetition != null && turn.noRepetition.enabled
  const noRepSummary = noRepActive
    ? `${turn.noRepetition!.summary.surviving}/${turn.noRepetition!.summary.surviving + turn.noRepetition!.summary.filtered}`
    : (turn.noRepetition != null && !turn.noRepetition.enabled ? 'disabled' : 'skipped')

  // 9. Send Loop
  const sendActive = turn.preSendCheck != null
  const sendSummary = sendActive
    ? `${turn.preSendCheck!.perTemplate.filter(t => t.checkResult === 'ok').length}/${turn.preSendCheck!.perTemplate.length} sent${turn.preSendCheck!.interrupted ? ' (interrupted)' : ''}`
    : 'skipped'

  // 10. Timer Signals
  const timerActive = (turn.timerSignals?.length ?? 0) > 0
  const timerSummary = timerActive
    ? turn.timerSignals!.map(s => s.type).join(', ')
    : 'skipped'

  // 11. Order Creation
  const orderActive = turn.orchestration?.shouldCreateOrder === true
  const orderSummary = orderActive ? 'created' : 'skipped'

  return (
    <div className="space-y-1">
      <PipelineStep stepNumber={1} name="Ingest" active={ingestActive} summary={ingestSummary}>
        <IngestDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={2} name="Implicit Yes" active={implicitYesActive} summary={implicitYesSummary}>
        <ImplicitYesDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={3} name="Ofi Inter" active={ofiActive} summary={ofiSummary}>
        <OfiInterDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={4} name="Intent Detection" active={intentActive} summary={intentSummary}>
        <IntentDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={5} name="Message Category" active={categoryActive} summary={categorySummary}>
        <CategoryDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={6} name="Orchestrate" active={orchActive} summary={orchSummary}>
        <OrchestrateDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={7} name="Block Composition" active={blockActive} summary={blockSummary}>
        <BlockCompositionDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={8} name="No-Repetition" active={noRepActive} summary={noRepSummary}>
        <NoRepDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={9} name="Send Loop" active={sendActive} summary={sendSummary}>
        <SendLoopDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={10} name="Timer Signals" active={timerActive} summary={timerSummary}>
        <TimerSignalsDetail turn={turn} />
      </PipelineStep>

      <PipelineStep stepNumber={11} name="Order Creation" active={orderActive} summary={orderSummary}>
        {orderActive && <div className="font-medium text-green-600 dark:text-green-400">Orden creada</div>}
      </PipelineStep>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function PipelineTab({ debugTurns }: PipelineTabProps) {
  const [selectedTurnIdx, setSelectedTurnIdx] = useState(debugTurns.length - 1)

  // Auto-select latest turn when new turns arrive
  useEffect(() => {
    if (debugTurns.length > 0) {
      setSelectedTurnIdx(debugTurns.length - 1)
    }
  }, [debugTurns.length])

  if (debugTurns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Envia un mensaje para ver el pipeline
      </div>
    )
  }

  // Clamp index in case turns shrink (e.g. session reset)
  const safeIdx = Math.min(selectedTurnIdx, debugTurns.length - 1)
  const selectedTurn = debugTurns[safeIdx >= 0 ? safeIdx : 0]
  const claudeCalls = estimateClaudeCalls(selectedTurn)

  return (
    <div className="flex flex-col h-full">
      {/* Turn chip navigation */}
      <ScrollArea className="w-full border-b pb-2 mb-2">
        <div className="flex gap-1.5 px-1 py-1">
          {debugTurns.map((turn, idx) => (
            <TurnChip
              key={turn.turnNumber}
              turn={turn}
              selected={idx === safeIdx}
              onClick={() => setSelectedTurnIdx(idx)}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Pipeline steps */}
      <div className="flex-1 overflow-y-auto">
        <PipelineSteps turn={selectedTurn} />
      </div>

      {/* Footer: Claude calls + tokens */}
      <div className="flex items-center gap-3 px-3 py-2 border-t text-xs text-muted-foreground mt-2">
        <span>{claudeCalls} Claude call{claudeCalls !== 1 ? 's' : ''}</span>
        <span>&middot;</span>
        <span>{selectedTurn.tokens?.tokensUsed ?? 0} tokens</span>
      </div>
    </div>
  )
}
