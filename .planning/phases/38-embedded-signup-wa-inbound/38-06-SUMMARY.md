---
phase: 38-embedded-signup-wa-inbound
plan: 06
subsystem: meta-number-activation
tags: [meta, register, activation, 2sv, payment, regla-3, regla-5, regla-6, gap-closure]

# Dependency graph
requires:
  - phase: 38-embedded-signup-wa-inbound
    plan: 04
    provides: connectWhatsAppNumber action + registerPhoneNumber helper (was unwired)
provides:
  - "activateNumber: register-after-subscribe (idempotent) wired into connectWhatsAppNumber"
  - "mapRegisterError helper (2388001→needs_2sv / payment→needs_payment / other→register_failed)"
  - "updateMetaAccountRegistration domain helper (persists registration_status/error + encrypted PIN)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent activation: GET /{id}?fields=status; skip register if already CONNECTED"
    - "register chain error mapping in a pure, server-safe helper (NOT a 'use server' module) so it is unit-testable and importable by the action"
    - "Activation problems surfaced as { success:true, status, message } (the number IS connected, just not active) — NOT a hard failure"

key-files:
  created:
    - src/lib/meta/register-errors.ts
    - src/lib/meta/__tests__/register-errors.test.ts
    - supabase/migrations/20260603140000_meta_account_registration_status.sql
  modified:
    - src/app/actions/meta-onboarding.ts
    - src/lib/domain/meta-accounts.ts
    - src/components/settings/connect-whatsapp.tsx

key-decisions:
  - "Closes the Plan 04 deviation: the helper existed but the call site was omitted, leaving every self-serve number PENDING (dead) until manually registered (proven live 2026-06-03)"
  - "PIN stored only on a successful register (two_step_pin_encrypted); on a chain block the PIN is untouched and the row records needs_2sv/needs_payment/register_failed"
  - "mapRegisterError moved out of the 'use server' file because a 'use server' module may only export async functions"

requirements-completed: []

# Metrics
completed: 2026-06-03
---

# Phase 38 Plan 06: Wire register into onboarding (Plan 04 gap-closure) Summary

**`connectWhatsAppNumber` now ACTIVATES the number on Cloud API after subscribe: `activateNumber` is idempotent (skips if Meta already reports CONNECTED) then calls `registerPhoneNumber` with a fresh 6-digit PIN; `mapRegisterError` turns the known failure chain (leftover 2SV `2388001` → `needs_2sv`, missing payment → `needs_payment`, other → `register_failed`) into a persisted `registration_status` + an actionable Spanish message — so a self-serve number never silently stays PENDING.**

## Why this plan existed
Plan 04 specified the register call ("calls it only if subscribed_apps indicates unregistered") but the executor created the `registerPhoneNumber` helper and **omitted the call site**. Proven live 2026-06-03: an Embedded-Signup number stays `status: PENDING / platform_type: NOT_APPLICABLE` and receives nothing until manually registered. This closes that deviation and handles the full activation chain documented in `PLAYBOOK-number-activation.md`.

## Accomplishments
- `src/app/actions/meta-onboarding.ts`: after `subscribeWaba`, calls `activateNumber(bisuat, workspaceId, phoneNumberId)` — GET `/{id}?fields=status` (skip+mark connected if already CONNECTED), else generate `crypto.randomInt(100000,1000000)` PIN → `registerPhoneNumber` → on success persist status `connected` + encrypted PIN; on error `mapRegisterError` → persist status + return `{ success:true, status, message }`. Return type widened to `ConnectWhatsAppResult`.
- `src/lib/meta/register-errors.ts` (+ 6 unit tests): pure mapper, server-safe, importable by the action. Maps `errorSubcode === 2388001` → `needs_2sv`, `/payment method|cannot migrate phone number/i` → `needs_payment`, else `register_failed`, each with an actionable ES message + raw `detail`.
- `src/lib/domain/meta-accounts.ts` (Regla 3): `updateMetaAccountRegistration({ workspaceId, phoneNumberId, status, error?, twoStepPinEncrypted? })` — workspace+phone-scoped UPDATE of `registration_status`/`registration_error` (+ encrypted PIN only on success). Never logs/returns the PIN. `MetaRegistrationStatus` type exported.
- `src/components/settings/connect-whatsapp.tsx`: on `status !== 'connected'` shows the actionable guidance as a `toast.warning` (14s); `connected` → success toast.
- Migration `20260603140000_meta_account_registration_status.sql`: adds `registration_status` (CHECK-constrained), `registration_error`, `two_step_pin_encrypted`; backfills the smoke number → `connected`. **Applied + verified in prod (Regla 5).**

## Task Commits
1. **Plan + migration (gap-closure)** — `f069d154`/prior + migration in `dc6d0cee`
2. **register wiring + chain mapping + domain updater + UI + tests** — `dc6d0cee` (feat)

## Verification Evidence
- `npx vitest run src/lib/meta/ src/app/api/webhooks/meta/` → **21/21 GREEN** (incl. 6 new register-errors tests covering 2388001/payment/other/non-Meta).
- `npx tsc --noEmit` → 0 errors in touched files (the 6 repo errors are pre-existing: `.next` generated types + an unrelated test).
- **Migration verified in prod:** the 3 columns exist; test number `1134593926408063` → `registration_status: 'connected'`.
- **Regla 6:** `git status` shows 0 changes to `webhook-handler.ts` or any 360dialog send path.
- No code path logs the auth code, plaintext BISUAT, or the PIN.

## Live chain validated end-to-end (2026-06-03)
The activation chain was proven manually before wiring: register first failed `2388001` (leftover 2SV) → disabled 2SV via WhatsApp Manager (email-confirmed, no PIN needed) → register then failed "Cannot Migrate Phone Number: no payment method" → added payment → register `success:true`, number `CONNECTED / CLOUD_API`. The code now reproduces each branch with the correct status + message.

## Deferred (tracked in deferred-items.md)
- Full "Conectado" UI panel (read `registration_status` server-side + Reintentar/Desconectar) — Plan 05 follow-up.
- Outbound via Meta (provider-aware send) — Phase 39 `meta-direct-outbound`.

## Self-Check: PASSED
- FOUND: src/lib/meta/register-errors.ts + register-errors.test.ts
- FOUND: updateMetaAccountRegistration in src/lib/domain/meta-accounts.ts
- FOUND: activateNumber + registerPhoneNumber wired in meta-onboarding.ts (commit dc6d0cee)
- VERIFIED: migration applied in prod (3 columns + backfill)

---
*Phase: 38-embedded-signup-wa-inbound · Completed: 2026-06-03*
