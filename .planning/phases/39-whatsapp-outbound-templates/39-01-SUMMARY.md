---
phase: 39-whatsapp-outbound-templates
plan: 01
subsystem: whatsapp-outbound-meta
tags: [tdd, red-scaffold, meta-cloud-api, templates, regla-6, provider-branch]
requires: []
provides:
  - "Six RED test files pinning every Phase 39 outbound + templates requirement contract"
  - "Regla 6 first-class parity test (flag=360dialog → 360dialog path byte-identical)"
  - "D-05 mandatory edit-guard test cases (name/language immutable + status-gated)"
affects:
  - src/lib/domain/messages.ts        # Plan 04 must satisfy messages-provider.test.ts
  - src/lib/meta/api.ts               # Plan 02 adds markWhatsAppRead/sendWhatsAppMedia/sendWhatsAppInteractive
  - src/lib/meta/media.ts             # Plan 02/06 — uploadMedia/downloadMedia
  - src/lib/meta/templates.ts         # Plan 03/07 — CRUD + editTemplateMeta (D-05)
  - src/lib/channels/meta-whatsapp-sender.ts  # Plan 02 — ChannelSender-shaped Meta sender
  - src/app/api/webhooks/meta/route.ts # Plan 06 — message_template_status_update branch
tech-stack:
  added: []   # zero new deps — vitest + native fetch stubbing only
  patterns:
    - "Stub global fetch to inspect Graph wire shape (real metaRequest uses fetch)"
    - "Lazy `await import()` of unbuilt modules → RED on module-not-found, not collection crash"
    - "Mock chainable Supabase admin builder to control workspaces.whatsapp_provider"
    - "@ts-expect-error import of not-yet-exported helper pins the contract pre-implementation"
key-files:
  created:
    - src/lib/domain/__tests__/messages-provider.test.ts
    - src/lib/meta/__tests__/send.test.ts
    - src/lib/meta/__tests__/media.test.ts
    - src/lib/meta/__tests__/templates.test.ts
    - src/lib/channels/__tests__/meta-whatsapp-sender.test.ts
    - src/app/api/webhooks/meta/__tests__/template-status.test.ts
  modified: []
decisions:
  - "Stub global fetch (not vi.mock metaRequest) for send/media/templates — the existing helpers capture their metaRequest reference at module-load, so partial mocking leaks the real impl; fetch-stubbing pins the actual wire body deterministically."
  - "messages-provider.test.ts mocks metaWhatsappSender + resolveByWorkspace so the suite runs RED on the meta_direct assertion, while the 360dialog parity tests run GREEN against the real (unchanged) arm — exactly the Regla 6 byte-identical guard."
metrics:
  duration_minutes: 18
  tasks_completed: 3
  files_created: 6
  tests_total: 31
  tests_red: 25
  tests_green: 6
  completed: 2026-06-03
---

# Phase 39 Plan 01: Wave 0 RED Test Scaffolds Summary

Created the six Wave 0 RED test files that pin every Phase 39 Meta outbound + templates requirement contract (WA-01/02/03/04/06/07/08/09 + MIG-03) BEFORE any implementation, including the first-class Regla 6 parity test and the D-05 mandatory edit-guard cases. Zero production code touched.

## What Was Built

Six Vitest files under `__tests__/` dirs — 31 tests total, **25 RED (intended)** + **6 GREEN** (parity/security guards that must stay green through implementation):

| File | Req IDs | Tests | RED | GREEN | What the GREEN tests guard |
|------|---------|-------|-----|-------|----------------------------|
| `domain/__tests__/messages-provider.test.ts` | MIG-03 | 5 | 3 | 2 | 360dialog arm byte-identical (Regla 6 parity) |
| `meta/__tests__/send.test.ts` | WA-01/03/07 | 3 | 1 | 2 | text + template wire-shape regression guard |
| `meta/__tests__/media.test.ts` | WA-02/06 | 7 | 7 | 0 | — |
| `meta/__tests__/templates.test.ts` | WA-08 + D-05 | 9 | 9 | 0 | — |
| `channels/__tests__/meta-whatsapp-sender.test.ts` | WA-04 | 3 | 3 | 0 | — |
| `webhooks/meta/__tests__/template-status.test.ts` | WA-09 | 4 | 2 | 2 | HMAC gate rejects forged/wrong-secret (T-39-04) |

Every RED test fails for the **right reason** — missing implementation (module-not-found, undefined export, or absent provider branch) — never a syntax or collection error.

### Task 1 — `messages-provider.test.ts` (commit `cb5d0ad0`)
The first-class Regla 6 parity + provider-routing contract on `domain/messages.ts::sendTextMessage`:
- **GREEN (today):** flag=`360dialog` → `send360Text(apiKey, to, body)` called with the same args; `resolveByWorkspace`/`metaWhatsappSender` NEVER touched. This is the byte-identical guard Plan 04 must not break.
- **RED (until Plan 04):** flag=`meta_direct` → `resolveByWorkspace(ctx.workspaceId, 'whatsapp')` (creds from workspaceId, never input — T-39-02), Meta sender called with the resolved creds object (not the apiKey string), 360dialog arm untouched.

### Task 2 — `send.test.ts` + `media.test.ts` + `meta-whatsapp-sender.test.ts` (commit `ad848f56`)
- **send.test.ts:** text §1 + template §3 wire shapes pinned GREEN; `markWhatsAppRead` §8 RED (WA-07).
- **media.test.ts:** caption/filename gating per type (image/video/document carry caption; document carries filename; audio/sticker carry neither — Pitfall 4); multipart upload to `/{pnid}/media` that is NOT `application/json` (§6); two-step inbound download `GET /{media_id}` → `GET url` with `Authorization: Bearer`, no hostname rewrite (§7, Pitfall 3). All RED until `meta/media.ts` + `sendWhatsAppMedia`.
- **meta-whatsapp-sender.test.ts:** asserts the module is `ChannelSender`-shaped taking `{accessToken, phoneNumberId}` (NOT apiKey), and interactive clamps — buttons ≤3 / title ≤20, list ≤10 sections / row title ≤24 (§4-5). All RED until Plan 02.

### Task 3 — `templates.test.ts` + `template-status.test.ts` (commit `1589cd85`)
- **templates.test.ts:** create §9 / list (limit=250 + full fields) / delete (`?name=`) endpoint shapes + `editTemplateMeta` happy path; the **D-05 MANDATORY guard** cases — rejects name change, rejects language change (immutable any status), rejects PENDING/DISABLED (not editable), allows APPROVED/REJECTED/PAUSED. All RED until `meta/templates.ts`.
- **template-status.test.ts:** HMAC gate rejects forged + wrong-secret `message_template_status_update` payloads GREEN (T-39-04 — the security guard Plan 06 must preserve); APPROVED → row `status` UPDATE and REJECTED → `rejected_reason` write RED until Plan 06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched from `vi.mock(metaRequest)` to global-fetch stubbing for send/media/templates**
- **Found during:** Task 2 (first `send.test.ts` run threw a live Graph 401, code 190).
- **Issue:** The existing `sendWhatsAppText`/`sendWhatsAppTemplate` capture their `metaRequest` reference at module-load, so a partial `vi.mock('@/lib/meta/api', { ...actual, metaRequest })` does NOT intercept the call inside those functions — they hit the real `metaRequest` → real `fetch` → a live network attempt.
- **Fix:** Stub `global.fetch` instead (the real `metaRequest` uses `fetch`), and assert the exact URL/body/Authorization header on the wire. This pins the contract more strictly (it verifies the real wrapper's output) and removes the leak.
- **Files modified:** `send.test.ts`, `media.test.ts` (rewritten before commit `ad848f56`).
- **Commit:** `ad848f56` (the corrected versions were what got committed; no separate fix commit).

No other deviations — the plan's prescribed RED approach (mock unbuilt modules / direct-import not-yet-exported helpers so suites run RED on assertion or module-not-found) was followed for every file.

## Authentication Gates

None. Pure test-scaffold work; no live credentials, no external services. T-39-01 honored — only placeholder tokens (`BISUAT_decrypted`) in fixtures, never logged.

## Verification

```
npx vitest run src/lib/meta/__tests__/{send,media,templates}.test.ts \
  src/lib/channels/__tests__/meta-whatsapp-sender.test.ts \
  src/lib/domain/__tests__/messages-provider.test.ts \
  src/app/api/webhooks/meta/__tests__/template-status.test.ts
→ 6 test files, 31 tests: 25 failed (intended RED) | 6 passed (parity/security guards)
```

`git show --stat` on each of the 3 task commits confirms ONLY the six test files were committed — zero production code, zero planning files (verified per-commit; the misleading `HEAD~3` diff stat span included an unrelated pre-existing realtime-inbox-badge PLAN commit, NOT any of this plan's commits).

## TDD Gate Compliance

This is `type: tdd` Wave-0 RED scaffolding. The RED gate is satisfied by design — there is no GREEN commit in this plan (implementation lands in Waves 2-5). The six files are the failing tests that every later wave verifies against. The 6 GREEN tests are intentional always-green guards (Regla 6 parity + HMAC security + existing-helper wire-shape regression), not premature implementation.

## Self-Check: PASSED

Created files (all FOUND):
- `src/lib/domain/__tests__/messages-provider.test.ts`
- `src/lib/meta/__tests__/send.test.ts`
- `src/lib/meta/__tests__/media.test.ts`
- `src/lib/meta/__tests__/templates.test.ts`
- `src/lib/channels/__tests__/meta-whatsapp-sender.test.ts`
- `src/app/api/webhooks/meta/__tests__/template-status.test.ts`

Commits (all FOUND in git log): `cb5d0ad0`, `ad848f56`, `1589cd85`.
