// ============================================================================
// Dry-run replay simulator — D-10 mandatory v1 safety net.
// Phase: agent-lifecycle-router (standalone) — Plan 05.
//
// Purpose: Before applying a rule change in the admin form (Plan 06) OR before
// flipping the lifecycle_routing_enabled flag for a workspace (Plan 07), this
// module replays the last N days of inbound conversations through the
// candidate rule set and reports a diff vs. the production routing decision.
//
// Semantics — D-14 (AS-OF-NOW):
//   For each historical inbound conversation, both the production decision
//   (via routeAgent — current cached rules) and the candidate decision (via a
//   fresh buildEngine pipeline using the candidateRules parameter) are
//   evaluated against the contact's CURRENT state. We do NOT reconstruct the
//   contact's state at the time of the historical message (no event sourcing
//   exists for orders/tags). This answers the operational question: "if I
//   deploy these rules NOW, what would happen for these contacts in their
//   current state?"
//
// Safety — D-10 (NEVER writes to routing_audit_log):
//   This module deliberately does NOT import recordAuditLog. The grep
//   `! grep -q "recordAuditLog" src/lib/agents/routing/dry-run.ts` is enforced
//   by Plan 05 verification. Note: routeAgent (called for current_decision)
//   does write its own audit log fire-and-forget — that is a separate signal
//   describing real production decisions. Dry-run.ts itself never adds audit
//   rows for the candidate side.
//
// Pitfall 5 (early candidate validation):
//   ALL candidateRules are run through validateRule BEFORE any DB read. An
//   invalid rule (path field — CVE-2025-1302 surface — schema_version mismatch,
//   etc.) throws synchronously with a descriptive message naming the rule.
//
// Pitfall 7 (Engine per request):
//   Each conversation builds a FRESH Engine per layer (classifier + router).
//   No singleton, no Engine reuse across conversations.
//
// Regla 3 (Domain Layer):
//   This module reads conversations only via getInboundConversationsLastNDays
//   from @/lib/domain/messages. No createAdminClient, no direct Supabase
//   access. Verifiable via grep on this file.
// ============================================================================

import { getInboundConversationsLastNDays } from '@/lib/domain/messages'
import type { RoutingRule } from '@/lib/domain/routing'
import { routeAgent, type RouteDecision } from './route'
import { buildEngine } from './engine'
import { validateRule } from './schema/validate'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface DryRunInput {
  workspaceId: string
  candidateRules: RoutingRule[]
  /** Window for historical replay. Default: 7 days (D-10). */
  daysBack?: number
  /** Cap on conversations replayed in this run. Default: 500. */
  limit?: number
}

/**
 * Slim shape of a routing decision used by the dry-run output. We do not
 * propagate the full RouteDecision (rule ids + latency_ms + facts_snapshot)
 * for the candidate side because dry-run is a UI-facing diff report — Plan 06
 * displays the conversation_id + before/after agent and reason; the production
 * latency / facts are already in the audit log.
 */
export interface DryRunDecisionSlim {
  agent_id: string | null
  reason:
    | 'matched'
    | 'human_handoff'
    | 'no_rule_matched'
    | 'fallback_legacy'
  lifecycle_state: string
}

export interface DryRunDecisionRow {
  conversation_id: string
  contact_id: string
  /** Historical timestamp — informational only. Facts are AS-OF-NOW (D-14). */
  inbound_message_at: string
  current_decision: DryRunDecisionSlim | null
  candidate_decision: DryRunDecisionSlim
  changed: boolean
}

export interface DryRunResult {
  total_inbound: number
  decisions: DryRunDecisionRow[]
  summary: {
    changed_count: number
    /**
     * Counts keyed by `bucketKey(decision)`:
     *   - matched + agent_id present → key = agent_id
     *   - otherwise → key = reason  (e.g. 'human_handoff', 'no_rule_matched',
     *     'fallback_legacy', 'unknown' for missing decisions)
     */
    before: Record<string, number>
    after: Record<string, number>
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const DEFAULT_DAYS_BACK = 7
const DEFAULT_LIMIT = 500
const DEFAULT_LIFECYCLE_STATE = 'new_prospect'

function bucketKey(d: DryRunDecisionSlim | null): string {
  if (!d) return 'unknown'
  if (d.reason === 'matched' && d.agent_id) return d.agent_id
  return d.reason
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Replays the last N days of inbound conversations and reports the diff
 * between current production routing and the proposed candidate rule set.
 *
 * Throws synchronously (BEFORE any DB read) when any candidate rule fails
 * schema validation — this is intentional so the admin form (Plan 06) and
 * Plan 07 parity validation both surface bad rules with maximum clarity.
 */
export async function dryRunReplay(input: DryRunInput): Promise<DryRunResult> {
  const daysBack = input.daysBack ?? DEFAULT_DAYS_BACK
  const limit = input.limit ?? DEFAULT_LIMIT

  // 1. Validate every candidate rule BEFORE any I/O. Pitfall 5 + Pitfall 2.
  //    A `path` field (CVE-2025-1302 jsonpath-plus surface) is rejected by the
  //    schema's additionalProperties:false on leafCondition, surfacing here as
  //    a thrown Error with a descriptive message including the rule name.
  for (const rule of input.candidateRules) {
    const v = validateRule(rule)
    if (!v.ok) {
      const ruleName = (rule as { name?: string })?.name ?? '<unnamed>'
      throw new Error(
        `dry-run: schema validation failed for candidate rule "${ruleName}": ${v.errors.join('; ')}`,
      )
    }
  }

  // 2. Fetch unique conversations in the window. The domain function dedupes
  //    by conversation_id and caps at `limit` rows.
  const conversations = await getInboundConversationsLastNDays(
    input.workspaceId,
    daysBack,
    limit,
  )
  const total_inbound = conversations.length

  // 3. Pre-split candidate rules by layer once — used per-conversation below.
  const classifierRules = input.candidateRules.filter(
    (r) => r.rule_type === 'lifecycle_classifier',
  )
  const routerRules = input.candidateRules.filter(
    (r) => r.rule_type === 'agent_router',
  )

  // 4. Replay loop. Each iteration evaluates production AND candidate
  //    independently against the SAME contact's current state (D-14).
  const decisions: DryRunDecisionRow[] = []
  const before: Record<string, number> = {}
  const after: Record<string, number> = {}
  let changed_count = 0

  for (const conv of conversations) {
    // --- Production (current rules) -----------------------------------------
    let current: DryRunDecisionSlim | null = null
    try {
      const prod: RouteDecision = await routeAgent({
        contactId: conv.contact_id,
        workspaceId: input.workspaceId,
      })
      current = {
        agent_id: prod.agent_id,
        reason: prod.reason,
        lifecycle_state: prod.lifecycle_state,
      }
    } catch (err) {
      // routeAgent itself swallows pipeline errors and emits 'fallback_legacy';
      // a throw here would be a programmer error in route.ts. Surface it as
      // unknown so dry-run continues.
      console.warn('[routing.dry-run] routeAgent threw for', conv.conversation_id, err)
      current = null
    }

    // --- Candidate (proposed rules) -----------------------------------------
    const candidate = await runCandidatePipeline({
      contactId: conv.contact_id,
      workspaceId: input.workspaceId,
      classifierRules,
      routerRules,
    })

    // --- Diff ---------------------------------------------------------------
    const changed =
      current === null ||
      current.agent_id !== candidate.agent_id ||
      current.reason !== candidate.reason
    if (changed) changed_count++
    increment(before, bucketKey(current))
    increment(after, bucketKey(candidate))

    decisions.push({
      conversation_id: conv.conversation_id,
      contact_id: conv.contact_id,
      inbound_message_at: conv.inbound_message_at,
      current_decision: current,
      candidate_decision: candidate,
      changed,
    })
  }

  return {
    total_inbound,
    decisions,
    summary: { changed_count, before, after },
  }
}

// ----------------------------------------------------------------------------
// Candidate pipeline — mirrors route.ts (Layer 1 + Layer 2) using fresh
// Engines built per conversation. Reuses buildEngine from Plan 03 — no fork.
//
// We intentionally do NOT funnel through routeAgent because:
//   1. routeAgent reads from the LRU cache (production rules), not candidates.
//   2. routeAgent writes to routing_audit_log (D-10 violation if used here).
//   3. Plan 05 needs a parameterised entry point that takes raw rule rows.
// ----------------------------------------------------------------------------

interface CandidatePipelineInput {
  contactId: string
  workspaceId: string
  classifierRules: RoutingRule[]
  routerRules: RoutingRule[]
}

async function runCandidatePipeline(
  input: CandidatePipelineInput,
): Promise<DryRunDecisionSlim> {
  let lifecycleState = DEFAULT_LIFECYCLE_STATE
  let agentId: string | null = null
  let firedRouter = false

  try {
    // ============ Layer 1: Classifier ============
    const e1 = buildEngine({
      contactId: input.contactId,
      workspaceId: input.workspaceId,
      rules: [],
    })
    for (const r of input.classifierRules) {
      e1.addRule({
        conditions: r.conditions as never,
        event: r.event as never,
        priority: r.priority,
        name: r.name,
        onSuccess: (event: unknown) => {
          const params = (event as { params?: Record<string, unknown> }).params ?? {}
          if (typeof params.lifecycle_state === 'string') {
            lifecycleState = params.lifecycle_state
          }
          e1.stop()
        },
      })
    }
    await e1.run({})

    // ============ Layer 2: Router ============
    const e2 = buildEngine({
      contactId: input.contactId,
      workspaceId: input.workspaceId,
      rules: [],
      runtimeFacts: { lifecycle_state: lifecycleState },
    })
    for (const r of input.routerRules) {
      e2.addRule({
        conditions: r.conditions as never,
        event: r.event as never,
        priority: r.priority,
        name: r.name,
        onSuccess: (event: unknown) => {
          firedRouter = true
          const params = (event as { params?: Record<string, unknown> }).params ?? {}
          // agent_id may be string OR explicit null (D-16 — null = human handoff).
          // `in` lets us distinguish "key absent" from "key present with null".
          if ('agent_id' in params) {
            const candidate = params.agent_id
            agentId = typeof candidate === 'string' ? candidate : null
          }
          e2.stop()
        },
      })
    }
    await e2.run({})
  } catch (err) {
    console.warn('[routing.dry-run] candidate pipeline threw:', err)
    return {
      agent_id: null,
      reason: 'fallback_legacy',
      lifecycle_state: lifecycleState,
    }
  }

  // Determine reason — same 4-output contract as route.ts (D-16) minus the
  // agentRegistry validation. We deliberately do NOT validate agentRegistry
  // for candidates: the form (Plan 06) provides its own picker and Plan 07
  // parity validation explicitly compares against legacy literal agent ids.
  // If a candidate emits an unregistered id, it shows up as `matched` in the
  // diff and the editor sees the discrepancy.
  let reason: DryRunDecisionSlim['reason']
  if (firedRouter && agentId !== null) reason = 'matched'
  else if (firedRouter && agentId === null) reason = 'human_handoff'
  else reason = 'no_rule_matched'

  return { agent_id: agentId, reason, lifecycle_state: lifecycleState }
}
