---
phase: 39-whatsapp-outbound-templates
plan: 06
subsystem: whatsapp-outbound-meta
tags: [meta-cloud-api, webhook, templates, wa-09, wa-06, inbound-media, hmac, regla-6, provider-branch]
requires:
  - "Wave 0 RED scaffold (39-01) — template-status.test.ts pins WA-09 + HMAC gate (T-39-04)"
  - "meta/media.ts (39-03) — downloadAndRehostMedia (two-step Bearer + Supabase rehost)"
  - "meta/credentials.ts resolveByWorkspace (existing) + Phase 38 Meta webhook route"
provides:
  - "WA-09: message_template_status_update webhook push handler on /api/webhooks/meta (UPDATE status + rejected_reason)"
  - "WA-06 inbound: meta_direct workspaces rehost Meta CDN media via downloadAndRehostMedia (Bearer two-step)"
  - "domain applyTemplateStatusUpdate (Regla 3 mutation chokepoint for the webhook)"
  - "credentials resolveByWabaId (resolve workspace from entry[].id WABA id)"
affects:
  - src/app/api/webhooks/meta/route.ts     # WA-09 branch added (additive on existing Meta webhook)
  - src/lib/whatsapp/webhook-handler.ts    # inbound media path now provider-aware
  - src/lib/domain/whatsapp-templates.ts   # applyTemplateStatusUpdate added
  - src/lib/meta/credentials.ts            # resolveByWabaId added
tech-stack:
  added: []   # zero new deps
  patterns:
    - "Webhook field-branch AFTER HMAC verify (template-status has no phone_number_id → branch before phoneNumberId extraction)"
    - "Provider-aware inbound media: read workspaces.whatsapp_provider ONCE, meta_direct → meta/media.ts, 360dialog byte-identical (Regla 6)"
    - "Best-effort workspace resolution (unknown WABA still acks 200 — no Meta retry storm on non-critical sync)"
    - "Domain mutation chokepoint for the webhook (route never UPDATEs whatsapp_templates directly — Regla 3)"
key-files:
  created: []
  modified:
    - src/app/api/webhooks/meta/route.ts
    - src/lib/whatsapp/webhook-handler.ts
    - src/lib/domain/whatsapp-templates.ts
    - src/lib/meta/credentials.ts
decisions:
  - "WA-09 branch runs after HMAC verify + object validation but BEFORE the phone_number_id extraction, because template-status payloads carry the WABA id at entry[].id and have NO metadata.phone_number_id (the existing ack-and-drop would otherwise swallow them)."
  - "applyTemplateStatusUpdate lives in domain/whatsapp-templates.ts (Regla 3) — the route resolves workspaceId from the WABA id then delegates; the route never touches whatsapp_templates directly."
  - "Workspace resolution from WABA id is best-effort: an unknown/unresolvable WABA (or a thrown resolver) still acks 200, and the UPDATE is scoped by name (+ language + workspace_id when resolvable). A 500 here would trigger a Meta retry storm for a non-critical status sync."
  - "Inbound media branch reads workspaces.whatsapp_provider (same column domain/messages.ts uses) — meta_direct routes to downloadAndRehostMedia(creds.accessToken,...); the 360dialog downloadAndUploadMedia call path is preserved verbatim inside the else arm (Regla 6)."
metrics:
  duration_minutes: 22
  tasks_completed: 2
  files_created: 0
  files_modified: 4
  tests_total: 4
  tests_green: 4
  completed: 2026-06-03
---

# Phase 39 Plan 06: WA-09 Template-Status Webhook + Inbound Meta Media Rehost Summary

Wired the inbound/webhook side of Meta Direct: the **WA-09** `message_template_status_update` push handler on the existing `/api/webhooks/meta` endpoint (replacing polling — templates created via Meta sit at PENDING until Meta reviews them, and this receives the APPROVED/REJECTED push), and the **WA-06** inbound media path so Meta CDN media is downloaded (two-step Bearer, immediate — ~5 min CDN expiry) and rehosted to Supabase Storage for `meta_direct` workspaces. Turned `template-status.test.ts` fully GREEN (4/4). Both changes are ADDITIVE — the existing Phase 38 inbound-message path (`processWebhook`) and the 360dialog inbound media path (`downloadAndUploadMedia`) stay byte-identical (Regla 6 / D-09).

## What Was Built

### Task 1 — WA-09 template-status webhook handler (commit `67c5ff0a`)

Three coordinated edits, all behind the existing HMAC gate:

- **`src/app/api/webhooks/meta/route.ts`** — after `verifyMetaHmac` (forged/unsigned already rejected 401 — T-39-04) + the `object === 'whatsapp_business_account'` check, branch on `entry[0].changes[0].field === 'message_template_status_update'`. This branch runs BEFORE the `phone_number_id` extraction because template-status payloads carry the WABA id at `entry[].id` and have no `metadata.phone_number_id` (the existing ack-and-drop at the `!phoneNumberId` check would otherwise swallow them). It resolves `workspaceId` from the WABA id via `resolveByWabaId` (best-effort, try/caught), calls the domain updater, and returns 200. The existing inbound-message path (`processWebhook`) for the `messages` field is unchanged (D-09).
- **`src/lib/domain/whatsapp-templates.ts`** — new `applyTemplateStatusUpdate(params)` (Regla 3 mutation chokepoint): maps the Meta `event` to the local `status` (uppercase verbatim — the column already carries Meta's enum), writes `rejected_reason` on negative events (REJECTED/PAUSED/DISABLED/FLAGGED with a meaningful reason, clears it otherwise), and UPDATEs the matching `whatsapp_templates` row scoped by `(name, workspace_id?, language?)`. `workspace_id` comes from the resolved WABA (T-39-02 — never from arbitrary payload fields).
- **`src/lib/meta/credentials.ts`** — new `resolveByWabaId(wabaId)` mirroring the other resolvers (`.eq('waba_id', wabaId).eq('is_active', true).single()`), for inbound events that carry the WABA id but no phone_number_id.

### Task 2 — Inbound Meta media rehost WA-06 (commit `7df2706e`)

- **`src/lib/whatsapp/webhook-handler.ts`** — the inbound media block (`MEDIA_TYPES.has(msg.type)`) now reads `workspaces.whatsapp_provider` (the same column `domain/messages.ts` uses) in the existing single workspace query. For `meta_direct`: resolve decrypted Bearer creds via `resolveByWorkspace(workspaceId, 'whatsapp')` (T-39-02) and call `downloadAndRehostMedia(creds.accessToken, mediaId, workspaceId, conversationId, mimeType)` from `meta/media.ts` (Plan 03 — two-step Bearer download with SSRF host-allowlist + per-type size cap T-39-07; downloads immediately on receipt for the ~5 min CDN expiry, Pitfall 3; token only in fetch headers, never logged T-39-01). For `360dialog` (default): the existing D360 API-key path (`downloadAndUploadMedia`) is preserved verbatim inside the `else` arm (Regla 6).

## Deviations from Plan

### Auto-fixed / contract-honored

**1. [Rule 2 — Critical] WA-09 branch placed BEFORE the phone_number_id extraction**
- **Found during:** Task 1 (tracing the test payload through the route).
- **Issue:** The plan's `<action>` said to branch "after HMAC verify + raw-body parse." But template-status payloads have no `metadata.phone_number_id`, and the existing route returns an ack-and-drop 200 at the `!phoneNumberId` check (line ~122) before any field branching. Putting the branch after that check would never reach it.
- **Fix:** Placed the `message_template_status_update` branch immediately after the `object` validation and BEFORE the phone_number_id extraction. HMAC still gates it (the verify runs earlier, unchanged). Inbound-message handling is untouched.
- **Files modified:** `src/app/api/webhooks/meta/route.ts`.
- **Commit:** `67c5ff0a`.

**2. [Rule 2 — Critical] Added `resolveByWabaId` + a domain updater (workspace resolved from WABA, not phone_number_id)**
- **Found during:** Task 1.
- **Issue:** The plan referenced "the existing credential resolver," but the only inbound resolver was `resolveByPhoneNumberId`, which template-status payloads cannot feed (no phone_number_id). The mutation also had to go through the domain layer (Regla 3), not an inline admin UPDATE in the route.
- **Fix:** Added `resolveByWabaId(wabaId)` to `credentials.ts` and `applyTemplateStatusUpdate(params)` to `domain/whatsapp-templates.ts` (the single Regla-3 chokepoint). The route resolves the workspace best-effort and delegates.
- **Files modified:** `src/lib/meta/credentials.ts`, `src/lib/domain/whatsapp-templates.ts`.
- **Commit:** `67c5ff0a`.

No other deviations — the inbound-media provider branch followed the plan's prescription exactly (360dialog path unchanged; Meta path uses `meta/media.ts`).

## OQ1 / A2 — subscribed_apps `message_templates` field check (OPERATOR ACTION)

The plan asked for a one-time Wave-0 check that the WABA is subscribed to the `message_templates` field (`GET /{waba_id}/subscribed_apps`), adding a one-time subscribe-field call if missing. **This requires a live Graph API call with the test number's decrypted BISUAT and is NOT performed in code** (no live credentials in the execution environment; doing it here would also be an external side-effect outside the plan's file scope).

**Operator action before the Plan 08 cutover smoke:** run, with the test WABA's access token —
```
GET https://graph.facebook.com/v22.0/{waba_id}/subscribed_apps
```
Confirm the subscribed app's `subscribed_fields` includes `message_templates`. Phase 38's `subscribeWaba` already POSTs `/{waba_id}/subscribed_apps` (inbound messages work), but if `message_templates` is not listed, re-subscribe with that field included (and ensure the Meta App dashboard has the `message_template_status_update` webhook field enabled). If it is missing, the WA-09 push will not fire — the polling `syncTemplateStatus360` / `syncTemplateStatusMeta` remain as the manual "Resync" fallback (Pattern 3 — deliberately NOT removed).

## Authentication Gates

None. All work ran against stubbed `global.fetch` / mocked Supabase admin in tests; no live credentials, no external calls. T-39-01 honored — Bearer/access tokens flow only to fetch headers, never logged.

## Verification

```
pnpm exec vitest run src/app/api/webhooks/meta/__tests__/template-status.test.ts
→ 1 file, 4 tests: 4 passed (0 failed)
  · HMAC gate rejects forged/unsigned 401 (T-39-04) ×2
  · APPROVED → status UPDATE ×1
  · REJECTED → rejected_reason write ×1

pnpm exec vitest run \
  src/app/api/webhooks/meta/__tests__/ src/lib/meta/__tests__/ \
  src/lib/domain/__tests__/messages-provider.test.ts
→ 9 files, 49 tests: 49 passed (regression check on every adjacent suite)

pnpm exec tsc --noEmit  → 0 errors in the 4 modified source files
```

- **Full-suite regression** (`pnpm exec vitest run`, whole repo): **114 passed / 7 failed files (1143 pass / 4 fail tests)**. The only failing file is `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts` (RAG-prompt wording from the in-flight `somnio-v4-rag-generative` standalone, last touched by commits `15f8bbfd`/`dbef0081`). Proven NOT a regression: `git diff HEAD --name-only | grep few-shots` = 0 (none of this plan's files touch it); it is the same pre-existing failure documented in Plan 04/05 SUMMARYs. Zero new failures introduced by this plan.
- **Regla 6 / D-09:** `git diff 67c5ff0a~1 7df2706e -- src/lib/whatsapp/webhook-handler.ts` shows the `downloadAndUploadMedia` and `getExtensionFromMime` function definitions UNCHANGED; the 360dialog call path (apiKey resolution + `downloadAndUploadMedia(apiKey,...)`) is preserved verbatim inside the new `else` arm (only re-indented + the workspace `.select` gains `whatsapp_provider`). The existing `processWebhook` inbound-message path in route.ts is unchanged.

## Threat Surface / Mitigations Applied

| Threat ID | Disposition | How |
|-----------|-------------|-----|
| T-39-04 (forged template-status webhook) | mitigated | `verifyMetaHmac` over RAW body (Phase 38) gates ALL fields; the template-status branch runs only after verify — unsigned/forged → 401 (test-pinned ×2) |
| T-39-02 (cross-workspace) | mitigated | `workspace_id` resolved from `entry[].id` WABA id via `resolveByWabaId` / from `ctx.workspaceId` via `resolveByWorkspace`, never from arbitrary payload fields used as the write key |
| T-39-07 (SSRF / DoS inbound media) | mitigated | enforced inside `downloadAndRehostMedia` (Plan 03 — Meta-CDN host allowlist + per-type size cap); downloaded immediately on receipt |
| T-39-01 (token disclosure) | mitigated | Bearer/access token only in fetch headers; never logged in route, domain, or webhook-handler |

No new threat surface beyond the plan's `<threat_model>` register.

## Known Stubs

None. The WA-09 handler writes real UPDATEs through the domain layer; the inbound media branch wires the real `downloadAndRehostMedia` consumer. No placeholder/empty data paths introduced.

## TDD Gate Compliance

Task 1 is `tdd="true"`. The RED gate (`test(39-01)` — `template-status.test.ts` with 2 RED status-update cases + 2 GREEN HMAC guards) shipped in Plan 01. This plan's `feat(39-06)` commit `67c5ff0a` is the GREEN gate turning those 2 RED cases green (4/4) while preserving the 2 always-green HMAC guards. No REFACTOR commit needed. Task 2 is `type="auto"` (no separate RED test — verified by grep + full-suite green per the plan's `<verify>`).

## Self-Check: PASSED

Modified files (all FOUND, contain the expected symbols):
- `src/app/api/webhooks/meta/route.ts` — contains `message_template_status_update`, `applyTemplateStatusUpdate`, `resolveByWabaId`
- `src/lib/domain/whatsapp-templates.ts` — contains `applyTemplateStatusUpdate`
- `src/lib/meta/credentials.ts` — contains `resolveByWabaId`
- `src/lib/whatsapp/webhook-handler.ts` — contains `downloadAndRehostMedia`, `resolveByWorkspace`

Commits (all FOUND in git log on `main`):
- `67c5ff0a` feat(39-06): WA-09 template-status webhook push handler
- `7df2706e` feat(39-06): inbound Meta media rehost for meta_direct (WA-06)
