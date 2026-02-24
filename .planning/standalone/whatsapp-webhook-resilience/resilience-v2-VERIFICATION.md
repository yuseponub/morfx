---
phase: standalone/whatsapp-webhook-resilience
verified: 2026-02-24T00:00:00Z
status: passed
score: 8/8 must-haves verified
gaps: []
---

# WhatsApp Webhook Resilience — Verification Report

**Phase Goal:** Hardening del pipeline de webhooks de WhatsApp para que nunca mas se pierdan mensajes entrantes. Tres entregables: (1) corregir HTTP response codes para permitir retries de 360dialog, (2) crear mecanismo de replay para eventos fallidos, (3) agregar regla de proceso para prevenir desync de migraciones.
**Verified:** 2026-02-24T00:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                   | Status      | Evidence                                                                                           |
|----|-----------------------------------------------------------------------------------------|-------------|----------------------------------------------------------------------------------------------------|
| 1  | route.ts returns HTTP 500 when processWebhook throws (store failed) — 360dialog retries | VERIFIED   | route.ts lines 138-146: catch block returns `{ status: 500 }` with comment "360dialog must retry"  |
| 2  | route.ts returns HTTP 200 when processWebhook returns normally (stored=true or fails)    | VERIFIED   | route.ts lines 134-137: success path returns `{ received: true }` with status 200                  |
| 3  | processWebhook() returns Promise<{ stored: boolean }> and only throws when eventId null  | VERIFIED   | webhook-handler.ts lines 45-108: signature matches; throws only when `eventId === null` at line 106 |
| 4  | replayWebhookPayload() exported and does NOT call logWhatsAppWebhookEvent                | VERIFIED   | webhook-handler.ts lines 115-139: exported fn runs processing pipeline only, no log call           |
| 5  | Replay script queries failed events with retry_count < 3, processes FIFO, 2s delay      | VERIFIED   | replay-failed-webhooks.ts lines 40-45: `.eq('status','failed').lt('retry_count',3).order('created_at',{ascending:true})`; DELAY_MS=2000 at line 24 |
| 6  | Replay transitions: success→reprocessed, fail under limit→failed+retry_count++, fail at limit→dead_letter | VERIFIED | lines 77-108: full three-branch state machine implemented correctly                   |
| 7  | Migration adds retry_count, reprocessed_at, expanded CHECK, partial index               | VERIFIED   | 20260225_webhook_events_retry_columns.sql: all four DDL changes present and correct                 |
| 8  | CLAUDE.md has Regla 5 (migration-before-deploy)                                         | VERIFIED   | CLAUDE.md lines 79-92: "Regla 5: Migracion Antes de Deploy" with full workflow and rationale       |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact                                                          | Expected                                      | Status      | Details                                   |
|-------------------------------------------------------------------|-----------------------------------------------|-------------|-------------------------------------------|
| `src/lib/whatsapp/webhook-handler.ts`                             | processWebhook + replayWebhookPayload exports | VERIFIED   | 760 lines, both functions exported, no stubs |
| `src/app/api/webhooks/whatsapp/route.ts`                          | HTTP 200/500 branching on processWebhook      | VERIFIED   | 147 lines, try/catch with correct status codes |
| `scripts/replay-failed-webhooks.ts`                               | CLI replay with retry state machine           | VERIFIED   | 127 lines, full implementation             |
| `scripts/tsconfig.json`                                           | Compiler config with @/* alias for tsx        | VERIFIED   | 12 lines, extends ../tsconfig.json, paths set |
| `supabase/migrations/20260225_webhook_events_retry_columns.sql`   | 4 DDL changes for retry tracking              | VERIFIED   | 24 lines, all four changes present         |
| `CLAUDE.md`                                                       | Regla 5 migration-before-deploy rule          | VERIFIED   | Lines 79-92, complete rule with rationale  |

---

### Key Link Verification

| From                          | To                                     | Via                                   | Status     | Details                                                              |
|-------------------------------|----------------------------------------|---------------------------------------|------------|----------------------------------------------------------------------|
| `route.ts`                    | `processWebhook`                       | import + try/catch                    | WIRED     | Imported at line 8, called at line 134, result inspected at 136      |
| `route.ts` catch              | HTTP 500                               | `NextResponse.json(..., { status: 500 })` | WIRED | Line 142-145: explicit 500 with comment about retry                  |
| `route.ts` try                | HTTP 200                               | `NextResponse.json({ received: true })` | WIRED   | Line 137: always 200 on normal return from processWebhook            |
| `processWebhook`              | `logWhatsAppWebhookEvent`              | await before try block                | WIRED     | Line 53: stores BEFORE processing, returns eventId for status update |
| `processWebhook` catch        | rethrow when eventId null              | `throw error` at line 106             | WIRED     | Only path where 500 is triggered                                     |
| `processWebhook` catch        | `return { stored: true }` when stored  | Lines 101-103                         | WIRED     | Stored-but-failed returns 200 so replay handles it later             |
| `replay-failed-webhooks.ts`   | `replayWebhookPayload`                 | import from webhook-handler           | WIRED     | Line 19: `import { replayWebhookPayload } from '@/lib/whatsapp/webhook-handler'` |
| `replayWebhookPayload`        | processing pipeline (no log)           | direct loop, no logWhatsAppWebhookEvent call | WIRED | Lines 115-139: only calls processIncomingMessage and processStatusUpdate |
| Migration retry columns       | `updateWhatsAppWebhookEvent`           | `reprocessed_at` + status enum        | WIRED     | handler.ts line 737-738: updates reprocessed_at when status='reprocessed' |
| Migration partial index       | replay query                           | `WHERE status = 'failed' AND retry_count < 3` | WIRED | Exactly matches the query in replay-failed-webhooks.ts lines 43-44   |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `webhook-handler.ts` | 510, 526 | `return null` | INFO | Intentional sentinel in media download helper — not a stub |
| `webhook-handler.ts` | 721, 727 | `return null` | INFO | Intentional sentinel in logWhatsAppWebhookEvent — caller handles null correctly |

No blockers or warnings found. All `return null` usages are deliberate error-fallback paths with correct upstream null-handling.

---

### Human Verification Required

None. All eight must-haves are fully verifiable from the codebase structure.

The only items that would need a human are:
- Running the replay script against a real Supabase instance to confirm env loading works
- Confirming 360dialog actually retries on HTTP 500 (external vendor behavior)

These are operational validations, not code correctness checks. The code itself is correct.

---

## Narrative Summary

All three phase deliverables are fully implemented and wired:

**Deliverable 1 — HTTP response codes:**
`route.ts` uses a try/catch around `processWebhook`. On success (regardless of whether processing succeeded or failed, as long as the payload was stored), it returns 200. On throw (only when the DB insert itself fails and there is no safety net), it returns 500. `processWebhook` throws only when `eventId` is null — meaning the log insert failed. This is exactly the behavior needed for 360dialog retries: 500 when the event was not persisted (needs retry), 200 when it was persisted (safe to ACK, replay handles failures).

**Deliverable 2 — Replay mechanism:**
`replayWebhookPayload` is exported and cleanly separated from `processWebhook` — it skips `logWhatsAppWebhookEvent` entirely and runs only the processing pipeline. The CLI script (`scripts/replay-failed-webhooks.ts`) queries failed events with `retry_count < 3` in ascending `created_at` order (FIFO), applies a 2-second inter-event delay, and implements a correct three-state machine: `reprocessed` on success, `failed` with `retry_count++` under the limit, `dead_letter` when limit is reached.

**Deliverable 3 — Migration process rule:**
CLAUDE.md contains "Regla 5: Migracion Antes de Deploy" at lines 79-92, with the full workflow (create migration, pause, wait for user confirmation, then push code) and an explicit rationale tied to the 20-hour incident that prompted this phase.

**Migration (Plan 01):**
The migration file `20260225_webhook_events_retry_columns.sql` adds all four required DDL changes: `retry_count INTEGER NOT NULL DEFAULT 0`, `reprocessed_at TIMESTAMPTZ`, expanded CHECK constraint (5 statuses: pending, processed, failed, reprocessed, dead_letter), and a partial index `idx_wa_webhook_events_replayable` that matches exactly the replay query's predicate.

---

_Verified: 2026-02-24T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
