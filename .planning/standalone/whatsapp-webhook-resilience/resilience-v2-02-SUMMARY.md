---
phase: standalone/whatsapp-webhook-resilience
plan: 02
subsystem: whatsapp-webhooks
tags: [resilience, webhook, retry, replay, error-handling]
dependency-graph:
  requires: [resilience-v2-01]
  provides: [conditional-http-response, replay-export, expanded-status-types]
  affects: [resilience-v2-03]
tech-stack:
  added: []
  patterns: [store-before-process, conditional-ack, replay-safe-processing]
key-files:
  created: []
  modified:
    - src/lib/whatsapp/webhook-handler.ts
    - src/app/api/webhooks/whatsapp/route.ts
decisions:
  - processWebhook swallows errors when stored=true (ACK for replay)
  - processWebhook re-throws only when eventId=null (no safety net)
  - replayWebhookPayload intentionally duplicates inner processing loop (different responsibilities)
  - updateWhatsAppWebhookEvent uses Record<string, unknown> for conditional field updates
metrics:
  duration: ~5min
  completed: 2026-02-24
---

# Standalone Phase: WhatsApp Webhook Resilience v2, Plan 02 Summary

**Conditional HTTP Response + Replay Export**

One-liner: processWebhook returns `{ stored: boolean }` enabling route.ts to return 500 only when no safety net exists, plus replayWebhookPayload export for Plan 03's replay script.

## What Was Done

### Task 1: processWebhook return type + error behavior
Changed `processWebhook()` from `Promise<void>` to `Promise<{ stored: boolean }>`. The critical behavioral change: when the payload IS stored (eventId exists) but processing fails, the function now swallows the error and returns `{ stored: true }` instead of re-throwing. This is safe because the payload can be replayed later. The function only re-throws when `eventId` is null (store failed), meaning there is no safety net.

### Task 2: replayWebhookPayload() export
Added `replayWebhookPayload()` as a new export. It runs the same message/status processing pipeline as processWebhook but does NOT call `logWhatsAppWebhookEvent` (the event row already exists from the original webhook). This function will be consumed by Plan 03's replay script.

### Task 3: Expanded updateWhatsAppWebhookEvent
Extended the status type from `'processed' | 'failed'` to `'processed' | 'failed' | 'reprocessed' | 'dead_letter'`. Added conditional `reprocessed_at` timestamp when status is `'reprocessed'`. Used `Record<string, unknown>` for flexible field updates.

### Task 4: Conditional HTTP response in route.ts
Replaced the unconditional `return 200` pattern with conditional logic:
- `processWebhook` returns normally (stored=true or processing succeeded): HTTP 200
- `processWebhook` throws (store failed, no safety net): HTTP 500 (triggers 360dialog retry)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Swallow processing errors when stored | Payload is safe for replay; ACK prevents 360dialog flooding |
| Re-throw only when not stored | No safety net means we need 360dialog to retry |
| Duplicate inner loop in replayWebhookPayload | Functions have different responsibilities; loop is stable |
| Record<string, unknown> for updates | Cleaner than conditional spread for variable fields |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- TypeScript compiles without errors (0 errors in modified files; 6 pre-existing in test files)
- processWebhook returns `{ stored: boolean }` (confirmed at line 49)
- replayWebhookPayload exported (confirmed at line 115)
- route.ts returns 500 on catch (confirmed at line 144)
- updateWhatsAppWebhookEvent accepts 4 status values (confirmed at line 737)
- replayWebhookPayload does NOT call logWhatsAppWebhookEvent (confirmed via grep)
- reprocessed_at set when status is 'reprocessed' (confirmed at line 749)

## Next Phase Readiness

Plan 03 (Replay Script + Dead Letter) can now proceed:
- `replayWebhookPayload` is exported and ready for import
- `updateWhatsAppWebhookEvent` accepts `'reprocessed'` and `'dead_letter'` statuses
- `reprocessed_at` column (from Plan 01 migration) is populated correctly

## Commits

| Hash | Message |
|------|---------|
| e9bff7a | feat(resilience-v2-02): processWebhook returns { stored: boolean } with conditional throw |
| fca47b5 | feat(resilience-v2-02): add replayWebhookPayload() export for failed event replay |
| 57cdb3a | feat(resilience-v2-02): expand updateWhatsAppWebhookEvent with reprocessed + dead_letter statuses |
| dfffc16 | feat(resilience-v2-02): route.ts returns 500 when payload not stored for 360dialog retry |
