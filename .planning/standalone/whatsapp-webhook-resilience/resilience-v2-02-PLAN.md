---
phase: standalone/whatsapp-webhook-resilience
plan: 02
type: implementation
wave: 2
depends_on: [01]
files_modified:
  - src/lib/whatsapp/webhook-handler.ts
  - src/app/api/webhooks/whatsapp/route.ts
autonomous: true

must_haves:
  truths:
    - "processWebhook() returns Promise<{ stored: boolean }> instead of Promise<void>"
    - "processWebhook() only throws when stored=false AND processing failed (triggers 500 in route.ts)"
    - "processWebhook() swallows errors and returns { stored: true } when eventId is non-null (processing failed but payload is safe)"
    - "replayWebhookPayload() is exported and processes a payload WITHOUT calling logWhatsAppWebhookEvent (no double-logging)"
    - "replayWebhookPayload() reuses the same inner processing loop as processWebhook"
    - "updateWhatsAppWebhookEvent() accepts 'reprocessed' and 'dead_letter' as status values"
    - "updateWhatsAppWebhookEvent() sets reprocessed_at when status is 'reprocessed'"
    - "route.ts returns HTTP 500 when processWebhook throws (store failed, no safety net)"
    - "route.ts returns HTTP 200 when processWebhook returns normally (stored=true OR processing succeeded)"
    - "route.ts catch block logs 'NOT stored, returning 500 for retry'"
  artifacts:
    - path: "src/lib/whatsapp/webhook-handler.ts"
      provides: "processWebhook with { stored: boolean } return, replayWebhookPayload export, expanded updateWhatsAppWebhookEvent"
      exports: ["processWebhook", "replayWebhookPayload"]
    - path: "src/app/api/webhooks/whatsapp/route.ts"
      provides: "Conditional HTTP response: 200 if stored/processed, 500 if neither"
      contains: "status: 500"
  key_links:
    - from: "src/app/api/webhooks/whatsapp/route.ts"
      to: "src/lib/whatsapp/webhook-handler.ts"
      via: "imports processWebhook, uses try/catch to determine HTTP response code"
      pattern: "import.*processWebhook"
    - from: "scripts/replay-failed-webhooks.ts (Plan 03)"
      to: "src/lib/whatsapp/webhook-handler.ts"
      via: "Plan 03 imports replayWebhookPayload"
      pattern: "import.*replayWebhookPayload"
---

<objective>
Modify processWebhook() to return `{ stored: boolean }` and only throw when the payload was NOT stored, then update route.ts to return HTTP 500 on throw (triggering 360dialog retries). Also extract replayWebhookPayload() for Plan 03's replay script.

Purpose: This is the core resilience fix. Currently route.ts always returns 200, even when the payload was never stored and processing failed. After this change, 360dialog will retry when we have no safety net (store failed), but we'll still ACK when the payload is safely persisted for later replay.
Output: Two modified files implementing conditional HTTP responses and replay-safe processing.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-webhook-resilience/CONTEXT-v2.md
@.planning/standalone/whatsapp-webhook-resilience/RESEARCH-v2.md
@src/lib/whatsapp/webhook-handler.ts
@src/app/api/webhooks/whatsapp/route.ts
</context>

<feature>
  <name>Conditional HTTP Response + Replay Export</name>
  <files>
    src/lib/whatsapp/webhook-handler.ts
    src/app/api/webhooks/whatsapp/route.ts
  </files>
  <behavior>
    Task 1: Modify webhook-handler.ts — processWebhook return type + error behavior

    Current signature (line 45-49):
    ```typescript
    export async function processWebhook(
      payload: WebhookPayload,
      workspaceId: string,
      phoneNumberId: string
    ): Promise<void> {
    ```

    New signature:
    ```typescript
    export async function processWebhook(
      payload: WebhookPayload,
      workspaceId: string,
      phoneNumberId: string
    ): Promise<{ stored: boolean }> {
    ```

    Changes to processWebhook body:
    - After the processing loop succeeds (line 90-93), return `{ stored: eventId !== null }` instead of just updating status.
    - In the catch block (lines 94-101):
      - If `eventId` exists (payload was stored): log error, update event to 'failed', return `{ stored: true }` (do NOT throw)
      - If `eventId` is null (store failed): re-throw the error (route.ts will catch and return 500)
    - The key behavioral change: processWebhook NO LONGER throws when stored=true. It swallows the processing error because the payload is safe for replay.

    New processWebhook implementation:
    ```typescript
    export async function processWebhook(
      payload: WebhookPayload,
      workspaceId: string,
      phoneNumberId: string
    ): Promise<{ stored: boolean }> {
      const supabase = createAdminClient()

      // Store raw payload BEFORE processing (resilience)
      const eventId = await logWhatsAppWebhookEvent(supabase, workspaceId, phoneNumberId, payload)

      try {
        // Process each entry (existing loop unchanged)
        for (const entry of payload.entry) {
          for (const change of entry.changes) {
            const { value } = change
            if (value.metadata.phone_number_id !== phoneNumberId) {
              console.warn(`Webhook for different phone: ${value.metadata.phone_number_id}`)
              continue
            }
            if (value.messages && value.messages.length > 0) {
              for (const msg of value.messages) {
                await processIncomingMessage(msg, value, workspaceId, phoneNumberId)
              }
            }
            if (value.statuses && value.statuses.length > 0) {
              for (const status of value.statuses) {
                await processStatusUpdate(status, workspaceId)
              }
            }
          }
        }

        // Mark event as processed
        if (eventId) {
          await updateWhatsAppWebhookEvent(supabase, eventId, 'processed')
        }
        return { stored: eventId !== null }
      } catch (error) {
        // Mark event as failed with error details
        if (eventId) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          await updateWhatsAppWebhookEvent(supabase, eventId, 'failed', errorMsg)
          // Stored but failed processing = safe to ACK (replay later)
          console.error('[webhook] Processing failed but payload stored for replay:', errorMsg)
          return { stored: true }
        }
        // NOT stored AND failed = no safety net, re-throw for 500
        throw error
      }
    }
    ```

    Task 2: Add replayWebhookPayload() export to webhook-handler.ts

    This function processes a payload WITHOUT calling logWhatsAppWebhookEvent (the event row already exists from the original webhook). Place it right after processWebhook, before processIncomingMessage.

    ```typescript
    /**
     * Replay a stored webhook payload without re-logging to whatsapp_webhook_events.
     * Used by the replay script to reprocess failed events.
     * The original event row already exists — replay only runs the processing pipeline.
     */
    export async function replayWebhookPayload(
      payload: WebhookPayload,
      workspaceId: string,
      phoneNumberId: string
    ): Promise<void> {
      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          const { value } = change
          if (value.metadata.phone_number_id !== phoneNumberId) {
            console.warn(`Webhook for different phone: ${value.metadata.phone_number_id}`)
            continue
          }
          if (value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
              await processIncomingMessage(msg, value, workspaceId, phoneNumberId)
            }
          }
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              await processStatusUpdate(status, workspaceId)
            }
          }
        }
      }
    }
    ```

    Note: This duplicates the inner processing loop from processWebhook. This is intentional — extracting a shared inner function would require refactoring processWebhook's error handling, and the processing loop is stable (hasn't changed since Phase 7). The duplication is small (15 lines) and the functions have different responsibilities.

    Task 3: Expand updateWhatsAppWebhookEvent status type + reprocessed_at

    Current signature (line 697-701):
    ```typescript
    async function updateWhatsAppWebhookEvent(
      supabase: ReturnType<typeof createAdminClient>,
      eventId: string,
      status: 'processed' | 'failed',
      errorMessage?: string,
    ): Promise<void> {
    ```

    New signature:
    ```typescript
    async function updateWhatsAppWebhookEvent(
      supabase: ReturnType<typeof createAdminClient>,
      eventId: string,
      status: 'processed' | 'failed' | 'reprocessed' | 'dead_letter',
      errorMessage?: string,
    ): Promise<void> {
    ```

    And update the body to handle reprocessed_at:
    ```typescript
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
        // Non-blocking: if we can't update status, processing still happened
        console.error('[webhook] Failed to update webhook event status:', error)
      }
    }
    ```

    Task 4: Modify route.ts — Conditional HTTP response

    Current POST handler (lines 132-143):
    ```typescript
    try {
      await processWebhook(payload, workspaceId, phoneNumberId)
      const duration = Date.now() - startTime
      console.log(`Webhook processed in ${duration}ms for workspace ${workspaceId}`)
    } catch (error) {
      console.error('Webhook processing error:', error)
      // Still return 200 to prevent 360dialog retries
    }

    return NextResponse.json({ received: true }, { status: 200 })
    ```

    New implementation:
    ```typescript
    try {
      const result = await processWebhook(payload, workspaceId, phoneNumberId)
      const duration = Date.now() - startTime
      console.log(`Webhook processed in ${duration}ms for workspace ${workspaceId} (stored: ${result.stored})`)
      return NextResponse.json({ received: true }, { status: 200 })
    } catch (error) {
      // processWebhook only throws when payload was NOT stored AND processing failed
      // In this case we have NO safety net — 360dialog must retry
      console.error('[webhook] NOT stored, returning 500 for retry:', error)
      return NextResponse.json(
        { error: 'Failed to process webhook' },
        { status: 500 }
      )
    }
    ```

    Key change: The catch block now returns 500 instead of silently returning 200. This only executes when the store INSERT failed AND processing also failed — meaning we have zero record of this webhook and need 360dialog to resend it.
  </behavior>
  <implementation>
    1. Modify processWebhook: change return type to `Promise<{ stored: boolean }>`, add conditional error behavior.
    2. Add replayWebhookPayload() export after processWebhook.
    3. Expand updateWhatsAppWebhookEvent status union type, add reprocessed_at handling.
    4. Modify route.ts POST handler: use try/catch with 200 on success, 500 on throw.
  </implementation>
</feature>

<verification>
```bash
cd /mnt/c/Users/Usuario/Proyectos/morfx-new

# Verify TypeScript compilation
npx tsc --noEmit --pretty 2>&1 | head -50

# Verify processWebhook return type
grep -n "Promise<{ stored: boolean }>" src/lib/whatsapp/webhook-handler.ts

# Verify replayWebhookPayload export
grep -n "export async function replayWebhookPayload" src/lib/whatsapp/webhook-handler.ts

# Verify route.ts has 500 response
grep -n "status: 500" src/app/api/webhooks/whatsapp/route.ts

# Verify route.ts has the NOT stored log
grep -n "NOT stored" src/app/api/webhooks/whatsapp/route.ts

# Verify updateWhatsAppWebhookEvent accepts new statuses
grep -n "reprocessed.*dead_letter" src/lib/whatsapp/webhook-handler.ts

# Verify the critical behavioral change: processWebhook does NOT throw when stored
grep -A5 "stored: true" src/lib/whatsapp/webhook-handler.ts
```
TypeScript compiles without errors. processWebhook returns `{ stored: boolean }`. replayWebhookPayload is exported. route.ts returns 500 on catch. updateWhatsAppWebhookEvent accepts 4 status values.
</verification>

<success_criteria>
- processWebhook returns `{ stored: boolean }` (not void)
- processWebhook only throws when eventId is null (store failed)
- processWebhook returns `{ stored: true }` when processing fails but payload is stored
- replayWebhookPayload is exported and does NOT call logWhatsAppWebhookEvent
- updateWhatsAppWebhookEvent accepts 'processed' | 'failed' | 'reprocessed' | 'dead_letter'
- updateWhatsAppWebhookEvent sets reprocessed_at for 'reprocessed' status
- route.ts returns 200 on successful processWebhook return
- route.ts returns 500 when processWebhook throws
- TypeScript compiles without errors
- No changes to processIncomingMessage, processStatusUpdate, or any other existing functions
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-webhook-resilience/resilience-v2-02-SUMMARY.md`
</output>
