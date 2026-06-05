---
phase: 41-instagram-direct
plan: 02
subsystem: instagram-direct
tags: [instagram, meta-direct, tdd-green, send-api, channel-sender, regla-6, igsid]
requirements: [IG-02]
requires:
  - "41-01 RED tests (instagram-api.test.ts + meta-instagram-sender.test.ts)"
provides:
  - "IG Send API client src/lib/meta/instagram-api.ts (text/image/attachment + direct name edge)"
  - "metaInstagramSender ChannelSender adapter (domain-imported, NOT in registry — Regla 6)"
affects:
  - "Plan 41-04 (domain instagram_provider chokepoint) will import metaInstagramSender directly"
  - "Plan 41-05 (webhook inbound) will call getInstagramUserName for self-heal IG- names"
tech-stack:
  added: []
  patterns:
    - "TDD GREEN by file-for-file clone of the shipped Phase 40 FB sibling (messenger-api.ts + meta-facebook-sender.ts) with psid→igsid swap"
    - "IG rides the SAME Page endpoint/token/envelope as FB Messenger (POST /{pageId}/messages, Page token, recipient:{id})"
    - "IG name edge SIMPLER than FB — direct GET /{IGSID}?fields=name,username (no conversations-edge workaround)"
    - "Regla 6 sibling-sender: domain-imported only, never in the channel-keyed registry map"
key-files:
  created:
    - src/lib/meta/instagram-api.ts
    - src/lib/channels/meta-instagram-sender.ts
  modified:
    - src/lib/meta/__tests__/instagram-api.test.ts
decisions:
  - "getInstagramUserName(token, igsid) is the 2-arg DIRECT edge GET /{IGSID}?fields=name,username, best-effort (null on error) — simpler than FB's 3-arg conversations workaround"
  - "sendInstagramAttachment signature (token, pageId, igsid, attachmentType, mediaUrl, tag?) with attachmentType union image|video|audio|file; document maps to 'file' in the sender"
metrics:
  duration: ~12m
  completed: 2026-06-05
  tasks: 2
  files: 3
  tests_total: 19
  tests_green: 19
---

# Phase 41 Plan 02: Instagram Direct — IG Send API client + metaInstagramSender (TDD GREEN) Summary

Turned the two Wave-1 RED send-shape files GREEN (IG-02) by cloning the shipped Phase 40 FB sibling file-for-file with the `psid→igsid` swap. IG rides the Messenger Platform via the connected Page, so the endpoint (`POST /{pageId}/messages`), token (Page token), and envelope (`recipient:{id:igsid}`, no `messaging_product`) are IDENTICAL to FB. The only IG divergence is the SIMPLER direct name edge.

## What Was Built

Two atomic commits, one per task:

| Task | Commit | Files | Tests (GREEN) |
| ---- | ------ | ----- | ------------- |
| 1 — IG Send API client | `60c8e856` | `src/lib/meta/instagram-api.ts` (+ RED-test text fix) | `instagram-api.test.ts` 11/11 |
| 2 — metaInstagramSender adapter | `85112cb2` | `src/lib/channels/meta-instagram-sender.ts` | `meta-instagram-sender.test.ts` 8/8 |

**Plan deliverable run: 2 files passed, 19/19 tests GREEN.**

### Task 1 — `instagram-api.ts` (IG-02)
- `sendInstagramText(token, pageId, igsid, text, tag?)` → no tag = `messaging_type:'RESPONSE'`; `'HUMAN_AGENT'` = `messaging_type:'MESSAGE_TAG'` + `tag:'HUMAN_AGENT'`. POST `/{pageId}/messages` with Bearer = Page token.
- `sendInstagramImage` → `message.attachment{type:'image', payload:{url, is_reusable:true}}`, NO caption field, NO `messaging_product`.
- `sendInstagramAttachment(token, pageId, igsid, attachmentType, mediaUrl, tag?)` — attachmentType union `image|video|audio|file` (the sender maps document→`file`).
- **IGSID-as-string verbatim** — `'17841400000000000000'` (> `Number.MAX_SAFE_INTEGER`) survives into `recipient.id`; zero `Number(` calls.
- `getInstagramUserName(token, igsid)` → DIRECT edge `GET /{IGSID}?fields=name,username` → `name` / `@username` / `null` on throw (best-effort).
- Token only passed to `metaRequest`, never logged (`console.log`=0).

### Task 2 — `meta-instagram-sender.ts` (IG-02)
- `metaInstagramSender.sendText/sendImage/sendMedia`, creds `{accessToken, pageId}` (not apiKey), unwrap `message_id` → `externalMessageId`.
- `sendImage` sends image then a FOLLOW-UP `sendInstagramText` for the caption (same tag both).
- `sendMedia` routes image→`sendImage`, document→`sendInstagramAttachment` with attachmentType `'file'`.
- **Regla 6 (CRITICAL):** domain-imported only — NOT added to the channel-keyed `senders` map. `registry.ts` + `manychat-sender.ts` left byte-identical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RED-test message text collided with the raw-body negative assertion**
- **Found during:** Task 1
- **Issue:** `instagram-api.test.ts` (from Plan 41-01) called `sendInstagramText(..., 'sin messaging_product')` and then asserted `lastRawBody()).not.toContain('messaging_product')`. The forbidden substring lived inside the *message text*, so the assertion failed even though the implementation never sets a `messaging_product` *field*. The test is self-defeating — the contract intent (no `messaging_product` field on the wire) was already correctly satisfied.
- **Fix:** Reworded the message text to `'sin campo de WhatsApp Cloud'`. The negative field assertion (`lastBody()).not.toHaveProperty('messaging_product')`) and the raw-body assertion both now correctly verify the contract.
- **Files modified:** `src/lib/meta/__tests__/instagram-api.test.ts`
- **Commit:** `60c8e856`

Two contract details followed the canonical interfaces (not deviations — the plan/41-01 RED tests pin them): `getInstagramUserName` 2-arg direct edge; `sendInstagramAttachment` 6-arg signature with the attachmentType union.

## Verification

- `instagram-api.test.ts` 11/11 GREEN; `meta-instagram-sender.test.ts` 8/8 GREEN (19/19 total).
- IG Send envelope matches the FB sibling: `POST /{pageId}/messages`, Page token, `recipient:{id:igsid}`, no `messaging_product`.
- IGSID-string preserved; token never logged; `metaInstagramSender` NOT in registry.
- **Regla 6 parity guards from 41-01 STILL GREEN:** the 3 manychat parity tests in `messages-instagram.test.ts` + the 2 HMAC-401 gate tests in `instagram-branch.test.ts` all still pass (no regression). The 18 remaining RED tests across `messages-instagram` (6 meta_direct arm → Plan 41-04), `instagram-branch` (4 route branch → Plan 41-05), and `webhook-handler` (8 → Plan 41-05) are owned by later plans and unchanged.

## Acceptance Greps (all PASS)

- `Number(` in instagram-api.ts: 0 (Pitfall 3)
- `messaging_product` field in instagram-api.ts: 0 (only 1 doc-comment mention, never on the wire)
- `/{pageId}/messages` endpoint in instagram-api.ts: 4 (≥1)
- `fields=name,username` in instagram-api.ts: 3 (≥1)
- `console.log` in instagram-api.ts: 0 (token never logged)
- `metaInstagramSender` in registry.ts: 0 (Regla 6 — NOT in the map)
- `git diff --stat registry.ts manychat-sender.ts`: EMPTY (byte-identical, Regla 6)
- `npx tsc --noEmit`: 0 errors mentioning instagram-api.ts / meta-instagram-sender.ts

## TDD Gate Compliance

- RED gate: `64685d9d` (Plan 41-01 — `test(...)` pinning the IG send shapes).
- GREEN gate: `60c8e856` + `85112cb2` (this plan — `feat(41-02)`).

## Self-Check: PASSED

- `src/lib/meta/instagram-api.ts` — FOUND.
- `src/lib/channels/meta-instagram-sender.ts` — FOUND.
- Commit `60c8e856` — FOUND.
- Commit `85112cb2` — FOUND.
