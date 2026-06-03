---
phase: 38-embedded-signup-wa-inbound
plan: 03
subsystem: meta-inbound-webhook
tags: [meta, webhook, hmac, inbound, regla-3, regla-6, dedup, deliverable-1]

# Dependency graph
requires:
  - phase: 38-embedded-signup-wa-inbound
    plan: 01
    provides: RED Vitest scaffolds (hmac.test.ts + handshake.test.ts)
  - phase: 38-embedded-signup-wa-inbound
    plan: 02
    provides: workspaces.whatsapp_provider migration (provider flag foundation)
  - phase: 37-meta-app-setup-foundation
    plan: 02
    provides: resolveByPhoneNumberId + metaRequest + token encryption
provides:
  - "/api/webhooks/meta endpoint (GET handshake + POST events) — HMAC over raw body + resolveByPhoneNumberId + processWebhook reuse"
  - upsertMetaAccount domain helper (sole Regla-3 write path into workspace_meta_accounts)
affects: [38-04-embedded-signup-backend, 38-05-embedded-signup-frontend, 38-06-register-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "3-change clone of the 360dialog route: (a) signature ALWAYS required (META_APP_SECRET), (b) workspace via resolveByPhoneNumberId (no env fallback — ack-and-drop unknown), (c) GET handshake vs META_WEBHOOK_VERIFY_TOKEN"
    - "Raw-body-first: await request.text() BEFORE JSON.parse so HMAC verifies the exact bytes Meta signed (Pitfall 1)"
    - "verifyMetaHmac returns false (no throw) on length mismatch — no 500 retry storm (Pitfall 2)"
    - "Synchronous processing (processWebhook awaited before 200) for Vercel; wamid UNIQUE makes Meta retries idempotent (D-09/D-10)"

key-files:
  created:
    - src/app/api/webhooks/meta/route.ts
    - src/lib/domain/meta-accounts.ts
  modified: []

key-decisions:
  - "processWebhook reused verbatim (D-09) — inbox + agent dispatch + dedup identical to 360dialog; zero changes to webhook-handler.ts (Regla 6)"
  - "Unknown phone_number_id → ack-and-drop 200 (NO env fallback) to prevent cross-workspace leakage (T-38-08)"
  - "500 only when processWebhook throws (NOT stored) → Meta retries; wamid dedup makes the retry safe"

requirements-completed: [WA-05, HOOK-01, HOOK-02, HOOK-03, HOOK-04]

# Metrics
completed: 2026-06-03
---

# Phase 38 Plan 03: Meta inbound webhook endpoint + domain write path Summary

**`/api/webhooks/meta` (GET handshake + POST events) — a 3-change clone of the proven 360dialog route (HMAC over raw body with `META_APP_SECRET`, workspace via `resolveByPhoneNumberId`, handshake via `META_WEBHOOK_VERIFY_TOKEN`) that reuses `processWebhook` verbatim, plus the Regla-3 `upsertMetaAccount` domain helper — delivering deliverable 1 (inbound) with Somnio/360dialog byte-identical (Regla 6).**

## Accomplishments
- `src/app/api/webhooks/meta/route.ts`: `GET` echoes `hub.challenge` (200/text) on a correct `META_WEBHOOK_VERIFY_TOKEN`, 403 otherwise. `POST` reads the RAW body first (`request.text()`), verifies `X-Hub-Signature-256` (HMAC-SHA256, timing-safe, `META_APP_SECRET`) → 401 on invalid; parses, validates `object === 'whatsapp_business_account'`, resolves the workspace via `resolveByPhoneNumberId` (ack-and-drop 200 on unknown — no env fallback), then awaits `processWebhook(payload, workspaceId, phoneNumberId)` synchronously. `nodejs` runtime, `maxDuration = 60`. `verifyMetaHmac` exported so Plan 01's `hmac.test.ts` imports the real verifier.
- `src/lib/domain/meta-accounts.ts` (Regla 3): `upsertMetaAccount` — sole write path into `workspace_meta_accounts` via `createAdminClient`, workspace-scoped, INSERT-or-UPDATE the active `(workspace_id, channel)` row, never logs/decrypts the token, maps `uq_meta_phone` conflicts to a Spanish "número ya conectado en otro workspace" string. Plus `resolveByPhoneNumberId` consumed (read side lives in `credentials.ts`).
- Plan 01 scaffolds turned GREEN: `hmac.test.ts` (6/6) + `handshake.test.ts` (3/3).

## Task Commits
1. **upsertMetaAccount domain helper (Regla 3)** — `fecc58c1` (feat)
2. **Meta inbound webhook route (3-change clone of 360dialog)** — `01ce8ec0` (feat)

## Verification Evidence (incl. live smoke 2026-06-03)
- `npx vitest run src/app/api/webhooks/meta/` → handshake 3/3 + hmac 6/6 GREEN.
- **Live HOOK-01:** GET to `www.morfx.app/api/webhooks/meta` with the real verify_token → 200 + challenge echo; wrong token → 403.
- **Live HOOK-02 + WA-05:** an HMAC-signed (real `META_APP_SECRET`) synthetic payload → 200 `{received:true}` and the message stored in the test workspace via `resolveByPhoneNumberId`. After the number was activated (Plan 06), **real Meta inbound** ("Hola", `wamid.HBgM…`) arrives and is stored end-to-end.
- **Regla 6:** `src/lib/whatsapp/webhook-handler.ts` and `src/app/api/webhooks/whatsapp/route.ts` unchanged by this phase (last touch predates Phase 38). 360dialog/Somnio path byte-identical.

## Threat Surface
- **T-38-06/spoof** (forged webhook): signature ALWAYS required, timing-safe HMAC over raw body; invalid → 401.
- **T-38-08** (cross-workspace leak): unknown `phone_number_id` → ack-and-drop 200, never an env fallback that could route to the wrong workspace.
- **T-38-replay** (Meta retry up to 7×): `messages.wamid UNIQUE` dedups for free (HOOK-04 / D-10).

## Deferred
- A dedicated unit test exercising `processWebhook` twice with the same wamid (HOOK-04) needs a live DB; covered by the wamid UNIQUE constraint + the live smoke (single `messages` row). Tracked in `deferred-items.md`.

## Self-Check: PASSED
- FOUND: src/app/api/webhooks/meta/route.ts (commit 01ce8ec0)
- FOUND: src/lib/domain/meta-accounts.ts (commit fecc58c1)
- Regla 6 verified: 0 changes to webhook-handler.ts / 360dialog route

---
*Phase: 38-embedded-signup-wa-inbound · Completed: 2026-06-03*
