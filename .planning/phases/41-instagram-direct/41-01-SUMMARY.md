---
phase: 41-instagram-direct
plan: 01
subsystem: instagram-direct
type: tdd
tags: [instagram, meta-direct, tdd-red, test-scaffold, regla-6, igsid]
requirements: [IG-01, IG-02, IG-03, MIG-02]
requires: []
provides:
  - "Five RED test files pinning the full Meta Instagram surface (IG-01/IG-02/IG-03/MIG-02)"
  - "Regla 6 manychat parity contract (instagram_provider='manychat' → ManyChat path untouched)"
  - "IGSID-as-string contract asserted end-to-end (never Number-coerced)"
affects:
  - "Plan 41-02 (instagram-api + metaInstagramSender) turns 2 send-shape files GREEN"
  - "Plan 41-04 (domain readInstagramProvider chokepoint) turns 6 meta_direct tests GREEN"
  - "Plan 41-05 (object==='instagram' webhook branch + processInstagramWebhook) turns inbound + route tests GREEN"
tech-stack:
  added: []
  patterns:
    - "TDD RED scaffold by file-for-file clone of the shipped Phase 40 FB sibling tests"
    - "Regla 6 parity as a first-class RED assertion (manychat arm not.toHaveBeenCalled holds today)"
    - "lazy per-test await import() for clean per-test module-not-found RED"
key-files:
  created:
    - src/lib/meta/__tests__/instagram-api.test.ts
    - src/lib/channels/__tests__/meta-instagram-sender.test.ts
    - src/lib/domain/__tests__/messages-instagram.test.ts
    - src/lib/instagram/__tests__/webhook-handler.test.ts
    - src/app/api/webhooks/meta/__tests__/instagram-branch.test.ts
  modified: []
decisions:
  - "getInstagramUserName(token, igsid) is the 2-arg DIRECT edge (not FB's 3-arg conversations-edge workaround) per 41-RESEARCH §Pattern 'Name resolution SIMPLER on IG'"
  - "sendMedia routing (image→sendImage, document→attachmentType 'file') pinned per plan Task 1 action"
metrics:
  duration: ~8m
  completed: 2026-06-05
  tasks: 3
  files: 5
  tests_total: 31
  tests_red: 26
  tests_green: 5
---

# Phase 41 Plan 01: Instagram Direct — Wave 1 RED Test Scaffolds Summary

TDD RED scaffolds for the entire Phase 41 Meta Instagram surface: five failing test files cloned from the shipped Phase 40 FB sibling tests, pinning every IG-01/IG-02/IG-03/MIG-02 contract BEFORE any implementation (Nyquist gate). The Regla 6 manychat parity contract is a first-class RED deliverable.

## What Was Built

Three atomic commits, one per task, each containing ONLY `__tests__/` files (zero production code touched):

| Task | Commit | Files | Tests (RED / GREEN) |
| ---- | ------ | ----- | ------------------- |
| 1 — IG send shapes | `64685d9d` | `meta/__tests__/instagram-api.test.ts`, `channels/__tests__/meta-instagram-sender.test.ts` | 8 RED / 0 |
| 2 — domain arm + Regla 6 parity | `82b072fc` | `domain/__tests__/messages-instagram.test.ts` | 6 RED / 3 GREEN |
| 3 — inbound handler + route branch | `1c113243` | `instagram/__tests__/webhook-handler.test.ts`, `api/webhooks/meta/__tests__/instagram-branch.test.ts` | 12 RED / 2 GREEN |

**Full 5-file run: 5 files failed (5), 26 failed | 5 passed (31).**

### Task 1 — `instagram-api.test.ts` + `meta-instagram-sender.test.ts` (IG-02)
- `sendInstagramText` → `messaging_type:'RESPONSE'` (no tag) inside-window; `MESSAGE_TAG`+`tag:'HUMAN_AGENT'` outside; POST to `/{pageId}/messages` with `Bearer` Page token.
- **NO `messaging_product`** anywhere on the wire (WhatsApp-only) — asserted on the raw body string (negative assertion, 10 grep hits).
- `sendInstagramImage` → `attachment{type:'image', payload:{url, is_reusable:true}}`, no caption field, never `messaging_product`.
- **IGSID-as-string** — large id `'17841400000000000000'` (> `Number.MAX_SAFE_INTEGER`) survives verbatim into `recipient.id`; `!= Number(IGSID)`.
- `getInstagramUserName(token, igsid)` → DIRECT edge `GET /{IGSID}?fields=name,username`, returns name / `@username` / `null` on failure (best-effort).
- Sender: creds `{accessToken, pageId}` (not a plain key string — `grep apiKey == 0`); image-as-followup caption; HUMAN_AGENT propagated to both image and caption; `sendMedia` routes image→`sendImage`, document→attachmentType `'file'`.
- RED reason: `ERR_MODULE_NOT_FOUND` for `@/lib/meta/instagram-api` + `@/lib/channels/meta-instagram-sender` (built in Plan 41-02).

### Task 2 — `messages-instagram.test.ts` (MIG-02 + Regla 6)
- meta_direct arm: `resolveByWorkspace(ctx.workspaceId, 'instagram')` → `metaInstagramSender.sendText/.sendMedia` with creds from ctx (never input), IGSID-string, missing-creds → `{success:false, error:'Credenciales Meta no configuradas'}`.
- **Regla 6 parity (first-class):** `instagram_provider='manychat'` (and null/unknown default) → `getChannelSender('instagram')`; `resolveByWorkspace` + `metaInstagramSender` **never called** (`not.toHaveBeenCalled` × 9).
- The 3 manychat-parity tests **PASS today** — they are the byte-identical guard Plan 41-04 must not break. The 6 meta_direct tests are RED (no `instagram_provider` branch in `domain/messages.ts` yet — it currently falls through to the ManyChat `else` arm).

### Task 3 — `webhook-handler.test.ts` + `instagram-branch.test.ts` (IG-01 / IG-03)
- `processInstagramWebhook(ev, ws, igAccountId, token)` → conversation `channel:'instagram'`, `phone:'ig-${IGSID}'`, `externalSubscriberId:IGSID` (string); contact create-or-get strictly by `ig-${IGSID}` identity, NO fuzzy phone/email search (`phoneSearchSingle` not called); self-heal `healPlaceholderContactName({placeholderPrefix:'IG-'})` when name resolves, fallback `IG-${IGSID}` + heal NOT called when null; `receiveMessage` waMessageId=mid; **D-IG-01 no Inngest dispatch**.
- Route branch: `object==='instagram'` parses `entry[].messaging[]`, routes by `entry.id` via `resolveByIgAccountId` (never `sender.id`), unknown id → ack 200 & drop, skips `is_echo`, dispatches `processInstagramWebhook`.
- The 2 HMAC 401 gate tests **PASS today** (security guard Plan 41-05 must preserve). Handler tests RED (module-not-found); branch routing tests RED (route returns 400 for `object='instagram'` today — branch lands in Plan 41-05).

## Deviations from Plan

None — plan executed exactly as written. Two contract details followed the canonical interfaces/RESEARCH (not deviations, the plan explicitly instructed them):
- `getInstagramUserName` is the 2-arg direct edge (plan `<interfaces>` + 41-RESEARCH §Pattern). FB's analog uses a 3-arg conversations-edge workaround; IG is simpler — followed the IG interface.
- `sendMedia` type-routing tests (image→sendImage, document→`file`) added per Task 1 `<action>`.

## Verification

- IG-01, IG-02, IG-03, MIG-02 each have ≥1 failing test pinning their contract.
- IGSID-as-string asserted (`instagram-api` + `meta-instagram-sender` + `messages-instagram` + `webhook-handler`).
- Regla 6 manychat parity asserted as first-class RED (9 `not.toHaveBeenCalled`, 3 parity tests GREEN today).
- D-IG-01 no-Inngest asserted; no-fuzzy asserted; `messaging_product` absence asserted.
- Each commit contains ONLY `__tests__/` files — `git diff --cached --stat` per commit shows only new test files, zero production code, zero deletions.
- (IG-05 window block reuses the FB window-gate tests — no new file, per 41-VALIDATION.md.)

## Acceptance Greps (all PASS)

- `messaging_product` in instagram-api.test.ts: 10 (≥1)
- `HUMAN_AGENT` in instagram-api.test.ts: 11 (≥1)
- IGSID-string literal (`17841`/`Number(`/`MAX_SAFE`): 5 (≥1)
- `accessToken` in sender: 14; `apiKey` in sender: 0
- `instagram_provider` in messages-instagram.test.ts: 8; `not.toHaveBeenCalled`: 9; `metaInstagramSender`: 10
- handler `channel instagram`: 6; self-heal `IG-` prefix: 8; D-IG-01 negative (`inngest`/`acquireLock`/`message_received`): 5; `ig-` prefix: 5
- `resolveByIgAccountId` in branch test: 8; `is_echo`: 4

## Self-Check: PASSED

- All 5 created files exist (FOUND).
- All 3 commits exist in git log (`64685d9d`, `82b072fc`, `1c113243`).
- Full suite confirmed RED (26 RED / 5 GREEN parity guards), every RED for the right reason (missing impl/branch), no syntax/collection crashes.
