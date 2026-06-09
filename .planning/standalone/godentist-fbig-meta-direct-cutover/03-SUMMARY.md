# Plan 03 — SUMMARY: Live cutover GoDentist Valoraciones FB+IG → Meta Direct

**Status:** ✅ COMPLETE (operator-driven, verified LIVE with real production traffic)
**Completed:** 2026-06-09
**Type:** checkpoint / human-action runbook (autonomous: false)

## Self-Check: PASSED

## What happened

GoDentist Valoraciones (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`) was moved from ManyChat to Meta Direct for Facebook + Instagram. Block A code (Plans 01 + 02) was deployed to Vercel (commit `45b7e48f`) BEFORE the cutover, per D-04 ordering.

## Tasks completed

- **Task 1 — Block A live + pre-checks (`block-a-live`):** Vercel deploy `45b7e48f` Ready. `lifecycle_routing_enabled = true`, `conversational_agent_id = 'godentist'`. Routing rule confirmed active: `"GoDentist FB/IG → godentist-fb-ig (lead capture)"`, priority 100, `channel in [facebook,instagram]` → `agent_id='godentist-fb-ig'`.
- **Task 2 — Connect Facebook (`fb-connected`):** `workspace_meta_accounts` row created — `channel='facebook'`, `page_id=1487106984933226`.
- **Task 3 — Connect Instagram (`ig-connected`):** second row `channel='instagram'`, same `page_id=1487106984933226`, `ig_account_id=17841417084952427` (FB+IG share page — GAP-41-02).
- **Task 4 — Flip providers (`providers-flipped`):** `messenger_provider=meta_direct`, `instagram_provider=meta_direct`, `whatsapp_provider=360dialog` (UNTOUCHED — Regla 6 / D-10).
- **Task 5 — Verify LIVE (`live-verified`):** Test FB DM → `godentist-fb-ig` replied via Meta (`wamid` `m_…`). Lead-capture saludo (goBot + Habeas Data Ley 1581) sent correctly.
- **Task 6 — Disconnect ManyChat + delete keys (`manychat-disconnected`):** ManyChat FB page + IG account disconnected; ManyChat subscription cancelled. Keys deleted: `settings - 'manychat_api_key' - 'manychat_webhook_secret'` → `has_mc_key=false, has_mc_secret=false, has_wa_key=true`. Post-deletion IG test confirmed single reply via Meta with NO manychat key present (proves Plan 01 patch holds).
- **Task 7 — D-08 decision (`proceed`):** Block B authorized. Point of no return crossed.

## Double-response diagnosis (Pitfall 5) — RESOLVED

During the overlap window (ManyChat still connected + Meta Direct active), a single FB DM produced TWO inbound rows in MorfX:
- one `wamid` `m_…` (Meta Direct webhook)
- one `wamid` `mc-…` (ManyChat webhook)

→ MorfX ran the agent twice → two Meta replies. Root cause = same DM hitting both webhooks (different external ids → dedup didn't merge). **Resolved** by disconnecting ManyChat: post-disconnect tests show a SINGLE `m_…` inbound + single outbound, no `mc-…`.

## Decisive verification — REAL production traffic

~15h after the cutover, `agent_sessions` showed **6 real FB leads** (Dodier Sánchez, Joaquin Montealegre, Daniela Carvajal, Martha Pico, Maria Fernanda Menco, Camilo Reyes) being served by `godentist-fb-ig` via Meta Direct — the strongest possible live confirmation. The optional FB saludo session-reset test was abandoned (closing real customer sessions would violate Regla 6).

## Regla 6 status

- WhatsApp (`whatsapp_provider=360dialog`) UNTOUCHED; a real Somnio/GoDentist WhatsApp conversation observed responding normally during the window.
- Only the Valoraciones FB/IG providers changed.

## Rollback note

Pre-Task-7, rollback = re-flip providers to `manychat` + reconnect ManyChat. Post-Task-7 (`proceed`), that rollback no longer applies — Block B (Plans 04-06) deliberately removes ManyChat per D-07/D-08.
