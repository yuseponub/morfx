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
result: PASSED (2026-06-05 live, after GAP-41-01 fix 41-09 + GAP-41-02 migration) — Varixcenter connected: instagram row created with page_id 528898033801678 (shared with the FB page), ig_account_id 17841405433849344, ig_username 'varixcenter', is_active true. Two sequential bugs fixed: GAP-41-01 (getPageToken data[0] → now targets the workspace's bound page) + GAP-41-02 (global uq_meta_page → partial WHERE channel='facebook' so the IG row can share the page_id).

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
passed: 1
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

### GAP-41-01 — connectInstagramAccount targets the wrong Facebook page (multi-page operator)
status: resolved
severity: blocking
requirement: IG-03
source: Test 2 (live, 2026-06-05)
detail: getPageToken returned the first page in /me/accounts (data[0]), not the page bound to the workspace. Fixed by plan 41-09: resolveByWorkspace + getPageTokenForPage(pageId) targets the workspace's bound page, never data[0]. Shipped + live-verified (FB row refreshed 2026-06-05).

### GAP-41-02 — global uq_meta_page UNIQUE(page_id) blocked the Instagram row sharing the FB page_id
status: resolved
severity: blocking
requirement: IG-03
source: Test 2 (live, 2026-06-05, after 41-09)
detail: The channel='instagram' row reuses the FB page's page_id (the IG sender needs creds.pageId), but the global uq_meta_page forbade it. Fixed by migration 20260605200000_relax_uq_meta_page_facebook_only.sql (partial unique index WHERE channel='facebook'). Applied to prod; Varixcenter IG connected (ig_username 'varixcenter').
