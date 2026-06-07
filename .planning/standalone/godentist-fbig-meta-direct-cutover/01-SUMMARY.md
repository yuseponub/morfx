---
phase: godentist-fbig-meta-direct-cutover
plan: 01
subsystem: outbound-send / messaging
tags: [meta-direct, manychat-cutover, regla-6, pitfall-2, fb-ig]
requires: []
provides:
  - "Provider-aware outbound send across all 6 FB/IG send sites — meta_direct no longer blocks on missing manychat_api_key"
affects:
  - src/lib/agents/engine-adapters/production/messaging.ts
  - src/inngest/functions/agent-timers-v3.ts
  - src/inngest/functions/agent-timers-v4.ts
  - src/lib/domain/messages-send-idempotent.ts
tech-stack:
  added: []
  patterns:
    - "Copy verbatim the proven provider-aware pattern from src/app/actions/messages.ts:147-163"
    - "apiKey ?? '' coerce on the meta_direct arm; the domain ignores params.apiKey and resolves the Page token via resolveByWorkspace"
key-files:
  created: []
  modified:
    - src/lib/agents/engine-adapters/production/messaging.ts
    - src/inngest/functions/agent-timers-v3.ts
    - src/inngest/functions/agent-timers-v4.ts
    - src/lib/domain/messages-send-idempotent.ts
    - src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts
decisions:
  - "D-06 ordering honored: this plan is the prerequisite deploy before any provider flip / ManyChat key deletion (Plan 03)."
  - "meta_direct arm leaves apiKey empty ('' coerce); domain chokepoint (messages.ts:260/287) ignores it and resolves Meta creds — no behavior change to manychat/whatsapp arms."
metrics:
  duration: "~1h"
  completed: 2026-06-07
---

# Phase godentist-fbig-meta-direct-cutover Plan 01: The Hazard Fix (provider-aware outbound send) Summary

Patched all SIX outbound send sites that hard-required `settings.manychat_api_key` for FB/IG so they SKIP that requirement when the workspace provider for the channel is `meta_direct`. Without this, `godentist-fb-ig` would go MUTE the instant GoDentist Valoraciones flips to `meta_direct` and deletes its ManyChat key (D-06): the agent runs, reaches the credential check, gets `apiKey:null`, and returns `messagesSent:0`. The proven provider-aware pattern from the web inbox action (`src/app/actions/messages.ts:147-163`) was copied verbatim; the manychat and whatsapp arms are byte-identical (Regla 6) — only a `meta_direct` arm was added.

## What Was Built

- **Task 1 — Agent adapter (`messaging.ts`):** `getChannelCredentials` now selects `settings, messenger_provider, instagram_provider` and returns a `{ apiKey, channel, metaDirect }` shape. `send()`'s early-return guard changed from `if (!creds.apiKey)` to `if (!creds.apiKey && !creds.metaDirect)`, and `apiKey` is coerced to `''` so the meta_direct branch proceeds to the domain.
- **Task 2 — Retake timers + mobile-inbox idempotent send (4 timer blocks + 1):** Both send sites in BOTH timer files (`sendTimerMessage` text + `sendTimerImage` image in `agent-timers-v3.ts` and `agent-timers-v4.ts`) plus `messages-send-idempotent.ts` are now provider-aware. The image-block error string `'No API key for channel (image)'` is preserved but now sits behind the `if (!apiKey && !isMetaDirect)` guard. The idempotent call sites coerce `apiKey ?? ''` to satisfy the domain's `string` signature.
- **Task 3 — Adapter tests:** `buildSupabaseChain` helper extended to return provider columns (defaulting to `'manychat'` so all prior assertions stay valid). Added 3 cases: meta_direct facebook → reaches domain with no key (`messagesSent:1`, recipient = PSID); manychat facebook with no key → `messagesSent:0`, domain not called (Regla 6); meta_direct instagram → reaches domain (recipient = IGSID).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `apiKey` type mismatch in `messages-send-idempotent.ts`**
- **Found during:** Task 2
- **Issue:** The plan's idempotent patch leaves `apiKey: string | undefined`, but the three downstream domain calls (`domainSendTemplateMessage`, `domainSendMediaMessage`, `domainSendTextMessage`) require `apiKey: string`. Typecheck failed with TS2322 at the call sites (unlike the web action `messages.ts`, which passes `string | undefined`). The plan's `<action>` snippet only covered the key-resolution block, not the call sites.
- **Fix:** Coerced `apiKey: apiKey ?? ''` at all three call sites — identical in spirit to the `?? ''` coerce the plan prescribes for `messaging.ts` (the domain ignores `params.apiKey` on the meta_direct arm).
- **Files modified:** src/lib/domain/messages-send-idempotent.ts
- **Commit:** 3d78d366

## Acceptance Criteria

All plan acceptance criteria verified green:
- `messaging.ts`: `messenger_provider`=2, `metaDirect`=5, select-swap=1, whatsapp arm unchanged.
- timers v3/v4: `isMetaDirect`=6 each, select-swap=2 each, `if (!apiKey && !isMetaDirect)`=2 each, bare `if (!apiKey)`=0, image error string=1 each, whatsapp arm present.
- idempotent: `isMetaDirect`=3, select-swap=1.
- adapter test: `meta_direct`=7, `messagesSent`=11.

## Verification

- `pnpm tsc --noEmit` → exits 0.
- `pnpm vitest run src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts` → 14/14 pass (11 prior, no regression + 3 new).
- `pnpm vitest run src/lib/domain/__tests__/messenger-provider.test.ts` → 5/5 pass (chokepoint no-regression).
- Regla 6: whatsapp arm string `settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY` present and unchanged across all 5 non-idempotent sites + idempotent untouched whatsapp branch; manychat arms byte-identical (only meta_direct arm added).

## Commits

- e33193ea: feat — adapter messaging provider-aware para meta_direct FB/IG
- 3d78d366: feat — retake timers + mobile-inbox idempotent provider-aware
- 690e3f04: test — cases meta_direct no-key + manychat no-key en adapter

## Known Stubs

None.

## Notes

- This plan is the **prerequisite deploy** before Plan 03 flips any provider or deletes any ManyChat key (D-04 ordering, Pitfall 2). NOT pushed by this executor — the orchestrator handles the Vercel push after the whole wave.

## Self-Check: PASSED

All 5 modified files + 01-SUMMARY.md present on disk; all 3 task commits (e33193ea, 3d78d366, 690e3f04) found in git history.
