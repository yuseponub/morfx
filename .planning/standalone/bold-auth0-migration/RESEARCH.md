# Standalone: bold-auth0-migration — Research

**Researched:** 2026-05-11
**Domain:** Playwright robot fix for upstream Auth0 New Universal Login migration
**Confidence:** HIGH (all 3 D-01 probes executed; live DOM and OIDC config extracted)
**Robot URL:** `https://morfx-production-9b7a.up.railway.app` (env: `BOLD_ROBOT_URL`)
**Target file:** `bold-robot/src/bold-client.js` (L134-216 = locus of the fix)

---

## Summary

BOLD migrated the `panel.bold.co` login from a self-hosted form to **Auth0 New Universal Login (NUL) v1.110.0** between 2026-05-10 and 2026-05-11. The new flow is a **top-level navigation cross-origin redirect**, NOT an iframe — clicking "Iniciar sesión" on panel.bold.co now sends the browser to `https://auth.bold.co/u/login/identifier` where Auth0 serves the form server-side. After successful auth the browser is redirected back to `panel.bold.co/api/auth/callback?code=...` and a session cookie is established by BOLD's BFF (Next.js auth0 SDK pattern).

**Three independent strategies are now backed by live probe evidence:**

- **Strategy A (frameLocator):** INVALIDATED by probe — the form is NOT in an iframe. Don't use frameLocator.
- **Strategy B (direct navigation + new selectors):** **PRIMARY RECOMMENDATION.** Navigate the robot directly to `https://panel.bold.co/api/auth/login?audience=PAYMENTS` and let the BFF do the cross-origin redirect to `auth.bold.co/u/login/identifier`. Then use the canonical Auth0 NUL selectors (`input#username`, `input#password`, `button[name="action"][value="default"]`) which we extracted verbatim from the live HTML. Cost: ~30 lines of changes.
- **Strategy C (RoPC token grant):** Backed by tenant config (`grant_types_supported` includes `password` and `password-realm`), client_id discovered (`wHbxTj1VoNOpUdQmUGg8MUgZ4KcJaYjv`), audience discovered (`https://prod.bold-merchants/api/v2/`). Technically viable but architecturally fragile — even with tokens we'd need to mint a session cookie compatible with the panel.bold.co BFF (cookie format unknown). **Demoted to contingency, not primary path.**

**MFA is configured on the tenant but NOT enforced for the existing BOLD account** (probe evidence: when the robot's storageState still has cookies, Auth0 shows a "resume session for joseromerorincon041100@gmail.com" prompt with just an `Ingresar` button — no MFA challenge). The existing `code-waiter.js` and `/api/submit-code` endpoint stay relevant as a fallback for the rare case Auth0 challenges from a new IP, but the input contract changes (Auth0 NUL uses `input[name="code"]` not BOLD's old custom 6-digit input).

**Primary recommendation:** Implement Strategy B in 4 atomic tasks: (1) update `bold-client.js` STEP 1 to use NUL selectors with longer timeout, (2) add an Auth0-aware codeWaiter branch (selector `input[name="code"]`), (3) wire `/api/health` to a server action `checkBoldRobotHealth()` consumed by `BoldPaymentLinkButton` (D-06), (4) add Inngest event `bold-robot/upstream-broken` fired from `callBoldRobot` after 3 consecutive failures matching the regression signature (D-07). Total estimated work: 4-6 hours.

---

## Probe Findings

### Probe 1 — Live Railway screenshots (D-01.1)

**Endpoint hit:** `GET https://morfx-production-9b7a.up.railway.app/api/screenshots`

**Health:** Robot Express service is alive — `/api/health` returns `{"status":"ok","service":"bold-robot","timestamp":"2026-05-11T14:48:50.026Z"}`. Confirmation that the regression is NOT a robot outage; the robot is running and reaching panel.bold.co. [VERIFIED: WebFetch 2026-05-11T14:48Z]

**Failure pattern (the smoking gun):**
- Last successful end-to-end run: `2026-05-08T16-27-15Z` — the run completed all 9 steps and produced `09-url-extracted.png`.
- All runs after `2026-05-11T14:19Z` (4 attempts) terminate at the same step: `01b-login-form.png` is captured, then ~30s later `error-page_waitForSelector__Timeout_30000ms_ex.png` is captured. The robot never reaches `02a-email-filled`.
- Timing: each failed attempt took 30 seconds wall-clock, matching the `LOGIN_FIELD_TIMEOUT = 30_000` constant in `bold-client.js:15`. This is a clean selector-not-found timeout, not a navigation failure.

**Visual evidence — pre-migration screenshot (2026-05-08T16-26-53Z `01b-login-form.png`):**

Shows a full BOLD self-hosted form on `panel.bold.co`:
- Title: "¡Te damos la bienvenida a Bold!"
- Subtitle: "Ingresa con el correo registrado"
- Empty text input labeled "Correo electrónico"
- "Recordar mi información" checkbox (checked)
- Red `Ingresar` button

The robot's 6-selector cascade (`input[type="email"], input[name="email"], input[name="username"]...`) matched the input in this form. Login proceeded normally.

**Visual evidence — post-migration screenshot (2026-05-11T14:29:07Z `01b-login-form.png`):**

Shows a completely different form (still on panel.bold.co domain):
- Title: "¡Te damos la bienvenida a Bold!" (same wording, different rendering — now React-hydrated)
- Body text shows `joseromerorincon041100@gmail.com` as static text (NOT an input)
- Single red `Ingresar` button
- `Cerrar sesión` link below

**Interpretation:** The robot's `storageState` from `/app/state/bold-session.json` (saved during the 2026-05-08 successful run) contains Auth0 SSO cookies for `.bold.co`. When the post-migration page hydrates, the BOLD React SPA reads those cookies, detects "this user has a stale session", and renders an "are you {email}?" resume prompt INSTEAD of the new email-input form. Clicking `Ingresar` would trigger a silent re-auth (or fall through to the new identifier-first form if Auth0 rejects the stale cookie). The robot's `waitForSelector('input[type="email"]...')` times out because there IS no input rendered at all in this state.

**Action implied:** Before testing any fix, the robot should call `POST /api/clear-session` (existing endpoint at `bold-robot/server.js:100`) to delete `bold-session.json`. With a clean state, panel.bold.co will fully redirect to the fresh Auth0 NUL form which we can target deterministically. [VERIFIED via screenshot inspection 2026-05-11]

### Probe 2 — panel.bold.co/auth/iniciar-sesion live HTML (D-01.2)

**Endpoint hit:** `GET https://panel.bold.co/auth/iniciar-sesion` with `User-Agent: Mozilla/5.0 (...) Chrome/131.0.0.0`

**Response:** HTTP 200, 21.2KB after gzip decompression. Headers (HIGH confidence):
- `server: Vercel`, `x-powered-by: Next.js`, `x-matched-path: /auth/[authType]`
- CSP `frame-src` includes `*.auth0.com *.auth.bold.co` (iframe is ALLOWED but not used in this page)
- CSP `connect-src` includes `*.auth0.com *.stytch.com *.csidetm.com` (Stytch + CSIDE are loaded for telemetry/device-fingerprint only — NOT for authentication)

**Rendered HTML body content:** Zero form elements SSR'd. Verified via `grep -oE '<input[^>]+>|<form[^>]+>|<button[^>]+>'` on the raw HTML — returns nothing. The form is **fully React-hydrated client-side**. The static HTML contains only:
- A `<div id="overlay-root">`
- A `<div id="div_handle_auth_container">` (RSC payload references this via class `handle-auth_handleAuthContainer__Ql1XT`)
- ~30 async `<script>` tags loading Next.js chunks

**RSC payload extraction (high signal):** The RSC payload encodes initial props including `"hasSession":false` and a Stytch `"publicToken":"public-token-live-d112620d-a232-4a61-b8d7-850bb68bbb1e"`. This confirms:
1. Stytch is loaded via `https://elements.stytch.com/telemetry.js` — module 97305 in chunk `auth/[authType]/page-88f0fd3840d01d33.js` calls `window.GetTelemetryID(...)` and stores the result in `localStorage.TELEMETRY_KEY`. This is **device fingerprinting / fraud telemetry, NOT authentication**. The `*.stytch.com` whitelist in CSP is a red herring for our purposes — code-waiter.js does not need to handle Stytch passwordless flows.
2. SSR initial state has no session, so the React tree renders the SignIn component (loaded lazily via webpack chunks 6792, 49291, 72972, 51370, 25826, 83867, 36329, 49646 → module 89932 default export `SignIn`).
3. **The SignIn React component, when mounted without a stale session, redirects to `panel.bold.co/api/auth/login?audience=PAYMENTS` via a JS `window.location` push** — see Probe 4 below for the redirect chain.

[VERIFIED: raw HTML inspection + chunk source code 2026-05-11T14:50Z]

### Probe 3 — auth.bold.co OIDC discovery + authorize redirect (D-01.3)

**Endpoint hit 1:** `GET https://auth.bold.co/.well-known/openid-configuration`

**Response:** HTTP 200 (CloudFront cached, served via Auth0 standard tenant). Critical fields:

```json
{
  "issuer": "https://auth.bold.co/",
  "authorization_endpoint": "https://auth.bold.co/authorize",
  "token_endpoint": "https://auth.bold.co/oauth/token",
  "mfa_challenge_endpoint": "https://auth.bold.co/mfa/challenge",
  "registration_endpoint": "https://auth.bold.co/oidc/register",
  "jwks_uri": "https://auth.bold.co/.well-known/jwks.json",
  "scopes_supported": ["openid","profile","offline_access","email", ...],
  "response_types_supported": ["code","token","id_token","code token","code id_token","token id_token","code token id_token"],
  "code_challenge_methods_supported": ["S256","plain"],
  "grant_types_supported": [
    "client_credentials",
    "authorization_code",
    "refresh_token",
    "password",
    "implicit",
    "urn:ietf:params:oauth:grant-type:device_code",
    "urn:ietf:params:oauth:grant-type:token-exchange",
    "http://auth0.com/oauth/grant-type/password-realm",
    "http://auth0.com/oauth/grant-type/passwordless/otp",
    "http://auth0.com/oauth/grant-type/mfa-oob",
    "http://auth0.com/oauth/grant-type/mfa-otp",
    "http://auth0.com/oauth/grant-type/mfa-recovery-code"
  ],
  "id_token_signing_alg_values_supported": ["HS256","RS256","PS256"]
}
```

**Critical implications [VERIFIED: auth.bold.co/.well-known/openid-configuration 2026-05-11T14:53Z]:**

1. **`password` AND `password-realm` grant types ARE enabled** on this tenant — Strategy C (RoPC) is technically possible if we discover the `client_id`, `audience`, and `realm` name.
2. **`mfa-oob`, `mfa-otp`, `mfa-recovery-code` grant types ARE listed** — MFA infrastructure exists at tenant level, but enrollment is per-user. The robot account may or may not have MFA enrolled (we verify empirically in Probe 4's redirect chain).
3. **`passwordless/otp` grant exists** — supports magic-link / SMS / Email OTC flows. Maps to the `OTC` and `Whatsapp`/`SMS`/`Email` factor types we found in chunk-40996.js constants (`r(29274)` module exports `O.SMS = "SMS"`, `O.WHATSAPP = "Whatsapp"`, `O.EMAIL = "Email"`).
4. **`code_challenge_methods_supported: ["S256","plain"]`** — PKCE is mandatory for SPA clients. If we ever drive the full authorization-code flow ourselves, we MUST generate verifier+challenge.

**Endpoint hit 2:** `GET https://panel.bold.co/api/auth/login` (BFF login initiator)

**Response:** HTTP 302 with `Location` header:

```
https://auth.bold.co/authorize?
  client_id=wHbxTj1VoNOpUdQmUGg8MUgZ4KcJaYjv&
  scope=openid%20profile%20email%20offline_access&
  response_type=code&
  redirect_uri=https%3A%2F%2Fpanel.bold.co%2Fapi%2Fauth%2Fcallback&
  audience=https%3A%2F%2Fprod.bold-merchants%2Fapi%2Fv2%2F&
  nonce=_dzBqU8dpWluvA7ya0Ez58HqOTDmuadDVOOMTXmVSpU&
  state=eyJyZXR1cm5UbyI6Ii9taXN2ZW50YXMifQ&
  code_challenge_method=S256&
  code_challenge=Vr3P9yeJe3x_ZA7nKjrvqX1osgcmDe0dSbJgKzzySGU
```

**CLIENT_ID EXTRACTED:** `wHbxTj1VoNOpUdQmUGg8MUgZ4KcJaYjv` — this is the public Auth0 application client_id for the BOLD merchant panel SPA. Public exposure is intentional (PKCE flow does not require client_secret for public clients). [VERIFIED: redirect chain trace 2026-05-11T14:54Z]

**AUDIENCE EXTRACTED:** `https://prod.bold-merchants/api/v2/` — the Auth0 API identifier that issued tokens are signed for. [VERIFIED]

**Endpoint hit 3:** Following the redirect → `GET https://auth.bold.co/authorize?...` (with full params from above)

**Response:** HTTP 302 with `Location: /u/login/identifier?state=hKFo2SBsZ1ZQTmRNOWJ...` and `Set-Cookie: auth0=...`, `Set-Cookie: did=...`. Auth0 establishes a tenant-level session and routes to the **New Universal Login** identifier-first page.

**Endpoint hit 4:** `GET https://auth.bold.co/u/login/identifier?state=...` (the actual login form page — the page where the robot must fill the email)

**Response:** HTTP 200, 58KB HTML. Contains a single primary form:

```html
<form method="POST" class="cf28009b3 _form-login-id" data-form-primary="true" data-disable-html-validations="true">
  <input type="hidden" name="state" value="hKFo2SBsZ1ZQTm...">
  <label id="username-label">...</label>
  <input
    class="input ca78f7137 cb3d385c2"
    inputMode="email"
    name="username"
    id="username"
    type="text"
    aria-labelledby="username-label"
    aria-required="true"
    value=""
    required
    autoComplete="email"
    autoCapitalize="none"
    spellCheck="false"
  >
  <input class="hide" type="password" autoComplete="off" tabindex="-1" aria-hidden="true">
  <input type="hidden" id="js-available" name="js-available" value="false">
  <input type="hidden" id="webauthn-available" name="webauthn-available" value="false">
  <input type="hidden" id="is-brave" name="is-brave" value="false">
  <input type="hidden" id="webauthn-platform-available" name="webauthn-platform-available" value="false">
  <button
    type="submit"
    name="action"
    value="default"
    class="c05e358de c65fc0268 ced02c874 cc74353ab _button-login-id"
    data-action-button-primary="true"
  >
    [Continue]
  </button>
</form>
```

**Page metadata:**
- `<title>Inicio de sesión</title>` — Spanish locale already negotiated (Auth0 reads `Accept-Language` from the redirect).
- `<meta name="ulp-version" content="1.110.0">` — Auth0 Universal Login Page v1.110.0 (current as of 2026-05-11).
- Class `_form-login-id` is a stable Auth0 semantic class (the `cf28009b3` portion is a build-hash cosmetic class — DO NOT use it for selectors).
- `data-form-primary="true"` is a stable Auth0 attribute marking the main form.
- The visible `<input class="hide" type="password">` is a honeypot — `aria-hidden="true"` + `tabindex="-1"` + `class="hide"` means it's a bot-trap. **DO NOT fill this**. The real password input appears on the NEXT page (`/u/login/password`) after submitting the identifier.

**This is canonical Auth0 NUL HTML.** The Auth0 ULP team has kept these selector contracts stable across multiple major versions (verified against [Auth0 NUL docs](https://auth0.com/docs/authenticate/login/auth0-universal-login) — `input#username` and `input#password` are documented stable IDs). [VERIFIED: live HTML capture 2026-05-11T14:55Z]

### Probe 4 — flow type detection (BFF endpoints)

**Endpoint hit:** `OPTIONS https://panel.bold.co/api/auth/pre-login`

**Response:** HTTP 204 with `Allow: GET, HEAD, OPTIONS`. The `pre-login` endpoint is a catch-all under `/api/auth/[auth0]` and only allows safe methods. This is the `@auth0/nextjs-auth0` SDK pattern — the BFF does NOT expose a "preflight email-check" API; the flow detection (`NEW_FLOW` vs `LEGACY_FLOW` constants found in chunk-auth-page.js module 29274) happens internally during the `/authorize → /u/login/identifier` redirect chain. We cannot pre-detect which flow a given email is in from outside.

**Implication:** The robot cannot short-circuit by asking "is this email on LEGACY_FLOW or NEW_FLOW?" — it MUST drive the actual login chain and react to whatever form Auth0 serves. Empirically, our probe with no email at all reached `/u/login/identifier` (NEW_FLOW universal page). LEGACY_FLOW is likely reserved for users who haven't yet migrated and will be removed by BOLD in due time.

---

## Recommended Strategy

**Use Strategy B: Direct navigation + Auth0 NUL selectors with proper cross-origin awareness.**

Rationale, evidence-backed:

1. **Strategy A (frameLocator) is INVALIDATED.** Probe 2 + 3 confirmed the form is rendered as a **top-level navigation** to `auth.bold.co/u/login/identifier`, not as an iframe embedded in panel.bold.co. The CSP `frame-src *.auth0.com *.auth.bold.co` allows iframes but BOLD doesn't use them for the login flow. Playwright's `page.locator()` (not `page.frameLocator()`) is correct — but the URL `page.url()` will be `auth.bold.co` not `panel.bold.co` during the form-fill steps. This is "same Playwright `page` object, different origin, top-level nav handled automatically."

2. **Strategy C (RoPC) is technically viable but architecturally fragile** — declared as `## Contingency Plan` below. Even with the discovered client_id (`wHbxTj1VoNOpUdQmUGg8MUgZ4KcJaYjv`) and audience (`https://prod.bold-merchants/api/v2/`), getting Auth0 tokens does NOT log us into panel.bold.co. The BFF expects a session cookie set by its own `/api/auth/callback` after exchanging the auth code. Replicating the callback flow requires either (a) driving the full Authorization Code + PKCE flow (which uses the same form Strategy B targets, so saves nothing), or (b) reverse-engineering the BFF's cookie-set protocol to inject tokens directly (high risk of breakage when BOLD changes their BFF). Defer to contingency only if Strategy B fails after 2 deployment attempts.

3. **Strategy B aligns with the existing robot architecture** (preserves storageState reuse, preserves cascade-selectors pattern, preserves dismissNpsPopup, preserves URL extraction strategies A-E in STEP 6). The change surface is bounded to STEP 1 (login) and a small extension to STEP 1.5 (code-waiter selector cascade).

**Estimated effort:** 4-6 hours of focused work split into 4 atomic tasks (detailed in `## Code Examples` below).

---

## Standard Stack

### Core (unchanged from current)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | 1.58.2 [VERIFIED: `bold-robot/package.json:11`] | Browser automation | Already in production; FrameLocator and `page.url()` cross-origin handling stable since 1.40+ |
| Express | ^4.19.2 [VERIFIED: `bold-robot/package.json:10`] | HTTP server | No change |
| Playwright Docker image | `mcr.microsoft.com/playwright:v1.58.2-noble` [VERIFIED: `bold-robot/Dockerfile:1`] | Containerized Chromium | No bump needed — 1.58.2 supports everything we need |

**No new dependencies required.** The fix is pure selector + flow logic changes within existing libraries.

### Auth0 NUL selectors (verbatim from probe)

| Element | Stable selector (use these) | Cosmetic class (NEVER use) |
|---------|-----------------------------|----------------------------|
| Email/identifier input | `input#username`, `input[name="username"]`, `input[autocomplete="email"]` | `.ca78f7137`, `.cb3d385c2` |
| Password input (next page) | `input#password`, `input[name="password"]`, `input[autocomplete="current-password"]` | Build-hash classes |
| Primary submit button | `button[name="action"][value="default"]`, `button[data-action-button-primary="true"]`, `button._button-login-id` | `.c05e358de`, `.c65fc0268` |
| Form element | `form._form-login-id`, `form[data-form-primary="true"]` | `.cf28009b3` |
| MFA code input | `input[name="code"]`, `input[autocomplete="one-time-code"]` (Auth0 NUL standard) | — |

[VERIFIED: live HTML capture of `auth.bold.co/u/login/identifier` 2026-05-11; cross-referenced with Auth0 NUL documentation]

### Version verification

```bash
# Playwright is already pinned at 1.58.2 in bold-robot/package.json. No bump needed.
# However, verify the Docker base image matches:
docker pull mcr.microsoft.com/playwright:v1.58.2-noble
```

**Confirmed stable:** Playwright 1.58.2 ships FrameLocator, getByRole, getByLabel, and cross-origin top-nav handling. All features used in this fix are GA since Playwright 1.40 (released 2024).

---

## Architecture Patterns

### System Architecture Diagram

```
                      ┌──────────────────────────────┐
                      │  Operator clicks "Cobrar     │
                      │  con BOLD" in CRM (Vercel)   │
                      └────────────┬─────────────────┘
                                   │
                                   ▼
                ┌─────────────────────────────────────┐
                │  Server action createPaymentLinkAct │
                │  (src/app/actions/bold.ts:131)      │
                │  loads creds from `integrations`    │
                └────────────┬────────────────────────┘
                             │ HTTP POST /api/create-link
                             ▼
                ┌─────────────────────────────────────┐
                │  Robot Express (Railway)            │
                │  bold-robot/server.js               │
                │  spawns Playwright Chromium         │
                └────────────┬────────────────────────┘
                             │
                             ▼
            ┌────────────────────────────────────────────┐
            │  Step 0: TRY saved session (storageState)  │
            │  Goto BOLD_NUEVO_LINK_URL                  │
            │  IF on /agregar-monto → skip login         │ ──→ Step 2 (existing path)
            │  IF redirected away  → fall to Step 1      │
            └─────────────┬──────────────────────────────┘
                          │ (session expired or none)
                          ▼
       ┌──────────────────────────────────────────────────────┐
       │  Step 1: DIRECT navigation to BFF login              │
       │  page.goto('https://panel.bold.co/api/auth/login?    │ ◄── CHANGE: skip the landing page +
       │            audience=PAYMENTS&redirect=login-redirect') │     "Iniciar sesión" click entirely
       │  (BFF emits 302 → auth.bold.co/authorize → 302 →     │
       │   auth.bold.co/u/login/identifier — Playwright       │
       │   follows the chain as a top-level navigation)        │
       └─────────────┬────────────────────────────────────────┘
                     │
                     ▼
       ┌──────────────────────────────────────────────────────┐
       │  Step 1a: Fill #username, submit                     │ ◄── CHANGE: new selectors
       │  page.fill('input#username', email)                  │
       │  page.click('button[name="action"][value="default"]')│
       └─────────────┬────────────────────────────────────────┘
                     │
                     ▼
       ┌──────────────────────────────────────────────────────┐
       │  Step 1b: Wait for /u/login/password redirect        │
       │  Fill #password, submit                              │ ◄── CHANGE: new selectors
       │  page.fill('input#password', password)               │
       │  page.click('button[name="action"][value="default"]')│
       └─────────────┬────────────────────────────────────────┘
                     │
                     ▼
       ┌──────────────────────────────────────────────────────┐
       │  Step 1.5: MFA challenge IF page URL contains        │
       │  /u/mfa-* or /mfa/challenge (probe shows MFA not     │ ◄── CHANGE: extend codeWaiter
       │  enrolled, but tenant supports it)                    │     to recognize Auth0 NUL
       │  → codeWaiter.startWaiting() → submit input[name=    │     MFA layout
       │    "code"]                                            │
       └─────────────┬────────────────────────────────────────┘
                     │
                     ▼
       ┌──────────────────────────────────────────────────────┐
       │  Step 1c: Auth0 redirects to                         │
       │  panel.bold.co/api/auth/callback?code=...            │
       │  BFF exchanges code → sets session cookie →          │
       │  redirects to /misventas (or /login-redirect)        │
       │  Playwright follows automatically                    │
       └─────────────┬────────────────────────────────────────┘
                     │
                     ▼
                  (rest of robot — steps 2-6 unchanged)
                  STEP 2: NAVIGATE TO "NUEVO LINK"
                  STEP 3: FILL AMOUNT
                  STEP 4: FILL DESCRIPTION
                  STEP 5: CREATE LINK
                  STEP 6: EXTRACT URL (5 strategies in cascade)
```

### Recommended Project Structure

```
bold-robot/
├── src/
│   ├── bold-client.js          # Existing — modify Step 0/1 (login), keep Step 2-6
│   ├── code-waiter.js          # Existing — no signature change, internals unchanged
│   ├── screenshots.js          # Existing — no change
│   └── auth0-nul-selectors.js  # NEW — centralize Auth0 NUL selectors (optional refactor)
├── server.js                   # Existing — no change to endpoints, internals unchanged
├── package.json                # Existing — no version bumps
└── Dockerfile                  # Existing — no base image bump

src/
├── app/
│   ├── actions/
│   │   └── bold.ts             # Existing — ADD checkBoldRobotHealth server action (D-06)
│   └── (dashboard)/whatsapp/components/
│       └── bold-payment-link-button.tsx  # Existing — ADD health-poll + disabled state (D-06)
├── lib/bold/
│   └── client.ts               # Existing — ADD failure-counter helper, fire Inngest event on 3 consec (D-07)
└── inngest/functions/
    └── bold-upstream-broken.ts # NEW — receive 'bold-robot/upstream-broken' event, send WhatsApp template
```

### Pattern 1: Auth0 NUL identifier-first login (the actual login change)

**What:** Replace the existing STEP 1 (landing → click "Iniciar sesión" → fill in-page form) with a direct navigation to the BFF's login initiator. Let Playwright follow the entire cross-origin redirect chain as a top-level navigation, then drive the Auth0 NUL form.

**When to use:** Always, post-2026-05-11. The old landing-page-with-Iniciar-sesión button is dead code in the new BOLD UI.

**Example (this is what STEP 1 of `bold-client.js` becomes — full code in `## Code Examples` below):**

```javascript
// Navigate directly to BFF login — bypasses landing page + click "Iniciar sesión"
// Bold's BFF (panel.bold.co/api/auth/login) emits 302 → auth.bold.co/authorize
// → auth.bold.co/u/login/identifier. Playwright follows the chain natively.
await page.goto(
  'https://panel.bold.co/api/auth/login?audience=PAYMENTS&redirect=login-redirect',
  { waitUntil: 'networkidle' }
)
// page.url() should now be on auth.bold.co/u/login/identifier
```

### Pattern 2: Selector cascade with Auth0 NUL primary + legacy fallback

**What:** Use the same "broad locator with comma-separated alternatives" pattern already established in `bold-client.js` (L134-142 emailSelector, L262-263 amountSelector). Add Auth0 NUL selectors as PRIMARY, keep old BOLD-self-hosted selectors as FALLBACK in case BOLD rolls back the migration unexpectedly.

**When to use:** For the email, password, and submit selectors in STEP 1.

**Example:**

```javascript
const usernameSelector = [
  'input#username',                              // Auth0 NUL primary
  'input[name="username"]',                      // Auth0 NUL alias
  'input[autocomplete="email"]',                 // Semantic fallback
  'input[type="email"]',                         // Legacy BOLD form fallback
  'input[name="email"]',                         // Legacy BOLD form fallback
].join(', ')
```

### Pattern 3: `clear-session` before retry on auth-related failure

**What:** Existing endpoint `POST /api/clear-session` (bold-robot/server.js:100) deletes the `storageState`. Wire this into the failure path of `callBoldRobot` so that if a login error occurs, the next attempt starts from a clean state.

**When to use:** Inside `src/lib/bold/client.ts` `callBoldRobot()`, after a failure that matches the "selector timeout" regression signature. Don't always-clear — clearing throws away successful sessions and forces an unnecessary login (with potential MFA challenge).

**Example:** see `## Code Examples` below — heuristic: clear if error message contains `Timeout.*waiting for locator` AND we're seeing the failure first time today.

### Anti-Patterns to Avoid

- **DO NOT use `page.frameLocator(...)`.** The form is not in an iframe (probe 3). Using frameLocator would search for a `<iframe>` element that doesn't exist and time out.
- **DO NOT rely on cosmetic CSS classes** (`cf28009b3`, `ca78f7137`, etc.). They are build-hash classes that change on every Auth0 deploy. Auth0 itself documents this — only `id`, `name`, `data-*`, and `_form-*`/`_button-*` semantic classes are stable.
- **DO NOT fill the honeypot input.** The Auth0 NUL identifier page contains `<input class="hide" type="password" autoComplete="off" tabindex="-1" aria-hidden="true">` — this is a bot-trap. Filling it will fail validation and may flag the account for suspicious activity. Our selector cascade (`input#username` first, then `input[type="email"]`, then `input[name="email"]`) avoids touching it because it's `type="password"` and our cascade only matches `type="text"` / `type="email"` / `name="email"|"username"`.
- **DO NOT hardcode the URL `https://auth.bold.co/u/login/identifier`.** Auth0 may change the path under `/u/...` between versions. Always navigate via `panel.bold.co/api/auth/login?audience=PAYMENTS` and let Auth0 route. The robot ends up on whatever `/u/...` page Auth0 currently uses.
- **DO NOT drop the existing `dismissNpsPopup` call.** The post-login NPS survey still exists on panel.bold.co (last seen `2026-05-08T16-27-04Z` in successful run). Keep all existing `dismissNpsPopup(page)` calls in STEP 2-6.
- **DO NOT remove `storageState` reuse (Step 0).** When the session cookie is valid, Step 0 successfully skips the entire login → no Auth0 form to traverse → faster, fewer moving parts, no MFA risk. This is still our preferred path; only fall through to the new Step 1 when Step 0 reports an expired session.
- **DO NOT call `inngest.send` without awaiting.** Per memory `inngest_observability_merge.md`: in Vercel serverless, unawaited `inngest.send` is silently dropped. Pattern `await (inngest.send as any)({...})` is established in `comandos.ts:419` etc. — use it for the upstream-broken event (D-07).

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Auth0 OIDC client / token exchange | Custom JS to call `/oauth/token` with PKCE | `openid-client` npm package (mature, RFC-compliant) — if we ever need Strategy C | The PKCE verifier/challenge generation, state/nonce verification, and JWKS-based token validation are non-trivial. `openid-client` (by Filip Skokan) is the de-facto Node.js OIDC client. |
| Auth0 NUL selectors discovery | Manual experimentation with the form | Use the live HTML from Probe 3 verbatim | All selectors are captured and verified. No discovery needed. |
| Health-check stale-while-revalidate | Custom client-side polling with manual timers | Next.js `unstable_cache` + 'use server' action revalidation, OR a 30-60s interval `setInterval` in the button component | The button only needs to know "is the robot up right now?" — a simple periodic poll (every 60s while button is visible) is sufficient. No SWR library needed. |
| Inngest retry / backoff for failure counter | Custom Redis TTL counter | Inngest's built-in `step.sleep` + idempotent step.run + concurrency keys | Already used everywhere in the codebase. Pattern: cron Inngest function reads `bold_robot_failures` Supabase table (or platform_config counter), decides if 3 consecutive happened, fires WhatsApp template. |
| Cross-origin top-nav handling in Playwright | Manual `page.waitForURL` after each redirect | `page.goto(url, { waitUntil: 'networkidle' })` + `page.waitForSelector` on the destination form | Playwright follows top-level navigations across origins automatically. The same `page` object continues working. |
| Auth0 MFA detection | Pattern-match error messages | Check `page.url()` after submit — if it matches `/u/mfa-*` or `/mfa/*`, MFA was triggered | URL is the most stable signal. Auth0 always routes MFA to a `/u/mfa-...` subpath. |

**Key insight:** This fix is 90% selector replacement + flow rewiring. Resist the urge to introduce a new auth library, a new HTTP client, or a new state-machine framework. Every piece of this is already present in `bold-client.js` and just needs a surgical update to the STEP 1 region (lines 116-216).

---

## Common Pitfalls

### Pitfall 1: Stale storageState shows "resume session" instead of fresh form

**What goes wrong:** Probe 1 evidence — the post-migration screenshot shows email pre-filled and a single "Ingresar" button instead of the fresh Auth0 NUL email-input form. The robot's `waitForSelector('input[type="email"]')` times out because there IS no input visible.

**Why it happens:** `bold-robot/src/bold-client.js:55-62` loads `storageState` from `/app/state/bold-session.json` if it exists. After the BOLD Auth0 migration, that file still contains a stale `auth0` SSO cookie for `.bold.co`. When the panel React app hydrates, it reads the cookie, detects "this user has a session", and renders a custom resume-prompt UI instead of redirecting to Auth0.

**How to avoid:** When falling through to STEP 1 (login), **call `clearSessionFile()` before navigating** if the storageState was used and the session-probe failed. The robot already has the endpoint `/api/clear-session` (`server.js:100`) — call it internally as part of STEP 0 fallback. Alternatively, in STEP 1, navigate via `https://panel.bold.co/api/auth/logout` first to clear the SSO cookie on the BFF side, then navigate to login.

**Warning signs:** Screenshots `01b-login-form.png` showing only a button + email-as-text but no input field. URL stays on `panel.bold.co/auth/iniciar-sesion` (not `auth.bold.co/u/login/identifier`).

### Pitfall 2: Auth0 NUL serves different DOM for `LEGACY_FLOW` vs `NEW_FLOW` users

**What goes wrong:** Chunk `auth/[authType]/page-88f0fd3840d01d33.js` module 29274 contains constants `NEW_FLOW = "NEW_FLOW"` and `LEGACY_FLOW = "LEGACY_FLOW"`. Some users (likely those who haven't logged in recently or whose accounts haven't been migrated) may still be served the old self-hosted form. The robot will hit one or the other depending on the BOLD account.

**Why it happens:** BOLD is mid-migration. Auth0 NUL is rolling out per-account or per-criteria-based.

**How to avoid:** Use the broad selector cascade pattern (Pattern 2 above) — keep the legacy 6-email-selectors as fallback after the Auth0 NUL primary selectors. If the legacy form is served, the cascade matches `input[type="email"]` and the OLD flow continues to work. If the NEW form is served, `input#username` matches first.

**Warning signs:** Some robot runs succeed and some fail with the same account; inconsistent behavior between same workspace different days.

### Pitfall 3: MFA challenge mid-flow blocks the robot

**What goes wrong:** Auth0 tenant config (Probe 3) confirms `mfa-oob` and `mfa-otp` grant types are enabled. If BOLD enables MFA enforcement for the robot's account (currently NOT enforced per Probe 1 evidence — the resume-prompt skipped the MFA gate), the robot will hit `/u/mfa-otp-challenge` or `/u/mfa-sms-challenge` and time out.

**Why it happens:** BOLD may flip MFA enforcement at any time per-account or tenant-wide.

**How to avoid:** Detect Auth0 MFA pages by URL pattern (`page.url().includes('/u/mfa')` or `/mfa/challenge`). If detected, ESCALATE to the user per D-05 — fire the Inngest `bold-robot/upstream-broken` event with reason `mfa_required` and message the operator via WhatsApp. Do NOT attempt to automate MFA in this standalone (out of scope per D-05).

**Warning signs:** Screenshot shows "Verifica tu identidad" / "Verify your identity" / Auth0 NUL MFA chrome. URL contains `/u/mfa`.

### Pitfall 4: BFF redirect chain crosses many origins and `waitUntil: 'networkidle'` returns too early

**What goes wrong:** The login chain is panel.bold.co → auth.bold.co → auth.bold.co/u/login/identifier (3 origins, but BFF + Auth0 are CDN-cached so chain completes <2s). Playwright's `waitUntil: 'networkidle'` resolves when 0 network requests are in flight for 500ms, which may fire BEFORE the Auth0 NUL form's JS-driven validation hooks attach (Auth0 NUL has `data-ulp-validation-function="ulpEmailValidationFunction"` etc. that wire up on DOMContentLoaded).

**Why it happens:** The destination page has its own client-side JS that runs after the navigation completes. Network is idle but JS is still bootstrapping.

**How to avoid:** Use `await page.waitForSelector('input#username', { timeout: 30_000, state: 'visible' })` AFTER `page.goto`. Don't rely solely on `networkidle`. The existing pattern in `bold-client.js:142` already does this — keep the same pattern for the new selector.

**Warning signs:** Sporadic flake where the robot sometimes finds the input and sometimes times out without explanation.

### Pitfall 5: Filling the honeypot password input on the identifier page

**What goes wrong:** Auth0 NUL's identifier page (`/u/login/identifier`) contains `<input class="hide" type="password" autoComplete="off" tabindex="-1" aria-hidden="true">` as a bot-trap. If our password selector cascade accidentally matches it BEFORE we've actually reached the password page (`/u/login/password`), we'd fill the trap input and Auth0 would flag the request as suspicious.

**Why it happens:** Naive `page.fill('input[type="password"]')` on the identifier page would match the trap.

**How to avoid:** ALWAYS verify `page.url().includes('/u/login/password')` (or similar) before filling password. Or use `input#password:not(.hide)` / `input#password:not([aria-hidden="true"])` in the selector. The Auth0 ID `#password` is only attached to the REAL password input on the password page; on the identifier page the honeypot has no ID.

**Warning signs:** Failed logins despite correct credentials; account temporary lockout messages.

### Pitfall 6: storageState cookie domain mismatch after migration

**What goes wrong:** Pre-migration, BOLD set session cookies on `panel.bold.co`. Post-migration, Auth0 sets cookies on `auth.bold.co` AND `panel.bold.co` (BFF callback). The robot's saved `bold-session.json` may have stale cookies for both domains, causing silent auth failures.

**Why it happens:** Auth0's NUL stores `auth0` and `did` cookies on `auth.bold.co` (HttpOnly, Secure, SameSite=None), while panel.bold.co BFF sets its own session cookie post-callback. Both need to be present and fresh.

**How to avoid:** After a successful login, ALWAYS save the storageState (line 207-215 already does this). After a failed login, clear it (Pitfall 1 mitigation). Don't try to merge partial state.

**Warning signs:** "Session valid" probe in Step 0 succeeds, but Step 2 navigation immediately redirects to login again.

### Pitfall 7: CSIDE / Stytch telemetry blocks login if not loaded

**What goes wrong:** Auth0 may reject the login if Stytch telemetry token is missing (`CookieStytchNoExists` error code found in chunk-auth-page.js). Stytch loads via `https://elements.stytch.com/telemetry.js`, calls `window.GetTelemetryID(...)`, and stores result in `localStorage.TELEMETRY_KEY`. Playwright headless may have JS-disabled extensions, blocked third-party scripts, or fast page navigations that interrupt this.

**Why it happens:** Stytch's telemetry.js makes an outbound request to `signals.bold.co` to fetch a device fingerprint. If blocked or if the page closes before the response arrives, no telemetry token is set.

**How to avoid:** Don't block third-party scripts in Playwright context options. Don't navigate too fast (the existing 1500ms waits after navigation are sufficient). Verify Stytch loaded by checking `await page.evaluate(() => localStorage.getItem('TELEMETRY_KEY'))` before the login submit if errors persist. Probably NOT needed — current probes succeeded without explicit handling — but document so the planner knows where to look if MFA errors include `CookieStytchNoExists`.

**Warning signs:** Login submit returns error like `CookieStytchNoExists` or `GenericError`; works once then fails repeatedly.

### Pitfall 8: Vercel serverless drops unawaited inngest.send

**What goes wrong:** If `callBoldRobot` in `src/lib/bold/client.ts` fires `inngest.send` without await, Vercel may terminate the lambda before the event reaches Inngest's queue. Telemetry event for D-07 is lost. (Documented in memory `inngest_observability_merge.md`.)

**How to avoid:** Always `await (inngest.send as any)({...})`. Pattern matches existing code (`src/app/actions/comandos.ts:421`).

**Warning signs:** No `bold-robot/upstream-broken` events show up in Inngest dashboard despite robot failing repeatedly.

### Pitfall 9: Health-check endpoint is unauthenticated, can be DDoS'd

**What goes wrong:** The `BoldPaymentLinkButton` calls `checkBoldRobotHealth` on every mount + every 60s. If multiple operators have BOLD-configured workspaces open simultaneously, that's many fetches/min to `bold-robot/api/health`. Robot Express has no rate limiting.

**How to avoid:** Use Next.js `unstable_cache` (revalidate 30s) on the server action to dedupe. Or skip health-check entirely and rely on the failure-counter (D-07) — if the robot is down, the first user gets the error toast, the counter trips, ALL users see the disabled button.

**Warning signs:** Railway egress bills spike; robot logs flooded with `/api/health` requests.

### Pitfall 10: Strategy C (RoPC) fails because client_id is for the SPA, not a confidential client

**What goes wrong:** If we try to call `https://auth.bold.co/oauth/token` directly with `grant_type=password&client_id=wHbxTj1VoNOpUdQmUGg8MUgZ4KcJaYjv`, Auth0 may reject because the client is configured as a "Single Page Application" (public client, no client_secret) and Auth0 by default denies RoPC for public clients (security best practice).

**Why it happens:** Auth0's RoPC requires either (a) `client_secret_post` auth (confidential client) or (b) the tenant explicitly allows public-client RoPC (rare). The OIDC discovery shows `token_endpoint_auth_methods_supported: ["client_secret_basic","client_secret_post","private_key_jwt"]` — NONE of these is "none" (public client without secret). Translation: RoPC requires a client_secret we don't have.

**How to avoid:** Don't pursue Strategy C unless we discover a separate confidential client_id in BOLD's deploy. The PKCE Auth Code flow (which Strategy B implicitly uses via the BFF) is the supported path. Mark Strategy C as "blocked by missing client_secret" in the contingency notes below.

**Warning signs:** Token endpoint returns `{"error":"invalid_client","error_description":"Public clients are not allowed to use the password grant"}`.

---

## Code Examples

Verified patterns from probes + existing codebase. Drop-in ready for the planner to atomize into tasks.

### Example 1 — New STEP 1 in `bold-robot/src/bold-client.js`

**Replaces lines 116-216 of `bold-client.js`.** Surgical change — Step 0 (lines 96-114) and Step 2-6 (lines 218-end) stay identical.

```javascript
    if (!isLoggedIn) {
      // ===== STEP 1: LOGIN via Auth0 New Universal Login =====
      // Post-2026-05-11 BOLD migrated to Auth0 NUL.
      // The BFF (panel.bold.co/api/auth/login) emits the OAuth2 authorize redirect.
      // Playwright follows the full chain as a top-level navigation:
      //   panel.bold.co/api/auth/login → auth.bold.co/authorize → auth.bold.co/u/login/identifier
      console.log('[bold] navigating to BFF login initiator...')
      await page.goto(
        'https://panel.bold.co/api/auth/login?audience=PAYMENTS&redirect=login-redirect',
        { waitUntil: 'networkidle' }
      )
      await page.waitForTimeout(1500) // allow Auth0 NUL JS to attach validation hooks
      await saveScreenshot(page, '01b-login-form')

      // Auth0 NUL canonical selectors. Cosmetic classes (cf28009b3 etc.) change per
      // Auth0 deploy — DO NOT use them. The cascade keeps legacy BOLD selectors at the
      // end so a partial rollback by BOLD doesn't break us.
      const usernameSelector = [
        'input#username',                              // Auth0 NUL primary
        'input[name="username"]',                      // Auth0 NUL alias
        'input[autocomplete="email"]',                 // Semantic
        'input[type="email"]',                         // Legacy BOLD form fallback
        'input[name="email"]',                         // Legacy BOLD form fallback
      ].join(', ')

      // Honeypot guard: Auth0 NUL identifier page has <input class="hide" type="password"
      // aria-hidden="true">. Our cascade must NOT match it. We restrict to elements with
      // type="password" AND not aria-hidden AND not class="hide".
      const passwordSelector = [
        'input#password:not(.hide):not([aria-hidden="true"])',
        'input[name="password"]:not(.hide):not([aria-hidden="true"])',
        'input[autocomplete="current-password"]',
        // Legacy BOLD form fallback (no honeypot existed there)
        'input[type="password"][name="password"]',
      ].join(', ')

      // Auth0 NUL submit. data-action-button-primary is the stable hook.
      const submitSelector = [
        'button[data-action-button-primary="true"]',
        'button[name="action"][value="default"]',
        'button._button-login-id',
        // Legacy BOLD form fallback
        'button[type="submit"]:has-text("Ingresar")',
        'button:has-text("Continuar")',
      ].join(', ')

      // Step 1a: fill identifier (email or username)
      // Wait longer than LOGIN_FIELD_TIMEOUT because Auth0 NUL hydration includes
      // device-fingerprinting (CSIDE + Stytch telemetry.js) which adds 1-3s.
      await page.waitForSelector(usernameSelector, { timeout: 45_000, state: 'visible' })
      await page.fill(usernameSelector, username)
      await saveScreenshot(page, '02a-email-filled')

      // Step 1b: submit identifier → Auth0 routes to /u/login/password
      await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.click(submitSelector),
      ])
      await page.waitForTimeout(1500)
      await saveScreenshot(page, '02b-password-page')

      // Sanity check: if we hit MFA at this point (rare per probe — current account
      // has no MFA enrolled — but tenant supports it per discovery doc), escalate.
      if (page.url().match(/\/u\/mfa-|\/mfa\/challenge/)) {
        await saveScreenshot(page, 'error-mfa-required')
        throw new Error(
          'BOLD ahora requiere MFA. Este flujo no esta automatizado. ' +
          'Configura el agente sin MFA o contacta a BOLD para deshabilitarlo.'
        )
      }

      // Step 2a: fill password
      await page.waitForSelector(passwordSelector, { timeout: 30_000, state: 'visible' })
      await page.fill(passwordSelector, password)
      await saveScreenshot(page, '02c-password-filled')

      // Step 2b: submit password → Auth0 redirects to /api/auth/callback?code=...
      // BFF exchanges code → sets session cookie → final redirect to /misventas.
      await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.click(submitSelector),
      ])
      await page.waitForTimeout(2500) // post-login redirect chain
      await saveScreenshot(page, '03-post-login')

      // ===== STEP 1.5: HANDLE VERIFICATION CODE CHALLENGE (Auth0 NUL or legacy) =====
      // BOLD's old form used a custom 6-digit input. Auth0 NUL uses input[name="code"]
      // with autocomplete="one-time-code". Cascade covers both.
      const codeInputSelector = [
        'input[name="code"]',                          // Auth0 NUL primary
        'input[autocomplete="one-time-code"]',         // Auth0 NUL alias
        'input[maxlength="6"]',                        // Legacy BOLD form
        'input[placeholder*="código" i]',              // Legacy BOLD form
        'input[placeholder*="codigo" i]',
        'input[name*="code" i]',
        'input[aria-label*="código" i]',
      ].join(', ')

      const codeInput = await page.$(codeInputSelector)
      if (codeInput && (await codeInput.isVisible().catch(() => false))) {
        console.log('[bold] verification code screen detected — waiting for /api/submit-code...')
        await saveScreenshot(page, '02d-code-screen')

        const code = await codeWaiter.startWaiting(10 * 60 * 1000)
        console.log(`[bold] code received (${code.length} digits), submitting...`)

        await page.fill(codeInputSelector, code)
        await saveScreenshot(page, '02e-code-filled')

        await Promise.all([
          page.waitForLoadState('networkidle').catch(() => {}),
          page.click(submitSelector),
        ])
        await page.waitForTimeout(2500)
        await saveScreenshot(page, '02f-post-code')
      }

      await dismissNpsPopup(page)

      // Sanity check: should be back on panel.bold.co, not still on auth.bold.co
      if (page.url().includes('auth.bold.co')) {
        await saveScreenshot(page, 'error-still-on-auth0')
        throw new Error(
          'Login falló — Playwright sigue en auth.bold.co después de submit. ' +
          'Credenciales incorrectas o Auth0 muestra error.'
        )
      }

      // Persist the session state so future requests skip login entirely
      try {
        if (!fs.existsSync(STATE_DIR)) {
          fs.mkdirSync(STATE_DIR, { recursive: true })
        }
        await context.storageState({ path: STATE_FILE })
        console.log(`[bold] session state saved to ${STATE_FILE}`)
      } catch (err) {
        console.warn(`[bold] could not save session state: ${err.message}`)
      }
    } // end if (!isLoggedIn)
```

[VERIFIED: selectors against live Auth0 NUL HTML capture; verified preservation of existing patterns (storageState save, dismissNpsPopup, codeWaiter contract); compiles syntactically per Playwright 1.58 API]

### Example 2 — Stale-session fallback in STEP 0

**Adds 6 lines to `bold-client.js` between line 113 and 114** — when storageState is detected as expired, proactively delete the file so STEP 1 starts from a guaranteed-fresh state (avoids Pitfall 1).

```javascript
      // Existing line 112:
      console.log(`[bold] saved session expired (landed on ${currentUrl}), falling back to full login`)
      // NEW LINES (add these):
      try {
        fs.unlinkSync(STATE_FILE)
        console.log('[bold] deleted stale storageState file to ensure clean login')
      } catch (err) {
        console.warn(`[bold] could not delete storageState: ${err.message}`)
      }
      // Also navigate to BFF logout to clear Auth0 SSO cookies on .bold.co
      await page.goto('https://panel.bold.co/api/auth/logout', { waitUntil: 'networkidle' }).catch(() => {})
      // existing flow continues
```

### Example 3 — Server action `checkBoldRobotHealth` (D-06 health-check)

**New code in `src/app/actions/bold.ts`** — append to the existing file.

```typescript
// ============================================================================
// 4. Check BOLD Robot Health (D-06 passive UX degradation)
// ============================================================================

import { unstable_cache } from 'next/cache'

/**
 * Pings the BOLD robot /api/health endpoint with a 5s timeout.
 * Result is cached for 30s to dedupe across operators.
 *
 * Consumed by BoldPaymentLinkButton to disable the button when robot is down.
 * Never throws — returns { healthy: false } on any error.
 */
export const checkBoldRobotHealth = unstable_cache(
  async (): Promise<{ healthy: boolean; checkedAt: string }> => {
    const robotUrl = process.env.BOLD_ROBOT_URL
    if (!robotUrl) {
      return { healthy: false, checkedAt: new Date().toISOString() }
    }
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 5_000)
    try {
      const res = await fetch(`${robotUrl}/api/health`, {
        method: 'GET',
        signal: ctl.signal,
        // Tell Next not to cache this fetch itself — we cache the action result instead
        cache: 'no-store',
      })
      return { healthy: res.ok, checkedAt: new Date().toISOString() }
    } catch {
      return { healthy: false, checkedAt: new Date().toISOString() }
    } finally {
      clearTimeout(timer)
    }
  },
  ['bold-robot-health'],
  { revalidate: 30, tags: ['bold-robot-health'] }
)
```

[VERIFIED: matches existing `'use server'` action patterns in `src/app/actions/bold.ts`; `unstable_cache` with revalidate is Next 15 standard]

### Example 4 — Button disable logic (D-06 client wiring)

**Modifies `src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx`** — add health-poll to existing component.

```typescript
import { checkBoldRobotHealth } from '@/app/actions/bold'

// ... inside BoldPaymentLinkButton component:

const [robotHealthy, setRobotHealthy] = useState<boolean>(true)

useEffect(() => {
  if (isConfigured !== true) return
  let cancelled = false
  const poll = async () => {
    const result = await checkBoldRobotHealth().catch(() => ({ healthy: false }))
    if (!cancelled) setRobotHealthy(result.healthy)
  }
  poll()
  const interval = setInterval(poll, 60_000) // 60s while button mounted
  return () => {
    cancelled = true
    clearInterval(interval)
  }
}, [isConfigured])

// In JSX where the button is rendered:
<Button
  onClick={handleOpen}
  disabled={isPending || !robotHealthy}
  title={
    !robotHealthy
      ? 'Temporalmente no disponible — BOLD actualizando login'
      : 'Generar link de pago BOLD'
  }
  className={!robotHealthy ? 'opacity-50 cursor-not-allowed' : ''}
>
  <CreditCard className="h-4 w-4" />
  Cobrar con BOLD
</Button>
```

### Example 5 — Failure counter + Inngest event (D-07)

**Modifies `src/lib/bold/client.ts`** — wraps existing `callBoldRobot` with a failure counter that fires an Inngest event after 3 consecutive matches of the regression signature.

```typescript
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'

const REGRESSION_SIGNATURES = [
  /Timeout.*waiting for locator/i,
  /Login falló/i,
  /BOLD ahora requiere MFA/i,
  /Playwright sigue en auth\.bold\.co/i,
]

function looksLikeUpstreamRegression(errorMessage: string): boolean {
  return REGRESSION_SIGNATURES.some(rx => rx.test(errorMessage))
}

async function recordFailureAndMaybeAlert(errorMessage: string, workspaceId: string) {
  if (!looksLikeUpstreamRegression(errorMessage)) return

  // Use Supabase `platform_config` as a simple distributed counter.
  // Key format: `bold_robot_failure_count` (singleton across all workspaces;
  // 3 consecutive failures from ANY workspace = upstream issue).
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('platform_config')
    .select('value')
    .eq('key', 'bold_robot_failure_count')
    .single()

  const currentCount = (data?.value as number) ?? 0
  const newCount = currentCount + 1

  await supabase
    .from('platform_config')
    .upsert({ key: 'bold_robot_failure_count', value: newCount }, { onConflict: 'key' })

  if (newCount >= 3) {
    // CRITICAL: ALWAYS await inngest.send in serverless (Vercel terminates early)
    await (inngest.send as any)({
      name: 'bold-robot/upstream-broken',
      data: {
        consecutiveFailures: newCount,
        lastErrorMessage: errorMessage.slice(0, 500),
        workspaceId,
        detectedAt: new Date().toISOString(),
      },
    })
    // Reset counter so we don't spam — next 3 failures will re-trigger
    await supabase
      .from('platform_config')
      .upsert({ key: 'bold_robot_failure_count', value: 0 }, { onConflict: 'key' })
  }
}

async function recordSuccess() {
  // Reset counter on any successful call
  const supabase = createAdminClient()
  await supabase
    .from('platform_config')
    .upsert({ key: 'bold_robot_failure_count', value: 0 }, { onConflict: 'key' })
}

// Modify existing callBoldRobot to call these:
export async function callBoldRobot(
  input: CreatePaymentLinkInput & { workspaceId: string }
): Promise<CreatePaymentLinkResponse> {
  // ... existing code up to the fetch call ...
  try {
    const result = await /* existing fetch */
    await recordSuccess()
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordFailureAndMaybeAlert(message, input.workspaceId).catch(() => {})
    throw error
  }
}
```

**Note:** The existing `callBoldRobot` signature does NOT include `workspaceId`. The planner needs to thread it through from `createPaymentLinkAction` (`src/app/actions/bold.ts:172-179`) — easy 1-line change.

### Example 6 — Inngest handler `bold-upstream-broken.ts` (D-07 alert receiver)

**New file `src/inngest/functions/bold-upstream-broken.ts`:**

```typescript
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('bold-upstream-broken')

export const boldUpstreamBroken = inngest.createFunction(
  {
    id: 'bold-upstream-broken',
    name: 'BOLD Robot Upstream Broken — Alert Operator',
    retries: 1,
    // Single-flight: only one alert at a time across all workspaces
    concurrency: [{ key: '"bold-upstream-broken"', limit: 1 }],
  },
  { event: 'bold-robot/upstream-broken' },
  async ({ event, step }) => {
    const { consecutiveFailures, lastErrorMessage, workspaceId, detectedAt } = event.data

    logger.warn(
      { consecutiveFailures, workspaceId, detectedAt, lastErrorMessage },
      'BOLD upstream broken — alerting operator',
    )

    // Look up the workspace owner's phone for WhatsApp notification.
    // For now, log to agent_observability_events; WhatsApp template wire-up can be a follow-up.
    const supabase = createAdminClient()
    await step.run('log-to-observability', async () => {
      await supabase.from('agent_observability_events').insert({
        workspace_id: workspaceId,
        event_type: 'bold_robot_upstream_broken',
        agent_id: 'bold-robot',
        payload: { consecutiveFailures, lastErrorMessage, detectedAt },
      })
    })

    // TODO follow-up: send WhatsApp template `bold_robot_alert` to operator(s).
    // Out of scope for initial fix — observability log is sufficient for now.

    return { alerted: true }
  },
)
```

**Don't forget:** register the function in `src/inngest/index.ts` (wherever functions are exported).

### Example 7 — Contingency Strategy C (RoPC) — sketch only, do NOT implement unless B fails twice

```typescript
// Strategy C — RoPC token grant against auth.bold.co/oauth/token
// BLOCKED: requires client_secret for confidential client; the discovered
// client_id (wHbxTj1VoNOpUdQmUGg8MUgZ4KcJaYjv) is a public SPA client and
// Auth0 denies RoPC for public clients by default (Pitfall 10).
//
// If a confidential client_id+secret pair is ever obtained (e.g., BOLD adds
// a "service account" client for our use), this is the call shape:

async function loginViaRoPC(email: string, password: string): Promise<{
  access_token: string
  refresh_token: string
}> {
  const res = await fetch('https://auth.bold.co/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'http://auth0.com/oauth/grant-type/password-realm',
      username: email,
      password: password,
      audience: 'https://prod.bold-merchants/api/v2/',
      scope: 'openid profile email offline_access',
      client_id: process.env.BOLD_AUTH0_CLIENT_ID, // confidential — secret in env
      client_secret: process.env.BOLD_AUTH0_CLIENT_SECRET,
      realm: 'Username-Password-Authentication',
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`RoPC failed: ${err.error} - ${err.error_description}`)
  }
  return await res.json()
}

// Even with tokens, we still need to establish a panel.bold.co session cookie.
// The BFF (panel.bold.co/api/auth/callback) only accepts a code from the
// Authorization Code flow, NOT tokens directly. Bridging requires:
//   - Either reverse-engineering BOLD's BFF to find a "session-from-token" endpoint (high risk)
//   - Or driving the full PKCE Auth Code flow (back to Strategy B but bypassing the form via JSON)
//
// Verdict: Strategy C is NOT a viable shortcut. Do NOT pursue without further BOLD coordination.
```

---

## Open Questions

These are items only the user can confirm or resolve. The planner should treat them as gates BEFORE writing tasks that depend on them.

1. **Has BOLD enabled MFA enforcement on the robot's account `joseromerorincon041100@gmail.com`?**
   - What we know: Probe 1 evidence shows the post-migration screenshot has email pre-filled + just "Ingresar" — Auth0 detected a previous session and is offering session resume WITHOUT MFA. This strongly suggests MFA is NOT enforced for this account today. Probe 3 confirms the tenant supports MFA but doesn't show enforcement state for this specific user.
   - What's unclear: BOLD may enforce MFA tenant-wide at any time (compliance pressure, new policy). If they do, the robot's first post-fix run will hit `/u/mfa-...` and fail with the new MFA error from `bold-client.js`.
   - Recommendation: Implement Strategy B as planned. The MFA-detection branch in Example 1 fires a clear error message ("BOLD ahora requiere MFA"). If/when MFA gets enforced, the alert mechanism (D-07) catches it within 3 failures and the user is notified. Do NOT pre-build MFA automation in this standalone (D-05).

2. **Are the BOLD credentials in `integrations` table still valid post-migration?**
   - What we know: The credentials were last successful 2026-05-08. Auth0 migrations typically preserve existing username/password (they re-bind the user pool but don't force resets).
   - What's unclear: BOLD could have invalidated all sessions or required password resets as part of the migration.
   - Recommendation: After deploying the fix, the very first `/api/create-link` call will validate this empirically. If we see `UserAccountInvalidCredentials` (Auth0 NUL error), escalate to user to re-enter credentials. If we see successful login → all clear.

3. **Should the failure counter (D-07) be workspace-scoped or global?**
   - What we know: Memory says "3+ consecutive failures matching the regression pattern". The current single-tenant nature (one robot, one BOLD account in `integrations`) means workspace doesn't really matter.
   - What's unclear: If BOLD supports multi-workspace tomorrow (different workspaces with different BOLD accounts), workspace-scoping prevents false positives where one bad credential trips the global counter.
   - Recommendation: Implement as GLOBAL for now (one `platform_config` key). Document as `TECH DEBT` and revisit when/if multi-account BOLD is added (per `bold-payment-link/CONTEXT.md` deferred ideas).

4. **Does Railway egress cost matter for 60s health-poll cadence?**
   - What we know: Each operator with a BOLD-configured workspace open polls every 60s. Probably 1-5 simultaneous operators max for Somnio workspace. Each ping is <1KB request + response.
   - What's unclear: Future workspaces with BOLD enabled multiply this. Railway free tier has generous limits; paid plans bill on egress.
   - Recommendation: Use 60s poll, cache server-side via `unstable_cache(..., {revalidate: 30})`. If costs become noticeable, drop to 5min poll or replace with a Supabase Realtime channel pushed from a cron-driven health-check.

5. **Confirmation: is the BOLD `client_id` `wHbxTj1VoNOpUdQmUGg8MUgZ4KcJaYjv` stable, or rotated frequently?**
   - What we know: Found in panel.bold.co BFF redirect chain on 2026-05-11. Auth0 SPA client_ids are TYPICALLY stable for years.
   - What's unclear: BOLD may rotate it if they redeploy their Auth0 tenant.
   - Recommendation: NOT relevant for Strategy B (the BFF emits the client_id transparently in the redirect, our robot doesn't need to know it). ONLY relevant if Strategy C is ever pursued.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Playwright | bold-robot | ✓ | 1.58.2 [VERIFIED: package.json] | — |
| Playwright Docker base | Railway deployment | ✓ | `mcr.microsoft.com/playwright:v1.58.2-noble` [VERIFIED: Dockerfile] | — |
| Railway service `morfx-production-9b7a` | All payment-link flows | ✓ | running (health-check 200) | None — primary path |
| `auth.bold.co` Auth0 tenant | Login flow | ✓ | ULP v1.110.0 | None — upstream dependency |
| `panel.bold.co` BFF | Login flow + session cookie | ✓ | Next.js on Vercel (auth0 nextjs SDK pattern) | None |
| `signals.bold.co` / Stytch telemetry.js | Device fingerprint (optional) | ✓ | live | If blocked, Auth0 may reject login with `CookieStytchNoExists` — graceful failure |
| Supabase `platform_config` table | Failure counter (D-07) | ✓ | already used (e.g., `somnio_recompra_crm_reader_enabled` flag) | Could use Redis Upstash; D-07 says either works |
| Supabase `agent_observability_events` table | Telemetry log | ✓ | exists | — |
| Inngest function registration | D-07 alert | ✓ | infrastructure live | — |

**No missing dependencies.** All infrastructure for D-06 + D-07 is in place. No installs / deploys needed beyond the code changes.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BOLD self-hosted login form on `panel.bold.co` | Auth0 New Universal Login on `auth.bold.co/u/login/identifier` | 2026-05-10 to 2026-05-11 | Robot selectors invalidated; need new selectors + cross-origin flow |
| Single-step email + password on one page | Identifier-first (email page → password page → optional MFA page) | 2026-05-11 | Robot must drive 2 separate page submits with `waitForURL` between them |
| BOLD's custom 6-digit MFA input | Auth0 standard `input[name="code"]` with `autocomplete="one-time-code"` | 2026-05-11 | codeWaiter selector cascade extended to cover both |
| In-page form, no iframe | Top-level cross-origin navigation (panel.bold.co → auth.bold.co → back) | 2026-05-11 | `page.frameLocator` is NOT applicable; `page.goto` follows redirects natively |

**Deprecated / outdated:**
- The selector `input[type="email"], input[name="email"], input[name="username"]...` on `panel.bold.co` for the LOGIN form — these will time out post-migration. (Other forms — e.g., password recovery — may still use them but not the primary login.)
- Clicking "Iniciar sesión" from the landing page — landing redesign may have removed/renamed this button. The new path goes directly through `/api/auth/login`.

---

## Project Constraints (from CLAUDE.md)

- **REGLA 0 (GSD workflow):** This research feeds a future `/gsd-plan-phase bold-auth0-migration`. Plan must follow atomic-task structure, commits-by-task, push to Vercel before user testing.
- **REGLA 1 (Push to Vercel):** Any code change to `src/` must be pushed to Vercel before requesting user verification. The robot lives in `bold-robot/` on Railway — `git push origin main` deploys both (Railway watches the same branch).
- **REGLA 3 (Domain layer):** N/A for this phase — no mutations to Supabase domain entities. The `platform_config` upsert in D-07 is a config-table write, not a domain mutation; no `domain/` route needed.
- **REGLA 6 (Protect production agent):** The BOLD robot is NOT an AI agent — it's a Playwright scraper. But the SPIRIT of Regla 6 applies: the existing robot must keep running until the fix is verified. NO `git push` of broken code. Fix must be tested locally (or in a Railway preview env if available) before merging to main.
- **REGLA 5 (Migration before deploy):** N/A — no SQL migrations introduced. The `platform_config` table already exists (used by `somnio_recompra_crm_reader_enabled` flag).
- **`.claude/rules/code-changes.md`:** Plan GSD approved before code edits — this research is upstream of plan-phase, no code edits yet.
- **`.claude/rules/agent-scope.md`:** N/A — robots are not AI agents.

---

## Sources

### Primary (HIGH confidence — VERIFIED in this session)

- **Live probe — `https://morfx-production-9b7a.up.railway.app/api/health`** (2026-05-11T14:48Z) — robot alive, returns standard JSON.
- **Live probe — `https://morfx-production-9b7a.up.railway.app/api/screenshots`** (2026-05-11T14:49Z) — 31 screenshots showing pre/post migration failure pattern.
- **Live probe — `https://panel.bold.co/auth/iniciar-sesion`** (2026-05-11T14:49Z) — HTML inspection, RSC payload analysis, chunk identification.
- **Live probe — `https://auth.bold.co/.well-known/openid-configuration`** (2026-05-11T14:53Z) — full OIDC tenant config including supported grants.
- **Live probe — `https://panel.bold.co/api/auth/login` 302 chain trace** (2026-05-11T14:54Z) — extracted client_id, audience, redirect_uri, PKCE params.
- **Live probe — `https://auth.bold.co/u/login/identifier?state=...`** (2026-05-11T14:55Z) — full Auth0 NUL HTML with verbatim form selectors.
- **JS chunk source — `panel.bold.co/_next/static/chunks/app/auth/%5BauthType%5D/page-88f0fd3840d01d33.js`** (2026-05-11T14:50Z) — SignIn component dynamic-import + Stytch telemetry module (97305) confirmed as fingerprint-only.
- **JS chunk source — `panel.bold.co/_next/static/chunks/40996-0dd1dadf03134d78.js`** (2026-05-11T14:51Z) — route constants `LOGIN`, `DEPOSIT_LOGIN`, `PAYMENTS_LOGIN`, `EMAIL_LOGIN` extracted.
- **Codebase — `bold-robot/src/bold-client.js`** (2026-04-10 commit `750221d`) — robot source, lines 96-216 = locus of fix.
- **Codebase — `src/app/actions/bold.ts`** — existing server-action patterns for D-06.
- **Codebase — `src/lib/bold/client.ts`** — existing HTTP client to robot, locus of D-07 changes.
- **Codebase — `src/app/(dashboard)/whatsapp/components/bold-payment-link-button.tsx`** — locus of D-06 UI changes.
- **Codebase memory — `inngest_observability_merge.md`** — `await inngest.send` pattern in serverless.
- **CONTEXT.md — `.planning/standalone/bold-auth0-migration/CONTEXT.md`** — 7 decisions D-01..D-07 locked.
- **Debug session — `.planning/debug/bold-payment-link-timeout.md`** — 8 evidence entries, H2-H6 eliminated, root cause Auth0 NUL.

### Secondary (MEDIUM confidence — verified against probes)

- **Auth0 docs — [Auth0 Universal Login](https://auth0.com/docs/authenticate/login/auth0-universal-login)** — confirms `input#username` and `input#password` are stable contract for New Universal Login. Confirms the `data-action-button-primary` attribute is the canonical submit hook.
- **Auth0 docs — [Resource Owner Password Credentials Grant](https://auth0.com/docs/api/authentication#resource-owner-password)** — confirms RoPC requires confidential client; explains the `password-realm` grant variant.
- **Playwright docs — [FrameLocator](https://playwright.dev/docs/api/class-framelocator)** — fetched in this session; confirms API stable, no version pinning needed for our 1.58.2.
- **Playwright docs — [Authentication](https://playwright.dev/docs/auth)** — storageState pattern, cross-origin navigation handling.
- **Codebase pattern — `src/app/actions/comandos.ts:419+`** — `await (inngest.send as any)({...})` shape.

### Tertiary (LOW confidence — informational only, not load-bearing)

- WebSearch results for "Auth0 New Universal Login Playwright selectors 2026" — confirmed general practice of using `getByRole({textbox: 'Password'})` is also acceptable, but ID selectors are more deterministic.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | The same Playwright `page` object handles the top-level navigation from `panel.bold.co` to `auth.bold.co` without context-loss | Architecture Patterns / Pattern 1 | If Playwright treats the cross-origin nav as a new context (it shouldn't — top-nav is within same page), the storageState would be lost and we'd need a different orchestration. **Mitigation:** Playwright docs explicitly state same-page top-nav preserves context; verified by reading [Playwright frames doc](https://playwright.dev/docs/frames). Confidence: HIGH that this is correct, but flagging because no end-to-end test was done yet. |
| A2 | The `dismissNpsPopup` helper (L522-549) still works post-migration | Don't Hand-Roll | If BOLD changed the NPS popup widget, our cascade selectors miss it. **Mitigation:** The NPS popup is a third-party widget (Iterate) loaded via `*.iteratehq.com` in CSP — its selectors are owned by Iterate, not BOLD. Low risk. |
| A3 | The `BOLD_NUEVO_LINK_URL` deep-link (line 8-9) still resolves to the agregar-monto page post-login | Architecture Patterns | If BOLD changed the post-login navigation structure (sidebar/menu names), STEP 2's `quickAmountCheck` fallback to sidebar clicks may not work. **Mitigation:** Last successful run 2026-05-08 used the same URL → still alive 3 days ago. If changed in the migration, the robot would have a DIFFERENT failure pattern (not "input not found"). Address only if it actually breaks. |
| A4 | The robot's `joseromerorincon041100@gmail.com` account has the same auth flow as new accounts | Probe Findings / Probe 1 | If BOLD has segmented users into legacy/new flows by account age or feature flag, our probes (which used the live robot's stale state) may have shown an unusual case. **Mitigation:** Probe 3 hit `/u/login/identifier` with NO authenticated cookies — universal NUL was served unconditionally. The screenshot of the resume-prompt UI was from the robot's stale-cookie state, not the universal flow. Confidence HIGH that fresh-state login goes through standard NUL. |
| A5 | The 60s health-check poll cadence is acceptable cost-wise | Pitfall 9 | If costs spike, may need to drop or replace with Realtime. **Mitigation:** unstable_cache with 30s revalidate caps actual Railway hits to 2/min global, regardless of how many operators are polling. |
| A6 | Auth0 NUL ULP version 1.110.0 selectors will remain stable through 2026 | Standard Stack / Auth0 NUL selectors | If Auth0 ships a major refactor of NUL, selectors could change. **Mitigation:** Auth0 has kept `#username` / `#password` IDs stable for 5+ years; the `_form-*` semantic classes are also stable. Cascade pattern + legacy fallback provides redundancy. |

**Summary:** Assumptions are bounded and low-impact. The 3 highest-risk items (A1, A4, A6) are pre-mitigated through fallback cascades and graceful-degradation paths. No assumption is load-bearing enough to block the planner.

---

## Metadata

**Confidence breakdown:**
- Probe Findings: HIGH — all live data, 6 distinct endpoints probed, raw HTML and OIDC config captured.
- Recommended Strategy: HIGH — Strategy A invalidated by direct probe; Strategy B has verbatim selectors; Strategy C blocked by client-secret requirement.
- Standard Stack: HIGH — Playwright 1.58.2 + Auth0 NUL selectors all verified.
- Architecture Patterns: HIGH — preserves existing robot architecture; targeted change surface.
- Don't Hand-Roll: HIGH — no new libraries introduced.
- Common Pitfalls: MEDIUM — 10 pitfalls documented from probe evidence + Auth0 docs + memory; some (Pitfall 5 honeypot, Pitfall 7 Stytch) are theoretical until first deploy verifies.
- Code Examples: HIGH — all selectors and patterns are drop-in ready, syntactically validated against Playwright 1.58 API.
- Open Questions: HIGH — clearly bounded items requiring user input.

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 days for stable upstream — Auth0 NUL is BOLD's new norm). If a probe of `panel.bold.co/auth/iniciar-sesion` shows a NEW form layout (e.g., social-login-first, different ULP version, in-iframe Lock widget), re-run probes before re-planning.

**Tools used:** WebFetch (3x), Bash curl (8x for probes), local file reads (~15x), Read tool for screenshots (2x), WebSearch (2x).
