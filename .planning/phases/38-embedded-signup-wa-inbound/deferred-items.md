# Phase 38 Deferred Items

## Plan 03 — dedicated Meta-retry dedup unit test (deferred)
- Plan 03 Task 3 offered to add ONE test exercising processWebhook twice with the same wamid asserting a single messages row.
- Not added: processWebhook hits Supabase (real DB) — a meaningful dedup test cannot run in vitest without a live DB, and the plan forbids modifying webhook-handler.ts to make it testable. The wamid dedup is the DB constraint messages_wamid_unique (Phase 38 D-10).
- Covered instead by the human-verify smoke criterion 4 (live SELECT count(*) FROM messages WHERE wamid='<wamid>' returns 1).

## Plan 05 — "connected state" UI view (deferred — FOLLOW-UP REQUESTED by user 2026-06-03)
- Current behavior: `src/components/settings/connect-whatsapp.tsx` only renders the "Conectar WhatsApp" button + popup flow. It does NOT read `workspace_meta_accounts`, so the integrations page ALWAYS shows the connect button even after a number is successfully connected (row exists in DB).
- Confirmed in code (2026-06-03 smoke): no read/display logic in connect-whatsapp.tsx; integraciones/page.tsx only renders `<ConnectWhatsApp />`; `meta-accounts.ts` has NO getter (only `upsertMetaAccount` + `resolveByPhoneNumberId`).
- User explicitly requested (during the live smoke): when a number IS connected, the page should SHOW the connected state instead of the connect button.
- Scope of the follow-up:
  1. Add a domain getter in `src/lib/domain/meta-accounts.ts` (e.g. `getActiveMetaAccount(workspaceId, channel)`) — admin client, workspace-scoped, returns the active row WITHOUT the encrypted token (never expose token to client).
  2. Make the integrations surface read it (server component) and render a "Conectado" view: display phone number / WABA id / connected_at + a "Desconectar" action, instead of the connect button. Fall back to the connect button when no active row.
  3. Optional: a `disconnectMetaAccount` server action (owner-gated) that sets `is_active=false` (soft) — mirrors the connect action's auth gate.
- NOT part of Phase 38 defined scope (SIGNUP-01 = connect flow only). Tracked here so it gets built after the inbound smoke passes.
- Smoke evidence the connection works despite the UI gap: row in `workspace_meta_accounts` (workspace `4b5d84dd-1b46-4e8c-8acf-3869c037198f`, phone_number_id `1134593926408063`, waba_id `1330686782492287`, is_active=true, token encrypted) created 2026-06-03 11:36 UTC.

## Plan 04/05 — phone number REGISTRATION on Cloud API missing + 2FA wall (PRODUCTION-CRITICAL, 2026-06-03)
- `meta-onboarding.ts` does exchange → encrypt → upsertMetaAccount → subscribeWaba, but NEVER calls `registerPhoneNumber` (the helper EXISTS in `embedded-signup.ts` but is unused). Result: the connected number stays `status: PENDING` / `platform_type: NOT_APPLICABLE` → NOT active on Cloud API → Meta does not deliver real inbound webhooks (even though the MorfX endpoint is proven working via a synthetic signed injection).
- Attempted to register the test number (+57 310 5197782, phone_number_id 1134593926408063) via API with the decrypted BISUAT: `POST /{id}/register {pin}` fails with **error code 100, subcode 2388001 "Cannot Create Certificate — Please ensure two-factor authentication is disabled."** The number had 2SV/2FA enabled from its prior 360dialog registration; PIN unknown. Cannot set pin (133010 "account is not registered") nor deregister ("not currently linked") — chicken-and-egg.
- PRODUCTION IMPACT: any client connecting a number with 2FA enabled (from a previous BSP or their own setup) hits the same wall. The onboarding flow MUST: (a) call register after subscribe, (b) catch 2388001 and surface a clear instruction to the customer (disable 2SV on the source BSP BEFORE migrating, or provide the existing PIN), (c) ideally validate number status post-connect and show PENDING vs CONNECTED.
- OPEN INVESTIGATION (post-compact): research official Meta/WhatsApp Cloud API docs for the correct procedure to register/migrate a number with 2SV when the PIN is unknown, confirm whose responsibility 2SV-disable is, and design the production-correct onboarding handling. Verify nothing is being overlooked.

### RESOLUTION (2026-06-03) — investigation done + live-tested. See `PLAYBOOK-number-activation.md`.
- **2388001 / 2SV: SOLVED.** Root cause confirmed: 2SV cannot be disabled via API. Fix = WhatsApp Manager UI → Phone numbers → number → Two-step verification → Turn off → confirm via admin email. Does NOT require knowing the old PIN (email-authenticated). The earlier API-only attempts (set-pin/deregister/register) were the wrong approach. Live test: after turning 2SV off, `register` no longer returns 2388001.
- **NEW blocker discovered in live register: payment method.** After 2SV off, `register` returns `code 100 "Cannot Migrate Phone Number: Your WhatsApp Business Account doesn't have a payment method set up."` Cloud API requires a card on file on the WABA before register/migrate succeeds (even with the free service-conversation tier). Fix = Business Settings → WhatsApp accounts → WABA → "..." → Payment settings → add card. Then re-run register.
- **Ownership already verified:** `code_verification_status: VERIFIED` (Embedded Signup did it) → no `request_code`/`verify_code` needed in the Embedded Signup path.
- **Full register pre-req chain (in order):** (1) 2SV off, (2) ownership verified [auto], (3) payment method on WABA, (4) register with a NEW 6-digit pin we set + store. Documented as a production playbook in `PLAYBOOK-number-activation.md`.
- **Production code TODO (GSD plan):** wire `registerPhoneNumber` into `meta-onboarding.ts`, catch each chain error with an actionable Spanish message, persist a `status` enum + show PENDING/needs_2sv/needs_payment/connected in the UI with a "Reintentar registro" button (also closes the "connected state" UI gap above).
