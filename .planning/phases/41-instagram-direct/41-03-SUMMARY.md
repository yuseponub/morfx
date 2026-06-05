---
phase: 41-instagram-direct
plan: 03
subsystem: api
tags: [instagram, meta-graph-api, oauth, server-action, domain-layer, page-token]

# Dependency graph
requires:
  - phase: 41-01
    provides: RED test scaffolds + IG identity contract (no dedicated RED for the connect action — verified by tsc + greps + 41-07 live smoke)
  - phase: 40-facebook-messenger-direct
    provides: messenger-connect.ts connect chain (exchange/getPageToken/subscribe), connectFacebookPage auth gate, upsertMetaAccount pageId pattern, resolveByWorkspace
provides:
  - resolveInstagramAccount(pageToken, pageId) — the single genuinely-new IG Graph call (resolves instagram_business_account off the connected Page)
  - upsertMetaAccount extended with igAccountId + igUsername (sole write path — Regla 3)
  - connectInstagramAccount server action (owner-gated, no-popup, reuses Page token, NEVER flips the IG provider — Regla 6)
affects: [41-04, 41-05, 41-06, 41-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IG rides on the connected Page: no independent OAuth — resolve instagram_business_account off the Page and reuse the SAME Page token (D-IG-04)"
    - "No-popup connect: read the connected-Page row via resolveByWorkspace (decrypted token) instead of a fresh FB.login when a Page row already exists"
    - "Sole write path extension: new channel-specific columns (ig_account_id/ig_username) added to BOTH UPDATE and INSERT blocks of upsertMetaAccount (Regla 3)"
    - "Regla 6 connect discipline: connect inserts the row but NEVER flips the provider column — traffic stays legacy until manual SQL cutover"

key-files:
  created:
    - src/lib/meta/instagram-connect.ts
  modified:
    - src/lib/domain/meta-accounts.ts
    - src/app/actions/meta-onboarding.ts

key-decisions:
  - "No-popup path (D-IG-04): connectInstagramAccount reads the workspace's connected-Page row + decrypted Page token and resolves IG off it — no fresh FB.login"
  - "Reuse the SAME Page token (re-encrypted) for the IG row — IG Send/receive rides the Page token"
  - "IG-not-linked error is operator-actionable → surfaced verbatim to the toast; any other failure stays a generic Spanish message (token never leaked)"
  - "uq_meta_ig UNIQUE conflict mapped to a clear Spanish cross-workspace error (mirror uq_meta_page)"

patterns-established:
  - "Pattern: channel sibling connect action clones the FB auth gate verbatim, diverges only in the body (resolve + upsert + subscribe)"
  - "Pattern: the only NEW Graph call is isolated in its own module; the rest of the chain is imported, not re-implemented"

requirements-completed: [IG-03]

# Metrics
duration: 14min
completed: 2026-06-05
---

# Phase 41 Plan 03: Instagram Connect Chain Summary

**`resolveInstagramAccount` (the single new IG Graph call) + `upsertMetaAccount` igAccountId/igUsername persistence + owner-gated `connectInstagramAccount` server action that reuses the connected Page token and NEVER flips the IG provider (Regla 6).**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-06-05T05:04:14Z
- **Completed:** 2026-06-05T05:18:04Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 extended)

## Accomplishments
- `resolveInstagramAccount(pageToken, pageId)` — the ONLY genuinely-new Graph call: `GET /{pageId}?fields=instagram_business_account{id,username}`, throws the clear Spanish error ("vincula una cuenta de Instagram Profesional a tu página de Facebook") when no IG account is linked. The rest of the connect chain is reused (not re-implemented) from `messenger-connect.ts`.
- `upsertMetaAccount` extended with `igAccountId?` + `igUsername?`, written in BOTH the UPDATE and INSERT column sets; `mapWriteError` now maps the `uq_meta_ig` UNIQUE conflict to a Spanish cross-workspace error. Remains the SOLE write path into `workspace_meta_accounts` (Regla 3).
- `connectInstagramAccount` server action: owner-gated (workspaceId session-derived, NEVER input), no-popup flow (reads the connected-Page row via `resolveByWorkspace`, resolves IG off it, re-encrypts and reuses the SAME Page token), upserts `channel='instagram'` with `ig_account_id`, and reuses `subscribeMessengerPage`. NEVER touches the IG provider column (Regla 6) — `grep instagram_provider == 0`.

## Task Commits

Each task was committed atomically:

1. **Task 1: instagram-connect.ts — resolveInstagramAccount** - `cc2938ea` (feat)
2. **Task 2: Extend upsertMetaAccount with igAccountId + igUsername** - `bc7f5f50` (feat)
3. **Task 3: connectInstagramAccount server action** - `abf806f8` (feat)

## Files Created/Modified
- `src/lib/meta/instagram-connect.ts` (NEW) - `resolveInstagramAccount` helper; resolves `instagram_business_account` off the connected Page, reusing the Page token; clear Spanish error if no IG linked. Server-only; never logs the token.
- `src/lib/domain/meta-accounts.ts` - `UpsertMetaAccountParams` gains `igAccountId?`/`igUsername?`; `ig_account_id` + `ig_username` written in both UPDATE + INSERT; `mapWriteError` maps `uq_meta_ig`.
- `src/app/actions/meta-onboarding.ts` - new `connectInstagramAccount()` action + imports of `resolveInstagramAccount` and `resolveByWorkspace`.

## Decisions Made
None beyond the plan — followed the plan's D-IG-04 no-popup flow and Regla 3 / Regla 6 discipline exactly as specified.

## Deviations from Plan

None - plan executed exactly as written.

(One cosmetic comment reword in `instagram-connect.ts` so the literal `getPageToken`/`subscribeMessengerPage` names did not appear — keeping the acceptance grep `== 0` strict. No behavior change; the functions are imported where used per the plan.)

## Issues Encountered
None. A shell-glob artifact (`?` in the `channel: ?'instagram'` grep) initially printed a misleading `0` count; re-running the grep correctly confirmed `channel: 'instagram'` is present (line 301). No code issue.

## Verification

- **All acceptance greps PASS:** instagram_business_account{id,username}=3, IG-not-linked Spanish error=1, getPageToken/subscribeMessengerPage re-impl=0, console.log=0 (Task 1); ig_account_id=4, ig_username=2, igAccountId=3, uq_meta_ig=1 (Task 2); connectInstagramAccount export=1, channel:'instagram'=1, instagram_provider=0, resolveInstagramAccount=2, owner-gate present (Task 3).
- **tsc:** 0 errors in all 3 of my files. (Project-wide tsc errors exist only in `__tests__/` for not-yet-built modules — `@/lib/instagram/webhook-handler` is 41-05 RED — plus pre-existing test-only issues; none touch my files.)
- **No Regla 6 regression:** `connect-facebook.test.ts` (which exercises the SAME two extended prod files) is **7/7 GREEN**, proving the FB path is byte-compatible after the extension.
- **messages-instagram.test.ts baseline unchanged:** `6 failed | 3 passed` — exactly the documented end-of-41-02 state. The 6 failures are the 41-04-owned RED tests for the `domain/messages.ts` meta_direct arm (a file I never touched); the 3 manychat parity guards stay GREEN.
- **No file deletions** introduced by the 3 commits; exactly the 3 planned files changed.

## Threat Model Coverage
- **T-41-03-01 (EoP):** owner gate copied verbatim; `workspaceId = auth.workspaceId` (session-derived, never input). ✓
- **T-41-03-02 (Info Disclosure):** Page token encrypted (`encryptToken`); never logged; action returns only `{ success, igUsername }`. ✓
- **T-41-03-03 (Regla 6):** action NEVER touches `instagram_provider` (grep == 0). ✓
- **T-41-03-04 (Tampering):** `uq_meta_ig` UNIQUE → `mapWriteError` Spanish conflict string. ✓

## Next Phase Readiness
- IG-03 connect persistence ready: a `channel='instagram'` row with `ig_account_id` is created on connect, reusing the Page token, with the provider untouched.
- Consumed downstream by 41-06 (Conectar Instagram UI calls `connectInstagramAccount`) and verified by 41-07 (live smoke A1/A2: `entry.id`==`ig_account_id` + whether a separate IG subscribe is needed).
- No blockers. (41-00 migration still AT its Regla-5 prod-apply checkpoint — independent of this plan, which does not read `instagram_provider`.)

## Self-Check: PASSED

- Files: FOUND instagram-connect.ts, meta-accounts.ts, meta-onboarding.ts, 41-03-SUMMARY.md
- Commits: FOUND cc2938ea, bc7f5f50, abf806f8

---
*Phase: 41-instagram-direct*
*Completed: 2026-06-05*
