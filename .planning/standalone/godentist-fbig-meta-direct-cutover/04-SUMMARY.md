# Plan 04 — SUMMARY: Re-point 3 dormant ManyChat workspaces → meta_direct

**Status:** ✅ COMPLETE (operator-applied prod SQL, verified)
**Completed:** 2026-06-09
**Type:** checkpoint / human-action (autonomous: false)

## Self-Check: PASSED

## What happened

The 3 remaining ManyChat-provider workspaces were re-pointed to `meta_direct`, leaving ZERO workspaces on `manychat` anywhere — the precondition for the codebase deletion (Plan 05) and the table drop (Plan 06).

## Pre-change snapshot (Task 1)

| Workspace | messenger | instagram | whatsapp |
|-----------|-----------|-----------|----------|
| GoDentist (36a74890) | manychat | manychat | 360dialog |
| GoDentist Valoraciones (f0241182) | meta_direct | meta_direct | 360dialog |
| Pruebas Morfx (4b5d84dd) | meta_direct | manychat | meta_direct |
| Somnio (a3843b3f) | manychat | manychat | 360dialog |
| Varixcenter (c6621640) | meta_direct | meta_direct | 360dialog |

## After re-point (Task 2)

UPDATE applied to GoDentist + Somnio + Pruebas (`messenger_provider`/`instagram_provider` = `meta_direct`; `whatsapp_provider` intentionally excluded).

- `SELECT COUNT(*) WHERE messenger_provider='manychat' OR instagram_provider='manychat'` → **0** ✅
- GoDentist: meta_direct / meta_direct / **360dialog** (whatsapp unchanged) ✅
- Pruebas: meta_direct / meta_direct / **meta_direct** (whatsapp unchanged — was already meta_direct) ✅
- Somnio: meta_direct / meta_direct / **360dialog** (whatsapp unchanged) ✅

## Regla 6 / D-10 (Task 3)

All 3 WhatsApp providers match the pre-change snapshot. Somnio (productive) WhatsApp = `360dialog`, untouched → its v3/recompra/pw-confirmation/v4 WhatsApp agents are unaffected (channel-agnostic, 360dialog). D-10 satisfied.

## Note

The 3 re-pointed workspaces have ~0 FB/IG traffic and no FB/IG agent sending; a human FB/IG reply attempt would get a graceful "Credenciales Meta no configuradas" (RESEARCH OQ-8 — accepted, no crash).
