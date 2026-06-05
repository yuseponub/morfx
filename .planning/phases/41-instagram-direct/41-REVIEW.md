---
phase: 41-instagram-direct
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/app/actions/meta-onboarding.ts
  - src/components/settings/connect-instagram.tsx
  - src/app/actions/__tests__/connect-instagram-oauth.test.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-06-05
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the Plan 41-08 diff (base `9959d717..HEAD`): dedicated Instagram OAuth login + canonical Page-token refresh. The change is correctly confined to `connectInstagramAccount` (server action) and the new `ConnectInstagram` client component, plus a TDD test scaffold. The previous no-popup / stored-token path (`resolveByWorkspace`) is fully removed and replaced with the Phase 40 token chain (`exchangeForLongLivedUserToken` → `getPageToken`) run with a freshly-granted IG-scoped user token.

Project-specific constraints all verified:
- **Regla 3** — no direct `createAdminClient` / `@supabase/supabase-js` in either source file; both upserts (facebook refresh + instagram) go through the domain `upsertMetaAccount`. The only direct DB read is the `workspace_members` role gate. PASS.
- **Regla 6** — `connect-facebook.tsx`, `FB_LOGIN_SCOPE`, and `connectFacebookPage` are byte-identical (git diff confirms the diff is confined to `connectInstagramAccount` + the removal of one unused import). The IG button uses its own `IG_LOGIN_SCOPE` constant. No `workspaces.update` / provider flip. PASS.
- **Token-flow security** — the browser only captures the short-lived USER token; the never-expiring Page token is minted server-side and never returned in the envelope (the result is `{ success, igUsername }`) nor logged. The catch logs the error object but not a plaintext token by design. PASS (one residual note below — IN-02).
- **Owner gate / session-derived workspaceId** — `workspaceId = auth.workspaceId` (never from input); owner role enforced server-side. PASS.

No critical or correctness-breaking issues. One warning (dead state in the client component that could mislead future maintainers about token retention) and three info-level items.

## Warnings

### WR-01: `tokenRef` is dead state — written but never read

**File:** `src/components/settings/connect-instagram.tsx:72,137,144`
**Issue:** `tokenRef` is created (line 72), reset to `null` (line 137), and assigned the captured access token (line 144), but its `.current` value is never read anywhere in the component. `handleConnect(accessToken)` is invoked with the token passed directly as a parameter, so the ref serves no functional purpose. Beyond being dead code, retaining the short-lived USER token in a component-scoped ref is mildly counter to the security posture documented in the header comment ("The browser only ever sees the short-lived USER token it captured ... This component never sees nor logs any Page token"). It is not a leak (the ref is never serialized, logged, or sent anywhere), but storing the token in long-lived component state with no consumer is unnecessary surface area and can mislead a future maintainer into thinking the ref is load-bearing.
**Fix:** Remove the ref entirely and pass the token straight through:
```tsx
// delete: const tokenRef = useRef<string | null>(null)

const launch = () => {
  if (!window.FB) {
    toast.error('El SDK de Facebook aún no cargó. Intenta de nuevo.')
    return
  }
  window.FB.login(
    (response: any) => {
      const accessToken = response?.authResponse?.accessToken
      if (accessToken) handleConnect(accessToken)
    },
    { scope: IG_LOGIN_SCOPE, auth_type: 'rerequest' }
  )
}
```
If the ref is intentionally kept as a sibling-parity placeholder with `connect-facebook.tsx`, add a comment saying so; otherwise it reads as a bug.

## Info

### IN-01: No re-entrancy guard on `launch` while a connect is in flight

**File:** `src/components/settings/connect-instagram.tsx:130-163`
**Issue:** The `Button` is disabled while `isPending` is true, which prevents most double-clicks. However, `launch` itself opens the FB popup synchronously and does not check `isPending` before opening. The window between popup-open and the `startTransition` firing is brief, but a user who opens the popup, leaves it open, and somehow re-triggers (e.g., keyboard) could stack two `FB.login` callbacks. Low practical risk because the button disables once `handleConnect` runs.
**Fix:** Early-return from `launch` if `isPending`:
```tsx
const launch = () => {
  if (isPending) return
  if (!window.FB) { /* ... */ }
  // ...
}
```

### IN-02: Catch logs the full error object — confirm no token in the thrown Meta error

**File:** `src/app/actions/meta-onboarding.ts:358`
**Issue:** `console.error('[meta-onboarding] connect Instagram account failed:', e)` logs the entire error. This mirrors the Facebook path (line 231) and the comment there documents the intent (server-side diagnosis). The Page token is never explicitly logged, but if `getPageToken` / `subscribeMessengerPage` / `resolveInstagramAccount` ever embed a token or `access_token` query param in a thrown error message, it would land in server logs. This is the same pattern already shipped for Facebook in Phase 40, so it is not a regression — flagging only so the team is aware the guarantee depends on the downstream lib not stuffing tokens into error messages.
**Fix:** No change required if the meta lib error messages are already token-redacted (Phase 40 `getPageToken` uses a redacted `probe=[...]` breakdown per the comment at line 196). Optionally log `e instanceof Error ? e.message : String(e)` instead of the raw object to reduce the chance of capturing an attached `config`/`response` carrying a token.

### IN-03: `getPageToken` picks the first Page (single-Page V1) — silent for multi-Page accounts

**File:** `src/app/actions/meta-onboarding.ts:306` (consumes `getPageToken`, defined in `src/lib/meta/messenger-connect.ts:173`)
**Issue:** `getPageToken` returns the first Page from `/me/accounts` (documented "V1 single-Page" in `messenger-connect.ts:118`). For an owner whose user manages multiple Pages, the IG connect could silently resolve the IG account of the wrong Page (whichever Meta returns first), which may differ from the Page chosen during the original Facebook connect. This is pre-existing Phase 40 behavior reused verbatim (D-IG-12), not introduced by 41-08, and out of scope to fix here — but the IG refresh now overwrites the canonical `facebook` row's `pageId` + token (line 315-323) with whatever `getPageToken` returns, so a multi-Page user could have the FB row's `page_id` flipped to a different Page than originally connected.
**Fix:** Out of scope for 41-08. If multi-Page support is ever added, `getPageToken` should accept the expected `pageId` (from the existing `facebook` row) and select that Page rather than the first, so the IG refresh cannot retarget the canonical row. Track as tech debt.

---

_Reviewed: 2026-06-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
