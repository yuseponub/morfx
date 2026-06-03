---
phase: 38-embedded-signup-wa-inbound
plan: 01
subsystem: testing
tags: [vitest, tdd, hmac, webhook, meta, embedded-signup, oauth]

# Dependency graph
requires:
  - phase: 37.5-meta-verification-website
    provides: Meta Business Verification public site (unblocks Meta app + webhook config)
provides:
  - RED Vitest scaffold for inbound webhook HMAC verify (verifyMetaHmac contract)
  - RED Vitest scaffold for GET handshake (hub.challenge echo / 403)
  - RED Vitest scaffold for Embedded Signup code→BISUAT exchange (no-Bearer) + subscribeWaba
affects: [38-03-inbound-webhook-route, 38-04-embedded-signup-module]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED scaffold: tests authored before implementation, fail on missing module/route, turn GREEN as Plans 03/04 ship"
    - "Reference-copy pattern: when the real export does not exist yet, inline a verbatim clone of the analog verifier to pin the contract + it.todo() to flag the real-import wiring"

key-files:
  created:
    - src/app/api/webhooks/meta/__tests__/hmac.test.ts
    - src/app/api/webhooks/meta/__tests__/handshake.test.ts
    - src/lib/meta/__tests__/embedded-signup.test.ts
  modified: []

key-decisions:
  - "hmac.test.ts inlines a verbatim reference copy of verifyWhatsAppHmac (analog) to assert the contract NOW, plus it.todo('route exports verifyMetaHmac') so Plan 03 wires the real import"
  - "handshake.test.ts imports GET from ../route directly → intended RED (route built in Plan 03)"
  - "embedded-signup.test.ts imports from @/lib/meta/embedded-signup → intended RED (module built in Plan 04); subscribeWaba uses metaRequest(token, endpoint, options) signature matching api.ts:24"

patterns-established:
  - "Pattern: TDD Wave 0 RED scaffold — no production code modified, only __tests__/ files; RED is the success state"
  - "Pattern: no-Bearer exchange assertion — fetch mock call[1] init has no Authorization header + serialized init contains no /Bearer/i (Pitfall 6 / T-38-03)"

requirements-completed: [HOOK-01, HOOK-02, SIGNUP-02, SIGNUP-03]

# Metrics
duration: 3min
completed: 2026-06-03
---

# Phase 38 Plan 01: WA Inbound + Embedded Signup RED Test Scaffolds Summary

**Three RED Vitest scaffolds that pin the webhook HMAC verify, GET handshake, and Embedded Signup code→BISUAT exchange (no-Bearer) + subscribeWaba contracts before any implementation — satisfying the Nyquist rule for Plans 03/04.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-03T02:32:08Z
- **Completed:** 2026-06-03T02:34:59Z
- **Tasks:** 2
- **Files modified:** 3 (all created, all under `__tests__/`)

## Accomplishments
- `hmac.test.ts` (HOOK-02): valid/raw-hex/tampered/length-mismatch/wrong-secret assertions on `verifyMetaHmac` via verbatim reference copy of the analog verifier; `it.todo` flags Plan 03 real-export wiring. Threat coverage T-38-01 (spoofing) + T-38-02 (length-mismatch returns false WITHOUT throwing — no 500 retry storm).
- `handshake.test.ts` (HOOK-01): GET `/api/webhooks/meta` echoes `hub.challenge` as plain text + 200 on correct `META_WEBHOOK_VERIFY_TOKEN`; 403 on wrong token and on non-`subscribe` mode. RED until Plan 03 ships the route.
- `embedded-signup.test.ts` (SIGNUP-02/03): `exchangeCodeForBisuat` asserts oauth/access_token URL shape (client_id/secret/code), NO Authorization/Bearer header (Pitfall 6 / T-38-03), returns `access_token`, throws on `!ok` or missing token; `subscribeWaba` asserts `metaRequest(bisuat, '/{wabaId}/subscribed_apps', { method:'POST' })` + throws on `success:false`. RED until Plan 04 ships the module.

## Task Commits

Each task was committed atomically:

1. **Task 1: HMAC + handshake test scaffolds (HOOK-01, HOOK-02)** - `0b581385` (test)
2. **Task 2: Embedded Signup exchange + subscribe test scaffold (SIGNUP-02, SIGNUP-03)** - `58469d21` (test)

**Plan metadata:** (final docs commit — this SUMMARY + STATE + ROADMAP)

_TDD note: this is the RED phase only. GREEN commits land in Plans 03 (route) and 04 (embedded-signup module)._

## Files Created/Modified
- `src/app/api/webhooks/meta/__tests__/hmac.test.ts` - verifyMetaHmac contract via reference copy + Plan 03 wiring todo
- `src/app/api/webhooks/meta/__tests__/handshake.test.ts` - GET handshake challenge-echo/403 contract (imports ../route, RED)
- `src/lib/meta/__tests__/embedded-signup.test.ts` - exchange no-Bearer + subscribeWaba contracts (imports @/lib/meta/embedded-signup, RED)

## Decisions Made
- The HMAC verifier does not exist yet (Plan 03 ships it). Per the plan's explicit guidance, inlined a verbatim reference copy of `verifyWhatsAppHmac` so the contract assertions run GREEN now, and added `it.todo('route exports verifyMetaHmac for reuse')` so Plan 03 swaps the reference copy for the real import. This keeps the contract witnessed without coupling Wave 0 to an unbuilt route.
- For the no-Bearer assertion, checked both the fetch init headers (lowercased keys exclude `authorization`) AND a serialized-init regex `not.toMatch(/Bearer/i)` for defense in depth against Pitfall 6 / T-38-03.

## Deviations from Plan
None - plan executed exactly as written. Both tasks used the plan's prescribed RED approach (reference copy + it.todo for HMAC; direct imports of unbuilt route/module for handshake + embedded-signup).

## Issues Encountered
None. All three files load; the two intended RED suites fail exactly as designed (handshake: `Failed to load url ../route`; embedded-signup: `ERR_MODULE_NOT_FOUND` for `@/lib/meta/embedded-signup`). The hmac suite is GREEN-with-todo (5 passing reference-copy assertions + 1 todo).

## Verification Evidence
- `npx vitest run src/app/api/webhooks/meta/ src/lib/meta/__tests__/embedded-signup.test.ts` → 2 suites failed (intended RED), 1 passed; 5 passed + 1 todo.
- `git diff --stat HEAD~2 HEAD` → only 3 files, all under `__tests__/` (no production code modified — success criterion met).
- Grep acceptance: hmac timingSafeEqual/verifyMetaHmac/sha256=24, handshake hub.challenge=5 + META_WEBHOOK_VERIFY_TOKEN=2, embedded-signup oauth/access_token=3 + subscribed_apps=4 + Authorization/Bearer=6 (all ≥ required thresholds).

## User Setup Required
None - no external service configuration required (pure test scaffolding).

## Next Phase Readiness
- Plan 03 (inbound webhook route): must export `verifyMetaHmac` (turns hmac `it.todo` GREEN + handshake import GREEN) and implement GET handshake returning the `hub.challenge` plain-text body / 403.
- Plan 04 (embedded-signup module): must export `exchangeCodeForBisuat` (dedicated unauthenticated fetch, no Bearer) + `subscribeWaba` (reuses `metaRequest`) — turns embedded-signup suite GREEN.
- No blockers.

## Self-Check: PASSED
- FOUND: src/app/api/webhooks/meta/__tests__/hmac.test.ts
- FOUND: src/app/api/webhooks/meta/__tests__/handshake.test.ts
- FOUND: src/lib/meta/__tests__/embedded-signup.test.ts
- FOUND: commit 0b581385 (Task 1)
- FOUND: commit 58469d21 (Task 2)

---
*Phase: 38-embedded-signup-wa-inbound*
*Completed: 2026-06-03*
