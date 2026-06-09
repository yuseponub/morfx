---
phase: godentist-fbig-meta-direct-cutover
plan: 05
subsystem: channels / domain messaging
tags: [decommission, manychat, meta-direct, regla-6, fb-ig]
requires:
  - "Plan 04 done (no workspace on messenger/instagram provider 'manychat')"
provides:
  - "FB/IG domain send arms: meta_direct ONLY (no getChannelSender, no manychat else)"
  - "channels/registry without manychat senders (whatsapp-only map)"
  - "ManyChat code fully removed from the repo (sender, routes, handler, api, middleware bypass)"
affects:
  - "src/lib/domain/messages.ts (send chokepoint)"
  - "src/lib/channels/registry.ts + types.ts"
  - "middleware.ts (no /api/manychat bypass)"
tech-stack:
  added: []
  patterns:
    - "Load-bearing delete order (Pitfall 4): rewire registry + domain BEFORE deleting sender"
    - "Stale .next/types validator must be cleared after deleting an API route (tsc artifact)"
key-files:
  created: []
  modified:
    - src/lib/domain/messages.ts
    - src/lib/channels/registry.ts
    - src/lib/channels/types.ts
    - src/lib/domain/__tests__/messenger-provider.test.ts
    - src/lib/domain/__tests__/messages-instagram.test.ts
    - middleware.ts
    - src/lib/meta/messenger-api.ts
    - src/lib/domain/conversations.ts
    - src/lib/whatsapp/types.ts
    - src/app/actions/meta-onboarding.ts
    - src/lib/channels/meta-facebook-sender.ts
    - src/lib/channels/meta-instagram-sender.ts
    - src/lib/channels/__tests__/meta-facebook-sender.test.ts
    - src/lib/messenger/webhook-handler.ts
    - src/lib/messenger/__tests__/webhook-handler.test.ts
    - src/lib/instagram/webhook-handler.ts
    - src/lib/instagram/__tests__/webhook-handler.test.ts
  deleted:
    - src/lib/channels/manychat-sender.ts
    - src/app/api/webhooks/manychat/route.ts
    - src/app/api/manychat/dynamic-reply/route.ts
    - src/lib/manychat/webhook-handler.ts
    - src/lib/manychat/api.ts
    - scripts/setup-godentist-manychat.sql
decisions:
  - "D-07: full decommission — all ManyChat transport code deleted"
  - "Kept readMessengerProvider/readInstagramProvider + the manychat_api_key outbound fallbacks as dead-but-safe Regla 6 byte-identical guards (out of Task 3 scope)"
metrics:
  duration_min: 18
  completed: 2026-06-09
---

# Phase godentist-fbig-meta-direct-cutover Plan 05: Decommission ManyChat Code Summary

BLOCK B complete — ManyChat transport code (sender, inbound webhook route, dynamic-reply route, handler, REST api, middleware bypass) fully removed from the repo; FB/IG domain send arms collapsed to `meta_direct`-only with all 6 `getChannelSender` call sites eliminated; typecheck green and shippable after every commit.

## What Was Done

### Task 1 — Rewire registry + remove all 6 domain getChannelSender call sites (`53ae782b`)
The load-bearing first step (Pitfall 4). Before the sender could be deleted, the domain had to stop calling it.
- `src/lib/domain/messages.ts`: removed the `manychat` else-branches at all 6 `getChannelSender` sites (TEXT facebook/instagram/fallback + MEDIA facebook/instagram/fallback). The FB/IG arms now read `messenger_provider`/`instagram_provider` for observability, then resolve Meta creds via `resolveByWorkspace` → `metaFacebookSender`/`metaInstagramSender`. A non-`meta_direct` provider (no workspace remains on it) returns `'Credenciales Meta no configuradas'`. The unreachable channel fallback returns `'Canal no soportado'`. Removed the now-unused `import { getChannelSender }`.
- `src/lib/channels/registry.ts`: dropped the manychat sender imports + map entries; `senders` is now `{ whatsapp }` only (typed `Partial<Record<…>>`). facebook/instagram fall back to `whatsappSender` for back-compat but the domain never calls it for them anymore.
- `src/lib/channels/types.ts`: header comment updated.
- Tests `messenger-provider.test.ts` + `messages-instagram.test.ts`: the legacy parity describe-blocks were converted to assert the new meta_direct-only behavior (provider read no longer gates; FB/IG always go meta_direct → resolveByWorkspace; legacy/non-meta_direct provider → clear error). Removed the `vi.mock('@/lib/channels/registry')` getChannelSender mock.
- Gate: `grep -c getChannelSender src/lib/domain/messages.ts` == 0; WhatsApp arms untouched; 10/10 tests pass.

### Task 2 — Delete manychat code files + routes + middleware bypass (`69bad515`)
With no importers left, the modules were deleted in the safe order:
1. `src/app/api/webhooks/manychat/route.ts`
2. `src/app/api/manychat/dynamic-reply/route.ts` (sole reader of `manychat_pending_replies`)
3. `src/lib/manychat/` (whole dir: `webhook-handler.ts` + `api.ts`)
4. `src/lib/channels/manychat-sender.ts`
5. The `/api/manychat` bypass block removed from `middleware.ts` (left `/api/webhooks` + `/api/inngest` bypasses intact).

### Task 3 — Clean residual comment references + env (`49f7920e`)
- Updated comments in `messenger-api.ts`, `conversations.ts`, `whatsapp/types.ts`, `meta-onboarding.ts`, `meta-facebook-sender.ts`, `meta-instagram-sender.ts` (+ its test), and the messenger/instagram webhook-handlers (+ tests) so no comment references the deleted modules or stale "via ManyChat" / "traffic stays on manychat" wording. `external_subscriber_id` field comments now say "PSID/IGSID" (field kept — reused by Meta).
- Removed `MANYCHAT_WEBHOOK_SECRET` from `.env.local` (gitignored; `.env.example` / `.env.test.example` had none). `grep -rln MANYCHAT_ src/` == 0.
- Deleted `scripts/setup-godentist-manychat.sql`.

## Verification

| Gate | Result |
|------|--------|
| `pnpm tsc --noEmit` after every commit | GREEN (×3) |
| `grep -c getChannelSender src/lib/domain/messages.ts` | 0 |
| manychat-sender.ts / src/lib/manychat / manychat routes | gone |
| `grep -c api/manychat middleware.ts` | 0 |
| dangling imports `@/lib/manychat`/`manychat-sender`/`processManyChatWebhook` | 0 (comments only, then cleaned) |
| `grep -rln MANYCHAT_ src/` | 0 |
| `pnpm vitest run src/lib/domain src/lib/channels src/lib/messenger src/lib/instagram` | 109/109 pass |
| v4-messaging-adapter + messenger-window guard tests | 25/25 pass |
| WhatsApp send arms diff (send360/whatsapp_provider) | 0 changes (Regla 6) |
| Deletions across HEAD~3..HEAD | only the 5 intended ManyChat files |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale `.next` route validator broke typecheck after deleting the API routes**
- **Found during:** Task 2
- **Issue:** After deleting `src/app/api/webhooks/manychat/route.ts` and `src/app/api/manychat/dynamic-reply/route.ts`, `pnpm tsc --noEmit` failed with TS2307 in `.next/dev/types/validator.ts` + `.next/types/validator.ts` (Next.js generated route-type validators still referencing the deleted routes).
- **Fix:** Removed the stale generated `.next/dev/types` + `.next/types` validator directories (build artifacts, regenerated on `next build`). Re-ran tsc → GREEN.
- **Files modified:** none in source (artifact cleanup only)
- **Commit:** part of `69bad515` (the deletion commit; artifact dir is not tracked)

## Known Residual ManyChat References (audit — `grep -rin manychat src/` == 81)

These are NOT transport code (sender/routes/handler/api are deleted). They are dead-but-safe, intentionally retained:

| File | Refs | Why kept |
|------|------|----------|
| `src/lib/domain/messages.ts` | 20 | `readMessengerProvider`/`readInstagramProvider` helpers still default to `'manychat'` (Task 1 instruction kept the reads); the `manychat_api_key` param doc-comments; my Plan-05 decommission comments. Provider literal is unused but the helper return type is `'manychat' \| 'meta_direct'`. |
| `src/lib/agents/engine-adapters/production/messaging.ts` | 4 | `getChannelCredentials` reads `settings.manychat_api_key` as the FB/IG key fallback (Block A provider-aware patch). Dead-but-safe (no manychat workspace); meta_direct skips it. |
| `src/lib/domain/messages-send-idempotent.ts` | 4 | Same outbound key fallback. |
| `src/inngest/functions/agent-timers-v3.ts` / `-v4.ts` | 4 each | Same retake-timer key fallback (Regla 6 byte-identical arms). |
| `src/app/actions/messages.ts` | 12 | Web-inbox provider-aware key resolution (the canonical pattern); reads `manychat_api_key` for non-meta_direct. |
| `src/lib/messenger/window-gate.ts` | 2 | Comment noting the gate governs meta_direct only. |
| `src/lib/agents/registry-helpers.ts` / `agent-production.ts` | 1 each | Comment about static-importable handlers. |
| Test fixtures (`v4-messaging-adapter`, `messages-instagram`, `messenger-provider`, `messenger-window`) | 1–15 | Provider-branch / Regla 6 guard fixtures asserting the meta_direct vs legacy behavior. |

Removing the `manychat_api_key` outbound fallbacks + flipping the helper defaults is OUT of this plan's scope (Task 3 = comments/tests/env). They are correctness-neutral now that no workspace is on `manychat`. Candidate for a follow-up cosmetic pass alongside the OQ-7 CHECK-constraint drop (deferred to Plan 06).

## Operator-only Follow-ups (Claude cannot do these)

- **Delete Vercel env vars:** `MANYCHAT_DEFAULT_WORKSPACE_ID`, `MANYCHAT_WEBHOOK_SECRET`, `MANYCHAT_IG_REPLY_TAG_ID`, `MANYCHAT_API_KEY` (Vercel dashboard).
- **Plan 06 (deferred):** OQ-7 CHECK-constraint drop (`messenger_provider`/`instagram_provider` → `IN ('meta_direct')` + default flip) and `DROP TABLE manychat_pending_replies` (its only reader, the dynamic-reply route, is now deleted). Regla 5: apply in prod before deploy.

## Commits

- `53ae782b` refactor: FB/IG send arms meta_direct-only (quita else manychat + getChannelSender)
- `69bad515` feat: borra codigo ManyChat (sender, rutas, handler, api) + bypass middleware
- `49f7920e` docs: limpia referencias residuales ManyChat en comentarios/tests + env

## Self-Check: PASSED

- SUMMARY.md present.
- All 5 ManyChat code files confirmed deleted on disk.
- All 3 task commits present in git history (53ae782b, 69bad515, 49f7920e).
