---
status: passed
phase: godentist-fbig-meta-direct-cutover
verified: 2026-06-09
plans: 6/6
---

# VERIFICATION — GoDentist FB/IG: ManyChat → Meta Direct cutover

**Goal:** Connect GoDentist Valoraciones FB + IG via Meta Direct, route inbound to the `godentist-fb-ig` agent, decommission ManyChat entirely. WhatsApp stays on 360dialog. Varixcenter/agentless workspaces stay human-only (Regla 6).

**Verdict:** ✅ PASSED — verified live in production (6 real FB leads served via Meta Direct ~15h post-cutover).

## Plan-by-plan must-haves

| Plan | Must-have | Evidence | ✓ |
|------|-----------|----------|---|
| 01 | 6 FB/IG send sites tolerate missing manychat key when provider=meta_direct | meta_direct arms in messaging.ts (4x), agent-timers-v3 (6x), agent-timers-v4 (6x), messages-send-idempotent (7x); whatsapp arm byte-identical | ✓ |
| 01 | WhatsApp send path byte-identical | executor zero-line-diff on whatsapp arms; build green | ✓ |
| 02 | Meta FB + IG inbound emit `agent/whatsapp.message_received` | grep 2/2 in both handlers | ✓ |
| 02 | Handlers do NOT call routeAgent (gate stays downstream) | grep routeAgent 0/0 | ✓ |
| 02 | Agentless workspace stays human-only (Regla 6, D-03) | downstream silence test + Varixcenter live unaffected (still meta_direct human-only) | ✓ |
| 03 | Valoraciones FB+IG on Meta Direct, agent responds LIVE | workspace_meta_accounts FB+IG rows; providers=meta_direct/360dialog; 6 real FB leads in agent_sessions via Meta | ✓ |
| 03 | ManyChat disconnected + keys deleted | has_mc_key=false, has_mc_secret=false, has_wa_key=true; post-deletion single Meta reply | ✓ |
| 04 | No workspace on manychat anywhere | `COUNT(... manychat) = 0` | ✓ |
| 04 | WhatsApp of 3 re-pointed ws untouched (D-10 Somnio) | whatsapp_provider matches pre-change snapshot for all 3 | ✓ |
| 05 | No ManyChat transport code in src/ | src/lib/manychat, manychat-sender.ts, api/manychat, webhooks/manychat all gone; getChannelSender in domain = 0 | ✓ |
| 05 | typecheck + full build green | `pnpm tsc --noEmit` = 0; `pnpm build` = 0 | ✓ |
| 06 | manychat_pending_replies dropped | `to_regclass` = NULL (prod); 0 src refs; migration file present | ✓ |
| 06 | Enum OQ-7 decision recorded | DEFERRED (research default) with un-defer SQL in 06-SUMMARY | ✓ |

## Regla compliance

- **Regla 6 (protect production):** WhatsApp untouched everywhere (Somnio productive — 360dialog intact); Varixcenter stays human-only; the production `godentist-fb-ig` agent kept responding throughout the transition (now via Meta instead of ManyChat).
- **Regla 5 (migration before deploy):** all prod SQL (provider flips, key deletion, re-point, DROP TABLE) applied by operator and confirmed before committing dependent artifacts.
- **Regla 1 (push to Vercel):** Block A (Plans 01+02) deployed before cutover (D-04 ordering); Block B code (Plan 05) deployed after build verification.
- **Regla 3 (domain layer):** no createAdminClient introduced outside domain.

## Deploys

- `45b7e48f` — Block A (Plans 01+02): send-site guards + Meta inbound wire.
- `ae20549c` — Block B (Plan 05): ManyChat code decommission.
- `bca9bc3f` — Plan 06: drop-table migration + summaries.

## Known residual (out of scope, documented)

- ~81 `manychat` string references remain in src/ — all are the kept Regla-6 key-fallbacks and the `'manychat'` provider-literal default in `readMessengerProvider`/`readInstagramProvider` (dead-but-safe; no workspace on manychat). These plus the CHECK-constraint `'manychat'` value are the DEFERRED OQ-7 cosmetic cleanup (un-defer SQL in 06-SUMMARY).
