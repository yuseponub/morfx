/**
 * Condense a previous turn into the lightly-condensed shape for multi-turn
 * auditor context (D-14, RESEARCH-plan-05 §2).
 *
 * Pure function: same TurnDetail input → same CondensedPreviousTurn output.
 * No I/O, no Date.now(), no random.
 *
 * Used in Plan 05 route handler first-round: maps each previous turn's
 * full TurnDetail into ~165 tokens of structured JSON. The audited turn
 * uses the FULL condenseTimeline + snapshot (heavier).
 */

import type { TurnDetail } from '@/lib/observability/repository'

export interface CondensedPreviousTurn {
  turnId: string
  startedAt: string
  durationMs: number | null
  respondingAgentId: string
  entryAgentId: string
  triggerKind: string | null
  intent: string | null
  intentConfidence: number | null
  pipelineDecisions: Array<{ label: string; payload: Record<string, unknown> }>
  templatesEnviados: string[]
  modeTransitions: Array<{ from: string; to: string; reason?: string }>
  toolCalls: Array<{ tool: string; status?: string }>
  guards: Array<{ label: string; reason: string }>
  stateChanges: { datosCapturadosAdded?: string[]; modeAtEnd?: string }
  hasError: boolean
  errorMessage?: string
  totalTokens: number
  totalCostUsd: number
}

const PIPELINE_PAYLOAD_KEYS = [
  'action',
  'agent',
  'agentId',
  'reason',
  'intent',
  'toAction',
] as const

function slim(
  payload: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  const src = payload as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of keys) if (k in src) out[k] = src[k]
  return out
}

export function condensePreviousTurn(detail: TurnDetail): CondensedPreviousTurn {
  const turn = detail.turn
  const events = detail.events

  const comprehension = events.find((e) => e.category === 'comprehension')
  const cp = (comprehension?.payload ?? {}) as Record<string, unknown>

  const pipelineDecisions = events
    .filter((e) => e.category === 'pipeline_decision')
    .map((e) => ({
      label: e.label ?? 'unknown',
      payload: slim(e.payload, PIPELINE_PAYLOAD_KEYS),
    }))

  const templatesEnviados = events
    .filter((e) => e.category === 'template_selection')
    .flatMap((e) => {
      const intents = (e.payload as { intents?: unknown })?.intents
      return Array.isArray(intents) ? (intents as string[]) : []
    })

  const modeTransitions = events
    .filter((e) => e.category === 'mode_transition')
    .map((e) => {
      const p = (e.payload ?? {}) as Record<string, unknown>
      return {
        from: (p.from as string) ?? '?',
        to: (p.to as string) ?? '?',
        ...(p.reason ? { reason: p.reason as string } : {}),
      }
    })

  const toolCalls = events
    .filter((e) => e.category === 'tool_call')
    .map((e) => {
      const p = (e.payload ?? {}) as Record<string, unknown>
      return {
        tool: (p.tool as string) ?? e.label ?? 'unknown',
        ...(p.status ? { status: p.status as string } : {}),
      }
    })

  const guards = events
    .filter((e) => e.category === 'guard')
    .map((e) => ({
      label: e.label ?? 'guard',
      reason: ((e.payload as { reason?: string })?.reason ?? '') as string,
    }))

  const lifecycle = events.find((e) => e.category === 'session_lifecycle')
  const lp = (lifecycle?.payload ?? {}) as Record<string, unknown>

  const errorMessage = turn.hasError
    ? (
        ((turn.error as { message?: string } | null)?.message) ?? 'unknown'
      ).slice(0, 200)
    : undefined

  return {
    turnId: turn.id,
    startedAt: turn.startedAt,
    durationMs: turn.durationMs,
    respondingAgentId: turn.respondingAgentId ?? turn.agentId,
    entryAgentId: turn.agentId,
    triggerKind: turn.triggerKind,
    intent: (cp.intent as string) ?? null,
    intentConfidence: (cp.confidence as number) ?? null,
    pipelineDecisions,
    templatesEnviados,
    modeTransitions,
    toolCalls,
    guards,
    stateChanges: {
      datosCapturadosAdded: Array.isArray(lp.dataAdded)
        ? (lp.dataAdded as string[])
        : undefined,
      modeAtEnd: (lp.modeAtEnd as string) ?? turn.newMode ?? undefined,
    },
    hasError: turn.hasError,
    ...(errorMessage ? { errorMessage } : {}),
    totalTokens: turn.totalTokens,
    totalCostUsd: turn.totalCostUsd,
  }
}
