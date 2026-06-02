---
phase: standalone/whatsapp-webhook-resilience
plan: 03
type: implementation
wave: 3
depends_on: [01, 02]
files_modified:
  - scripts/replay-failed-webhooks.ts
  - scripts/tsconfig.json
autonomous: true

must_haves:
  truths:
    - "Replay script queries whatsapp_webhook_events with status='failed' AND retry_count < 3"
    - "Replay script calls replayWebhookPayload (NOT processWebhook) to avoid double-logging events"
    - "On replay success: status is updated to 'reprocessed', retry_count incremented, reprocessed_at set"
    - "On replay failure with retry_count < 3: status stays 'failed', retry_count incremented, error_message updated"
    - "On replay failure with retry_count >= 3: status set to 'dead_letter'"
    - "Replay processes events sequentially with 2-second delay between each (rate limiting)"
    - "Replay orders events by created_at ASC (FIFO — oldest first)"
    - "scripts/tsconfig.json extends root tsconfig with @/* path aliases pointing to ../src/*"
    - "Script loads env vars from .env.local via dotenv/config before any app imports"
    - "Script prints summary at end: N reprocessed, N still failed, N dead-lettered"
  artifacts:
    - path: "scripts/replay-failed-webhooks.ts"
      provides: "CLI script for manual replay of failed webhook events"
      contains: "replayWebhookPayload"
    - path: "scripts/tsconfig.json"
      provides: "TypeScript config for scripts that need to import from src/"
      contains: "extends"
  key_links:
    - from: "scripts/replay-failed-webhooks.ts"
      to: "src/lib/whatsapp/webhook-handler.ts"
      via: "imports replayWebhookPayload"
      pattern: "import.*replayWebhookPayload"
    - from: "scripts/tsconfig.json"
      to: "tsconfig.json"
      via: "extends root tsconfig, overrides paths for @/* alias"
      pattern: "extends.*tsconfig"
---

<objective>
Create the CLI replay script and its TypeScript configuration so failed webhook events can be manually reprocessed after incidents.

Purpose: When webhook processing fails but the payload was stored (the happy path for resilience), this script provides the recovery mechanism. It reads failed events from the DB, re-runs them through the same processing pipeline (via replayWebhookPayload), and tracks retry state.
Output: Two new files — a replay script and its tsconfig.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-webhook-resilience/CONTEXT-v2.md
@.planning/standalone/whatsapp-webhook-resilience/RESEARCH-v2.md
@scripts/backfill-is-client.ts
@tsconfig.json
@src/lib/whatsapp/webhook-handler.ts
</context>

<feature>
  <name>Replay CLI Script + Scripts TSConfig</name>
  <files>
    scripts/replay-failed-webhooks.ts
    scripts/tsconfig.json
  </files>
  <behavior>
    Task 1: Create scripts/tsconfig.json

    The root tsconfig.json excludes `scripts/` from compilation. Scripts in `scripts/` cannot use `@/*` path aliases without their own tsconfig. This tsconfig extends the root and re-enables the paths.

    ```json
    {
      "extends": "../tsconfig.json",
      "compilerOptions": {
        "module": "esnext",
        "moduleResolution": "bundler",
        "paths": {
          "@/*": ["../src/*"]
        }
      },
      "include": ["./**/*.ts", "../src/**/*.ts"],
      "exclude": []
    }
    ```

    Run command: `npx tsx --tsconfig scripts/tsconfig.json scripts/replay-failed-webhooks.ts`

    Task 2: Create scripts/replay-failed-webhooks.ts

    The replay script:
    1. Loads env vars from .env.local via `import 'dotenv/config'` (MUST be first import, before any app imports)
    2. Creates its own Supabase client for reading/updating whatsapp_webhook_events
    3. Imports `replayWebhookPayload` from `@/lib/whatsapp/webhook-handler` for processing
    4. Queries failed events (status='failed', retry_count < MAX_RETRIES=3), ordered by created_at ASC (FIFO)
    5. For each event, calls replayWebhookPayload(payload, workspace_id, phone_number_id)
    6. On success: updates status='reprocessed', increments retry_count, sets reprocessed_at
    7. On failure: if retry_count+1 >= MAX_RETRIES, sets status='dead_letter'; else stays 'failed', increments retry_count
    8. Waits 2 seconds between events (rate limiting)
    9. Prints progress for each event and summary at the end

    IMPORTANT notes:
    - The script uses `replayWebhookPayload` (NOT `processWebhook`) to avoid creating a second event row in whatsapp_webhook_events.
    - The script manages the status updates itself using its own Supabase client (NOT through updateWhatsAppWebhookEvent).
    - The wamid UNIQUE constraint on messages table provides natural deduplication — replay of an already-processed message is inherently safe.
    - The script needs `dotenv` as a devDependency. Check if it exists; if not, install it.

    Full implementation:
    ```typescript
    /**
     * Replay failed WhatsApp webhook events.
     *
     * Reads events with status='failed' from whatsapp_webhook_events,
     * reprocesses them through the same pipeline as live webhooks,
     * and tracks retry state.
     *
     * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/replay-failed-webhooks.ts
     *
     * Prerequisites:
     * - .env.local must exist with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
     * - OR set these env vars before running
     */

    // Load env vars FIRST — before any app imports that read process.env
    import 'dotenv/config'

    import { createClient } from '@supabase/supabase-js'
    import { replayWebhookPayload } from '@/lib/whatsapp/webhook-handler'
    import type { WebhookPayload } from '@/lib/whatsapp/types'

    const MAX_RETRIES = 3
    const DELAY_MS = 2000

    // Validate required env vars
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
      console.error('Ensure .env.local exists or set env vars before running.')
      process.exit(1)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    async function main() {
      console.log('Fetching failed webhook events (retry_count < ' + MAX_RETRIES + ')...\n')

      const { data: events, error } = await supabase
        .from('whatsapp_webhook_events')
        .select('*')
        .eq('status', 'failed')
        .lt('retry_count', MAX_RETRIES)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Failed to fetch events:', error.message)
        process.exit(1)
      }

      if (!events || events.length === 0) {
        console.log('No failed events to replay.')
        return
      }

      console.log(`Found ${events.length} failed event(s) to replay.\n`)

      let reprocessed = 0
      let stillFailed = 0
      let deadLettered = 0

      for (let i = 0; i < events.length; i++) {
        const event = events[i]
        const newRetryCount = event.retry_count + 1

        console.log(
          `[${i + 1}/${events.length}] Event ${event.id} ` +
          `(type: ${event.event_type}, attempt ${newRetryCount}/${MAX_RETRIES})...`
        )

        try {
          const payload = event.payload as unknown as WebhookPayload
          await replayWebhookPayload(payload, event.workspace_id, event.phone_number_id)

          // Success — mark as reprocessed
          await supabase
            .from('whatsapp_webhook_events')
            .update({
              status: 'reprocessed',
              retry_count: newRetryCount,
              reprocessed_at: new Date().toISOString(),
              error_message: null,
            })
            .eq('id', event.id)

          console.log(`  -> REPROCESSED`)
          reprocessed++
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
            deadLettered++
          } else {
            console.log(`  -> FAILED (retry ${newRetryCount}/${MAX_RETRIES}): ${errorMsg}`)
            stillFailed++
          }
        }

        // Rate limit between events (skip delay after last event)
        if (i < events.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS))
        }
      }

      console.log(`\n--- Replay Summary ---`)
      console.log(`Reprocessed: ${reprocessed}`)
      console.log(`Still failed: ${stillFailed}`)
      console.log(`Dead-lettered: ${deadLettered}`)
      console.log(`Total: ${events.length}`)
    }

    main().catch(err => {
      console.error('Unexpected error:', err)
      process.exit(1)
    })
    ```

    Task 3: Ensure dotenv is available

    Check if `dotenv` is already a dependency. If not, install as devDependency:
    ```bash
    npm ls dotenv 2>/dev/null || npm install --save-dev dotenv
    ```

    This is needed because:
    - The replay script runs outside Next.js (via `npx tsx`), so .env.local is NOT auto-loaded
    - `import 'dotenv/config'` at the top of the script loads .env.local automatically
    - The existing `backfill-is-client.ts` uses hardcoded credentials — we explicitly DO NOT repeat that anti-pattern
  </behavior>
  <implementation>
    1. Create scripts/tsconfig.json extending root with @/* path aliases.
    2. Ensure dotenv is installed as devDependency.
    3. Create scripts/replay-failed-webhooks.ts with full implementation.
    4. Verify the script compiles (syntax check only — don't run against production).
  </implementation>
</feature>

<verification>
```bash
cd /mnt/c/Users/Usuario/Proyectos/morfx-new

# Verify scripts/tsconfig.json exists and extends root
cat scripts/tsconfig.json

# Verify replay script exists and imports replayWebhookPayload
grep -n "replayWebhookPayload" scripts/replay-failed-webhooks.ts

# Verify dotenv is first import
head -15 scripts/replay-failed-webhooks.ts

# Verify dotenv is installed
npm ls dotenv

# Verify script compiles (syntax check — does NOT run against DB)
npx tsx --tsconfig scripts/tsconfig.json -e "import './scripts/replay-failed-webhooks'" 2>&1 | head -10

# Alternative: just check TypeScript compilation
npx tsc --noEmit --project scripts/tsconfig.json 2>&1 | head -20
```
Script compiles. dotenv is available. tsconfig resolves @/* aliases. Script uses replayWebhookPayload (not processWebhook).
</verification>

<success_criteria>
- scripts/tsconfig.json created, extends root tsconfig, has @/* path aliases
- scripts/replay-failed-webhooks.ts created with full implementation
- Script imports replayWebhookPayload from @/lib/whatsapp/webhook-handler
- Script uses dotenv/config as first import
- Script validates env vars before proceeding
- Script queries status='failed' AND retry_count < 3
- Script orders by created_at ASC (FIFO)
- Script has 2-second delay between events
- Script updates to 'reprocessed' on success, 'dead_letter' at retry cap
- Script prints per-event progress and final summary
- dotenv is installed as devDependency
- No hardcoded credentials
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-webhook-resilience/resilience-v2-03-SUMMARY.md`
</output>
