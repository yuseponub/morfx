# Phase 29: Inngest Migration + Character Delays - Research

**Researched:** 2026-02-23
**Domain:** Inngest async processing, WhatsApp webhook architecture, delay curve mathematics
**Confidence:** HIGH

## Summary

Phase 29 migrates the WhatsApp message processing from inline (synchronous within the webhook HTTP request) to asynchronous via Inngest, and replaces the fixed per-template delay system with a dynamic character-count-based delay curve. This is the foundation phase for the entire v4.0 "Human Behavior" system.

The good news: **80% of the infrastructure already exists.** The Inngest function `whatsappAgentProcessor` in `agent-production.ts` already has concurrency-1-per-conversation configured. The `agent/whatsapp.message_received` event type is already defined in `events.ts`. The `response_speed` multiplier is already stored in `workspace_agent_config` and passed to `ProductionMessagingAdapter`. What's missing is the wiring: the webhook currently calls `processMessageWithAgent()` inline instead of emitting an Inngest event, and the delay calculation uses a fixed `template.delaySeconds` instead of a character-based formula.

**Primary recommendation:** Wire the existing Inngest function to the existing webhook path, add a `USE_INNGEST_PROCESSING` environment variable for instant rollback, implement `calculateCharDelay()` as a pure function, and update the `ProductionMessagingAdapter.send()` loop to use it.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| inngest | ^3.51.0 | Durable workflow orchestration | Already in use, concurrency-1 function already exists |
| Next.js | 15 (App Router) | Webhook API route | Already in use |
| Supabase | - | Database, workspace_agent_config | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All libraries needed are already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inngest concurrency | Redis-based queue | Inngest already configured, concurrency-1 function exists -- no reason to add Redis |
| Environment variable flag | DB-based feature flag | Env var is simpler, faster check, no DB round-trip, instant rollback via Vercel dashboard |
| Logarithmic delay curve | Linear curve | Logarithmic better mimics human typing acceleration (short messages feel "thought about", long messages don't punish) |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Current Flow (BEFORE -- inline processing)
```
360dialog POST
  |
  v
route.ts (maxDuration=60)
  |
  v
processWebhook()  [webhook-handler.ts]
  |
  v
processIncomingMessage()
  |- domainReceiveMessage()  --> stores message, emits automation triggers
  |- [if msg.type === 'text']
  |    processMessageWithAgent()  <-- INLINE, blocks webhook for 5-30s
  |      |- isAgentEnabledForConversation()
  |      |- UnifiedEngine.processMessage()
  |      |- ProductionMessagingAdapter.send()
  |           |- sleep(template.delaySeconds * responseSpeed * 1000)  <-- FIXED delay
  |           |- domainSendTextMessage()
  |
  v
return { received: true }  (after 5-30 seconds)
```

### Target Flow (AFTER -- async via Inngest)
```
360dialog POST
  |
  v
route.ts (maxDuration can be reduced to 10)
  |
  v
processWebhook()  [webhook-handler.ts]
  |
  v
processIncomingMessage()
  |- domainReceiveMessage()  --> stores message, emits automation triggers
  |- [if msg.type === 'text' && USE_INNGEST_PROCESSING]
  |    await inngest.send('agent/whatsapp.message_received', {...})
  |    // FIN -- ~200ms total
  |
  |- [FALLBACK: if !USE_INNGEST_PROCESSING]
  |    processMessageWithAgent()  <-- old inline path preserved
  |
  v
return { received: true }  (~200ms)

--- meanwhile, asynchronously ---

whatsappAgentProcessor [agent-production.ts]
  concurrency: { key: 'event.data.conversationId', limit: 1 }
  |
  v
step.run('process-message')
  processMessageWithAgent()
    |- UnifiedEngine.processMessage()
    |- ProductionMessagingAdapter.send()
         |- calculateCharDelay(content.length) * speedFactor  <-- NEW dynamic delay
         |- domainSendTextMessage()
```

### Pattern 1: Feature Flag via Environment Variable
**What:** Use `process.env.USE_INNGEST_PROCESSING` as a boolean flag to control whether the webhook emits an Inngest event (async) or processes inline (sync).
**When to use:** Any time a critical path is being migrated and instant rollback is needed.
**Example:**
```typescript
// In webhook-handler.ts, replacing the inline processMessageWithAgent() block:
const useInngest = process.env.USE_INNGEST_PROCESSING === 'true'

if (msg.type === 'text') {
  if (useInngest) {
    // Async: emit event, Inngest handles processing
    const { inngest } = await import('@/inngest/client')
    await (inngest.send as any)({
      name: 'agent/whatsapp.message_received',
      data: {
        conversationId,
        contactId: convData?.contact_id ?? null,
        messageContent: normalizeWebsiteGreeting(msg.text?.body ?? ''),
        workspaceId,
        phone,
        messageId: msg.id,
      },
    })
  } else {
    // Inline fallback (existing behavior)
    const { processMessageWithAgent } = await import(...)
    await processMessageWithAgent({...})
  }
}
```
**Source:** Pattern derived from project's existing approach (no feature flag library used anywhere in codebase).

### Pattern 2: Logarithmic Delay Curve
**What:** Calculate typing delay based on character count using a logarithmic curve with min/max bounds.
**When to use:** When simulating human typing speed that accelerates for longer messages.
**Example:**
```typescript
// Source: Derived from DISCUSSION.md curve specification
/**
 * Calculate typing delay in milliseconds based on character count.
 * Curve: 1-20 chars = ~2s, 50 = ~3.5s, 80 = ~5s, 100 = ~6s,
 *        150 = ~8s, 200 = ~10s, 250+ = ~12s cap.
 *
 * Formula: delay = MIN + (MAX - MIN) * ln(1 + chars/k) / ln(1 + CAP/k)
 * where k controls curve shape (lower = more aggressive log)
 */
const MIN_DELAY_MS = 2000
const MAX_DELAY_MS = 12000
const CHAR_CAP = 250
const K = 30  // Curve shape parameter

export function calculateCharDelay(charCount: number): number {
  if (charCount <= 0) return MIN_DELAY_MS
  const effectiveChars = Math.min(charCount, CHAR_CAP)
  const normalized = Math.log(1 + effectiveChars / K) / Math.log(1 + CHAR_CAP / K)
  return MIN_DELAY_MS + (MAX_DELAY_MS - MIN_DELAY_MS) * normalized
}
```

### Pattern 3: MUST await inngest.send in Vercel serverless
**What:** Always `await` the `inngest.send()` call in webhook handlers and API routes deployed to Vercel.
**When to use:** Every time `inngest.send()` is called outside of an Inngest function.
**Why critical:** Vercel can terminate the serverless function immediately after the response is sent. If `inngest.send()` is not awaited, the event may never reach Inngest.
**Example:**
```typescript
// CORRECT -- always in this project:
await (inngest.send as any)({
  name: 'agent/whatsapp.message_received',
  data: { ... },
})

// INCORRECT -- would lose events:
inngest.send({ name: 'agent/whatsapp.message_received', data: { ... } })
// return response -- Vercel kills process, event never sent
```
**Source:** Established project pattern -- see `trigger-emitter.ts:7-9`, `comandos.ts:257`, `robot-callback/route.ts:189`.

### Anti-Patterns to Avoid
- **Fire-and-forget inngest.send in serverless:** Vercel terminates the process after response. ALWAYS await. This is documented in project memory and trigger-emitter.ts.
- **Checking feature flag from DB on every webhook hit:** Adds latency and a DB round-trip to the hot path. Use env var instead (cached in process memory).
- **Removing the inline path entirely during migration:** Keep both paths with feature flag. If Inngest has an outage, flip the flag to restore service instantly.
- **Using step.sleep() for character delays:** `step.sleep()` inside Inngest releases the concurrency slot. We need `setTimeout`/`sleep()` (blocking within the step.run) to hold the concurrency slot while delaying -- otherwise another message could start processing during the delay.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inngest event typing | Custom event type | Existing `agent/whatsapp.message_received` in `events.ts` | Already defined with correct fields |
| Inngest function | New function | Existing `whatsappAgentProcessor` in `agent-production.ts` | Already has concurrency-1 per conversation |
| Speed multiplier storage | New DB column | Existing `workspace_agent_config.response_speed` | Already in DB and UI |
| Speed presets | New preset system | Existing SPEED_PRESETS in `agent-config-slider.tsx` and `config-panel.tsx` | UI already has Real/Rapido/Instantaneo |
| Process deduplication | Custom dedup | Existing wamid unique constraint in messages table | `domainReceiveMessage` handles 23505 |
| Agent enabled check | New check | Existing `isAgentEnabledForConversation()` | Already called in processMessageWithAgent |

**Key insight:** This phase is primarily a WIRING change. The components exist -- they just aren't connected in the active flow. The only truly new code is `calculateCharDelay()` (a pure math function) and the feature flag branching logic in the webhook handler.

## Common Pitfalls

### Pitfall 1: Inngest Concurrency Slot and sleep()
**What goes wrong:** Using `step.sleep()` (Inngest's built-in sleep) instead of `setTimeout`-based sleep releases the concurrency slot. Another message for the same conversation could start processing during the typing delay, causing overlapping responses.
**Why it happens:** Developers assume `step.sleep()` is the right way to add delays in Inngest functions. But `step.sleep()` is designed to release the concurrency slot and resume later.
**How to avoid:** The delay MUST happen INSIDE `step.run('process-message', ...)`, using the existing `sleep()` utility (Promise-based setTimeout). This keeps the concurrency-1 lock held for the entire processing + sending duration.
**Warning signs:** Two agent responses arriving simultaneously for the same conversation.

### Pitfall 2: Event Not Reaching Inngest
**What goes wrong:** The webhook returns 200 but the Inngest event was never sent, so the message is never processed by the agent.
**Why it happens:** `inngest.send()` not awaited in serverless (Vercel kills process), or Inngest service is temporarily unreachable.
**How to avoid:** (1) ALWAYS `await inngest.send()`. (2) Keep the inline fallback path behind the feature flag. (3) The message is already stored in DB by `domainReceiveMessage()` before agent routing -- so message data is never lost, only agent response is delayed/missing.
**Warning signs:** Messages appearing in UI but agent never responding. Check Inngest dashboard for event delivery.

### Pitfall 3: maxDuration Conflict
**What goes wrong:** The webhook route has `maxDuration = 60` (for inline agent processing). After migration, the webhook should complete in ~200ms. If the feature flag is OFF (inline fallback), the 60s timeout is still needed.
**Why it happens:** Forgetting to keep maxDuration high enough for the fallback path.
**How to avoid:** Keep `maxDuration = 60` in the webhook route until the inline path is fully removed (post-feature-flag validation). The Inngest function has its own timeout controlled by Inngest (default 600s).
**Warning signs:** 504 errors from Vercel when feature flag is OFF.

### Pitfall 4: Type Assertion for inngest.send
**What goes wrong:** TypeScript error when calling `inngest.send()` with custom event types.
**Why it happens:** The Inngest client's typed schemas don't always match the `send()` overloads perfectly.
**How to avoid:** Use `(inngest.send as any)({...})` -- this is the established pattern in this project (see `trigger-emitter.ts:50`, `comandos.ts:258`, `shopify/webhook-handler.ts:127`).
**Warning signs:** TypeScript compilation errors in CI.

### Pitfall 5: Speed Factor Multiplication Semantics Change
**What goes wrong:** The current delay system multiplies `delaySeconds * responseSpeed` where `responseSpeed=0` means instant and `1.0` means real speed. The new system should maintain the same semantics: `calculateCharDelay(chars) * speedFactor` where `speedFactor=0` = instant, `1.0` = real delays.
**Why it happens:** Confusing the multiplier direction or changing the presets without updating UI labels.
**How to avoid:** The existing SPEED_PRESETS map `{ Real: 1.0, Rapido: 0.2, Instantaneo: 0.0 }`. The new `calculateCharDelay()` returns milliseconds. Multiply by `speedFactor` (which is `responseSpeed` from config). If `speedFactor === 0`, skip sleep entirely.
**Warning signs:** "Instantaneo" preset still showing delays, or "Real" preset responding too fast/slow.

### Pitfall 6: Error Handling Regression in Webhook
**What goes wrong:** The current inline path has a try/catch that writes `[ERROR AGENTE]` messages to the conversation on failure. After migration to Inngest, this error visibility could be lost because failures happen asynchronously.
**Why it happens:** Inngest retries are configured (`retries: 2`) which handles transient failures, but permanent failures need to surface somewhere.
**How to avoid:** Keep the error handling in `processMessageWithAgent()` -- it already writes error messages to the conversation. Inngest's step.run wraps this function, so errors are caught by Inngest's retry system. After all retries fail, Inngest marks the function as failed (visible in Inngest dashboard). Consider adding an `onFailure` handler to the Inngest function for persistent error notification.
**Warning signs:** Silent agent failures with no error messages in the conversation.

## Code Examples

### Example 1: Feature Flag Branch in webhook-handler.ts
```typescript
// Source: Derived from codebase analysis -- replaces lines 246-296 in webhook-handler.ts

// Agent routing: Process text messages through agent
if (msg.type === 'text') {
  const useInngest = process.env.USE_INNGEST_PROCESSING === 'true'

  if (useInngest) {
    // ASYNC PATH: Emit Inngest event, processing happens in background
    try {
      const { inngest } = await import('@/inngest/client')
      // MUST await in serverless (Vercel terminates early)
      await (inngest.send as any)({
        name: 'agent/whatsapp.message_received',
        data: {
          conversationId,
          contactId: convForContact?.contact_id ?? null,
          messageContent: normalizeWebsiteGreeting(msg.text?.body ?? ''),
          workspaceId,
          phone,
          messageId: msg.id,
        },
      })
    } catch (inngestError) {
      // Non-blocking: if Inngest send fails, log but don't fail message processing
      console.error('Inngest event send failed (non-blocking):', inngestError)
      // FALLBACK: process inline if Inngest fails
      try {
        const { processMessageWithAgent } = await import(
          '@/lib/agents/production/webhook-processor'
        )
        await processMessageWithAgent({
          conversationId,
          contactId: convForContact?.contact_id ?? null,
          messageContent: normalizeWebsiteGreeting(msg.text?.body ?? ''),
          workspaceId,
          phone,
        })
      } catch { /* non-blocking */ }
    }
  } else {
    // INLINE PATH: Existing behavior (feature flag OFF or not set)
    try {
      const { processMessageWithAgent } = await import(
        '@/lib/agents/production/webhook-processor'
      )
      // ... existing inline processing code ...
    } catch (agentError) {
      // ... existing error handling ...
    }
  }
}
```

### Example 2: calculateCharDelay() Pure Function
```typescript
// Source: Derived from DISCUSSION.md delay curve specification
// File: src/lib/agents/somnio/char-delay.ts

const MIN_DELAY_MS = 2000   // Minimum 2 seconds (even for 1 char)
const MAX_DELAY_MS = 12000  // Cap at 12 seconds (250+ chars)
const CHAR_CAP = 250        // Characters at which we hit max delay
const K = 30                // Curve shape (lower = more aggressive logarithm)

/**
 * Calculate human-like typing delay based on message character count.
 *
 * Curve targets (speedFactor=1.0):
 *   1-20 chars  -> ~2.0s
 *   50 chars    -> ~3.5s
 *   80 chars    -> ~5.0s
 *   100 chars   -> ~6.0s
 *   150 chars   -> ~8.0s
 *   200 chars   -> ~10.0s
 *   250+ chars  -> ~12.0s (cap)
 *
 * @param charCount - Number of characters in the message
 * @returns Delay in milliseconds (before speedFactor multiplication)
 */
export function calculateCharDelay(charCount: number): number {
  if (charCount <= 0) return MIN_DELAY_MS
  const effectiveChars = Math.min(charCount, CHAR_CAP)
  const normalized = Math.log(1 + effectiveChars / K) / Math.log(1 + CHAR_CAP / K)
  return Math.round(MIN_DELAY_MS + (MAX_DELAY_MS - MIN_DELAY_MS) * normalized)
}
```

### Example 3: Updated ProductionMessagingAdapter.send() Loop
```typescript
// Source: Modification of existing messaging.ts:99-105
// Key change: replace template.delaySeconds with calculateCharDelay()

import { calculateCharDelay } from '@/lib/agents/somnio/char-delay'

// Inside send() method, replace the delay logic:
for (let i = 0; i < templates.length; i++) {
  const template = templates[i]

  // Apply character-based delay (skip for first message if desired, skip if instant)
  if (i > 0 && this.responseSpeed > 0) {
    const delayMs = calculateCharDelay(template.content.length) * this.responseSpeed
    await sleep(delayMs)
  }

  // ... existing send logic (domainSendTextMessage, etc.) ...
}
```

### Example 4: Verify Delay Curve Values (test helper)
```typescript
// Test to verify the curve matches DISCUSSION.md specification
// Tolerance: +/- 0.5s from target values

describe('calculateCharDelay', () => {
  const cases = [
    { chars: 10,  expectedMs: 2000,  tolerance: 500 },
    { chars: 50,  expectedMs: 3500,  tolerance: 500 },
    { chars: 80,  expectedMs: 5000,  tolerance: 500 },
    { chars: 100, expectedMs: 6000,  tolerance: 500 },
    { chars: 150, expectedMs: 8000,  tolerance: 500 },
    { chars: 200, expectedMs: 10000, tolerance: 500 },
    { chars: 250, expectedMs: 12000, tolerance: 500 },
    { chars: 500, expectedMs: 12000, tolerance: 500 },  // cap
  ]

  for (const { chars, expectedMs, tolerance } of cases) {
    it(`${chars} chars -> ~${expectedMs}ms`, () => {
      const actual = calculateCharDelay(chars)
      expect(actual).toBeGreaterThanOrEqual(expectedMs - tolerance)
      expect(actual).toBeLessThanOrEqual(expectedMs + tolerance)
    })
  }
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed delay per template (`delay_s` column) | Dynamic delay by character count | This phase | Template `delay_s` column becomes unused |
| Inline agent processing in webhook | Async via Inngest with concurrency-1 | This phase | Webhook returns in ~200ms instead of 5-30s |
| responseSpeed multiplies fixed delay | responseSpeed multiplies dynamic delay | This phase | Same presets (1.0/0.2/0.0), different base |

**Deprecated/outdated:**
- `agent_templates.delay_s` column: Will be ignored in code but kept in DB (no migration to remove -- cleanup later)
- `template.delaySeconds` in MessagingAdapter: Replaced by `calculateCharDelay(template.content.length)`
- `maxDuration = 60` in webhook route: Can be reduced after feature flag validation, but keep for now (fallback path needs it)

## Existing Infrastructure Map

### What Already Exists (just needs wiring)

| Component | File | Status | What's Needed |
|-----------|------|--------|---------------|
| `whatsappAgentProcessor` | `src/inngest/functions/agent-production.ts` | EXISTS, registered in serve route | Wire webhook to emit event instead of inline call |
| `agent/whatsapp.message_received` event type | `src/inngest/events.ts:135-146` | EXISTS with correct fields | No changes needed |
| Inngest serve route registration | `src/app/api/inngest/route.ts:43` | EXISTS, includes `agentProductionFunctions` | No changes needed |
| `response_speed` in workspace config | `workspace_agent_config.response_speed` (DB) | EXISTS, default 1.0 | No changes needed |
| SPEED_PRESETS UI | `agent-config-slider.tsx`, `config-panel.tsx` | EXISTS: Real(1.0)/Rapido(0.2)/Instantaneo(0.0) | Update descriptions to match new delay range |
| `processMessageWithAgent()` | `src/lib/agents/production/webhook-processor.ts` | EXISTS | No changes -- called from Inngest step.run instead of inline |
| `ProductionMessagingAdapter` | `src/lib/agents/engine-adapters/production/messaging.ts` | EXISTS | Modify delay logic in `send()` method |
| `responseSpeed` passed to adapter | `production/index.ts:48` | EXISTS | No changes needed |
| Error messages in conversation | `webhook-processor.ts:271-279` | EXISTS | Preserved -- runs inside Inngest step.run |

### What Needs to Be Created

| Component | Location | Purpose |
|-----------|----------|---------|
| `calculateCharDelay()` | `src/lib/agents/somnio/char-delay.ts` | Pure function: chars -> delay ms |
| Feature flag check | `webhook-handler.ts` (modify) | Branch between async and inline paths |
| DB migration: `processed_by_agent` | `supabase/migrations/` | Boolean field on messages table (INFRA-01) |

### What Needs to Be Modified

| File | Change | Lines |
|------|--------|-------|
| `src/lib/whatsapp/webhook-handler.ts` | Replace inline `processMessageWithAgent()` with feature-flagged Inngest emit | ~246-296 |
| `src/lib/agents/engine-adapters/production/messaging.ts` | Replace `template.delaySeconds * responseSpeed * 1000` with `calculateCharDelay(content.length) * responseSpeed` | ~99-105 |
| `src/app/api/webhooks/whatsapp/route.ts` | (Optional) Reduce maxDuration comment, but keep value for fallback | Line 12 |

## DB Migration Requirements

### INFRA-01: `processed_by_agent` Column

```sql
-- Add processed_by_agent flag to messages table
-- Used by future check pre-envio (Phase 29+ / Etapa 3A) to detect new inbound
-- Default TRUE for existing messages (already processed), new inbound = FALSE
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS processed_by_agent BOOLEAN NOT NULL DEFAULT true;

-- Index for the check pre-envio query pattern:
-- SELECT count(*) FROM messages WHERE conversation_id=X AND direction='inbound'
--   AND processed_by_agent=false AND created_at > [timestamp]
CREATE INDEX idx_messages_unprocessed_inbound
  ON messages(conversation_id, created_at)
  WHERE direction = 'inbound' AND processed_by_agent = false;
```

**Note:** The `processed_by_agent` column is technically a foundation for Etapa 3A (check pre-envio) which is beyond this phase's scope. However, INFRA-01 in the requirements mandates it. Adding it now is safe (default TRUE, no behavioral change) and prevents a second migration later.

## Open Questions

1. **Should the first message in a sequence also have a character delay?**
   - What we know: Current code skips delay for `i === 0` (first message). DISCUSSION.md doesn't specify.
   - What's unclear: Should the first bot response after receiving a customer message have a delay? This simulates "reading + typing" vs the current "instant first response."
   - Recommendation: YES, add delay for first message too (it's more human-like). The delay starts AFTER agent processing finishes, so it adds to response time. With `calculateCharDelay()` the first message (typically ~50 chars) would add ~3.5s. User can validate and adjust K parameter if too slow.

2. **Should `processed_by_agent` be set to FALSE on insert or updated after processing?**
   - What we know: DISCUSSION.md says "processed_by_agent: false" for new inbound messages, set to true after agent processes.
   - What's unclear: Should it be FALSE on INSERT in `domainReceiveMessage()` and then updated to TRUE in `processMessageWithAgent()`? Or should it be TRUE by default and only FALSE during the processing window?
   - Recommendation: Set DEFAULT to `true` in DB (safe for existing messages). In `domainReceiveMessage()`, explicitly insert with `processed_by_agent: false` for inbound messages. After `processMessageWithAgent()` completes, update to `true`. This way the column accurately reflects "has this inbound message been seen by the agent."

3. **Curve parameter K tuning**
   - What we know: K=30 gives a curve close to the DISCUSSION.md specification. But exact match depends on float rounding.
   - What's unclear: Whether the exact curve needs production tuning after deployment.
   - Recommendation: Make K a constant in `char-delay.ts` that's easy to adjust. Implement the test suite from Example 4 to validate curve shape. After deployment, user can validate by observing response timing in production.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `webhook-handler.ts`, `webhook-processor.ts`, `messaging.ts`, `agent-production.ts`, `events.ts`, `client.ts`, `agent-config.ts` -- direct code reading
- `.planning/standalone/human-behavior/DISCUSSION.md` -- complete design document with delay curve specification
- `.planning/standalone/human-behavior/ARCHITECTURE-ANALYSIS.md` -- architecture map with all 8 layers documented
- Inngest official docs (https://www.inngest.com/docs/guides/concurrency) -- concurrency-per-key pattern, FIFO queueing

### Secondary (MEDIUM confidence)
- Inngest concurrency behavior: docs confirm steps queued in FIFO order when limit reached, `step.sleep()` releases slot while waiting. This aligns with our need to keep sleep INSIDE step.run.
- Project MEMORY.md patterns: "NEVER fire-and-forget inngest.send in webhooks/API routes"

### Tertiary (LOW confidence)
- Exact Inngest dispatch latency (<500ms for events with runners available) -- based on ARCHITECTURE-ANALYSIS.md claim, not independently verified. Should be validated in production.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- existing Inngest function already configured, just needs wiring
- Delay curve: HIGH -- mathematical formula verified against DISCUSSION.md specification
- Feature flag: HIGH -- simple env var pattern, well-understood
- Pitfalls: HIGH -- all derived from direct codebase analysis and established project patterns

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable domain -- Inngest v3 API, no fast-moving changes)
