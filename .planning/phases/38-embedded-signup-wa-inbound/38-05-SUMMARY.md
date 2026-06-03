---
phase: 38-embedded-signup-wa-inbound
plan: 05
subsystem: meta-embedded-signup-frontend
tags: [meta, embedded-signup, fb-login, client-component, deliverable-2, signup-01]

# Dependency graph
requires:
  - phase: 38-embedded-signup-wa-inbound
    plan: 04
    provides: connectWhatsAppNumber server action (owner-gated, exchange→encrypt→persist→subscribe)
provides:
  - "ConnectWhatsApp client component — FB JS SDK + Embedded Signup v4 popup (FB.login + config_id) + dual-channel capture + server action call"
  - integrations settings surface rendering the connect flow
affects: [38-06-register-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-channel capture (RESEARCH Pattern 4): auth code via FB.login callback + waba_id/phone_number_id via window 'message' WA_EMBEDDED_SIGNUP FINISH; both refs must be set before firing the action"
    - "Untrusted message listener (T-38-17): event.origin.endsWith('facebook.com') guard + JSON.parse try/catch before trusting payload"
    - "config_id read from NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID (non-secret); META_APP_SECRET never referenced client-side (T-38-18)"

key-files:
  created:
    - src/components/settings/connect-whatsapp.tsx
  modified:
    - src/app/(dashboard)/configuracion/integraciones/page.tsx

key-decisions:
  - "FB.login with { config_id, response_type:'code', override_default_response_type:true, extras:{sessionInfoVersion:'3'} } — no redirect_uri (Embedded Signup popup flow)"
  - "Refs reset immediately on fire so a stray duplicate event cannot double-submit"

requirements-completed: [SIGNUP-01]

# Metrics
completed: 2026-06-03
---

# Phase 38 Plan 05: Embedded Signup frontend (Conectar WhatsApp) Summary

**`ConnectWhatsApp` client component: loads the Facebook JS SDK, launches the Embedded Signup v4 popup via `FB.login` (with the live `config_id`), captures BOTH return channels (auth `code` from the callback + `waba_id`/`phone_number_id` from the `WA_EMBEDDED_SIGNUP` window message), and calls the owner-gated `connectWhatsAppNumber` action — completing SIGNUP-01 self-service onboarding and replacing deliverable 1's throwaway manual SQL insert.**

## Accomplishments
- `src/components/settings/connect-whatsapp.tsx` (`'use client'`): injects the FB JS SDK once (double-inject guarded), `FB.init` (appId `1457229738955828`, v22.0), and `FB.login` with `config_id` from `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`. Dual-channel capture with refs; the `window 'message'` listener guards `event.origin.endsWith('facebook.com')` + JSON.parse try/catch (T-38-17) and only trusts `type === 'WA_EMBEDDED_SIGNUP'` `FINISH`. On both channels present → `connectWhatsAppNumber({ code, wabaId, phoneNumberId })` + Spanish toasts. CANCEL/ERROR → reset + "Conexión cancelada". Button gated on `configReady && sdkReady && !isPending`.
- `src/app/(dashboard)/configuracion/integraciones/page.tsx`: renders `<ConnectWhatsApp />` in the integrations surface.
- `META_APP_SECRET` never referenced in the client bundle — only the non-secret `config_id` (T-38-18).

## Task Commits
1. **ConnectWhatsApp component + integrations wiring (Embedded Signup FB.login + dual-channel)** — `cce20ab6` (feat)

## Verification Evidence (live smoke 2026-06-03)
- **SIGNUP-01 end-to-end:** clicking "Conectar WhatsApp" → Meta popup → authorize WABA + number → an encrypted row appears in `workspace_meta_accounts` (workspace `4b5d84dd…`, phone_number_id `1134593926408063`, waba_id `1330686782492287`, token AES-256-GCM, `is_active=true`) and the WABA shows our app in `subscribed_apps`.
- JS SDK domain config required live: added `www.morfx.app` to the app's Allowed Domains to clear the "Unknown Host domain" popup error.
- `META_APP_ID` corrected to the user's real app `1457229738955828` (was the freelancer's old app) across the 4 Vercel env vars.

## Deviations from Plan
- The component hardcodes `META_APP_ID = '1457229738955828'` (the `appId` must match `META_GRAPH_API_VERSION` v22.0 and is non-secret) rather than reading an env var — acceptable for a single-app deployment.

## Deferred (tracked in deferred-items.md)
- **Connected-state UI panel:** the component always renders the connect button; it does NOT read `workspace_meta_accounts` to show a "Conectado" view (phone/WABA/connected_at + Desconectar). Requires a domain getter (token-free) + server-component read. Plan 06 added an inline activation `toast.warning`, but the persistent connected panel remains a Plan 05 follow-up.

## Self-Check: PASSED
- FOUND: src/components/settings/connect-whatsapp.tsx (commit cce20ab6)
- FOUND: integrations page renders ConnectWhatsApp
- Live: encrypted row stored + WABA subscribed

---
*Phase: 38-embedded-signup-wa-inbound · Completed: 2026-06-03*
