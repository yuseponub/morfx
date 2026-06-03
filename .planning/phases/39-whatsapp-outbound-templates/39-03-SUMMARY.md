---
phase: 39-whatsapp-outbound-templates
plan: 03
subsystem: whatsapp-outbound-meta
tags: [green, meta-cloud-api, media, templates, d-05, ssrf-guard, regla-6]
requires:
  - "Wave 0 RED scaffolds (39-01) — media.test.ts + templates.test.ts pin the contracts"
  - "meta/api.ts metaRequest helper + META_BASE_URL constant (existing)"
provides:
  - "meta/media.ts — uploadMedia (multipart→media_id), getMediaUrl, downloadMedia (two-step Bearer), downloadAndRehostMedia (Supabase whatsapp-media)"
  - "meta/templates.ts — createTemplateMeta, listTemplatesMeta, deleteTemplateMeta, editTemplateMeta (D-05 guard), syncTemplateStatusMeta, uploadHeaderHandleMeta"
  - "D-05 edit-constraint enforcement at the service layer (single point for every caller)"
affects:
  - src/lib/domain/messages.ts          # Plan 04 (meta_direct template branch) consumes meta/templates.ts
  - src/app/api/webhooks/meta/route.ts   # Plan 05/06 inbound media path consumes meta/media.ts downloadAndRehostMedia
tech-stack:
  added: []   # zero new deps
  patterns:
    - "Dedicated multipart fetch (FormData) for uploadMedia — NOT metaRequest (which forces application/json)"
    - "Two-step Bearer download with NO hostname rewrite (Meta returns the real CDN url, unlike 360dialog proxy)"
    - "SSRF host-allowlist + per-type size cap before the binary GET (T-39-07)"
    - "D-05 guard as the single enforcement point in editTemplateMeta (T-39-08) — name/language immutable + status-gated"
    - "metaRequest for JSON Graph calls; dedicated fetch only for binary (upload/resumable)"
key-files:
  created:
    - src/lib/meta/media.ts
    - src/lib/meta/templates.ts
  modified: []
decisions:
  - "editTemplateMeta / createTemplateMeta etc. take a single `creds: { accessToken, wabaId, phoneNumberId? }` object (not positional accessToken+wabaId) — the RED templates.test.ts calls them as `fn(CREDS, {...})`; honored the test contract over the plan's positional sketch."
  - "Kept BOTH downloadMedia (two-step Bearer → buffer+mime, the exact name media.test.ts imports) AND downloadAndRehostMedia (the must_haves Storage-rehost wrapper) — the test pins downloadMedia, the domain/webhook consumers (Plan 05) need the rehost wrapper."
  - "Sticker size cap keyed off image/webp (512KB) before the generic image 5MB cap, mirroring Meta's documented sticker limit."
metrics:
  duration_minutes: 12
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  tests_total: 16
  tests_green: 16
  completed: 2026-06-03
---

# Phase 39 Plan 03: Meta Media + Templates Service Files Summary

Built the two new Meta Cloud API service files — `meta/media.ts` (WA-06 CDN upload + inbound two-step Bearer download + Supabase rehost) and `meta/templates.ts` (WA-08 CRUD + the MANDATORY D-05 edit-constraint guard) — turning the Wave-1 RED suites `media.test.ts` (7) and `templates.test.ts` (9) fully GREEN. Both mirror the proven 360dialog analogs function-for-function (Regla 6 — copied, not modified), swapping base URL + auth header.

## What Was Built

### Task 1 — `meta/media.ts` (commit `17145b17`)
- **`uploadMedia(accessToken, phoneNumberId, mime, file)`** — multipart `POST /{phoneNumberId}/media` (`messaging_product=whatsapp`, `type=<mime>`, `file=<binary>`) → `media_id`. Dedicated `fetch` with `FormData`, NOT `metaRequest` (which forces `Content-Type: application/json` — RESEARCH §6). The test asserts the body `instanceof FormData` and that Content-Type is not forced to JSON.
- **`getMediaUrl(accessToken, mediaId)`** — `GET /{media_id}` (Bearer) → `{ url, mime_type, file_size }`.
- **`downloadMedia(accessToken, mediaId)`** — two-step (§7 / Pitfall 3): `getMediaUrl` then `GET url` with `Authorization: Bearer`, **no hostname rewrite** (Meta returns the real `lookaside.fbsbx.com` CDN url, unlike 360dialog's proxy swap). Returns `{ buffer, mimeType, filename }`.
- **`downloadAndRehostMedia(accessToken, mediaId, workspaceId, conversationId, mimeType?)`** — calls `downloadMedia`, then rehosts to the Supabase `whatsapp-media` bucket at `inbound/{ws}/{conv}/{ts}_{safeName}` with `upsert:false`, returns `getPublicUrl`. Copies `downloadAndUploadMedia` (webhook-handler.ts:632-679) + `getExtensionFromMime` (:684-704) verbatim.
- **SSRF + DoS guards (T-39-07):** `assertMetaCdnHost` allowlists `*.fbsbx.com` / `*.facebook.com` / `*.fbcdn.net` before the binary GET; `maxBytesForMime` caps per type (sticker 512KB, image 5MB, audio/video 16MB, document/fallback 100MB) and aborts on both declared `file_size` and actual `byteLength`. The Bearer token only ever flows to fetch headers — never logged (T-39-01).

### Task 2 — `meta/templates.ts` (commit `2562131d`)
- **`createTemplateMeta(creds, { name, language, category, components })`** — `POST /{waba_id}/message_templates` (§9).
- **`listTemplatesMeta(creds, limit=250)`** — `GET …/message_templates?limit=250&fields=name,status,category,language,components,quality_score,rejected_reason`.
- **`deleteTemplateMeta(creds, name)`** — `DELETE …/message_templates?name=<name>` (URL-encoded).
- **`syncTemplateStatusMeta(creds, name)`** — poll fallback mirroring `syncTemplateStatus360`; reconciles a single row by name from the list.
- **`editTemplateMeta(creds, { templateId, status, name?, language?, category?, components? })`** — `POST /{message_template_id}` body `{ category?, components? }`. **D-05 guard (T-39-08, the mandatory deliverable):** rejects if `name` or `language` is supplied (immutable, any status); rejects if `status ∉ {APPROVED, REJECTED, PAUSED}`. Both guards throw BEFORE any fetch — the RED tests assert `fetchMock` is never called on the reject paths. This is the single enforcement point every call-site inherits.
- **`uploadHeaderHandleMeta(accessToken, appId, bytes, mime, fileName?)`** — Meta Resumable Upload 2-step (`POST /{app_id}/uploads?file_length&file_type` → session → `POST /{session_id}` `file_offset:0` → `{ h }`), copying the structure of `uploadHeaderImage360` (templates-api.ts:235-291) pointed at Graph directly.
- Uses `metaRequest<T>` for all JSON Graph calls (parses `MetaGraphApiError`); dedicated `fetch` only for the binary resumable upload.

## Deviations from Plan

### Auto-fixed / contract-honored

**1. [Rule 1 — Contract] Functions take a `creds` object, not positional `(accessToken, wabaId)`**
- **Found during:** Task 2 (first read of the RED `templates.test.ts`).
- **Issue:** The plan's `<action>` sketched positional signatures (`createTemplateMeta(accessToken, wabaId, {...})`), but the RED tests (the source of truth for GREEN) call `mod.createTemplateMeta(CREDS, {...})` with `CREDS = { accessToken, wabaId, phoneNumberId }`, and `editTemplateMeta(CREDS, { templateId, status, ... })`.
- **Fix:** Implemented the `MetaTemplateCreds` object signature so the tests pass. Endpoint shapes + D-05 semantics are identical to the plan.
- **Files modified:** `src/lib/meta/templates.ts`.
- **Commit:** `2562131d`.

**2. [Rule 2 — Critical] Kept `downloadMedia` (test contract) alongside `downloadAndRehostMedia` (must_haves)**
- **Found during:** Task 1.
- **Issue:** `media.test.ts` imports and asserts `media.downloadMedia(TOKEN, mediaId)` returning `{ mimeType }`, while the plan's `must_haves`/`provides` name `downloadAndRehostMedia` (the Storage wrapper).
- **Fix:** Exported both — `downloadMedia` is the two-step Bearer primitive the test pins; `downloadAndRehostMedia` wraps it with the Supabase rehost the Plan 05 webhook consumer needs.
- **Files modified:** `src/lib/meta/media.ts`.
- **Commit:** `17145b17`.

No other deviations.

## Authentication Gates

None. Pure service-file implementation against stubbed `global.fetch`; no live credentials, no external calls. T-39-01 honored — Bearer tokens flow only to fetch headers, never logged.

## Verification

```
pnpm exec vitest run src/lib/meta/__tests__/media.test.ts src/lib/meta/__tests__/templates.test.ts
→ 2 files, 16 tests: 16 passed (0 failed)
```

- `media.test.ts` (WA-06): 7/7 GREEN — multipart upload (FormData, not JSON), two-step Bearer download with no hostname rewrite, plus the 5 sendWhatsAppMedia gating tests that stayed GREEN.
- `templates.test.ts` (WA-08 + D-05): 9/9 GREEN — create/list/delete endpoint shapes, edit happy path (APPROVED/REJECTED/PAUSED), and the 4 D-05 guard rejects (name immutable, language immutable, PENDING not editable, DISABLED not editable) each asserting `fetch` was never called.
- `pnpm exec tsc --noEmit` → 0 errors mentioning `meta/media` or `meta/templates`.
- **Regla 6:** `git status --short` on `whatsapp/templates-api.ts`, `whatsapp/api.ts`, `whatsapp/webhook-handler.ts`, `meta/api.ts` → empty (all UNCHANGED — copied, not modified).

### Sibling suite intentionally still RED (out of scope)
`domain/__tests__/messages-provider.test.ts` — 3 `meta_direct` provider-branch tests remain RED (the Plan 04 deliverable: wiring the `meta_direct` arm of `sendTextMessage` in `domain/messages.ts`). Confirmed these failures are the pre-existing Plan-04 RED contract, NOT a regression — this plan touches no domain file. The 2 360dialog parity tests in that suite stay GREEN.

## Threat Flags

None. The threat surface introduced (Meta CDN download, template CRUD) is exactly the plan's `<threat_model>` register — T-39-07 (SSRF + size cap) and T-39-08 (D-05 guard) are both implemented; T-39-01 (no token logging) honored.

## TDD Gate Compliance

This is the GREEN half of the Wave-0 RED scaffolds (`type: execute`). The RED gate (`test(39-01)`) shipped in Plan 01. This plan's two `feat(39-03)` commits (`17145b17`, `2562131d`) are the GREEN gate turning media.test.ts + templates.test.ts green. No REFACTOR commit needed.

## Self-Check: PASSED

Created files (all FOUND):
- `src/lib/meta/media.ts`
- `src/lib/meta/templates.ts`

Commits (all FOUND in git log):
- `17145b17` feat(39-03): meta/media.ts — CDN upload + inbound download/rehost (WA-06)
- `2562131d` feat(39-03): meta/templates.ts — CRUD + D-05 edit guard (WA-08)
