# Phase 33: Confidence Routing + Disambiguation Log - Research

**Researched:** 2026-03-02
**Domain:** Agent confidence routing, disambiguation logging, Supabase schema design
**Confidence:** HIGH

## Summary

Phase 33 adds a two-band confidence threshold to the Somnio agent's classification pipeline and creates a `disambiguation_log` table for logging ambiguous situations. The scope is narrow: a confidence check in the existing `classifyMessage()` function (which already receives `_confidence` as an unused parameter), a new DB table, and an insert call on low-confidence handoffs.

The codebase is exceptionally well-prepared for this change. The `classifyMessage()` function in `message-category-classifier.ts` already accepts `_confidence: number` as a reserved parameter. The HANDOFF return path in step 5.5 of `somnio-agent.ts` already returns `newMode: 'handoff'` with timer cancellation. The webhook-processor already handles `result.newMode === 'handoff'` by calling `executeHandoff()`. The only new work is: (1) activating the confidence parameter, (2) creating the disambiguation_log table, and (3) inserting a record when confidence < 80%.

**Primary recommendation:** Add a confidence < 80% rule as Rule 1.5 in `classifyMessage()` (between the current HANDOFF-intent check and the SILENCIOSO check), create the `disambiguation_log` table with workspace isolation and RLS, and write the disambiguation log record from the HANDOFF return path in `somnio-agent.ts` step 5.5.

## Standard Stack

### Core

No new libraries needed. This phase uses only existing project infrastructure.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase (admin client) | existing | DB reads/writes for disambiguation_log | Already used by all domain functions and adapters |
| createAdminClient() | existing | Bypass RLS for server-side writes | Standard pattern per CLAUDE.md Regla 3 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| createModuleLogger | existing | Structured logging | Log disambiguation events for observability |

### Alternatives Considered

None -- this phase uses exclusively existing infrastructure.

**Installation:** No new packages needed.

## Architecture Patterns

### Integration Point: classifyMessage()

The classifier at `src/lib/agents/somnio/message-category-classifier.ts` is the ideal integration point.

**Current rules:**
1. Rule 1: HANDOFF if intent in HANDOFF_INTENTS
2. Rule 2: SILENCIOSO if acknowledgment in non-confirmatory mode
3. Rule 3: RESPONDIBLE (default)

**New rule insertion:**
1. Rule 1: HANDOFF if intent in HANDOFF_INTENTS (unchanged)
2. **Rule 1.5 (NEW): HANDOFF if confidence < 80%** -- this is the confidence routing
3. Rule 2: SILENCIOSO if acknowledgment in non-confirmatory mode (unchanged)
4. Rule 3: RESPONDIBLE (default, unchanged)

**Why Rule 1.5 and not a separate check:**
- The classifier already receives `_confidence` (unused, prefixed underscore)
- Placing the check here means ALL handoff paths (intent-based and confidence-based) flow through the same return path in somnio-agent.ts step 5.5
- The step 5.5 HANDOFF early return already handles newMode='handoff', timer cancel, and no-template-sending
- This keeps the single-responsibility pattern: classifyMessage decides category, somnio-agent routes

**Critical detail:** The `_confidence` parameter must be renamed to `confidence` (remove underscore prefix) when activating it.

### Disambiguation Log Write Location

The disambiguation_log record MUST be created at the point where the HANDOFF early return is built in `somnio-agent.ts` step 5.5 -- specifically when `classification.category === 'HANDOFF'` AND the reason starts with `low_confidence:`.

**Why here and not in classifyMessage():**
- classifyMessage() is a pure TypeScript function (no I/O, no async) -- adding a DB write would violate its design
- somnio-agent.ts step 5.5 has access to ALL context needed: message, session state, intent alternatives, templates_enviados, pending_templates, conversation history

**Why not in webhook-processor.ts:**
- webhook-processor handles ALL handoff types (intent-based, confidence-based, step 7 old-style)
- Disambiguation logging only applies to LOW CONFIDENCE handoffs, not all handoffs
- Putting it in webhook-processor would require passing the "why" of the handoff downstream

### Recommended Project Structure

```
src/
  lib/
    agents/
      somnio/
        message-category-classifier.ts    # Modified: activate confidence param, add Rule 1.5
        somnio-agent.ts                   # Modified: add disambiguation_log write in step 5.5
        constants.ts                      # Modified: add LOW_CONFIDENCE_THRESHOLD = 80
    domain/
      (no new domain file)                # Direct createAdminClient() in somnio-agent -- see rationale below
supabase/
  migrations/
    YYYYMMDD_disambiguation_log.sql       # New: table + indexes + RLS
```

### Domain Layer Decision

Per CLAUDE.md Regla 3, ALL mutations should go through `src/lib/domain/`. However, the disambiguation_log is an audit/diagnostic table written exclusively by the agent pipeline (server-side, non-user-facing, no automation triggers). The existing pattern in `somnio-agent.ts` does NOT go through domain -- it's a pure function that returns output signals.

**Recommended approach:** Create a minimal helper function (e.g., `logDisambiguation()`) in a new file or directly in somnio-agent.ts that uses `createAdminClient()` to insert the record. This matches the existing pattern where `production/storage.ts` and `production/handoff-handler.ts` write directly via admin client for operational data that doesn't need domain-layer automation triggers.

**Alternative:** Create `src/lib/domain/disambiguation.ts` following the domain pattern. This adds overhead for a table that has no automation triggers, no server actions, and no user-facing mutations. The planner should decide based on consistency vs. simplicity.

### Anti-Patterns to Avoid

- **Making classifyMessage async:** The classifier MUST remain a pure synchronous function. The DB write happens in the caller (somnio-agent.ts), not in the classifier.
- **Blocking on disambiguation log write:** The INSERT into disambiguation_log is fire-and-forget (non-blocking). A failed log should NOT prevent the handoff from executing. Use try/catch with logger.warn.
- **Modifying the existing IntentDetector thresholds:** Phase 33 does NOT change the 4-band system (proceed/reanalyze/clarify/handoff at 85/60/40/0). It adds a SEPARATE 2-band check in classifyMessage. The old step 7 handoff (from IntentDetector action=handoff) remains but is effectively superseded since classifyMessage runs first at step 5.5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom ID logic | Supabase `gen_random_uuid()` default | Consistent with all other tables |
| Timestamp handling | `new Date().toISOString()` for DB | `timezone('America/Bogota', NOW())` in SQL default | Regla 2: all DB timestamps in Bogota timezone |
| RLS policies | Custom auth checks | Standard `is_workspace_member()` pattern | Consistent with agent_sessions, agent_turns |
| JSON serialization | Custom stringify | Supabase JSONB columns | Natively handles JS objects |
| Conversation history summary | LLM call to summarize | Last N turns raw text | V1 simplicity -- LLM summary is over-engineering for a diagnostic table |

**Key insight:** The disambiguation_log table follows the exact same schema patterns as `agent_sessions` and `agent_turns` (workspace_id FK, timestamptz defaults, RLS via is_workspace_member, JSONB for flexible fields). No new patterns needed.

## Common Pitfalls

### Pitfall 1: Breaking Pure Classifier

**What goes wrong:** Adding async DB writes inside `classifyMessage()` breaks its pure-function contract and requires changing all callers to await.
**Why it happens:** Natural temptation to "log where we classify."
**How to avoid:** Keep classifyMessage pure. Return a `reason` string that includes "low_confidence:" prefix. The caller (somnio-agent.ts) checks the reason and writes the log.
**Warning signs:** `async` keyword on classifyMessage, import of createAdminClient in classifier file.

### Pitfall 2: Missing Timer Cancel on Confidence Handoff

**What goes wrong:** Low-confidence handoff doesn't cancel active timers, leading to phantom timer messages sent to conversations that are already with a human agent.
**Why it happens:** The current step 5.5 HANDOFF path already includes `timerSignals: [{ type: 'cancel', reason: 'handoff' }]`, BUT the old step 7 handoff (from IntentDetector) has `timerSignals: []` -- no timer cancellation.
**How to avoid:** Since confidence < 80% will be handled by classifyMessage (step 5.5), it automatically gets the correct timer cancel signal. No action needed beyond placing the check in classifyMessage.
**Warning signs:** Step 7's `timerSignals: []` is a pre-existing bug. Phase 33 should fix it while we're here.

### Pitfall 3: Disambiguating Intent-Based vs Confidence-Based Handoffs

**What goes wrong:** All handoffs look the same downstream (newMode='handoff'). If we need to distinguish "handoff because intent=asesor" from "handoff because confidence=65%", we need the reason.
**Why it happens:** The classification result already includes a `reason` string, but it's not propagated to the output.
**How to avoid:** Add `classification.reason` to the HANDOFF early return (e.g., in intentInfo or a new field). The disambiguation_log write checks if reason starts with `low_confidence:`.
**Warning signs:** Having to parse the intentInfo to guess why a handoff happened.

### Pitfall 4: Blocking Agent Pipeline on Log Write

**What goes wrong:** If the disambiguation_log INSERT is awaited and Supabase has a timeout/error, the entire agent pipeline stalls, and the customer doesn't get the handoff message.
**Why it happens:** Natural pattern to await all DB operations.
**How to avoid:** Fire-and-forget with try/catch. The handoff MUST proceed even if logging fails. Pattern:
```typescript
// Fire and forget -- handoff proceeds regardless
logDisambiguation(...).catch(err => logger.warn({ err }, 'Failed to write disambiguation_log'))
```
**Warning signs:** `await logDisambiguation(...)` in the critical return path without a catch-then-continue pattern.

### Pitfall 5: Overly Complex Conversation History Summary

**What goes wrong:** Spending tokens to LLM-summarize conversation history for each low-confidence case, when the raw last N turns are sufficient for human review.
**Why it happens:** CONTEXT says "conversation history summary" which sounds like it needs summarization.
**How to avoid:** V1 stores the last 5-10 conversation turns as raw JSON in the JSONB column. This is MORE useful for reviewers than a summary (they see exact messages). LLM summarization can be added later if the raw data proves unwieldy.
**Warning signs:** Adding a Claude call to the disambiguation logging path.

### Pitfall 6: Forgetting workspace_id Isolation

**What goes wrong:** disambiguation_log records without workspace_id, making multi-workspace queries dangerous.
**Why it happens:** Audit/diagnostic tables are sometimes treated as less important.
**How to avoid:** workspace_id is a required column with FK to workspaces. Every query filters by workspace_id. RLS enforces via is_workspace_member().
**Warning signs:** Table definition without workspace_id column.

## Code Examples

### Example 1: Modified classifyMessage with Confidence Check

```typescript
// Source: message-category-classifier.ts (modified)
export function classifyMessage(
  intent: string,
  confidence: number,  // <-- remove underscore prefix
  currentMode: string,
  message: string
): ClassificationResult {
  // Rule 1 -- HANDOFF: intent is a handoff trigger
  if (HANDOFF_INTENTS.has(intent)) {
    return { category: 'HANDOFF', reason: `handoff_intent:${intent}` }
  }

  // Rule 1.5 -- HANDOFF: low confidence (< 80%)
  // Skip for timer-forced calls (confidence=100) and auto-triggered intents
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { category: 'HANDOFF', reason: `low_confidence:${confidence}` }
  }

  // Rule 2 -- SILENCIOSO (unchanged)
  // Rule 3 -- RESPONDIBLE (unchanged)
}
```

### Example 2: Disambiguation Log Write in somnio-agent.ts Step 5.5

```typescript
// Source: somnio-agent.ts step 5.5 HANDOFF return (modified)
if (classification.category === 'HANDOFF') {
  // Log disambiguation context for low-confidence handoffs
  if (classification.reason.startsWith('low_confidence:')) {
    logDisambiguation({
      workspaceId: input.session.workspace_id,
      sessionId: input.session.id,
      conversationId: input.session.conversation_id,
      contactId: input.session.contact_id,
      customerMessage: input.message,
      detectedIntent: intent.intent,
      confidence: intent.confidence,
      alternatives: intent.alternatives ?? [],
      reasoning: intent.reasoning ?? '',
      agentState: currentMode,
      templatesEnviados: input.session.state.templates_enviados ?? [],
      pendingTemplates: (input.session.state as any).pending_templates ?? [],
      conversationHistory: input.history.slice(-10), // Last 10 turns
    }).catch(err => logger.warn({ err }, 'Failed to write disambiguation_log'))
  }

  return {
    success: true,
    messages: [],
    stateUpdates: {
      newMode: 'handoff',
      // ... existing state updates
    },
    shouldCreateOrder: false,
    timerSignals: [{ type: 'cancel', reason: 'handoff' }],
    // ... rest unchanged
  }
}
```

### Example 3: Disambiguation Log Table Schema

```sql
-- Source: Migration file
CREATE TABLE disambiguation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Workspace isolation
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Session context
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- What happened
  customer_message TEXT NOT NULL,
  detected_intent TEXT NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  alternatives JSONB NOT NULL DEFAULT '[]',
  reasoning TEXT,

  -- Agent context at time of detection
  agent_state TEXT NOT NULL,
  templates_enviados JSONB NOT NULL DEFAULT '[]',
  pending_templates JSONB NOT NULL DEFAULT '[]',
  conversation_history JSONB NOT NULL DEFAULT '[]',

  -- Human review fields (V1: filled via Supabase dashboard)
  correct_intent TEXT,
  correct_action TEXT,
  guidance_notes TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Indexes
CREATE INDEX idx_disambiguation_log_workspace ON disambiguation_log(workspace_id);
CREATE INDEX idx_disambiguation_log_unreviewed ON disambiguation_log(workspace_id, reviewed)
  WHERE reviewed = false;
CREATE INDEX idx_disambiguation_log_session ON disambiguation_log(session_id);
CREATE INDEX idx_disambiguation_log_created ON disambiguation_log(workspace_id, created_at DESC);

-- RLS
ALTER TABLE disambiguation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disambiguation_log_workspace_select"
  ON disambiguation_log FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "disambiguation_log_workspace_insert"
  ON disambiguation_log FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "disambiguation_log_workspace_update"
  ON disambiguation_log FOR UPDATE
  USING (is_workspace_member(workspace_id));
```

### Example 4: logDisambiguation Helper

```typescript
// Could live in somnio-agent.ts or a separate utility file
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('disambiguation')

interface DisambiguationLogInput {
  workspaceId: string
  sessionId: string
  conversationId: string
  contactId: string
  customerMessage: string
  detectedIntent: string
  confidence: number
  alternatives: Array<{ intent: string; confidence: number }>
  reasoning: string
  agentState: string
  templatesEnviados: string[]
  pendingTemplates: unknown[]
  conversationHistory: Array<{ role: string; content: string }>
}

export async function logDisambiguation(input: DisambiguationLogInput): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('disambiguation_log')
    .insert({
      workspace_id: input.workspaceId,
      session_id: input.sessionId,
      conversation_id: input.conversationId,
      contact_id: input.contactId,
      customer_message: input.customerMessage,
      detected_intent: input.detectedIntent,
      confidence: input.confidence,
      alternatives: input.alternatives,
      reasoning: input.reasoning,
      agent_state: input.agentState,
      templates_enviados: input.templatesEnviados,
      pending_templates: input.pendingTemplates,
      conversation_history: input.conversationHistory,
    })

  if (error) {
    logger.warn({ error, sessionId: input.sessionId }, 'Failed to insert disambiguation_log')
    throw error
  }

  logger.info(
    { sessionId: input.sessionId, intent: input.detectedIntent, confidence: input.confidence },
    'Disambiguation logged'
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 4-band confidence (85/60/40/0) in IntentDetector | 2-band (80/0) in classifyMessage + 4-band still exists in IntentDetector | Phase 33 | classifyMessage catches < 80% BEFORE step 7 ever checks action=handoff |
| `_confidence` unused in classifyMessage | `confidence` active with < 80% check | Phase 33 | Activates the parameter that was reserved since Phase 30 |
| No disambiguation logging | disambiguation_log table captures full context | Phase 33 | Enables future training data collection and human review |

**Key insight on threshold interaction:**
- IntentDetector still returns `action` based on 4-band thresholds (proceed >= 85, reanalyze >= 60, clarify >= 40, handoff < 40)
- classifyMessage now checks confidence < 80% (NEW Rule 1.5)
- Effect: messages with 40-79% confidence that IntentDetector would route to reanalyze/clarify now get caught by classifyMessage as HANDOFF
- Messages with confidence < 40% that IntentDetector routes to handoff are caught FIRST by classifyMessage (since step 5.5 runs before step 7)
- The old step 7 `if (action === 'handoff')` becomes effectively dead code for confidence-based handoffs, but remains as a safety net

## Open Questions

1. **Should step 7 (old confidence handoff) also log to disambiguation_log?**
   - What we know: Step 5.5 runs before step 7, so all confidence < 80% cases hit classifyMessage first
   - What's unclear: If IntentDetector somehow returns action='handoff' with confidence >= 80% (which shouldn't happen with current thresholds), step 7 would handle it without logging
   - Recommendation: Leave step 7 as-is (safety net). No logging needed since the path is effectively unreachable with current thresholds.

2. **Token budget for conversation_history in the log**
   - What we know: CONTEXT says "conversation history summary" and "Claude's Discretion" for token budget
   - What's unclear: How many turns to store
   - Recommendation: Store last 10 turns as raw JSON (no LLM summary). 10 turns is enough context for a human reviewer. At ~100 chars per turn average, this is ~1KB per record -- negligible.

3. **Should we fix step 7's missing timer cancel?**
   - What we know: Step 5.5 HANDOFF has `timerSignals: [{ type: 'cancel', reason: 'handoff' }]` but step 7 has `timerSignals: []`
   - Impact: Step 7 is a confidence-based handoff (action === 'handoff'). If active timers exist, they won't be cancelled.
   - Recommendation: YES, fix step 7 to include timer cancel. Small change, prevents phantom timer messages.

## Sources

### Primary (HIGH confidence)

All findings are based on direct codebase inspection:

- `src/lib/agents/somnio/message-category-classifier.ts` -- Current classifier with `_confidence` reserved parameter
- `src/lib/agents/somnio/somnio-agent.ts` -- Full pipeline with step 5.5 integration point
- `src/lib/agents/intent-detector.ts` -- IntentDetector with 4-band routing
- `src/lib/agents/types.ts` -- ConfidenceThresholds, IntentResult types
- `src/lib/agents/somnio/constants.ts` -- HANDOFF_INTENTS, CONFIRMATORY_MODES
- `src/lib/agents/somnio/config.ts` -- SOMNIO_STATES, SOMNIO_TRANSITIONS, DEFAULT_CONFIDENCE_THRESHOLDS
- `src/lib/agents/production/webhook-processor.ts` -- HANDOFF execution flow
- `src/lib/agents/production/handoff-handler.ts` -- executeHandoff() function
- `src/lib/agents/engine/unified-engine.ts` -- Engine routing for handoff
- `supabase/migrations/20260205000000_agent_sessions.sql` -- Table pattern reference
- `supabase/migrations/20260226000000_block_priorities.sql` -- Migration pattern reference
- `.planning/phases/30-message-classification-silence-timer/30-CONTEXT.md` -- Phase 30 decisions
- `.planning/phases/30-message-classification-silence-timer/30-VERIFICATION.md` -- Phase 30 verification

### Secondary (MEDIUM confidence)

- Phase 33 CONTEXT.md -- User decisions, locked choices

### Tertiary (LOW confidence)

None -- all findings verified against actual code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing infrastructure
- Architecture: HIGH -- direct codebase analysis, integration point is obvious (reserved parameter)
- Pitfalls: HIGH -- identified from actual code inspection (step 7 timer bug, classifier purity)
- Schema design: HIGH -- follows exact patterns from existing agent_sessions migration

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable domain, no external dependencies)
