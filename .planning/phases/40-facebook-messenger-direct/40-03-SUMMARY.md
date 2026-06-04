---
phase: 40-facebook-messenger-direct
plan: 03
subsystem: api
tags: [meta, messenger, fb-login, oauth, connect, onboarding, signup-04, tdd]

# Dependency graph
requires:
  - phase: 40-01
    provides: "RED contract test (connect-facebook.test.ts) pinning SIGNUP-04 connect chain"
  - phase: 40-00
    provides: "messenger_provider migration (Regla 5 ordering — this plan does NOT read it, depends_on enforces sequencing)"
  - phase: 38-embedded-signup-wa-inbound
    provides: "connectWhatsAppNumber auth gate + embedded-signup SERVER-ONLY discipline + encryptToken + upsertMetaAccount"
provides:
  - "exchangeForLongLivedUserToken / getPageToken / subscribeMessengerPage (messenger-connect.ts) — FB-Login token chain"
  - "connectFacebookPage() owner-only server action (meta-onboarding.ts)"
  - "upsertMetaAccount channel:'facebook' + pageId write path (meta-accounts.ts)"
affects: [40-04, 40-05, 40-07, 40-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Classic FB-Login 3-step chain (short/code → long-lived user token → /me/accounts Page token → per-Page subscribed_apps) — diverges from P38 Embedded Signup BISUAT exchange"
    - "Page token derived from a LONG-LIVED user token never expires (Pitfall 3)"
    - "Per-Page subscribe with subscribed_fields=messages,messaging_postbacks (Pitfall 4 — distinct from WABA subscribe)"
    - "Connect inserts the account row is_active but NEVER flips the Messenger provider (Regla 6 — manual SQL flip in Plan 08)"

key-files:
  created:
    - src/lib/meta/messenger-connect.ts
  modified:
    - src/lib/domain/meta-accounts.ts
    - src/app/actions/meta-onboarding.ts

key-decisions:
  - "getPageToken returns { pageId, pageName, accessToken } — accessToken satisfies the RED mock shape; pageName feeds the success envelope"
  - "OAuth exchange uses a dedicated unauthenticated fetch (no Bearer), mirroring embedded-signup.ts; subscribe + me/accounts reuse the Bearer-authenticated metaRequest"
  - "connectFacebookPage returns only { success, pageName } — plaintext Page token never returned, never logged (T-40-03-03)"

patterns-established:
  - "messenger-connect.ts is the SERVER-ONLY sibling of embedded-signup.ts for the FB Page connect divergence"
  - "page_id UNIQUE conflict (uq_meta_page) mapped to a Spanish toast string in mapWriteError"

requirements-completed: []  # SIGNUP-04 consumed end-to-end by the gated cutover smoke in Plan 40-08 — keep Pending until then

# Metrics
duration: 13min
completed: 2026-06-04
---

# Phase 40 Plan 03: SIGNUP-04 Facebook Page Connect Chain Summary

**The owner-only Facebook Page connect chain: a server-only FB-Login token sibling (short/code → long-lived user token → /me/accounts Page token → per-Page subscribe), an extended upsertMetaAccount for channel:'facebook' + page_id, and the connectFacebookPage() server action — encrypted Page token at rest, no Messenger-provider flip (Regla 6). connect-facebook.test.ts is now GREEN 6/6.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-04T10:08:00Z
- **Completed:** 2026-06-04T10:21:00Z
- **Tasks:** 3
- **Files:** 3 (1 created, 2 modified)

## Accomplishments
- `src/lib/meta/messenger-connect.ts` (130 lines, SERVER-ONLY): `exchangeForLongLivedUserToken` (dedicated unauthenticated `fb_exchange_token` fetch, no Bearer), `getPageToken` (`GET /me/accounts?fields=id,name,access_token` via metaRequest → never-expiring Page token), `subscribeMessengerPage` (`POST /{pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks` with the Page token).
- `src/lib/domain/meta-accounts.ts`: `UpsertMetaAccountParams` gains `pageId?: string | null`; `page_id` written in BOTH the UPDATE and INSERT blocks; `mapWriteError` maps the `uq_meta_page` UNIQUE conflict to a Spanish string. Regla 3 sole write path; `channel:'facebook'` leaves `waba_id`/`phone_number_id` null. No new migration (column + UNIQUE already in prod via 20260401100000).
- `src/app/actions/meta-onboarding.ts`: `connectFacebookPage({ code })` — auth gate copied verbatim from `connectWhatsAppNumber` (owner-only; `workspaceId` session-derived, never from input), then the divergent body: `exchangeForLongLivedUserToken` → `getPageToken` → `encryptToken` (AES-256-GCM) → `upsertMetaAccount({ channel:'facebook', pageId, ... })` → `subscribeMessengerPage`. Returns `{ success, pageName }`; generic Spanish error on any failure.
- The Wave-1 RED file from Plan 40-01 is now GREEN: `connect-facebook.test.ts` **6/6**.

## Task Commits

Each task was committed atomically (plain git — gsd-sdk unavailable):

1. **Task 1: GREEN — messenger-connect.ts (token chain + Page subscribe)** - `edb41b0b` (feat)
2. **Task 2: GREEN — upsertMetaAccount channel:'facebook' + pageId** - `0e893bc1` (feat)
3. **Task 3: GREEN — connectFacebookPage() server action (SIGNUP-04)** - `143ab77f` (feat)

_Note: `type: tdd` GREEN plan — the RED was Plan 40-01; each task is a single feat commit turning the contract GREEN (no separate test commit, no refactor needed)._

## Files Created/Modified
- `src/lib/meta/messenger-connect.ts` (NEW) - SERVER-ONLY FB-Login token chain: long-lived exchange (Pitfall 3), Page-token derivation, per-Page subscribe with fields (Pitfall 4). Never logs tokens.
- `src/lib/domain/meta-accounts.ts` (MODIFIED) - `pageId` param + `page_id` persisted in UPDATE/INSERT + `uq_meta_page` Spanish conflict string.
- `src/app/actions/meta-onboarding.ts` (MODIFIED) - `connectFacebookPage()` owner-only action with the divergent token chain; encrypted Page token; NO provider flip.

## Decisions Made
- `getPageToken` returns `{ pageId, pageName, accessToken }` so the same value satisfies the RED mock's `{ pageId, accessToken }` shape AND supplies `pageName` for the success envelope.
- The OAuth long-lived exchange uses a dedicated unauthenticated `fetch` (no Bearer header) mirroring `embedded-signup.ts`; `/me/accounts` and `subscribed_apps` reuse the Bearer-authenticated `metaRequest`.

## Deviations from Plan

None — plan executed exactly as written.

(Minor: the action's Regla-6 explanatory comment originally contained the literal column name `messenger_provider`; reworded to "the Messenger provider" / "that column" so the acceptance gate `grep -c "messenger_provider" == 0` passes. No code/behavior change — there is no write to the provider column; the test's `workspacesUpdate not.toHaveBeenCalled` assertion passes.)

## Issues Encountered
- None. All three RED behaviors turned GREEN on first implementation; `tsc --noEmit` reported 0 errors in the three touched files.

## Verification

- `npx vitest run src/app/actions/__tests__/connect-facebook.test.ts` → **Test Files 1 passed (1), Tests 6 passed (6)** (was 6 failed before — `connectFacebookPage is not a function`).
- Task 1 gates: `subscribeMessengerPage` export=1; `fb_exchange_token`=3 (≥1); `subscribed_fields=messages`=3 (≥1); `me/accounts`=5 (≥1); `console.log`=0.
- Task 2 gates: `pageId`=3; `page_id`=4 (≥2, both UPDATE+INSERT); `uq_meta_page` in mapWriteError=1.
- Task 3 gates: `connectFacebookPage` export=1; `channel: 'facebook'`=1; `subscribeMessengerPage(pageToken`=1; owner gate `member.role !== 'owner'`=2; `messenger_provider`=0 (Regla 6).
- **Regla 6:** `git diff --stat src/lib/channels/registry.ts src/lib/channels/manychat-sender.ts` → EMPTY; no write to `workspaces.messenger_provider` anywhere in the action (verified by grep AND the test's `workspacesUpdate` not-called assertion).
- `tsc --noEmit` → 0 errors in the 3 touched files. No package installed; no migration.

## User Setup Required
- **meta-app dashboard scope (pages_messaging):** The Facebook app must request the `pages_messaging` permission (and the IG messaging scope for D-02 forward-compat) under **Meta App Dashboard → Facebook Login → Permissions**, and `META_APP_ID` / `META_APP_SECRET` must be set. This is the same FB Login product already configured for WhatsApp Embedded Signup; it is surfaced as a connect-time prerequisite (the FB-Login popup in Plan 40-07 passes `scope:'pages_messaging,...'`). A denied IG scope must NOT block the FB flow — this connect chain only touches the Page.

## Next Phase Readiness
- Connect primitives ready for the ConnectFacebook UI (Plan 40-07) — the popup hands a `code` to `connectFacebookPage`.
- `resolveByPageId` (existing) reads the encrypted Page token stored by this plan for the inbound webhook (Plan 40-05) and the domain send chokepoint (Plan 40-04).
- SIGNUP-04 requirement remains Pending — consumed end-to-end by the gated cutover smoke (Plan 40-08).

## Self-Check: PASSED
- `src/lib/meta/messenger-connect.ts` — FOUND
- `src/lib/domain/meta-accounts.ts` (pageId) — FOUND
- `src/app/actions/meta-onboarding.ts` (connectFacebookPage) — FOUND
- Commit `edb41b0b` — FOUND
- Commit `0e893bc1` — FOUND
- Commit `143ab77f` — FOUND

---
*Phase: 40-facebook-messenger-direct*
*Completed: 2026-06-04*
