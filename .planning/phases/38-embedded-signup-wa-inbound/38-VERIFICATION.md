---
phase: 38-embedded-signup-wa-inbound
type: verification
verdict: PASS (inbound + self-serve connect + activation) — outbound out of scope (Phase 39)
verified: 2026-06-03
---

# Phase 38 — Verification (goal-backward)

## Phase goal (from 38-CONTEXT.md)
> Un workspace puede conectar su cuenta de WhatsApp Business de Meta (Cloud API directo, sin
> 360dialog) y los mensajes entrantes llegan a MorfX por un webhook seguro y deduplicado,
> apareciendo en el inbox **idénticos** a los de 360dialog y entrando al **mismo pipeline de
> agentes**. Entrega: (1) camino mínimo inbound + conexión manual de 1 número; (2) Embedded
> Signup multi-tenant self-serve.

## Goal-backward checks

| # | What the goal requires | Evidence | Verdict |
|---|------------------------|----------|---------|
| 1 | Secure inbound webhook (HMAC over raw body, handshake) | `route.ts`: raw-body-first, timing-safe HMAC vs `META_APP_SECRET` (401 invalid), GET echoes challenge vs `META_WEBHOOK_VERIFY_TOKEN` (403 else). Tests hmac 6/6 + handshake 3/3. Live: handshake 200, synthetic signed → 200. | ✅ PASS |
| 2 | Inbound message reaches inbox identical to 360dialog, same agent pipeline | `processWebhook` reused VERBATIM (D-09). Live: real Meta inbound ("Hola", `wamid.HBgM…`) stored in the test workspace via `resolveByPhoneNumberId`. | ✅ PASS |
| 3 | Dedup (Meta retries up to 7×) | `messages.wamid UNIQUE` (D-10) — no second row. Live smoke: single row per wamid. (Dedicated retry unit test deferred — live-DB.) | ✅ PASS (1 test deferred) |
| 4 | Self-serve connect (Embedded Signup) stores encrypted creds + subscribes | `ConnectWhatsApp` FB.login popup → `connectWhatsAppNumber` (owner-gated, exchange→encrypt→`upsertMetaAccount`→`subscribeWaba`). Live: encrypted row in `workspace_meta_accounts` + app in `subscribed_apps`. | ✅ PASS |
| 5 | Connected number is actually USABLE for inbound (activation) | Plan 06: `activateNumber` registers after subscribe (idempotent) + chain handling. Live: number reached `CONNECTED / CLOUD_API`; real inbound flows. | ✅ PASS |
| 6 | Regla 6 — Somnio/360dialog untouched | `webhook-handler.ts` + `/api/webhooks/whatsapp/route.ts` + 360dialog send path byte-identical (git: no Phase-38 commit touches them). | ✅ PASS |
| 7 | Multi-tenant isolation, no cross-workspace leak | Unknown `phone_number_id` → ack-and-drop 200 (no env fallback). `workspaceId` session-derived in the action, never from body. | ✅ PASS |

## Requirements coverage
- **HOOK-01** (handshake) ✅ · **HOOK-02** (HMAC raw body) ✅ · **HOOK-03** (200<5s sync) ✅ · **HOOK-04** (dedup by wamid) ✅ (unit test deferred, constraint+smoke cover it)
- **WA-05** (receive WA webhooks) ✅ · **SIGNUP-01** (self-serve UI) ✅ · **SIGNUP-02** (code→BISUAT) ✅ · **SIGNUP-03** (auto-subscribe) ✅

## Out of scope (correctly deferred)
- **Outbound via Meta** → Phase 39 `meta-direct-outbound`. Verified gap: send path is 360dialog-only/provider-unaware; a reply failed `131047` "Re-engagement" out the global 360dialog number. Documented in `PLAYBOOK-number-activation.md` §GAP DE OUTBOUND.
- **"Conectado" UI panel** (read status + Reintentar/Desconectar) → Plan 05 follow-up.
- FB Messenger (Phase 40), Instagram (Phase 41), templates CRUD / media CDN (Phase 39).

## Tests
`npx vitest run src/lib/meta/ src/app/api/webhooks/meta/` → **21/21 GREEN**. `npx tsc --noEmit` → 0 errors in phase files (6 repo errors pre-existing + unrelated).

## Verdict
**PASS** for the defined Phase 38 scope (inbound + self-serve connect + activation). The phase goal is achieved: a workspace can self-connect a Meta WhatsApp number, it activates on Cloud API, and real inbound flows into the existing inbox + agent pipeline, with Somnio on 360dialog untouched. Outbound is the next phase.
