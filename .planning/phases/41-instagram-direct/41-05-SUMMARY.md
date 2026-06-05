---
phase: 41-instagram-direct
plan: 05
subsystem: instagram-direct
tags: [instagram, meta-direct, tdd-green, inbound-webhook, igsid, regla-3, d-ig-01]
requirements: [IG-01, IG-03, IG-04]
requires:
  - "41-01 (RED tests: instagram/__tests__/webhook-handler.test.ts + meta/__tests__/instagram-branch.test.ts)"
  - "41-02 (getInstagramUserName direct edge from src/lib/meta/instagram-api.ts)"
  - "41-00 (instagram_provider migration — depends_on; reads land via domain alongside the gated column)"
provides:
  - "processInstagramWebhook — inbound IG DM handler (conversation channel='instagram' + IGSID contact + IG- name self-heal)"
  - "object==='instagram' branch in the unified Meta webhook route (routes by entry.id via resolveByIgAccountId, parses messaging[], skips is_echo)"
affects:
  - "Plan 41-06 (inbox channel indicator wired — conversations now land as channel='instagram')"
  - "Plan 41-07 (gated cutover — live IG DM smoke A1/A2 exercises this inbound path)"
tech-stack:
  added: []
  patterns:
    - "TDD GREEN by file-for-file clone of the shipped Phase 40 FB sibling (processMessengerWebhook + the page route branch)"
    - "Additive route branch after the shared verifyMetaHmac, before the whatsapp_business_account reject (D-06 byte-identical WA/page/template-status)"
    - "Inbound handler is human-only (D-IG-01): NO Inngest dispatch, NO v4 lock — distinct from the v3/v4 agent inbound paths"
key-files:
  created:
    - src/lib/instagram/webhook-handler.ts
  modified:
    - src/app/api/webhooks/meta/route.ts
decisions:
  - "getInstagramUserName(token, igsid) is the 2-arg DIRECT edge (no pageId arg) — simpler than FB's conversations-edge; the ONLY divergence from the FB handler clone"
  - "healPlaceholderContactName called with placeholderPrefix:'IG-' (FB handler defaults to FB-) — the contacts domain guard is channel-agnostic"
metrics:
  duration: ~6m
  completed: 2026-06-05
  tasks: 2
  files: 2
  tests_green: 12
---

# Phase 41 Plan 05: Instagram Direct — IG Inbound (webhook branch + processInstagramWebhook + IGSID self-heal) Summary

Turned the two Wave-1 RED inbound files GREEN (IG-01 / IG-03 / IG-04 inbox-half). Built `processInstagramWebhook` as a clone of the shipped FB `processMessengerWebhook` with the universal `psid→igsid` / `fb-→ig-` / `FB-→IG-` / `channel:'facebook'→'instagram'` swaps + the SIMPLER 2-arg IG name edge, plus the `object==='instagram'` branch in the unified Meta webhook route (structurally identical to the `object==='page'` branch). Inbound IG DMs now land in the existing inbox as `channel='instagram'` conversations with the IGSID contact + IG- name self-heal, human-only (D-IG-01 — no agent dispatch, no v4 lock).

## What Was Built

| Task | Commit | Files | Tests (GREEN) |
| ---- | ------ | ----- | ------------- |
| 1 — processInstagramWebhook | `0488d87c` | `src/lib/instagram/webhook-handler.ts` (NEW, 214 lines) | `instagram/__tests__/webhook-handler.test.ts` 8/8 |
| 2 — object==='instagram' route branch | `3ee77c2b` | `src/app/api/webhooks/meta/route.ts` | `meta/__tests__/instagram-branch.test.ts` 4/4 |

### Task 1 — `processInstagramWebhook(ev, workspaceId, igAccountId, accessToken?)`
- Clone of `processMessengerWebhook` (src/lib/messenger/webhook-handler.ts) with the swaps.
- `igsid = String(ev.sender?.id ?? '')`; empty guard → `{ stored:false }`. **IGSID kept a STRING end-to-end** (`grep Number(` == 0 — Pitfall 3).
- `phoneIdentifier = ig-${igsid}` (D-IG-05 identity).
- Name: `getInstagramUserName(accessToken ?? '', igsid)` — the **SIMPLER DIRECT edge, NO pageId arg** (the only divergence from the FB clone, which uses the 3-arg conversations-edge). `nameResolved` guard; fallback `IG-${igsid}` + `profileName` passed to `findOrCreateConversation` ONLY when `nameResolved`.
- Conversation: `findOrCreateConversation(ctx, { phone:'ig-${igsid}', channel:'instagram', externalSubscriberId:igsid, profileName? })`.
- Contact: `resolveOrCreateContact(ctx, { name:profileName, phone:'ig-${igsid}' })` by identity ONLY — **NO fuzzy phone/email match** (D-IG-05; the test asserts the raw `.single()` phone-search NEVER runs).
- Self-heal: `healPlaceholderContactName(ctx, { contactId, realName:profileName, placeholderPrefix:'IG-' })` when `nameResolved`.
- `receiveMessage(ctx, { ..., waMessageId: ev.message.mid })` idempotent on mid; fallback mid `ig-${igsid}-${Date.now()}`. Text + media (image|audio|video|file map).
- **D-IG-01:** NO Inngest dispatch, NO v4 lock (`grep -E "inngest|acquireLock|message_received"` == 0). **Regla 3:** imports EXCLUSIVELY from `@/lib/domain/*` + `@/lib/meta/instagram-api` (`grep createAdminClient` == 0).

### Task 2 — `object==='instagram'` branch in `src/app/api/webhooks/meta/route.ts`
- New `if ((payload.object as string) === 'instagram') { ... }` branch, structurally identical to the `page` branch, inserted AFTER the shared `verifyMetaHmac` (reused verbatim) and BEFORE the `whatsapp_business_account` reject (D-06 additive).
- Parses `entry[].messaging[]` (NOT `changes[]` — Pitfall 1).
- Routes by `entry.id` = IGID via `resolveByIgAccountId(igAccountId)` (NEVER `sender.id` — Pitfall 2 cross-tenant). Unknown id → `console.warn` + `continue` (ack 200 & drop).
- Skips `ev.message.is_echo` (Pitfall 7); dispatches `processInstagramWebhook(ev, creds.workspaceId, igAccountId, creds.accessToken)`. Returns `{ received:true }` 200.
- Imports extended: `resolveByIgAccountId` (sibling of `resolveByPageId`) + `processInstagramWebhook`. Cast `(payload.object as string)` exactly like the page branch (the `WebhookPayload.object` literal is `'whatsapp_business_account'`).
- **D-06 additive proof:** `git diff --stat` = 55 insertions / 1 deletion (the import line extended); WhatsApp + page + template-status branches byte-identical (no non-import deletions).

## Deviations from Plan

None — plan executed exactly as written. (The 2-arg `getInstagramUserName` direct edge + `placeholderPrefix:'IG-'` are the plan-specified divergences from the FB clone, not deviations.)

## Verification

- `instagram/__tests__/webhook-handler.test.ts` **8/8 GREEN**; `meta/__tests__/instagram-branch.test.ts` **4/4 GREEN**.
- No regression: full meta route `__tests__/` run **20/20 GREEN** (instagram-branch 4 + page/wa/template + handshake 3). Combined IG + FB + manychat-parity run **28/28 GREEN** (the 3 manychat Regla 6 parity guards + 2 HMAC 401 guards STILL GREEN).
- `npx tsc --noEmit` — 0 errors mentioning `webhook-handler.ts` or `route.ts`.

## Acceptance Greps (all PASS)

Task 1 (`src/lib/instagram/webhook-handler.ts`): `channel: 'instagram'`=1, `placeholderPrefix: 'IG-'`=1, `Number(`=0, `inngest|acquireLock|message_received`=0, `createAdminClient`=0, `getInstagramUserName`=4, `platform=instagram`=0.

Task 2 (`src/app/api/webhooks/meta/route.ts`): `=== 'instagram'`=2, `resolveByIgAccountId`=3, `processInstagramWebhook`=2, `is_echo`=4; diff additive (55 ins / 1 del = import only).

## TDD Gate Compliance

- RED gate: `1c113243` (Plan 41-01 — both inbound RED test files committed test-only).
- GREEN gate: `0488d87c` (handler) + `3ee77c2b` (route branch) — `feat(41-05)` after the RED commit. Sequence satisfied.

## Self-Check: PASSED

- `src/lib/instagram/webhook-handler.ts` — FOUND.
- `src/app/api/webhooks/meta/route.ts` — FOUND (modified).
- Commits `0488d87c` + `3ee77c2b` — FOUND in git log.
- NOT pushed (Regla 5 — IG inbound lands messages alongside the `instagram_provider` gated column; pushes at the 41-07 cutover after the prod migration is confirmed applied).
