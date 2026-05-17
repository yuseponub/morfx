'use client'

/**
 * Sub-Loop Tab Component
 * Standalone: v4-subloop-debug-view / Plan 04 (D-04, D-05).
 *
 * Renders SubLoopDebugPayload per turn:
 *   - Banner (reason + fired + finishReason + latencyMs)
 *   - Fired=false explainer (turns where v4 ran but sub-loop didn't fire)
 *   - Tool calls timeline (expandable, AI SDK v6 input/output)
 *   - KB Hits section (similarity bar, nunca-decir flag) — Pitfall 5: handle undefined
 *   - Outcome (status badge + responseTemplate + responseText preview + confidence)
 *   - Violation banners (invariantViolation, nuncaDecirViolation, errorMessage)
 *
 * Mirrors classify-tab.tsx structure for visual consistency.
 */

import { useState } from 'react'
import {
  Activity,
  Database,
  AlertTriangle,
  Wrench,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { DebugTurn } from '@/lib/sandbox/types'
import type {
  SubLoopDebugPayload,
  SubLoopToolCallSnapshot,
  SubLoopKbHitSnapshot,
} from '@/lib/agents/somnio-v4/sub-loop/debug-payload'

interface SubloopTabProps {
  debugTurns: DebugTurn[]
}

// ============================================================================
// Helpers (mirror classify-tab.tsx — keep visual consistency)
// ============================================================================

function normalizeSimilarity(s: number): number {
  return s <= 1 ? Math.round(s * 100) : Math.round(s)
}

function getSimilarityColor(s: number): string {
  const n = normalizeSimilarity(s)
  if (n >= 85) return 'text-green-600 dark:text-green-400'
  if (n >= 60) return 'text-yellow-600 dark:text-yellow-400'
  if (n >= 40) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

function getOutcomeStatusBadge(status: string | undefined): 'default' | 'secondary' | 'destructive' {
  if (!status) return 'secondary'
  // Plan 03 RAG-generative: 'generated' (nuevo) reemplaza 'canonical' (eliminado).
  if (status === 'generated' || status === 'template') return 'default'
  return 'destructive' // no_match
}

/**
 * Plan 03 RAG-generative: color del responseConfidence (D-19 threshold 0.70).
 * - >= 0.80: verde (alta confianza).
 * - >= 0.70: amarillo (apenas pasa threshold).
 * - < 0.70: rojo (handoff territory — el orchestrator dispara handoff).
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.80) return 'text-green-600 dark:text-green-400'
  if (confidence >= 0.70) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function getReasonBadgeColor(reason: string): string {
  switch (reason) {
    case 'low_confidence':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300'
    case 'crm_mutation':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300'
    case 'cas_reject':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300'
    case 'razonamiento_libre':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300 border-gray-300'
  }
}

// ============================================================================
// Sub-components
// ============================================================================

function BannerSection({ payload }: { payload: SubLoopDebugPayload }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        Sub-Loop
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border',
            getReasonBadgeColor(payload.reason),
          )}
        >
          {payload.reason}
        </span>
        <Badge variant="default" className="text-[10px]">
          fired
        </Badge>
        {payload.finishReason && (
          <Badge variant="outline" className="text-[10px]">
            finish: {payload.finishReason}
          </Badge>
        )}
        {payload.stepCount !== undefined && (
          <Badge variant="outline" className="text-[10px]">
            steps: {payload.stepCount}
          </Badge>
        )}
        {payload.latencyMs !== undefined && (
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {Math.round(payload.latencyMs)}ms
          </span>
        )}
      </div>
    </div>
  )
}

function FiredFalseExplainer({ turn }: { turn: DebugTurn }) {
  // Render when sub-loop did NOT fire on this v4 turn. We have intent_confidence + threshold
  // available from classify surface (Plan 07 parent standalone analog).
  const conf = turn.intent?.intent_confidence
  const threshold = turn.threshold
  if (conf === undefined || threshold === undefined) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Sub-loop did not fire (no confidence data available for this turn).
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground italic">
        Sub-loop did not fire — confidence ≥ threshold.
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">intent_confidence</span>
        <span className="font-mono font-medium">{conf.toFixed(3)}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">threshold</span>
        <span className="font-mono">{threshold.toFixed(2)}</span>
      </div>
    </div>
  )
}

function ToolCallItem({
  call,
  result,
  index,
}: {
  call: SubLoopToolCallSnapshot
  result?: SubLoopToolCallSnapshot
  index: number
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">#{index + 1}</span>
        <span className="font-mono text-sm truncate flex-1">{call.toolName}</span>
        {result ? (
          <Badge variant="default" className="shrink-0 text-[10px]">
            ok
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            pending
          </Badge>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t bg-muted/30">
          <div className="pt-2">
            <span className="text-xs text-muted-foreground">Input:</span>
            <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          {result && (
            <div>
              <span className="text-xs text-muted-foreground">Output (preview, max 500ch):</span>
              <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
                {result.outputPreview ?? JSON.stringify(result.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolCallsTimeline({ payload }: { payload: SubLoopDebugPayload }) {
  if (payload.toolCalls.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No tool calls (model emitted output directly).
      </div>
    )
  }
  // Match each call to its result by index (AI SDK v6 step order preserves pairing).
  // If toolResults has fewer entries than toolCalls, some pending — match by toolName fallback.
  const resultsByName = new Map<string, SubLoopToolCallSnapshot>()
  payload.toolResults.forEach((r) => {
    if (!resultsByName.has(r.toolName)) resultsByName.set(r.toolName, r)
  })
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Wrench className="h-3.5 w-3.5" />
        Tool calls ({payload.toolCalls.length})
      </div>
      {payload.toolCalls.map((call, idx) => (
        <ToolCallItem
          key={idx}
          call={call}
          result={payload.toolResults[idx] ?? resultsByName.get(call.toolName)}
          index={idx}
        />
      ))}
    </div>
  )
}

function KbHitsSection({ hits }: { hits: SubLoopKbHitSnapshot[] }) {
  if (hits.length === 0) {
    return (
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          KB Hits
        </div>
        <div className="text-xs text-muted-foreground/70 italic">
          kb_search returned 0 hits.
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        KB Hits ({hits.length})
      </div>
      {hits.map((hit, idx) => (
        <div key={idx} className="space-y-1.5 border rounded-lg p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs truncate flex-1">{hit.topic}</span>
            {hit.hasNuncaDecir && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                nunca-decir
              </Badge>
            )}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">similarity</span>
              <span className={cn('font-mono font-medium', getSimilarityColor(hit.similarity))}>
                {normalizeSimilarity(hit.similarity)}%
              </span>
            </div>
            <Progress value={normalizeSimilarity(hit.similarity)} className="h-1.5" />
          </div>
          {hit.contentPreview && (
            <p className="text-[11px] text-muted-foreground/80 line-clamp-2">
              {hit.contentPreview}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function KbNotConsulted() {
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        KB Hits
      </div>
      <div className="text-xs text-muted-foreground/60 italic">
        KB not consulted in this turn.
      </div>
    </div>
  )
}

function OutcomeSection({ payload }: { payload: SubLoopDebugPayload }) {
  const outcome = payload.outcome
  if (!outcome) return null
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {outcome.requiresHuman ? (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
        )}
        Outcome
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={getOutcomeStatusBadge(outcome.status)} className="text-[10px]">
          {outcome.status}
        </Badge>
        {outcome.responseTemplate && (
          <Badge variant="outline" className="text-[10px]">
            template: {outcome.responseTemplate}
          </Badge>
        )}
        {outcome.sourceTopic && (
          <Badge variant="outline" className="text-[10px]">
            topic: {outcome.sourceTopic}
          </Badge>
        )}
        {outcome.requiresHuman && (
          <Badge variant="destructive" className="text-[10px]">
            requires human
          </Badge>
        )}
      </div>
      {outcome.responseText && (
        <div>
          <span className="text-xs text-muted-foreground">response text (Plan 03 RAG-generative):</span>
          <pre className="mt-1 p-2 bg-muted/40 rounded text-xs overflow-auto max-h-24 whitespace-pre-wrap">
            {outcome.responseText}
          </pre>
        </div>
      )}
      {outcome.responseConfidence !== null && outcome.responseConfidence !== undefined && (
        <div className="text-xs flex gap-2 items-baseline">
          <span className="text-muted-foreground">confidence:</span>
          <span className={getConfidenceColor(outcome.responseConfidence)}>
            {outcome.responseConfidence.toFixed(2)}
          </span>
          {outcome.confidenceRationale && (
            <span className="text-muted-foreground/80 italic truncate">
              — {outcome.confidenceRationale}
            </span>
          )}
        </div>
      )}
      {outcome.reason && (
        <div className="text-xs">
          <span className="text-muted-foreground">reason:</span>{' '}
          <span className="text-muted-foreground/90">{outcome.reason}</span>
        </div>
      )}
    </div>
  )
}

function ViolationBanner({
  kind,
  message,
}: {
  kind: 'invariant' | 'nunca_decir' | 'error'
  message: string
}) {
  const label =
    kind === 'invariant'
      ? 'Invariant violation'
      : kind === 'nunca_decir'
        ? 'NUNCA-decir violation'
        : 'Error'
  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-red-700 dark:text-red-300">{label}</div>
        <div className="text-xs text-red-600 dark:text-red-400 break-words">{message}</div>
      </div>
    </div>
  )
}

// ============================================================================
// Main component
// ============================================================================

export function SubloopTab({ debugTurns }: SubloopTabProps) {
  // Render ALL v4 turns (so user can see fired=false explainer). A v4 turn is
  // detectable via the presence of intent.intent_confidence (Plan 07 parent
  // standalone — only v4 path populates this). For non-v4 turns we skip.
  const v4Turns = debugTurns.filter(
    (t) => t.intent?.intent_confidence !== undefined || t.subLoopDebug !== undefined,
  )

  if (v4Turns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground text-center px-4">
        No v4 turns yet — send a message with agentId=&quot;somnio-sales-v4&quot; in the
        sandbox to populate this tab.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {v4Turns.map((turn, idx) => {
        const payload = turn.subLoopDebug
        return (
          <div key={idx} className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Turno {turn.turnNumber}</span>
              {payload ? (
                <Badge variant="default" className="text-[10px]">
                  sub-loop fired
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  not fired
                </Badge>
              )}
            </div>

            {payload ? (
              <>
                <BannerSection payload={payload} />
                {payload.errorMessage && (
                  <ViolationBanner kind="error" message={payload.errorMessage} />
                )}
                {payload.invariantViolation && (
                  <ViolationBanner kind="invariant" message={payload.invariantViolation} />
                )}
                {payload.nuncaDecirViolation && (
                  <ViolationBanner kind="nunca_decir" message={payload.nuncaDecirViolation} />
                )}
                <ToolCallsTimeline payload={payload} />
                {/* Pitfall 5: undefined kbHits = kb_search not invoked OR shape mismatch. */}
                {payload.kbHits !== undefined ? (
                  <KbHitsSection hits={payload.kbHits} />
                ) : (
                  <KbNotConsulted />
                )}
                <OutcomeSection payload={payload} />
              </>
            ) : (
              <FiredFalseExplainer turn={turn} />
            )}
          </div>
        )
      })}
    </div>
  )
}
