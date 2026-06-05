---
status: partial
phase: 41-instagram-direct
source: [41-VERIFICATION.md]
started: 2026-06-05T15:42:50Z
updated: 2026-06-05T15:42:50Z
---

## Current Test

[awaiting human testing — operator cutover gate]

## Tests

### 1. Push to Vercel + confirm prod migration (Regla 1 + Regla 5)
expected: The 41-00 `instagram_provider` migration is confirmed applied in production FIRST, then the local Phase 41 commits (including 41-08) are pushed to origin/main so Vercel deploys. No code referencing `instagram_provider` reaches prod before the column exists.
result: [pending]

### 2. Connect a real Instagram Professional account via the new button
expected: In `/configuracion/integraciones` → Instagram tab, clicking "Conectar Instagram" opens a Meta login window requesting IG_LOGIN_SCOPE (FB superset + instagram_basic + instagram_manage_messages) with auth_type:'rerequest'. The 3-step token refresh runs server-side, `resolveInstagramAccount` resolves the linked IG business account, and the UI shows "Instagram conectado: @<username>". A business with no linked IG surfaces the clear Spanish error and never blocks.
result: [pending]

### 3. A1 linchpin — entry.id == ig_account_id
expected: Server logs confirm the inbound IG webhook `entry.id` matches the stored `ig_account_id`, so `resolveByIgAccountId(entry.id)` routes the DM to the correct workspace.
result: [pending]

### 4. A2 linchpin — IG DM fires the webhook
expected: A real Instagram DM to the connected account fires the unified Meta webhook at the www callback (the App Dashboard `instagram` product has the `messages` field subscribed to https://www.morfx.app/api/webhooks/meta).
result: [pending]

### 5. Flip 1 workspace + live inbound/outbound smoke (IG-01, IG-02)
expected: After flipping `instagram_provider` to `meta_direct` for one pilot workspace, an inbound IG DM appears as a conversation with the Instagram channel indicator; sending text and an image from the inbox reaches the IG contact; unsupported types (stickers/voice) degrade gracefully with a clear error.
result: [pending]

### 6. Outside-24h window block live test (IG-05)
expected: Attempting to send to an IG contact whose 24h window has closed is blocked at the action layer with the Spanish window-closed message (no countdown — block-only is intentional V1 per D-IG-09).
result: [pending]

### 7. Regla 6 sanity — godentist-fb-ig / ManyChat IG unaffected
expected: The godentist-fb-ig agent and any ManyChat-based IG flow continue working unchanged after the cutover (no behavior drift from the new meta_direct IG path).
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
