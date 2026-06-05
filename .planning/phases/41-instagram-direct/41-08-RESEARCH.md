# Phase 41 · Plan 41-08 — Dedicated Instagram OAuth Login — Research (SUPPLEMENT)

**Researched:** 2026-06-05
**Domain:** Meta Facebook Login (web JS SDK v22.0) incremental authorization → IG-scoped Page token → `resolveInstagramAccount`
**Confidence:** HIGH (codebase grounded + Meta docs cited; one MEDIUM live-only item: whether Varixcenter's IG is actually Professional+linked)
**Scope:** This file SUPPLEMENTS `41-RESEARCH.md` (do NOT replace it). It corrects the flawed "IG rides on the SAME stored Page token" premise **for the CONNECT flow specifically** (41-RESEARCH lines 217, 350-366). The send/receive/webhook research in 41-RESEARCH stays valid — only the token-acquisition story for the IG button changes.

---

<user_constraints>
## User Constraints (from 41-CONTEXT.md Addendum — Plan 41-08)

### Locked Decisions (research HONORS these — does not relitigate)
- **D-IG-10 — Dedicated IG login (Option B), NOT shared FB scope.** "Conectar Instagram" runs its OWN `FB.login` requesting the IG scopes (incremental auth) and refreshes the stored Page token. REJECTED: adding `instagram_*` to the shared `FB_LOGIN_SCOPE` (would re-introduce the IG-selection screen for ALL FB connects — exactly what Phase 40 D-02 deferred; would block FB-only businesses without IG).
- **D-IG-11 — Regla 6 / additive.** 41-08 must NOT break the FB Messenger connect or the FB-only flow. `connect-facebook.tsx` + `connectFacebookPage` stay **BYTE-IDENTICAL**. Only the IG button (`connect-instagram.tsx`) + `connectInstagramAccount` change.
- **D-IG-12 — Token refresh path.** The dedicated IG login yields a fresh USER token → reuse Phase 40 helpers (`exchangeForLongLivedUserToken` + `getPageToken`) → obtain a Page token that now carries the IG scopes → re-store (UPDATE `access_token_encrypted` on the connected facebook row, additive/superset — Messenger keeps working) → `resolveInstagramAccount` → upsert instagram account.
- **Still UNKNOWN (resolves post-deploy):** whether Varixcenter's IG account is actually Professional+linked. The broken token blocked the check. Once 41-08 ships and the user reconnects, `resolveInstagramAccount` gives the definitive verdict.

### Claude's Discretion (researcher recommendations below)
- Token-flow vs code-flow in the new IG `FB.login` → **REUSE the connect-facebook token-flow verbatim** (see Q6).
- Whether to UPDATE the existing facebook row's token, or also store on the instagram row → **UPDATE the facebook row (canonical source for both); the IG row re-encrypts the same superset token** (see Q2).
- Whether `auth_type` is `'reauthorize'` (FB connect) or `'rerequest'` (IG button) → **use `'rerequest'` for the IG button** (see Q1).

### Out of scope (ignore)
- Migrating `godentist-fb-ig`; AI agents on IG; countdown timer; templates/marketing on IG; fuzzy contact matching. (All per 41-CONTEXT deferred list — untouched by 41-08.)
</user_constraints>

<phase_requirements>
## Phase Requirements addressed by 41-08

| ID | Description | 41-08 Support |
|----|-------------|---------------|
| IG-03 | Connect IG (resolve `instagram_business_account` + store `ig_account_id`) | 41-08 is the **fix** that makes `resolveInstagramAccount` actually succeed: it mints a Page token that carries `instagram_basic`+`pages_read_engagement`+`pages_show_list` so the resolve edge stops failing `(#100)`/`(#10)`. |
| IG-01 | Receive DMs via unified webhook | A2 linchpin RESOLVED here: the existing `subscribeMessengerPage` (Page `subscribed_apps?subscribed_fields=messages,...`) **does** deliver IG DMs (object `instagram`) — provided the token holds `pages_manage_metadata` AND the App Dashboard has the `instagram` product/`messages` field configured (one-time). Unblocks the 41-07 A2 smoke. |
</phase_requirements>

## Summary

The verified root cause (proven via `scripts/_debug-ig-link.ts` against the REAL stored Varixcenter Page token): **the stored Page token was minted in an early Phase 40 smoke whose `FB_LOGIN_SCOPE` deliberately excluded the IG scopes** (`connect-facebook.tsx:65-66`). App-level **advanced-access approval** of `instagram_basic`/`instagram_manage_messages` (the 9 approved Meta perms) is NOT the same as those scopes being **GRANTED to a specific token at `FB.login` time**. A Page token only carries the scopes the user granted in the login that produced it. So `resolveInstagramAccount` (`GET /{pageId}?fields=instagram_business_account{id,username}`, which needs `instagram_basic`+`pages_read_engagement`+`pages_show_list` on the token) fails even when the IG account IS professional+linked. The debug script even showed the stored token can't read `/me` → `(#100) requires 'pages_read_engagement'` — it's a stale/under-scoped token.

**The fix (D-IG-10/12):** give the "Conectar Instagram" button its OWN `FB.login` popup that requests the **IG superset scope** (the existing 5 FB scopes + `instagram_basic` + `instagram_manage_messages`), with `auth_type:'rerequest'` so previously-declined IG scopes are re-prompted. Meta **unions** the new grant onto prior grants — it never drops the Messenger scopes — so the resulting Page token is a strict superset and Messenger keeps working (Regla 6 / D-IG-11). Then reuse the Phase 40 token chain verbatim (`exchangeForLongLivedUserToken` → `getPageToken`), UPDATE the facebook row's `access_token_encrypted` with the new superset Page token, run `resolveInstagramAccount`, and upsert the instagram row reusing that same token.

**Primary recommendation:** Make `connect-instagram.tsx` a near-clone of `connect-facebook.tsx` (its OWN SDK-loaded `FB.login`, token-flow, `auth_type:'rerequest'`, dedicated `IG_LOGIN_SCOPE` constant) that passes the captured user token to a modified `connectInstagramAccount({ accessToken })`. The action does the FB token chain, UPDATEs the facebook row token (refresh), then runs the existing IG resolve + upsert (unchanged from current 41-06 code below the token step). `connect-facebook.tsx` + `connectFacebookPage` are NOT touched. The App Dashboard one-time `instagram`→`messages` webhook config is an operator step (document it).

---

## Research Questions — Answers

### Q1. Incremental permissions on `FB.login` (web JS SDK v22.0): union or replace? Is `rerequest` needed?

**Answer (HIGH):** Granted scopes **UNION** — additional permissions requested in a later `FB.login` are *added* to previously-granted permissions, never replacing them. [CITED: developers.facebook.com/docs/facebook-login/web/permissions/ — "the new permission … was added to the list of granted permissions"]

**`auth_type:'rerequest'` is REQUIRED when the user previously DECLINED a scope** — once declined, the login dialog will NOT re-ask unless you explicitly pass `auth_type:'rerequest'`. [CITED: same doc — "Once a permission is declined, the login dialog won't request it again unless you explicitly tell it to"; FB.login reference shows `{ scope: '…', auth_type: 'rerequest' }`]

**Implication for 41-08:**
- The IG button MUST request the **full superset** (the 5 FB scopes the connect chain needs + the 2 IG scopes), because the new login produces a fresh token and `getPageToken`/`/me/accounts` still needs `pages_show_list`+`pages_read_engagement`+`pages_manage_metadata`. Requesting only the 2 IG scopes would yield a token missing the page scopes.
- Use **`auth_type:'rerequest'`** (NOT `'reauthorize'`). The FB connect uses `'reauthorize'` to force the Page asset-picker (40-08 bug). For the IG button the Page is already selected/connected; the goal is to re-prompt the previously-absent IG scopes — `'rerequest'` is the documented tool for exactly that. (If the live popup ever skips the page-picker and `getPageToken` returns count=0, fall back to `'reauthorize'` — documented contingency, low risk since the page is already connected.)
- Optionally set `return_scopes:true` to read `authResponse.grantedScopes` client-side for a friendlier "Instagram permission not granted" message — but the server-side `resolveInstagramAccount` error already covers the failure path, so this is nice-to-have, not required.

### Q2. Token refresh → IG-scoped Page token: exact chain + is re-storing the right move?

**Answer (HIGH for the chain; MEDIUM only on the live IG-linked unknown):**

After the dedicated IG login captures a short-lived USER token, the chain is **identical to `connectFacebookPage`**:
1. `exchangeForLongLivedUserToken(shortLivedUserToken)` → long-lived user token (~60d). [VERIFIED: messenger-connect.ts:94-111]
2. `getPageToken(longLivedUserToken)` → `{ pageId, pageName, accessToken }` — a **never-expiring Page token whose scopes reflect the NEW grant** (a Page token inherits the user-grant context of the user token it was derived from). [VERIFIED: messenger-connect.ts:173-229]
3. `encryptToken(pageToken)` then **UPDATE the connected facebook row's `access_token_encrypted`** via `upsertMetaAccount({ channel:'facebook', pageId, accessTokenEncrypted, isActive:true })`. Because `upsertMetaAccount` keys on `(workspace_id, channel)` and the facebook row already exists, this is an UPDATE (overwrites the stale token with the superset token). [VERIFIED: meta-accounts.ts:90-112 — UPDATE path overwrites `access_token_encrypted`].
4. Run `resolveInstagramAccount(pageToken, pageId)` (now succeeds — token has the IG scopes).
5. `upsertMetaAccount({ channel:'instagram', pageId, igAccountId, igUsername, accessTokenEncrypted, isActive:true })` — the IG row re-encrypts the SAME superset token.

**Is re-storing the right move? YES, and it is additive/superset (Regla 6 safe).** The new grant unions the IG scopes onto the existing Messenger scopes (Q1), so the refreshed Page token is a **strict superset** of the old one — every Messenger send/receive that worked before still works. Overwriting the facebook row's token with the superset cannot regress Messenger; it only ADDS capability. The facebook row stays the canonical token source (both `resolveByWorkspace(ws,'facebook')` and the IG row carry the same superset value).

**Why UPDATE the facebook row (not just the IG row):** the current `connectInstagramAccount` reads `resolveByWorkspace(workspaceId, 'facebook')` to get the token (meta-onboarding.ts:286). If only the IG row were refreshed, the facebook row would keep the stale token and any future `resolveInstagramAccount` (re-connect) or Messenger debug would still see the broken token. Refreshing the facebook row is the clean canonical fix. The IG row gets a copy (consistent with current code at meta-onboarding.ts:295).

### Q3. Exact scope string for IG messaging via the FB-Page path

**Answer (HIGH):** Minimal set to (a) read `instagram_business_account` on the Page and (b) send/receive IG DMs through the Page:

| Scope | Needed for | Source |
|-------|-----------|--------|
| `pages_show_list` | `/me/accounts` lists Pages + delivers the Page token (`getPageToken`) | connect-facebook.tsx:58-60 (verified in 40-08 smoke) |
| `pages_read_engagement` | reading Page node fields incl. `instagram_business_account`; the stale token failed `(#100) requires 'pages_read_engagement'` | debug script verdict + connect-facebook.tsx:66 |
| `pages_manage_metadata` | `POST /{pageId}/subscribed_apps` (Page webhook subscribe) — REQUIRED for IG message webhooks too (Q5) | messenger-connect.ts:243; [CITED: messenger-platform/instagram/features/webhook — "instagram_basic, instagram_manage_messages and pages_manage_metadata are mandatory"] |
| `pages_messaging` | send/receive on behalf of the Page (Messenger + IG) | [CITED: IG messaging permissions search] |
| `instagram_basic` | read the linked IG account + IGSID profile (`name`,`username`) | [CITED: messenger-platform/instagram — mandatory] |
| `instagram_manage_messages` | send/receive IG DMs | [CITED: messenger-platform/instagram — mandatory] |
| `business_management` | Business Portfolio page fallback (`findPageViaBusinesses`) | connect-facebook.tsx:66 (kept for parity) |

**Recommended `IG_LOGIN_SCOPE` constant (superset = current `FB_LOGIN_SCOPE` + 2 IG scopes):**
```
pages_show_list,pages_messaging,pages_manage_metadata,business_management,pages_read_engagement,instagram_basic,instagram_manage_messages
```
This is `FB_LOGIN_SCOPE` (connect-facebook.tsx:65-66) verbatim + `,instagram_basic,instagram_manage_messages`. Define it as a NEW constant in `connect-instagram.tsx` — do NOT touch `FB_LOGIN_SCOPE` (Regla 6 / D-IG-11). [Note: Meta's docs phrase the messaging-mandatory set as `instagram_basic`+`instagram_manage_messages`+`pages_manage_metadata`; `pages_messaging`+`pages_show_list`+`pages_read_engagement` are what OUR connect CHAIN additionally needs to mint+subscribe the Page token — so the superset is correct and minimal.]

### Q4. No-IG graceful failure (never blocks)

**Answer (HIGH — already handled, two layers):**
- **At `FB.login`:** Because IG scopes are requested incrementally with the page scopes, a business with NO IG can still complete the login and grant the page scopes (Meta does not hard-block the dialog for a missing linked IG — the IG scopes simply have no IG to act on). The popup succeeds; the IG resolve fails downstream with the clear message. This mirrors Phase 40 D-02 intent (the IG scope was always "additive, never blocks").
- **At `resolveInstagramAccount`:** already throws the exact Spanish error `'vincula una cuenta de Instagram Profesional a tu página de Facebook'` when `instagram_business_account` is absent (instagram-connect.ts:40-43), and `connectInstagramAccount` already surfaces that message verbatim to the toast (meta-onboarding.ts:322-326) while keeping any other failure generic. **No change needed to the graceful-failure path** — 41-08 only ADDS the token-refresh steps before the existing resolve.
- **3-case diagnosis already exists** in `scripts/_debug-ig-link.ts` (CASE 1 no IG / CASE 2 connected via Accounts Center only / CASE 3 token missing scope). Post-deploy, if the reconnect still fails, run that script to classify — CASE 3 will be gone after 41-08 (the new token has the scopes); a remaining CASE 1/2 is a user-side IG-linking action, not a code bug.

### Q5. A2 webhook subscribe linchpin — does Page `subscribed_apps` deliver IG DMs?

**Answer (HIGH — RESOLVED from doc, was MEDIUM in 41-RESEARCH):**
**YES.** IG DMs are delivered via the **Messenger Platform**: you subscribe at the **Page level** with `POST /{page-id}/subscribed_apps?subscribed_fields=messages` and the webhook arrives with **`object: "instagram"`**. [CITED: developers.facebook.com/docs/messenger-platform/instagram/features/webhook]

Definitive points from the doc:
- **No separate per-Instagram-account subscribe call is required** beyond the Page subscription.
- The token used for the subscribe must carry **`pages_manage_metadata`** (plus `instagram_basic`+`instagram_manage_messages` for the data). The current under-scoped stored token is exactly why a re-subscribe via the new token matters.
- The **app must be published** to receive webhooks (it is — FB Messenger is live).
- The **App Dashboard must have the `instagram` product configured with the `messages` webhook field** pointing at `https://www.morfx.app/api/webhooks/meta` (www — apex 307-redirects, drops POST body). This is a **one-time operator/App-Dashboard step**, NOT code. The Page `subscribed_apps` call alone is necessary-but-not-sufficient if the app has never been told to deliver the `instagram` object.

**What 41-08 should do:** the existing `subscribeMessengerPage(pageToken, pageId)` already POSTs `subscribed_apps?subscribed_fields=messages,messaging_postbacks` — `messages` is the IG-relevant field, so **re-running it with the NEW (pages_manage_metadata-bearing) token is sufficient at the Page level**. `connectInstagramAccount` already calls `subscribeMessengerPage` (meta-onboarding.ts:316) — keep it; it now runs with a properly-scoped token. **Add a documented one-time operator step:** "In the App Dashboard, add the `instagram` webhook product and subscribe the `messages` field at the www callback." This unblocks the 41-07 A2 smoke.

> A2 verdict: the original A2 "maybe a per-IG subscribe is needed" worry is **resolved NO** — Page subscription + app-level `instagram`/`messages` field is the complete picture. No `subscribeInstagram` sibling function is needed.

### Q6. Pitfalls

1. **Token-flow vs code-flow.** `connect-facebook.tsx` uses **token-flow** (captures `response.authResponse.accessToken`, passes the short-lived USER token to the action, which calls `exchangeForLongLivedUserToken`). Comments warn the **code-flow broke the connect** (40-08 smoke: `redirect_uri` exchange + feeding a code into `fb_exchange_token`). **REUSE token-flow verbatim** for the IG button — pass the captured `accessToken` to `connectInstagramAccount({ accessToken })`, and inside the action call `exchangeForLongLivedUserToken(input.accessToken)` (NOT `exchangeCodeForUserToken`). [VERIFIED: connect-facebook.tsx:72-87,138-160 + messenger-connect.ts:50-79 comment]
2. **`auth_type` choice.** Use `'rerequest'` (re-prompt declined IG scopes), NOT `'reauthorize'` (which forces the page-picker; unnecessary when the page is connected, and re-picking risks `getPageToken` count=0 if the user mis-clicks). See Q1.
3. **v22.0 SDK pinning.** The new login MUST use `META_APP_ID='1457229738955828'`, `version:'v22.0'`, SDK `https://connect.facebook.net/en_US/sdk.js`, and the shared `facebook-jssdk` loader (poll for `window.FB` if the script tag already exists from connect-whatsapp/connect-facebook). [VERIFIED: connect-facebook.tsx:50-52,104-124] Do NOT bump the version.
4. **IG-selection screen UX.** Requesting IG scopes WILL show the IG account in the consent screen for businesses that have one — that's the point. For FB-only businesses it's a no-op grant. This is acceptable on the **IG button** (D-IG-10) precisely because it's isolated from the FB connect (which stays IG-free).
5. **Regla 6 traps (D-IG-11):**
   - **Do NOT edit `connect-facebook.tsx` or `FB_LOGIN_SCOPE`.** Define a separate `IG_LOGIN_SCOPE` in `connect-instagram.tsx`.
   - **Do NOT edit `connectFacebookPage`.** Only `connectInstagramAccount` changes signature (`() → ({ accessToken })`) and gains the token-chain prefix.
   - The token-refresh UPDATE is a **superset** (Q1/Q2) — it cannot regress Messenger. (If you were ever to request FEWER scopes than the current Messenger token, that WOULD regress it — hence the superset constant is mandatory.)
   - Verifiable: `git diff --stat src/components/settings/connect-facebook.tsx` → 0 changes; `git diff src/app/actions/meta-onboarding.ts` touches only the `connectInstagramAccount` block (and its type), never `connectFacebookPage`/`connectWhatsAppNumber`.
6. **Don't leak the token.** Same discipline as `connectFacebookPage` — the browser only sees the short-lived user token it captured (never the Page token); the action never returns/logs the Page token; failures stay generic except the IG-not-linked message. [VERIFIED: meta-onboarding.ts:319-331]
7. **`connect-instagram.tsx` currently has NO login** (41-06 no-popup version, lines 31-69). 41-08 REPLACES that no-popup body with the FB.login flow. Update the component's header comment (it currently says "does NOT launch a fresh Facebook Login popup" — that becomes false).

---

## Code Anchors

| Anchor (file:line) | Signature / shape | 41-08 action |
|--------------------|-------------------|--------------|
| `src/components/settings/connect-facebook.tsx:50-52` | `META_APP_ID`/`META_SDK_VERSION`/`FB_SDK_ID` consts | **adapt** — copy consts into connect-instagram.tsx (or import) |
| `connect-facebook.tsx:65-66` | `FB_LOGIN_SCOPE` string (5 scopes) | **do NOT touch** — define NEW `IG_LOGIN_SCOPE` = these + `,instagram_basic,instagram_manage_messages` |
| `connect-facebook.tsx:90-126` | SDK loader `useEffect` (init/poll `window.FB`) | **clone verbatim** into connect-instagram.tsx |
| `connect-facebook.tsx:129-161` | `launch()` — `FB.login(cb,{scope,auth_type})` token capture | **adapt** — same shape, `scope:IG_LOGIN_SCOPE`, `auth_type:'rerequest'`, call `connectInstagramAccount({accessToken})` |
| `connect-facebook.tsx:78-87` | `handleConnect(accessToken)` → action + toast | **adapt** — call `connectInstagramAccount({accessToken})`; keep IG toast (igUsername) |
| `src/components/settings/connect-instagram.tsx:31-69` | current no-popup `ConnectInstagram` | **rewrite** — becomes the FB.login version (update header comment) |
| `src/app/actions/meta-onboarding.ts:263-332` | `connectInstagramAccount(): Promise<ConnectInstagramResult>` (no args) | **adapt** — change to `connectInstagramAccount(input:{accessToken:string})`; INSERT token-chain (Q2 steps 1-3) before the existing resolve at :291 |
| `meta-onboarding.ts:168-238` | `connectFacebookPage({accessToken})` — token chain template | **reuse as template** (read-only) — do NOT edit |
| `meta-onboarding.ts:286-292` | `resolveByWorkspace(ws,'facebook')` → `resolveInstagramAccount(token,pageId)` | **adapt** — after refresh, can use the FRESH `pageToken`+`pageId` directly (no need to re-read the row); keep the `if (!fb?.pageId)` guard as "first connect Facebook" precheck |
| `meta-onboarding.ts:299-316` | `upsertMetaAccount({channel:'instagram',...})` + `subscribeMessengerPage` | **reuse verbatim** — runs with the refreshed token now |
| `src/lib/meta/messenger-connect.ts:94-111` | `exchangeForLongLivedUserToken(short):Promise<string>` | **reuse verbatim** (D-IG-12) |
| `messenger-connect.ts:173-229` | `getPageToken(longLived):Promise<{pageId,pageName,accessToken}>` | **reuse verbatim** (D-IG-12) |
| `messenger-connect.ts:243-252` | `subscribeMessengerPage(pageToken,pageId):Promise<void>` (`subscribed_fields=messages,messaging_postbacks`) | **reuse verbatim** — `messages` field = IG delivery (Q5) |
| `src/lib/meta/instagram-connect.ts:32-45` | `resolveInstagramAccount(pageToken,pageId):Promise<{id,username?}>` | **reuse verbatim** — now succeeds with IG-scoped token |
| `src/lib/meta/token.ts:48-58` | `encryptToken(token):string` (AES-256-GCM) | **reuse verbatim** |
| `src/lib/domain/meta-accounts.ts:90-112` | `upsertMetaAccount` UPDATE path overwrites `access_token_encrypted` | **reuse** — facebook-row UPDATE = token refresh; IG-row INSERT/UPDATE = copy |
| `src/lib/meta/credentials.ts:136-153` | `resolveByWorkspace(ws,channel):Promise<MetaCredentials|null>` (`.pageId`,`.accessToken`) | **reuse** — precheck only; fresh token preferred post-refresh |
| `scripts/_debug-ig-link.ts` | READ-ONLY 3-case IG-link diagnostic | **reuse** — post-deploy verdict if reconnect still fails |

### Proposed `connectInstagramAccount` shape (illustrative — planner refines)
```typescript
// meta-onboarding.ts — ADAPT (Regla 6: connectFacebookPage untouched)
export async function connectInstagramAccount(input: {
  accessToken: string                      // short-lived USER token from the IG FB.login (token-flow, Q6)
}): Promise<ConnectInstagramResult> {
  // ... same auth gate (owner) + V5 input check (input.accessToken present) ...
  try {
    // Refresh chain (D-IG-12) — mirrors connectFacebookPage:201-225
    const longLived = await exchangeForLongLivedUserToken(input.accessToken)
    const { pageId, accessToken: pageToken } = await getPageToken(longLived)
    const accessTokenEncrypted = encryptToken(pageToken)
    // Refresh the canonical facebook-row token (superset — Messenger keeps working, Regla 6)
    await upsertMetaAccount({ workspaceId, channel: 'facebook', wabaId: null,
      phoneNumberId: null, pageId, accessTokenEncrypted, isActive: true })
    // Now the token carries the IG scopes → resolve succeeds (was the broken step)
    const ig = await resolveInstagramAccount(pageToken, pageId)
    await upsertMetaAccount({ workspaceId, channel: 'instagram', wabaId: null,
      phoneNumberId: null, pageId, igAccountId: ig.id, igUsername: ig.username ?? null,
      accessTokenEncrypted, isActive: true })
    await subscribeMessengerPage(pageToken, pageId)   // messages field = IG delivery (Q5)
    return { success: true, igUsername: ig.username }
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    console.error('[meta-onboarding] connect Instagram account failed:', e)
    if (message.includes('vincula una cuenta de Instagram Profesional'))
      return { success: false, error: message }
    return { success: false, error: 'No se pudo conectar la cuenta de Instagram. Intenta de nuevo.' }
  }
}
```
> Note: the `resolveByWorkspace(ws,'facebook')` "first connect Facebook" precheck (current :286-289) can stay as a friendly guard ("Primero conecta tu página de Facebook") OR be dropped since a fresh login mints its own page token. Planner decides; keeping it is harmless and gives a clearer error if the user clicks IG before ever connecting FB.

---

## Don't Hand-Roll

| Problem | Don't build | Reuse | Why |
|---------|-------------|-------|-----|
| Short→long→Page token chain | new OAuth | `exchangeForLongLivedUserToken` + `getPageToken` | live-verified in Phase 40, incl. Business-Portfolio fallback |
| Page webhook subscribe (IG too) | `subscribeInstagram` | `subscribeMessengerPage` (`messages` field) | Q5: Page `subscribed_apps` delivers IG DMs; no per-IG subscribe |
| IG account resolve | new edge | `resolveInstagramAccount` | already correct; only failed due to under-scoped token |
| Token encryption / persist | inline | `encryptToken` + `upsertMetaAccount` | Regla 3 sole write path; UPDATE = refresh |
| SDK load / FB.login popup | new loader | clone `connect-facebook.tsx` loader + launch | shared `facebook-jssdk`, v22.0 pinned |

**Key insight:** 41-08 is ~90% reuse. The ONLY genuinely-new code is (a) a `FB.login` popup on the IG button (clone of the FB one with the IG superset scope + `rerequest`), and (b) prepending the 3-step token-refresh to `connectInstagramAccount`. Everything below the token step (resolve, upsert, subscribe, graceful error) is already shipped and correct.

---

## Migration / Regla 5

**No new migration.** 41-08 mints+stores a token via the existing `upsertMetaAccount` (UPDATE of `access_token_encrypted`) — no schema change. (`instagram_provider`, `ig_account_id`, `ig_username` all already exist per 41-RESEARCH §Migration and the shipped 41-00..06 migration.) Regla 5 does not gate this plan.

## Regla 6 verification gates (grep/diff-verifiable)
```bash
git diff --stat src/components/settings/connect-facebook.tsx          # → 0 changes (D-IG-11)
grep -c "FB_LOGIN_SCOPE" src/components/settings/connect-instagram.tsx # → 0 (IG uses its OWN IG_LOGIN_SCOPE)
grep -c "instagram_basic" src/components/settings/connect-facebook.tsx # → 0 (FB connect stays IG-free)
git diff src/app/actions/meta-onboarding.ts                           # → only connectInstagramAccount block changes
git diff --stat src/lib/agents/godentist-fb-ig/                       # → 0 changes (Regla 6)
```

## Operator step (one-time, App Dashboard — Q5)
> In the Meta App Dashboard: add/confirm the **`instagram` webhook product** and subscribe the **`messages`** field to the callback **`https://www.morfx.app/api/webhooks/meta`** (www — apex 307-redirects drop the POST body). This is config, not code; required before IG DMs arrive even after the Page is subscribed. Verify in the 41-07 A2 smoke (send a real IG DM, confirm `object:'instagram'` lands).

---

## Assumptions Log

| # | Claim | Risk if wrong | Mitigation |
|---|-------|---------------|------------|
| A1 | A fresh `FB.login` with the IG superset scope yields a Page token (via long-lived exchange) whose grant includes `instagram_basic`+`instagram_manage_messages`, so `resolveInstagramAccount` succeeds | If Page-token scope inheritance differs, resolve still fails | Page tokens inherit the user-grant context; HIGH per Meta token model. Live smoke (reconnect Varixcenter) is the definitive check; `_debug-ig-link.ts` classifies any residual CASE 1/2/3 |
| A2 | `auth_type:'rerequest'` re-prompts the previously-absent IG scopes (they were never granted, effectively "declined" by omission in the FB connect) without forcing the page-picker | If the popup skips IG re-prompt, IG scope stays ungranted | If smoke shows IG scope still missing, switch to `'reauthorize'` (forces full consent incl. IG). Documented contingency |
| A3 | Varixcenter's IG IS Professional + linked to the Page as `instagram_business_account` | If only `connected_instagram_account` (Accounts-Center) or no IG, resolve throws the Spanish error (correct UX, not a bug) | Post-deploy `_debug-ig-link.ts` gives CASE 1/2/3 verdict; user-side IG re-link if CASE 1/2 |
| A4 | App Dashboard already (or will) have the `instagram`/`messages` webhook field at the www callback | If not configured, IG DMs never arrive despite a correct Page subscribe | One-time operator step documented; 41-07 A2 smoke verifies delivery |

## Open Questions (live-only, deferred to 41-07/post-deploy smoke)
1. Does the refreshed token actually grant IG scopes for THIS user? → reconnect smoke (A1/A2). STOP-on-fail; `_debug-ig-link.ts` diagnoses.
2. Is Varixcenter's IG Professional+linked? → `resolveInstagramAccount` verdict post-reconnect (A3).
3. Is the App Dashboard `instagram`/`messages` field live at the www callback? → 41-07 A2 smoke (A4).

---

## Confidence

| Area | Level | Reason |
|------|-------|--------|
| Incremental-perm union + `rerequest` semantics (Q1) | HIGH | Meta official permissions doc cited directly |
| Token-refresh chain + superset re-store (Q2) | HIGH | All helpers verified in codebase; chain is the live-verified connectFacebookPage flow |
| Scope string (Q3) | HIGH | Meta IG-messaging mandatory perms + our connect-chain page-scope needs both cited |
| Graceful no-IG failure (Q4) | HIGH | Existing code already throws+surfaces the Spanish error; 41-08 only prepends token steps |
| A2 webhook linchpin (Q5) | HIGH | Meta IG-webhook doc: Page `subscribed_apps`+`messages`=`object:'instagram'`, no per-IG subscribe; `pages_manage_metadata` required; app-level `instagram` field one-time |
| Pitfalls / token-flow / Regla 6 (Q6) | HIGH | Grounded in connect-facebook.tsx comments (40-08 live lessons) + diff/grep gates |
| Varixcenter IG actually linked | MEDIUM | Live-only unknown (D-IG-12) — resolves on reconnect; code path is correct regardless |

## Sources

### Primary (HIGH)
- developers.facebook.com/docs/facebook-login/web/permissions/ — incremental permissions UNION; `auth_type:'rerequest'` required for declined scopes; `/me/permissions` granted/declined
- developers.facebook.com/docs/reference/javascript/FB.login/ — `scope`, `auth_type`, `return_scopes`/`grantedScopes`
- developers.facebook.com/docs/messenger-platform/instagram/features/webhook/ — Page `subscribed_apps?subscribed_fields=messages` delivers `object:'instagram'`; mandatory `instagram_basic`+`instagram_manage_messages`+`pages_manage_metadata`; no per-IG subscribe; app must be published
- Codebase (shipped Phase 40 / Phase 41 41-06): `connect-facebook.tsx`, `connect-instagram.tsx`, `meta-onboarding.ts`, `messenger-connect.ts`, `instagram-connect.ts`, `credentials.ts`, `token.ts`, `meta-accounts.ts`, `scripts/_debug-ig-link.ts`

### Secondary (MEDIUM — multi-source agreement)
- IG messaging permission set (`instagram_basic`,`instagram_manage_messages`,`pages_messaging`,`pages_show_list`,`pages_manage_metadata`) — bot.space, unipile, CM.com docs corroborate Meta

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (re-verify if Meta bumps the enforced Graph version off v22.0 or changes IG login/permission mechanics)
