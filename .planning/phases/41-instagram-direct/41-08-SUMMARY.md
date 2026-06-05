---
phase: 41-instagram-direct
plan: 08
subsystem: api
tags: [meta, instagram, facebook-login, oauth, fb-sdk, token-refresh, regla-6, tdd]

# Dependency graph
requires:
  - phase: 41-03
    provides: connectInstagramAccount action + resolveInstagramAccount + meta-accounts igAccountId/igUsername
  - phase: 41-06
    provides: ConnectInstagram UI component (no-popup version, now rewritten)
  - phase: 40-facebook-messenger-direct
    provides: exchangeForLongLivedUserToken / getPageToken / subscribeMessengerPage / encryptToken / upsertMetaAccount / connect-facebook.tsx FB.login template
provides:
  - Dedicated IG FB.login popup (IG_LOGIN_SCOPE superset + auth_type:'rerequest', token-flow)
  - connectInstagramAccount({ accessToken }) 3-step token refresh (D-IG-12) — refreshes the
    canonical facebook-row Page token with the IG-scoped superset, then resolves + upserts the IG row
  - Working "Conectar Instagram" path that can resolve instagram_business_account (was the broken step)
affects: [41-07-cutover, instagram-direct-live-smoke]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated per-button FB.login with a button-owned superset scope constant (sibling of FB connect, never shares the FB scope) — Regla 6 isolation"
    - "Incremental OAuth: auth_type:'rerequest' re-prompts previously-absent scopes; Meta unions the new grant onto prior grants → refreshed Page token is a strict superset"
    - "Token-refresh of the canonical facebook-row access_token_encrypted as an additive superset (Messenger keeps working)"

key-files:
  created:
    - src/app/actions/__tests__/connect-instagram-oauth.test.ts
  modified:
    - src/app/actions/meta-onboarding.ts
    - src/components/settings/connect-instagram.tsx

key-decisions:
  - "Dropped the resolveByWorkspace precheck in connectInstagramAccount (the fresh login mints its own page token) and removed the now-unused import"
  - "Test uses the 'tu pagina de Facebook' (no-accent) message verbatim from the plan; the impl's .includes('vincula una cuenta de Instagram Profesional') substring check matches both accented/unaccented variants"

patterns-established:
  - "Button-owned scope constant (IG_LOGIN_SCOPE) so a new channel login never touches the FB connect scope (Regla 6 grep-verifiable: FB_LOGIN_SCOPE count == 0 in the IG file)"
  - "TDD RED-by-signature: a no-arg → ({ accessToken }) signature change makes the new-shape assertions fail until the impl is adapted"

requirements-completed: [IG-03, IG-04]

# Metrics
duration: ~20min
completed: 2026-06-05
---

# Phase 41 Plan 08: Dedicated Instagram OAuth Login Summary

**"Conectar Instagram" now runs its OWN FB.login (IG_LOGIN_SCOPE superset + auth_type:'rerequest', token-flow) and feeds the captured user token to connectInstagramAccount({ accessToken }), which refreshes the canonical Page token with the IG-scoped superset (D-IG-12) then resolves + persists the linked IG account — fixing the under-scoped stored token that blocked resolveInstagramAccount.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-05T10:10:00Z (approx)
- **Completed:** 2026-06-05T10:25:00Z (approx)
- **Tasks:** 3 (RED test → GREEN impl → component rewrite)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- **Root-cause fix:** the stored Varixcenter Page token was minted in an early Phase 40 smoke whose scope deliberately excluded the IG scopes, so it couldn't read `/me` and `resolveInstagramAccount` failed `(#100)`. The IG button now mints a fresh IG-scoped Page token.
- **Dedicated IG login (D-IG-10):** `connect-instagram.tsx` rewritten from the 41-06 no-popup version to mirror `connect-facebook.tsx`'s FB.login structure with its OWN `IG_LOGIN_SCOPE` (the 5 FB connect-chain scopes + `instagram_basic` + `instagram_manage_messages`) and `auth_type:'rerequest'`.
- **Token-refresh action (D-IG-12):** `connectInstagramAccount({ accessToken })` now runs the Phase 40 chain (`exchangeForLongLivedUserToken` → `getPageToken` → `encryptToken`), refreshes the canonical facebook-row `access_token_encrypted` with the fresh superset Page token (additive — Messenger keeps working), then `resolveInstagramAccount` + IG-row upsert + per-Page subscribe with the FRESH token.
- **Regla 6 / D-IG-11 intact:** `connect-facebook.tsx`, `FB_LOGIN_SCOPE`, `connectFacebookPage`, `connectWhatsAppNumber`, and `godentist-fb-ig` all byte-identical (grep + git-diff verified).

## Task Commits

Each task was committed atomically:

1. **Task 1: RED contract test** - `8f92e7b8` (test) — 5 failing assertions (token-flow / facebook-refresh / 2x-upsert / fresh-token-resolve / subscribe + graceful IG error); 5 passing guards (auth gates, no-flip, no-leak).
2. **Task 2: GREEN token-refresh impl** - `3b1fab78` (feat) — signature `() → ({ accessToken })`, 3-step refresh chain + IG resolve/upsert/subscribe with the fresh token; dropped unused `resolveByWorkspace` import.
3. **Task 3: component rewrite** - `4cfcf5d3` (feat) — own FB.login with `IG_LOGIN_SCOPE` + `auth_type:'rerequest'`, token-flow → `connectInstagramAccount({ accessToken })`.

_Two unrelated `docs(ui-redesign-editorial-core)` commits (`443a6a31`, `44955067`) interleaved from a concurrent session — additive, separate files, not part of this plan._

## Files Created/Modified
- `src/app/actions/__tests__/connect-instagram-oauth.test.ts` (created) — contract test for `connectInstagramAccount({ accessToken })`: token-flow, facebook-row refresh, 2x upsert (facebook then instagram), fresh-token IG resolve, subscribe, graceful no-IG error, Regla 6 no-flip, no token leak.
- `src/app/actions/meta-onboarding.ts` (modified) — `connectInstagramAccount` adapted to the dedicated-login token-refresh path; `connectFacebookPage`/`connectWhatsAppNumber` untouched.
- `src/components/settings/connect-instagram.tsx` (modified) — rewritten to launch its own IG FB.login (was no-popup); SDK loader cloned from connect-facebook; updated header + copy.

## Decisions Made
- **Dropped the `resolveByWorkspace('facebook')` precheck** inside `connectInstagramAccount` — the fresh IG login mints its own page token, so reading the stale stored row is unnecessary. Removed the now-unused import (Rule 3 — dangling unused import would fail tsc/lint). The plan explicitly left this to executor discretion ("keeping it is harmless OR drop it — your call; the test does not require it").
- **Test message variant:** the RED test pins the plan-specified `'...tu pagina de Facebook'` (no accent). The shipped `resolveInstagramAccount` actually throws the accented `'...tu página de Facebook'`, but the impl's catch uses `.includes('vincula una cuenta de Instagram Profesional')` (the accent-free prefix), so it surfaces BOTH variants verbatim. The test mocks `resolveInstagramAccount` directly, so the no-accent variant flows through correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed now-unused `resolveByWorkspace` import**
- **Found during:** Task 2 (GREEN impl)
- **Issue:** The new token-refresh chain mints its own page token and no longer calls `resolveByWorkspace`. The import was used ONLY by `connectInstagramAccount`, so it became a dangling unused import (tsc/lint failure).
- **Fix:** Removed `import { resolveByWorkspace } from '@/lib/meta/credentials'` (verified no other usage in the file via grep).
- **Files modified:** src/app/actions/meta-onboarding.ts
- **Verification:** `npx tsc --noEmit` 0 errors mentioning meta-onboarding.ts; FB test still 7/7 GREEN.
- **Committed in:** 3b1fab78 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The import removal is a direct consequence of the plan-specified body replacement (the plan said the precheck "OR be dropped"). No scope creep.

## Issues Encountered
- A `pkill -f "tsc --noEmit"` issued to clean up a redundant background tsc killed the shell mid-commit (exit 144), so the Task 2 commit was interrupted before it landed. Verified via `git log` + `git status` that meta-onboarding.ts was still unstaged, then re-ran the commit cleanly (`3b1fab78`). No work lost.

## User Setup Required
**External services require manual configuration** (one-time, App Dashboard — Q5, verified in the 41-07 A2 smoke, NOT in this plan's code):
- In the Meta App Dashboard, add/confirm the `instagram` webhook product and subscribe the `messages` field to `https://www.morfx.app/api/webhooks/meta` (www — apex 307-redirects drop the POST body). Required before IG DMs arrive even after the Page is subscribed.

## Next Phase Readiness
- The IG connect path is now code-complete. On reconnect of a real IG Professional account, `resolveInstagramAccount` gives the definitive verdict (whether Varixcenter's IG is actually Professional+linked — the live-only unknown D-IG-12).
- **NOT pushed** (Regla 1/5): pushing happens at the 41-07 cutover after the operator confirms the 41-00 prod migration. This plan only commits to `main` locally.
- Unblocks the 41-07 cutover live smoke (IG-01 / A2 linchpin) — `connectInstagramAccount` can now mint an IG-scoped token so the webhook can resolve `instagram_business_account` and receive IG DMs.

## Self-Check: PASSED

- Files created/modified exist on disk: connect-instagram-oauth.test.ts, meta-onboarding.ts, connect-instagram.tsx — all FOUND.
- Task commits in git log: `8f92e7b8` (RED), `3b1fab78` (GREEN), `4cfcf5d3` (component) — all FOUND.
- No stub markers in the 2 touched production files.

---
*Phase: 41-instagram-direct*
*Completed: 2026-06-05*
