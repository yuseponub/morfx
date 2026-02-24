# Phase 31: Pre-Send Check + Interruption + Pending Merge - Research

**Researched:** 2026-02-23
**Domain:** Agent message send loop control, interruption detection, pending template management
**Confidence:** HIGH (100% codebase-based, no external libraries needed)

## Summary

Phase 31 introduces three interconnected capabilities to the Somnio agent's message sending pipeline: (1) a pre-send check that queries the DB before each template send to detect new inbound messages, (2) an interruption system that saves unsent templates as pending with CORE/COMP/OPC priority, and (3) a merge algorithm that combines pending templates with new ones in the next response block, capped at 3 templates per block.

This phase is entirely internal architecture -- no new npm libraries needed. The work involves modifying the `ProductionMessagingAdapter.send()` method to add per-template DB checks, introducing a priority system to `agent_templates`, building a block composition engine that replaces the current "send all templates sequentially" approach, and storing/retrieving pending templates in session state. The existing `InterruptionHandler` and `MessageSequencer` will be substantially rewritten or replaced by the new block-based system.

**Primary recommendation:** Build a new `BlockComposer` module that takes raw templates from the orchestrator, applies the 3-intent cap and priority rules to select the block, and returns both the block to send and any overflow as pending. The pre-send check lives inside `ProductionMessagingAdapter.send()` as a DB query before each template. Pending storage uses a dedicated `pending_templates` JSONB column on `session_state` (not the `datos_capturados` hack currently used by `InterruptionHandler`).

## Standard Stack

### Core

No new libraries. All implementation uses existing stack:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase JS | existing | Pre-send check DB queries | Already used everywhere; `createAdminClient()` bypasses RLS |
| Inngest | existing | Concurrency-1 guarantees sequential processing per conversation | Already configured with `key: event.data.conversationId, limit: 1` |
| TypeScript | strict | Type-safe priority system, block composition | Project standard |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino logger | existing | Structured logging for pre-send checks, interruptions, merge decisions | Every new module |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DB column for pending | In-memory in Inngest function | DB column survives serverless cold restarts; Inngest functions can restart mid-execution |
| JSONB column on session_state | Separate `pending_templates` table | JSONB is simpler, pending is session-scoped and small (max ~10 items), no need for relational queries |
| `datos_capturados` hack (current) | Dedicated JSONB column | Current approach pollutes datos_capturados with `__pending_messages` keys; dedicated column is cleaner and avoids conflicts with data extraction |

## Architecture Patterns

### Recommended Project Structure

```
src/lib/agents/somnio/
├── block-composer.ts          # NEW: Block composition + merge algorithm
├── message-sequencer.ts       # MODIFY: Pre-send check in send loop
├── interruption-handler.ts    # MODIFY: Priority-aware pending storage
├── constants.ts               # MODIFY: Add BLOCK_MAX_TEMPLATES, priority types
└── char-delay.ts              # UNCHANGED: Character delay calculation
src/lib/agents/engine-adapters/production/
└── messaging.ts               # MODIFY: Pre-send check before each template send
src/lib/agents/engine/
└── types.ts                   # MODIFY: MessagingAdapter interface for block-aware sending
supabase/migrations/
└── YYYYMMDD_block_priorities.sql  # NEW: Add priority column to agent_templates, pending_templates to session_state
```

### Pattern 1: Pre-Send Check (DB Query Before Each Template)

**What:** Before sending each template in a block, query the `messages` table for any new inbound message with `timestamp > triggerMessageTimestamp`. If found, stop the sequence.

**When to use:** Every template send in `ProductionMessagingAdapter.send()`.

**Implementation approach:**

```typescript
// Source: Codebase analysis — messages table + processed_by_agent index
async function hasNewInboundMessage(
  conversationId: string,
  triggerTimestamp: string
): Promise<boolean> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .gt('timestamp', triggerTimestamp)

  return (count ?? 0) > 0
}
```

**Key detail:** The existing `idx_messages_unprocessed_inbound` partial index (from Phase 29 migration `20260224100000_processed_by_agent.sql`) covers `(conversation_id, created_at) WHERE direction='inbound' AND processed_by_agent=false`. However, the pre-send check needs ALL inbound messages after the trigger (not just unprocessed ones), because the Inngest concurrency-1 means the next message is already queued and its `processed_by_agent` may be false OR already being processed. A new index on `(conversation_id, timestamp) WHERE direction='inbound'` would be optimal, or reuse the existing `idx_messages_conversation ON messages(conversation_id, timestamp DESC)` which already exists and covers this query perfectly.

**Critical timing:** The `triggerTimestamp` is the timestamp of the inbound message that initiated the current processing block. This is available from the Inngest event data (`agent/whatsapp.message_received`) which already carries `messageId`. We need to also carry or resolve the message timestamp.

### Pattern 2: Block Composition (3-Intent Cap + Priority)

**What:** A pure function that takes all templates from orchestrator + pending templates, applies the cap rules, and returns `{ blockToSend: Template[], pendingOverflow: PendingTemplate[] }`.

**When to use:** After orchestrator returns templates, before sending.

**Implementation approach:**

```typescript
type TemplatePriority = 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'

interface PrioritizedTemplate {
  template: ProcessedTemplate
  priority: TemplatePriority
  intent: string
  isNew: boolean  // true = from current orchestrator, false = from pending
}

interface BlockCompositionResult {
  block: PrioritizedTemplate[]      // Max 3 templates to send
  pending: PrioritizedTemplate[]    // Overflow saved as pending
  dropped: PrioritizedTemplate[]    // OPC that don't fit and are discarded
}

function composeBlock(
  newTemplatesByIntent: Map<string, PrioritizedTemplate[]>,
  pendingTemplates: PrioritizedTemplate[],
  maxBlockSize: number = 3
): BlockCompositionResult
```

**Algorithm (from CONTEXT.md decisions):**

1. **Intent cap:** Max 3 intents in a block. If 4+ intents detected, excess intents (all their templates) go to pending immediately.
2. **Template selection per block:**
   - First, take the CORE (first/orden=0) template from each intent (up to 3).
   - If space remains, fill by priority rank (CORE > COMP > OPC).
3. **Merge ordering:**
   - CORE from NEW intents first (respond to client's question).
   - Fill remaining slots by priority (CORE > COMP > OPC).
   - Tiebreaker: pending wins over new at same priority level.
4. **Cap = 3 templates per block** is absolute.

### Pattern 3: Pending Template Storage (Session State JSONB)

**What:** Store unsent templates in a dedicated JSONB column on `session_state`, avoiding the current `datos_capturados` pollution.

**When to use:** When block is interrupted mid-send, or when block composition produces overflow.

**Implementation approach:**

```typescript
interface PendingTemplate {
  templateId: string
  content: string
  contentType: 'texto' | 'template' | 'imagen'
  priority: TemplatePriority
  intent: string
  /** Order within the intent's template list */
  orden: number
  /** When this was saved as pending */
  savedAt: string
}

// Storage: session_state.pending_templates JSONB column
// Lifecycle: cleared on session close/timeout, HANDOFF clears all
```

### Pattern 4: Interaction with Phase 30 Classification

**What:** The pre-send check detects ANY new inbound message and stops the block. Classification (RESPONDIBLE/SILENCIOSO/HANDOFF) happens AFTER, when that new message is processed by the Inngest queue.

**When to use:** Understanding the flow for interruption handling.

**Flow:**
1. Block sending in progress (Inngest concurrency-1 for conversation X)
2. New customer message arrives -> stored in DB by webhook handler -> Inngest event queued (waits for concurrency slot)
3. Pre-send check finds new message -> block stops -> unsent templates saved as pending
4. Current Inngest function completes -> next queued message starts processing
5. New message goes through classification (RESPONDIBLE/SILENCIOSO/HANDOFF)
6. Based on classification:
   - **RESPONDIBLE:** SomnioAgent processes normally -> orchestrator generates new templates -> BlockComposer merges new + pending -> send new block
   - **SILENCIOSO:** No orchestrator call -> silence timer starts -> if 90s timeout: send pending templates + retake message
   - **HANDOFF:** All pending cleared immediately -> HANDOFF executes

### Anti-Patterns to Avoid

- **Polling for new messages:** The check must be a single DB query per template, NOT a polling loop. The Inngest concurrency-1 already serializes messages per conversation.
- **Storing pending in datos_capturados:** Current InterruptionHandler stores JSON in special keys (`__pending_messages`, `__interrupted_at`). This pollutes the data extraction space and causes issues with TransitionValidator (line 259 already has a skip for `__pending_messages`). Use a dedicated column instead.
- **Checking session.last_activity_at for interruption:** Current `MessageSequencer.checkForInterruption()` has a known bug (#6) where cached session data causes missed interruptions. The pre-send DB check (directly querying messages table) is the correct replacement.
- **Sending without checking first template:** CONTEXT.md says pre-send check applies to EVERY template including the first. The current code skips the first (`i > 0` check at line 195 of message-sequencer.ts). Phase 31 must check ALL.
- **Per-block batch check:** The check must be per-template, not per-block. Between sending template 1 and template 2 (with char delay in between), a new message could arrive.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Priority ordering | Custom sort with manual comparisons | Define priority rank as enum/number, use standard sort | Edge cases in comparison logic |
| Template deduplication | Manual loop with includes() | Set-based lookup on template_id | O(1) vs O(n) and cleaner |
| Session state locking | Manual version check for pending | Rely on Inngest concurrency-1 | Only one function runs per conversation at a time, no concurrent writes to pending |

**Key insight:** Inngest's concurrency-1 per `conversationId` is the primary concurrency control mechanism. Within a single Inngest function execution, there is no concurrent access to session state for that conversation. This eliminates the need for optimistic locking on pending template operations.

## Common Pitfalls

### Pitfall 1: Race Between Pre-Send Check and Message Storage

**What goes wrong:** The pre-send check queries the DB, but the new inbound message hasn't been committed to DB yet (webhook still processing). The check finds nothing, and the template is sent when it shouldn't be.

**Why it happens:** The webhook handler stores the message in DB (via `receiveMessage`) BEFORE emitting the Inngest event (`agent/whatsapp.message_received`). So by the time the queued Inngest function runs, the message IS in DB. But the pre-send check runs inside the CURRENT Inngest function (which started before the new message arrived). The question is: is the new message already in DB when the pre-send check runs?

**How to avoid:** Yes, it is. The webhook handler flow is: `receiveMessage()` (stores in DB with `processed_by_agent: false`) -> then `inngest.send()` (queues event). The pre-send check queries `messages WHERE direction='inbound' AND timestamp > triggerTimestamp`. Since the webhook stores the message BEFORE anything else, the message is in DB before the pre-send check runs (the check happens during a delay between template sends).

**Warning signs:** If the delay is very short (responseSpeed = 0 / instantaneo), the window shrinks. But even at 0 delay, there's still the execution time of the previous template send (API call + DB write ~200-500ms), which is enough for the webhook to store the new message.

### Pitfall 2: Pending Templates Surviving Session State Weirdness

**What goes wrong:** Pending templates accumulate across multiple interruptions without being cleared, causing stale templates to be sent.

**Why it happens:** Each interruption saves new pending. If the merge doesn't clear old pending before saving new pending, templates pile up.

**How to avoid:** The merge algorithm MUST: (1) retrieve all current pending, (2) merge with new templates, (3) compose the block, (4) save the NEW pending (overflow from composition), replacing the old pending entirely. Never append to existing pending -- always replace.

**Warning signs:** Pending template count growing beyond expected limits (should never exceed ~10).

### Pitfall 3: SILENCIOSO Interruption + Pending Templates

**What goes wrong:** A SILENCIOSO message interrupts a block. Pending is saved. The 90s silence timer fires. But the silence timer only sends the retake message, not the pending templates.

**Why it happens:** The current silence timer (Phase 30) only sends `SILENCE_RETAKE_MESSAGE`. It doesn't know about pending templates.

**How to avoid:** Phase 31 must modify the silence timer to: (1) retrieve pending templates for the session, (2) send pending templates (up to cap) + retake message. The pending templates are the "info the client was supposed to get" and the retake is the "sales close attempt."

**Warning signs:** Customer gets retake message but not the info they were waiting for.

### Pitfall 4: HANDOFF Clearing Pending But Maintaining Session

**What goes wrong:** HANDOFF clears pending templates, but the session continues. When bot is reactivated after HANDOFF, old stale pending could still be there.

**Why it happens:** If pending is stored in session_state and HANDOFF doesn't explicitly clear it.

**How to avoid:** HANDOFF flow must explicitly clear `session_state.pending_templates = '[]'`. When bot is reactivated: session continues with conversation history but zero pending.

**Warning signs:** After HANDOFF reactivation, bot sends stale templates from pre-HANDOFF.

### Pitfall 5: Block Composition When 0 Templates Sent + New Message

**What goes wrong:** Pre-send check detects new message before even the first template is sent. Per CONTEXT.md, all templates should be discarded (not saved as pending), and the new message should be processed fresh.

**Why it happens:** This is a special case: if the check fires on the FIRST template, it means the agent's processing was already "stale" by the time it was ready to send. The correct behavior is to discard everything and let the next queued message produce its own templates from scratch.

**How to avoid:** In the send loop: track `sentCount`. If interrupted at sentCount=0, return `{ messagesSent: 0, interrupted: true, discarded: true }`. Do NOT save pending. The next Inngest function invocation will produce fresh templates.

**Warning signs:** If this case saves pending, the customer gets both the fresh response AND old pending templates -- double-responding.

### Pitfall 6: Template Priority Not in DB Schema

**What goes wrong:** The agent_templates table has no `priority` column. The CORE/COMP/OPC priority must come from somewhere.

**Why it happens:** Current templates are ordered by `orden` within an intent, but there's no priority concept.

**How to avoid:** Add a `priority` column to `agent_templates` (`TEXT CHECK (priority IN ('CORE', 'COMPLEMENTARIA', 'OPCIONAL')) NOT NULL DEFAULT 'CORE'`). The first template (orden=0) of each intent is typically CORE. Remaining templates are COMPLEMENTARIA or OPCIONAL based on content importance. This requires a migration + template data update.

**Warning signs:** All templates treated as same priority = merge algorithm has no way to make priority decisions.

### Pitfall 7: Multiple Rapid Client Messages and Intent Accumulation

**What goes wrong:** Client sends 3 messages in rapid succession: "hola", "cuanto cuesta?", "hacen envio a cali?". Inngest concurrency-1 processes them sequentially. The sum of intents (hola + precio + envio_cali) should be 3 intents in a single block.

**Why it happens:** Each Inngest invocation processes ONE message. The "sum of intents" is NOT accumulated automatically -- each message produces its own intent.

**How to avoid:** This is NOT handled by Phase 31 directly. The Inngest concurrency-1 means: message 1 processes -> sends block -> message 2 processes -> sends block -> etc. The "sum of intents" mentioned in CONTEXT.md describes the scenario where interruption stops block 1, then message 2 and 3 arrive. When message 2 processes, it merges pending from block 1. When message 3 processes, it merges pending from block 2's overflow. The accumulation is organic through the pending merge system, not a single "accumulate all intents" step.

**Warning signs:** Trying to batch-accumulate intents across messages would require delaying processing, which conflicts with the sequential model.

## Code Examples

### Example 1: Pre-Send Check in MessagingAdapter

```typescript
// Source: Codebase analysis - production/messaging.ts line 103
// Current: no pre-send check
// Phase 31: add check before each template send

async send(params: {
  // ... existing params ...
  triggerTimestamp: string  // NEW: timestamp of message that triggered this block
}): Promise<{ messagesSent: number; interrupted: boolean }> {
  // ... setup ...

  let sentCount = 0
  let interrupted = false

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i]

    // Apply character-based delay
    if (this.responseSpeed > 0) {
      const delayMs = calculateCharDelay(template.content.length) * this.responseSpeed
      await sleep(delayMs)
    }

    // PRE-SEND CHECK: query DB for new inbound messages
    const hasNew = await this.hasNewInboundMessage(
      params.conversationId,
      params.triggerTimestamp
    )

    if (hasNew) {
      interrupted = true
      break  // Stop sending — caller handles pending save
    }

    // Send template via domain
    // ... existing send logic ...
    sentCount++
  }

  return { messagesSent: sentCount, interrupted }
}

private async hasNewInboundMessage(
  conversationId: string,
  afterTimestamp: string
): Promise<boolean> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .gt('timestamp', afterTimestamp)
  return (count ?? 0) > 0
}
```

### Example 2: Block Composition Algorithm

```typescript
// Source: CONTEXT.md decisions - Block Composition Rules
const PRIORITY_RANK: Record<TemplatePriority, number> = {
  CORE: 0,
  COMPLEMENTARIA: 1,
  OPCIONAL: 2,
}

function composeBlock(
  newByIntent: Map<string, PrioritizedTemplate[]>,
  pending: PrioritizedTemplate[],
  maxBlock: number = 3
): BlockCompositionResult {
  const block: PrioritizedTemplate[] = []
  const overflow: PrioritizedTemplate[] = []
  const dropped: PrioritizedTemplate[] = []

  // Step 1: Limit to 3 intents (new intents first)
  const newIntents = [...newByIntent.keys()].slice(0, 3)
  const excessIntents = [...newByIntent.keys()].slice(3)
  for (const intent of excessIntents) {
    overflow.push(...newByIntent.get(intent)!)
  }

  // Step 2: Take CORE from each selected intent
  const remaining: PrioritizedTemplate[] = []
  for (const intent of newIntents) {
    const intentTemplates = newByIntent.get(intent)!
    const core = intentTemplates.find(t => t.priority === 'CORE')
    if (core && block.length < maxBlock) {
      block.push(core)
    }
    remaining.push(...intentTemplates.filter(t => t !== core))
  }

  // Step 3: Add pending templates to remaining pool
  remaining.push(...pending)

  // Step 4: Deduplicate (same template_id -> keep one, prefer pending at same priority)
  const seen = new Set(block.map(t => t.template.id))
  const deduped = remaining.filter(t => {
    if (seen.has(t.template.id)) return false
    seen.add(t.template.id)
    return true
  })

  // Step 5: Sort remaining by priority, then pending-first tiebreaker
  deduped.sort((a, b) => {
    const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (rankDiff !== 0) return rankDiff
    // Tiebreaker: pending wins over new
    if (a.isNew !== b.isNew) return a.isNew ? 1 : -1
    return 0
  })

  // Step 6: Fill block up to cap
  for (const t of deduped) {
    if (block.length >= maxBlock) {
      if (t.priority === 'OPCIONAL') {
        dropped.push(t) // OPC that don't fit are discarded permanently
      } else {
        overflow.push(t) // CORE/COMP go to pending
      }
    } else {
      block.push(t)
    }
  }

  return { block, pending: overflow, dropped }
}
```

### Example 3: Pending Template Storage

```typescript
// Source: Codebase analysis - session_state table + InterruptionHandler pattern
// Current: datos_capturados['__pending_messages'] = JSON.stringify(pending)
// Phase 31: dedicated session_state.pending_templates JSONB column

async function savePending(sessionId: string, pending: PendingTemplate[]): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('session_state')
    .update({
      pending_templates: pending,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
}

async function getPending(sessionId: string): Promise<PendingTemplate[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('session_state')
    .select('pending_templates')
    .eq('session_id', sessionId)
    .single()
  return (data?.pending_templates as PendingTemplate[]) ?? []
}

async function clearPending(sessionId: string): Promise<void> {
  await savePending(sessionId, [])
}
```

### Example 4: Silence Timer with Pending Templates

```typescript
// Source: Codebase analysis - agent-timers.ts silenceTimer function
// Current: sends only SILENCE_RETAKE_MESSAGE
// Phase 31: send pending templates + retake message

// In silenceTimer's 'send-retake' step:
const pending = await getPending(sessionId)
const retakeMessage = 'Deseas adquirir el tuyo?'

// Send pending templates (up to 3) with char delays
for (const template of pending.slice(0, 3)) {
  const delayMs = calculateCharDelay(template.content.length)
  await sleep(delayMs)
  await sendWhatsAppMessage(workspaceId, conversationId, template.content)
}

// Clear pending after sending
await clearPending(sessionId)

// Send retake message
await sendWhatsAppMessage(workspaceId, conversationId, retakeMessage)
```

## State of the Art

| Old Approach | Current Approach | Phase 31 Approach | Impact |
|--------------|------------------|-------------------|--------|
| All templates sent sequentially with fixed delays | Templates sent with char-based delays, rudimentary interruption via session.last_activity_at (Bug #6) | Per-template DB pre-send check, block composition with priority cap | Reliable interruption detection, priority-aware response blocks |
| Pending stored in datos_capturados with __pending_messages hack | Same as old | Dedicated pending_templates JSONB column | Clean separation, no data extraction conflicts |
| No priority concept | Templates sorted by orden only | CORE/COMP/OPC priority per template, merge algorithm | Critical info (CORE) never dropped, optional info (OPC) dropped first |
| All templates from all intents sent | Same (but with no-repetition from Phase 30) | Max 3 intents per block, max 3 templates per block | Prevents overwhelming customer with too many messages |

**Deprecated/outdated:**
- `MessageSequencer.checkForInterruption()`: Uses session.last_activity_at with 2-second window. Known Bug #6. Replaced by DB pre-send check.
- `InterruptionHandler.savePendingMessages()`: Stores in datos_capturados. Replaced by dedicated JSONB column.
- `MessageSequencer.mergeWithPending()`: Simple "new first, then pending" concatenation. Replaced by priority-aware BlockComposer.

## Open Questions

1. **triggerTimestamp resolution**
   - What we know: The Inngest event `agent/whatsapp.message_received` carries `messageId` (wamid) but NOT the message's DB timestamp. The pre-send check needs `timestamp > X` where X is the trigger message's timestamp.
   - What's unclear: Whether to resolve the timestamp from DB at the start of processing (one extra query) or pass it through the event data.
   - Recommendation: Add `messageTimestamp` to the Inngest event data in the webhook handler. The webhook handler already has the timestamp from the incoming message. This avoids an extra DB query.

2. **Priority assignment for existing templates**
   - What we know: ~50+ templates exist in DB with no priority column. All have `orden` (0-indexed).
   - What's unclear: Which templates should be CORE vs COMPLEMENTARIA vs OPCIONAL.
   - Recommendation: Default all existing templates to `CORE` (safest -- nothing gets dropped). Then update via a seed migration based on Somnio's sales flow: typically, `orden=0` = CORE (the direct answer), `orden=1` = COMPLEMENTARIA (supporting info), `orden=2+` = OPCIONAL (nice-to-have).

3. **Multiple intents in a single message**
   - What we know: IntentDetector returns ONE intent per message. Combination intents like `hola+precio` exist as dedicated intents in the template system.
   - What's unclear: How "sum of intents" accumulation works when 3 rapid messages produce 3 different intents (hola, precio, envio). Each is a separate Inngest invocation.
   - Recommendation: The accumulation is organic through the pending merge system. Message 1's templates interrupted by message 2 -> pending. Message 2's templates + pending compose next block. This naturally produces multi-intent blocks without any special accumulation logic.

4. **Block size after SILENCIOSO timeout**
   - What we know: On SILENCIOSO timeout, pending templates are sent + retake message.
   - What's unclear: Does the 3-template cap apply to the silence timeout send? (The retake message is not a template, it's a system message.)
   - Recommendation: Yes, cap applies. Send up to 3 pending templates (by priority), then the retake message as a separate system message. Retake does NOT count against the cap since it's not from the template system.

## Sources

### Primary (HIGH confidence)

- **Codebase analysis:** All findings based on direct reading of source files:
  - `src/lib/agents/engine-adapters/production/messaging.ts` - Current send loop (no pre-send check)
  - `src/lib/agents/somnio/message-sequencer.ts` - Current interruption detection (Bug #6)
  - `src/lib/agents/somnio/interruption-handler.ts` - Current pending storage (datos_capturados hack)
  - `src/lib/agents/somnio/somnio-agent.ts` - Current agent flow (Phase 30 classification)
  - `src/lib/agents/engine/unified-engine.ts` - Engine routing through adapters
  - `src/lib/agents/somnio/template-manager.ts` - Current template selection (no priority)
  - `src/inngest/functions/agent-production.ts` - Inngest concurrency-1 per conversation
  - `src/inngest/functions/agent-timers.ts` - Silence timer (currently no pending support)
  - `src/lib/domain/messages.ts` - receiveMessage sets `processed_by_agent: false`
  - `supabase/migrations/20260224100000_processed_by_agent.sql` - Index for unprocessed messages
  - `supabase/migrations/20260130000002_whatsapp_conversations.sql` - Messages table schema with `idx_messages_conversation ON messages(conversation_id, timestamp DESC)`
  - `supabase/migrations/20260205000000_agent_sessions.sql` - session_state schema
  - `supabase/migrations/20260206000000_agent_templates.sql` - agent_templates schema (no priority column)
  - `.planning/phases/31-pre-send-check-interruption-pending-merge/31-CONTEXT.md` - All locked decisions

### Secondary (MEDIUM confidence)

- None needed -- this phase is entirely codebase-internal.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, 100% codebase analysis
- Architecture: HIGH - All patterns derived from existing code + locked CONTEXT.md decisions
- Pitfalls: HIGH - Identified from actual code bugs (Bug #6) and data flow analysis

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable internal architecture, no external dependency changes)
