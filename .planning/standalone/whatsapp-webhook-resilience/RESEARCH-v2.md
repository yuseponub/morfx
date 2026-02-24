# WhatsApp Webhook Resilience v2 - Research

**Researched:** 2026-02-25
**Domain:** Webhook pipeline hardening, HTTP resilience, event replay
**Confidence:** HIGH

## Summary

This research investigates how to harden the WhatsApp webhook pipeline so incoming messages are never lost again. The incident involved ~20 hours of lost messages caused by a triple failure: (1) code deployed referencing a non-existent DB column (`processed_by_agent`), (2) the store-before-process table (`whatsapp_webhook_events`) wasn't applied in production either, and (3) `route.ts` always returns HTTP 200, preventing 360dialog from retrying.

The codebase already has store-before-process implemented in `webhook-handler.ts` (v1, from the original PLAN). What's needed now is: fix the HTTP response logic in `route.ts` so 360dialog retries on true failures, add retry/replay columns to the existing table, create a CLI replay script, and add a process rule to prevent migration-before-code desync.

**Primary recommendation:** Change `route.ts` to return 500 when the store-before-process INSERT fails (meaning we have no safety net), but keep returning 200 if the store succeeded (even if processing fails, because we have the payload for later replay).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.93.1 | Direct Supabase access from CLI script | Already in project, scripts use `createClient()` directly |
| `tsx` | (devDep) | TypeScript script execution | Already used for all scripts via `npx tsx` |

### Supporting
No new libraries needed. This phase uses only existing project dependencies.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct Supabase in script | `createAdminClient()` (app import) | Scripts are excluded from tsconfig (`"exclude": ["scripts"]`), can't use `@/*` path aliases. Direct `createClient()` is the established pattern (see `backfill-is-client.ts`). |
| Hardcoded credentials in script | Env vars via `dotenv` or process.env | Existing scripts use hardcoded credentials. However, for a script that will persist in the repo, env vars via `process.env` are safer. The script can read from `.env.local` manually or expect env vars to be set. |

## Architecture Patterns

### Current Pipeline Architecture
```
360dialog POST
  -> route.ts: HMAC verify, parse JSON, validate
  -> processWebhook(payload, workspaceId, phoneNumberId)
       -> logWhatsAppWebhookEvent() -- INSERT to whatsapp_webhook_events [store]
       -> for each message: processIncomingMessage()
       -> for each status: processStatusUpdate()
       -> updateWhatsAppWebhookEvent('processed') [update]
       catch: updateWhatsAppWebhookEvent('failed', errorMsg) [update]
  -> route.ts: currently ALWAYS returns 200
```

### Pattern 1: Conditional HTTP Response Based on Store Success
**What:** route.ts returns 200 only if the payload was safely stored (or processing succeeded). Returns 500 if the store failed AND processing also failed.
**When to use:** When the webhook provider (360dialog) supports retries on non-200.

The key change is that `processWebhook()` must communicate whether the store succeeded back to `route.ts`. Currently it returns `void`. Two approaches:

**Approach A: Return a result object**
```typescript
// webhook-handler.ts
interface ProcessWebhookResult {
  stored: boolean  // whether payload was saved to whatsapp_webhook_events
}

export async function processWebhook(
  payload: WebhookPayload,
  workspaceId: string,
  phoneNumberId: string
): Promise<ProcessWebhookResult> {
  const supabase = createAdminClient()
  const eventId = await logWhatsAppWebhookEvent(supabase, workspaceId, phoneNumberId, payload)

  try {
    // ... existing processing ...
    if (eventId) await updateWhatsAppWebhookEvent(supabase, eventId, 'processed')
    return { stored: eventId !== null }
  } catch (error) {
    if (eventId) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      await updateWhatsAppWebhookEvent(supabase, eventId, 'failed', errorMsg)
    }
    if (!eventId) throw error  // Re-throw ONLY if not stored (triggers 500)
    return { stored: true }    // Stored but failed processing = safe to ACK
  }
}
```

```typescript
// route.ts — new catch logic
try {
  const result = await processWebhook(payload, workspaceId, phoneNumberId)
  return NextResponse.json({ received: true }, { status: 200 })
} catch (error) {
  // Only reaches here if store failed AND processing failed
  console.error('Webhook processing error (NOT stored, requesting retry):', error)
  return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
}
```

**Why this is correct:**
- If stored + processed = 200 (happy path)
- If stored + failed processing = 200 (we have the payload, can replay later)
- If NOT stored + processed = 200 (processing worked, no safety net needed)
- If NOT stored + failed processing = 500 (360dialog should retry)

### Pattern 2: CLI Replay Script
**What:** Standalone TypeScript script that reads failed events from `whatsapp_webhook_events`, re-processes them through `processWebhook()`, and tracks retry state.
**When to use:** Manual recovery after incidents.

**Critical constraint:** The script lives in `scripts/` which is excluded from the project's tsconfig. It CANNOT use `@/*` path aliases or import from `src/`. It must use direct Supabase client access.

However, the script needs to call `processWebhook()` which is in `src/lib/whatsapp/webhook-handler.ts`. Two sub-approaches:

**Sub-approach A: Script calls processWebhook() via dynamic import with tsconfig-paths**
Requires a separate `tsconfig.scripts.json` or using `tsx --tsconfig tsconfig.scripts.json`. This is fragile.

**Sub-approach B: Script does its own HTTP POST to the webhook endpoint**
Send the stored payload back to the webhook URL. This is clean but requires HMAC signing, and the 60s timeout may be an issue for batch replay.

**Sub-approach C (RECOMMENDED): Script queries failed events, then for each one calls the production webhook endpoint's processWebhook logic by importing directly**
Use `tsx` which handles path resolution naturally. The existing `backfill-is-client.ts` uses direct Supabase, but for replay we need the full processing pipeline. The simplest approach is:

1. Script creates its own Supabase client (for reading/updating `whatsapp_webhook_events`)
2. For calling `processWebhook()`, the script needs the Next.js module resolution. Since `tsx` supports TypeScript path aliases when a `tsconfig.json` with `paths` is present, we can create a minimal `scripts/tsconfig.json` that extends the root one but removes the `exclude`.

**Actually, the cleanest approach**: The script ONLY does Supabase CRUD (read failed events, update status). For the actual reprocessing, it calls `processWebhook()` by using a self-contained version that imports from relative paths. BUT this duplicates logic.

**FINAL RECOMMENDATION**: Use `tsx` with a `--tsconfig` flag pointing to a script-specific tsconfig that includes path aliases. The replay script imports `processWebhook` directly from `src/lib/whatsapp/webhook-handler.ts`. This avoids code duplication and ensures replay uses the exact same processing pipeline as live webhooks.

```json
// scripts/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["../src/*"]
    }
  },
  "include": ["./**/*.ts", "../src/**/*.ts"],
  "exclude": []
}
```

Run command: `npx tsx --tsconfig scripts/tsconfig.json scripts/replay-failed-webhooks.ts`

**IMPORTANT**: This requires the same env vars as the Next.js app (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.). The script should load `.env.local` via `dotenv` or the user sets them before running.

### Pattern 3: Status Flow with Retry Tracking
**What:** Extended status CHECK constraint and new columns for retry tracking.
**Status flow:**
```
pending -> processed     (first attempt success)
pending -> failed        (first attempt error)
failed  -> reprocessed   (replay success)
failed  -> failed        (replay failure, retry_count++)
failed  -> dead_letter   (retry_count >= 3)
```

### Anti-Patterns to Avoid
- **Returning 200 always regardless of store success:** This is the root cause of the original incident. 360dialog treats 200 as "delivered successfully" and will NOT retry.
- **Having the replay script duplicate processWebhook logic:** If the processing logic changes, the replay script would be out of sync. Always import and call the same function.
- **Using fire-and-forget for the store INSERT:** The store result MUST be checked because it determines the HTTP response code. Currently `logWhatsAppWebhookEvent` silently returns null on failure — this needs to propagate to route.ts.
- **Running replay without rate limiting:** Replaying 100+ failed events simultaneously could overwhelm the system. Use sequential processing with delays.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript script execution | Custom build step | `npx tsx` | Already standard in project, handles TS natively |
| Environment variable loading | Custom parser | `dotenv` or inline process.env | Standard approach for Node scripts |
| Supabase admin access in scripts | HTTP API calls | `@supabase/supabase-js` `createClient()` | Already used in existing scripts (backfill-is-client.ts) |
| Deduplication on replay | Custom dedup logic | Existing `wamid` UNIQUE constraint in `messages` table | Domain layer handles error code 23505 (duplicate) gracefully |

**Key insight:** The replay mechanism doesn't need its own deduplication logic because the `messages.wamid` UNIQUE constraint and domain's 23505 error handler already prevent duplicates. Replay is inherently safe.

## Common Pitfalls

### Pitfall 1: 360dialog 5-Second Timeout
**What goes wrong:** 360dialog has a hard limit of 5 seconds for the webhook endpoint to return a 200. If processing takes longer, 360dialog marks the delivery as failed and queues for retry — even if you eventually return 200.
**Why it happens:** The current webhook has `maxDuration = 60` for agent processing (Claude API calls can take 10-30s).
**How to avoid:** The store-before-process INSERT must complete in <5 seconds (typically ~10ms). The 200 response should be based on store success, not processing completion. Processing can take up to 60s because the 200 was already sent... WAIT. This is a fundamental issue: Next.js route handlers are synchronous (response is sent after the function returns, not before).
**Critical finding:** In Next.js App Router, the HTTP response is sent when the handler function returns. There is NO way to "return 200 early and continue processing." The `maxDuration` of 60s means the function CAN run for 60s, but 360dialog will consider it failed after 5s if no 200 is received.
**Implication:** The current architecture ALREADY violates the 5s timeout when agent processing runs inline. The Inngest path (when `USE_INNGEST_PROCESSING=true`) solves this by returning fast (~200ms). The store-before-process approach we're implementing adds ~10ms, which is safe.
**Warning signs:** If you see 360dialog retry logs for webhooks that actually processed successfully, it's the timeout issue.

### Pitfall 2: Script Can't Import App Modules
**What goes wrong:** `scripts/` is excluded from tsconfig.json, so `@/*` path aliases don't resolve. Importing `processWebhook` from `@/lib/whatsapp/webhook-handler` fails.
**Why it happens:** tsconfig.json has `"exclude": ["scripts"]` to avoid type-checking scripts during build.
**How to avoid:** Create `scripts/tsconfig.json` that extends root and adds correct path aliases. Run with `npx tsx --tsconfig scripts/tsconfig.json`.
**Warning signs:** `Cannot find module '@/lib/...'` errors when running the script.

### Pitfall 3: Missing ENV Variables in Script Context
**What goes wrong:** The replay script runs outside Next.js, so `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.SUPABASE_SERVICE_ROLE_KEY` are undefined.
**Why it happens:** Next.js auto-loads `.env.local`, but `npx tsx` does not.
**How to avoid:** Either: (a) use `dotenv` to load `.env.local` at script start, or (b) require env vars to be set before running. Option (a) is more user-friendly. Note: `backfill-is-client.ts` uses hardcoded credentials — we should NOT repeat that pattern for a script that stays in the repo.
**Warning signs:** `SUPABASE_SERVICE_ROLE_KEY is not set` error.

### Pitfall 4: Replay Re-triggers Automations
**What goes wrong:** Replaying a message through `processWebhook()` calls `processIncomingMessage()` which calls `domainReceiveMessage()` which emits automation triggers (`emitWhatsAppMessageReceived`, `checkKeywordMatches`). If the message was originally processed (and the automation ran), replaying it could trigger automations again.
**Why it happens:** The replay goes through the full pipeline.
**How to avoid:** The `wamid` UNIQUE constraint prevents the message from being re-inserted (returns `messageId: ''`), which causes the webhook handler to `return` early (line 235-238 in webhook-handler.ts). This means automations are NOT re-triggered for already-processed messages. But for messages that truly failed (never made it to `messages` table), automations WILL fire — which is the desired behavior.
**Warning signs:** None — this is actually correct behavior. The deduplication handles it.

### Pitfall 5: processWebhook Creates Its Own Admin Client
**What goes wrong:** Currently `processWebhook` creates `const supabase = createAdminClient()` at line 50 and passes it to the helper functions. The replay script needs `processWebhook` to work, which means `createAdminClient()` must work in the script context.
**Why it happens:** `createAdminClient()` reads `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.SUPABASE_SERVICE_ROLE_KEY`.
**How to avoid:** Ensure the script loads env vars before importing `processWebhook`. Use `dotenv` as the first thing in the script.

### Pitfall 6: Migration ALTER with CHECK Constraint
**What goes wrong:** PostgreSQL doesn't support `ALTER TABLE ... ALTER CONSTRAINT` directly. To add new values to a CHECK constraint, you must DROP the existing constraint and CREATE a new one.
**Why it happens:** CHECK constraints are immutable in PostgreSQL.
**How to avoid:** Migration must:
```sql
-- Drop existing check
ALTER TABLE whatsapp_webhook_events DROP CONSTRAINT whatsapp_webhook_events_status_check;
-- Add expanded check
ALTER TABLE whatsapp_webhook_events ADD CONSTRAINT whatsapp_webhook_events_status_check
  CHECK (status IN ('pending', 'processed', 'failed', 'reprocessed', 'dead_letter'));
```
**Warning signs:** Migration error if you try to ALTER the CHECK directly.

## Code Examples

### Example 1: Modified route.ts Response Logic
```typescript
// Source: Current codebase analysis + CONTEXT-v2.md decisions

export async function POST(request: NextRequest) {
  // ... existing validation (HMAC, JSON parse, etc.) ...

  try {
    const result = await processWebhook(payload, workspaceId, phoneNumberId)
    const duration = Date.now() - startTime
    console.log(`Webhook processed in ${duration}ms for workspace ${workspaceId}`)
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    // processWebhook only throws if store FAILED and processing FAILED
    // In this case, we have NO safety net — 360dialog must retry
    console.error('Webhook NOT stored, returning 500 for retry:', error)
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    )
  }
}
```

### Example 2: Modified processWebhook Return Type
```typescript
// Source: Current webhook-handler.ts + CONTEXT-v2.md decisions

export async function processWebhook(
  payload: WebhookPayload,
  workspaceId: string,
  phoneNumberId: string
): Promise<{ stored: boolean }> {
  const supabase = createAdminClient()
  const eventId = await logWhatsAppWebhookEvent(supabase, workspaceId, phoneNumberId, payload)

  try {
    // ... existing processing loop ...

    if (eventId) {
      await updateWhatsAppWebhookEvent(supabase, eventId, 'processed')
    }
    return { stored: eventId !== null }
  } catch (error) {
    if (eventId) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      await updateWhatsAppWebhookEvent(supabase, eventId, 'failed', errorMsg)
    }
    // If stored: swallow the error (route.ts returns 200, replay later)
    // If NOT stored: re-throw (route.ts returns 500, 360dialog retries)
    if (eventId) {
      console.error('Webhook processing failed but stored for replay:', error)
      return { stored: true }
    }
    throw error
  }
}
```

### Example 3: Migration for New Columns + Status Values
```sql
-- Source: CONTEXT-v2.md decisions

-- Add retry tracking columns
ALTER TABLE whatsapp_webhook_events
  ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN reprocessed_at TIMESTAMPTZ;

-- Expand status CHECK constraint to include new statuses
ALTER TABLE whatsapp_webhook_events
  DROP CONSTRAINT whatsapp_webhook_events_status_check;

ALTER TABLE whatsapp_webhook_events
  ADD CONSTRAINT whatsapp_webhook_events_status_check
  CHECK (status IN ('pending', 'processed', 'failed', 'reprocessed', 'dead_letter'));
```

### Example 4: Replay Script Structure
```typescript
// Source: Existing script patterns (backfill-is-client.ts) + CONTEXT-v2.md decisions

/**
 * Replay failed WhatsApp webhook events.
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/replay-failed-webhooks.ts
 */
import 'dotenv/config'  // Load .env.local
import { createClient } from '@supabase/supabase-js'
import { processWebhook } from '@/lib/whatsapp/webhook-handler'
import type { WebhookPayload } from '@/lib/whatsapp/types'

const MAX_RETRIES = 3
const DELAY_MS = 2000  // 2s between replays

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Fetch failed events (retry_count < MAX_RETRIES)
  const { data: events, error } = await supabase
    .from('whatsapp_webhook_events')
    .select('*')
    .eq('status', 'failed')
    .lt('retry_count', MAX_RETRIES)
    .order('created_at', { ascending: true })  // FIFO

  if (error) { console.error('Failed to fetch events:', error); process.exit(1) }
  if (!events?.length) { console.log('No failed events to replay.'); return }

  console.log(`Found ${events.length} failed events to replay.\n`)

  let success = 0, failed = 0, deadLetter = 0

  for (const event of events) {
    const newRetryCount = event.retry_count + 1
    console.log(`[${success + failed + deadLetter + 1}/${events.length}] Replaying event ${event.id} (attempt ${newRetryCount})...`)

    try {
      const payload = event.payload as unknown as WebhookPayload
      await processWebhook(payload, event.workspace_id, event.phone_number_id)

      // Mark as reprocessed
      await supabase
        .from('whatsapp_webhook_events')
        .update({
          status: 'reprocessed',
          retry_count: newRetryCount,
          reprocessed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', event.id)

      console.log(`  -> SUCCESS (reprocessed)`)
      success++
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const newStatus = newRetryCount >= MAX_RETRIES ? 'dead_letter' : 'failed'

      await supabase
        .from('whatsapp_webhook_events')
        .update({
          status: newStatus,
          retry_count: newRetryCount,
          error_message: errorMsg,
        })
        .eq('id', event.id)

      if (newStatus === 'dead_letter') {
        console.log(`  -> DEAD LETTER (${MAX_RETRIES} retries exhausted): ${errorMsg}`)
        deadLetter++
      } else {
        console.log(`  -> FAILED (retry ${newRetryCount}/${MAX_RETRIES}): ${errorMsg}`)
        failed++
      }
    }

    // Rate limit
    if (events.indexOf(event) < events.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  console.log(`\nReplay complete: ${success} reprocessed, ${failed} still failed, ${deadLetter} dead-lettered.`)
}

main()
```

### Example 5: updateWhatsAppWebhookEvent Extended Signature
```typescript
// Source: Current webhook-handler.ts + CONTEXT-v2.md decisions

async function updateWhatsAppWebhookEvent(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  status: 'processed' | 'failed' | 'reprocessed' | 'dead_letter',
  errorMessage?: string,
): Promise<void> {
  try {
    const updates: Record<string, unknown> = {
      status,
      error_message: errorMessage ?? null,
    }

    if (status === 'processed') {
      updates.processed_at = new Date().toISOString()
    }
    if (status === 'reprocessed') {
      updates.reprocessed_at = new Date().toISOString()
    }

    await supabase
      .from('whatsapp_webhook_events')
      .update(updates)
      .eq('id', eventId)
  } catch (error) {
    console.error('[webhook] Failed to update webhook event status:', error)
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Always return 200 from webhook | Return 200 only if stored OR processed; 500 if neither | This phase | 360dialog retries on true failures |
| No retry tracking | retry_count + dead_letter status | This phase | Manual replay with bounded retries |
| Silent error swallowing in route.ts | Conditional error propagation based on store success | This phase | Correct HTTP semantics for webhook providers |

**Deprecated/outdated:**
- The original PLAN.md (v1) said "NO cambiar route.ts" — this is now overridden by CONTEXT-v2.md which explicitly requires HTTP response code changes.

## Existing Code State Analysis

### What's Already Implemented (v1)
The following code from the original resilience phase is ALREADY in production code (committed, deployed):

1. **`whatsapp_webhook_events` table** — migration exists at `supabase/migrations/20260220_whatsapp_webhook_events.sql`
2. **`logWhatsAppWebhookEvent()`** — exists in `webhook-handler.ts` (lines 643-692)
3. **`updateWhatsAppWebhookEvent()`** — exists in `webhook-handler.ts` (lines 697-716)
4. **Store-before-process in `processWebhook()`** — exists (line 53, calls logWhatsAppWebhookEvent)
5. **Mark processed/failed** — exists (lines 91-99)

### What's NOT Implemented Yet (v2 scope)
1. **HTTP response codes in route.ts** — still always returns 200
2. **`retry_count` column** — doesn't exist in the table
3. **`reprocessed_at` column** — doesn't exist
4. **`reprocessed` and `dead_letter` statuses** — not in CHECK constraint
5. **Replay script** — doesn't exist
6. **Regla 5 in CLAUDE.md** — doesn't exist
7. **`processWebhook()` return type** — currently returns `void`, needs to return `{ stored: boolean }`

### Key: processWebhook Must Be Export-Safe for Replay
The replay script needs to import `processWebhook()`. Currently it's exported and takes `(payload, workspaceId, phoneNumberId)` — perfect for replay because all three are stored in `whatsapp_webhook_events`. BUT the replay script must prevent double-logging:

When replay calls `processWebhook()`, the function will try to INSERT a NEW event into `whatsapp_webhook_events` (via `logWhatsAppWebhookEvent`). This is a problem — we don't want a new event for each replay attempt.

**Solution:** The replay script should NOT use `processWebhook()` directly. Instead, it should call the INNER processing logic (the for-loop that processes entries) without the store wrapper. Two approaches:

1. **Extract inner processing into a separate exported function** (e.g., `processWebhookPayload()`) that `processWebhook()` calls internally.
2. **Add an optional `skipStore` parameter** to `processWebhook()`.

**Recommended: Option 1** — cleaner separation of concerns:
```typescript
// Public API for route.ts (stores + processes)
export async function processWebhook(payload, workspaceId, phoneNumberId): Promise<{ stored: boolean }>

// Public API for replay script (processes only, no store)
export async function replayWebhookPayload(payload, workspaceId, phoneNumberId): Promise<void>
```

This avoids boolean flags and keeps the API clean.

## Open Questions

1. **360dialog Retry Window Duration**
   - What we know: 360dialog retries on non-200 with exponential backoff. Some sources say up to 24 hours, others say up to 7 days.
   - What's unclear: The exact retry window and interval schedule. Official 360dialog docs returned 404 on the specific webhook page.
   - Recommendation: Assume at least 24h retry window. The 5-second response timeout is the critical constraint (verified by multiple sources). Our store INSERT takes ~10ms, well within limits.

2. **dotenv Availability**
   - What we know: The project doesn't have `dotenv` as a dependency currently. Scripts like `backfill-is-client.ts` use hardcoded credentials.
   - What's unclear: Whether `dotenv` should be added as devDependency or if env vars should be set manually.
   - Recommendation: Add `dotenv` as devDependency. It's standard practice and prevents credentials from being hardcoded in scripts. Alternatively, `tsx` can be run with `--env-file .env.local` (Node.js 20+ feature).

3. **tsx Path Alias Support**
   - What we know: `tsx` uses Node.js module resolution. Path aliases (`@/*`) require either tsconfig-paths or a separate tsconfig.
   - What's unclear: Whether `npx tsx --tsconfig scripts/tsconfig.json` resolves path aliases correctly.
   - Recommendation: Test this during implementation. Fallback: use `tsconfig-paths/register` at the top of the script, or use relative imports instead of `@/*` aliases.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** — `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/whatsapp/webhook-handler.ts`, `src/lib/domain/messages.ts`, `supabase/migrations/20260220_whatsapp_webhook_events.sql`, `supabase/migrations/20260224100000_processed_by_agent.sql`
- **CONTEXT-v2.md** — User decisions locked for this phase
- **Original RESEARCH.md** — v1 analysis of webhook pipeline, deduplication, and store-before-process design

### Secondary (MEDIUM confidence)
- [360dialog Webhook Documentation](https://docs.360dialog.com/docs/waba-basics/webhook-events-and-notifications) — 5-second timeout, retry on non-200, confirmed by multiple search results
- [Hookdeck WhatsApp Webhooks Guide](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices) — Exponential backoff retry behavior
- [360dialog Integration Best Practices](https://docs.360dialog.com/partner/integrations-and-api-development/integration-best-practices/design-a-stable-webhook-receiving-endpoint) — Endpoint design recommendations (page returned 404 on fetch, but search snippet confirmed 5s timeout)

### Tertiary (LOW confidence)
- Meta Graph API webhook retry window (7 days vs 24 hours) — conflicting sources, could not verify with official docs (developers.facebook.com blocked by WebFetch)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new libraries needed, all patterns from existing codebase
- Architecture: HIGH — Clear path based on existing code + user decisions in CONTEXT-v2.md
- Pitfalls: HIGH — All identified from direct codebase analysis and verified behavior
- 360dialog retry behavior: MEDIUM — 5s timeout confirmed by multiple sources, exact retry window unclear

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable domain, no external library changes expected)
