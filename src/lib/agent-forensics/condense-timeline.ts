/**
 * Condensed timeline filter for the agent forensics panel (D-04 + D-05).
 *
 * Source: standalone/agent-forensics-panel RESEARCH.md §Code Examples
 * (lineas 599-721), §Open Items §2 (whitelist completo).
 *
 * Rationale:
 *   - D-04 locks the "mechanism-relevant" surface: pipeline decisions,
 *     comprehension outputs, template selection, guards, tool calls,
 *     mode transitions, session lifecycle — the subset that explains
 *     "why this bot answered this way".
 *   - D-05 strictly excludes SQL queries (`detail.queries`) from the
 *     condensed view. The Raw tab remains the escape hatch for deep
 *     debugging (Pitfall 5 mitigation).
 *
 * The function is pure: same input → same output, no I/O, no time
 * dependency. Consumers: server action `getForensicsViewAction`
 * (super-user gated) and future Plan 04 auditor (reads the same
 * condensed shape before emitting its diagnosis).
 */
import type { TurnDetail, TurnDetailEvent } from '@/lib/observability/repository'

/**
 * Event categories considered mechanism-relevant for the condensed timeline.
 *
 * 16 core from RESEARCH §Open Items §2 + `classifier` + `error` (errors always
 * surface so the user never misses a failure hiding behind a filter).
 *
 * Queries are ALWAYS excluded (D-05). AI calls kept only for mechanism
 * purposes (see `MECHANISM_AI_PURPOSES` below).
 *
 * Excluded on purpose:
 *   - 'char_delay'       → render detail, not a decision
 *   - 'disambiguation'   → rarely fires, noise
 *   - 'silence_timer'    → plumbing
 *   - 'block_composition'→ implied by the preceding template_selection
 *   - 'intent'           → legacy, superseded by comprehension
 */
export const CORE_CATEGORIES: ReadonlySet<string> = new Set([
  'session_lifecycle',
  'pipeline_decision',
  'mode_transition',
  'guard',
  'template_selection',
  'tool_call',
  'no_repetition',
  'handoff',
  'timer_signal',
  'comprehension',
  'media_gate',
  'pre_send_check',
  'interruption_handling',
  'retake',
  'ofi_inter',
  'pending_pool',
  'classifier',
  'error', // always show errors
])

export interface CondensedTimelineItem {
  kind: 'event' | 'ai'
  sequence: number
  recordedAt: string
  category?: string
  label?: string | null
  summary: string
  raw:
    | TurnDetailEvent
    | {
        purpose: string
        durationMs: number
        inputTokens: number
        outputTokens: number
        model?: string
      }
}

/**
 * AI-call purposes that belong to the condensed mechanism view.
 *
 * Everything else (prompt_versioning, debug_utilities, etc.) falls back
 * to the Raw tab.
 */
const MECHANISM_AI_PURPOSES = new Set([
  'comprehension',
  'classifier',
  'orchestrator',
  'no_rep_l2',
  'no_rep_l3',
  'minifrase',
  'paraphrase',
  'sticker_vision',
])

export function condenseTimeline(
  detail: TurnDetail,
  respondingAgentId: string | null,
): CondensedTimelineItem[] {
  const items: CondensedTimelineItem[] = []

  for (const e of detail.events) {
    if (!CORE_CATEGORIES.has(e.category)) continue
    items.push({
      kind: 'event',
      sequence: e.sequence,
      recordedAt: e.recordedAt,
      category: e.category,
      label: e.label,
      summary: summarizeEvent(e),
      raw: e,
    })
  }

  for (const a of detail.aiCalls) {
    if (!MECHANISM_AI_PURPOSES.has(a.purpose)) continue
    items.push({
      kind: 'ai',
      sequence: a.sequence,
      recordedAt: a.recordedAt,
      summary: `AI · ${a.purpose} · ${a.model ?? '—'} · ${a.inputTokens}+${a.outputTokens}tok · ${a.durationMs}ms`,
      raw: {
        purpose: a.purpose,
        durationMs: a.durationMs,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        model: a.model,
      },
    })
  }

  // Reserved for per-bot label boosting (RESEARCH §Open Items §2 tabla
  // per-bot). Today the parameter is unused by the filter — keeping the
  // signature stable means Plan 04 auditor can request the same function
  // with the bot-specific context without a breaking change.
  void respondingAgentId

  return items.sort((a, b) => a.sequence - b.sequence)
}

function summarizeEvent(e: TurnDetailEvent): string {
  const p = (e.payload ?? {}) as Record<string, unknown>
  switch (e.category) {
    case 'pipeline_decision':
      return `${e.label ?? '?'} · ${JSON.stringify(
        slim(p, ['action', 'agentId', 'agent', 'reason', 'intent', 'toAction']),
      )}`
    case 'template_selection':
      return `${e.label ?? '?'} · intents=[${((p.intents as string[]) || []).join(', ')}]`
    case 'guard':
      return `${e.label ?? '?'} · reason=${p.reason ?? '—'}`
    case 'mode_transition':
      return `${p.from ?? '—'} → ${p.to ?? '—'} · ${p.reason ?? ''}`.trim()
    case 'comprehension':
      return `intent=${p.intent ?? '—'} · confidence=${p.confidence ?? '—'}`
    case 'tool_call':
      return `${p.tool ?? e.label ?? '?'} · ${p.status ?? ''}`.trim()
    case 'session_lifecycle':
      return e.label ?? 'lifecycle'
    case 'error':
      return `${e.label ?? 'error'} · ${p.message ?? JSON.stringify(slim(p, Object.keys(p).slice(0, 3)))}`
    default:
      return `${e.label ?? ''} ${JSON.stringify(slim(p, Object.keys(p).slice(0, 3)))}`.trim()
  }
}

function slim(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (k in obj) out[k] = obj[k]
  return out
}
