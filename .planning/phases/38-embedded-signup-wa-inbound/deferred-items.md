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
